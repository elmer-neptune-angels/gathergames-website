// Apple: the subscription mirror (portal migration 035, fed by App Store
// Server Notifications and healed by the daily reconcile), the raw
// notification log, and the purchase funnel the app's own events record.
import { pageAll, supabaseAdmin } from "./db.ts";
import { countWhere, type EventRow } from "./events.ts";
import { loadSettings, type Settings } from "./settings.ts";
import { bucketKeys, dayKey } from "./time.ts";

export type Environment = "Sandbox" | "Production";

export interface MirrorRow {
  original_transaction_id: string;
  environment: Environment;
  product_id: string | null;
  tier: "club" | "family" | null;
  expires_at: string | null;
  auto_renew: boolean | null;
  revoked_at: string | null;
  apple_status: number | null;
  last_notification_type: string | null;
  last_notification_subtype: string | null;
  reconciled_at: string | null;
  created_at: string;
  updated_at: string;
}

export const PRODUCT_NAMES: Record<string, string> = {
  "my.lgc.gather.club.monthly": "Club Monthly",
  "my.lgc.gather.club.annual": "Club Annual",
  "my.lgc.gather.family.annual": "Family Annual",
};

export const PRODUCT_ORDER = Object.keys(PRODUCT_NAMES);

export const productName = (id: string | null): string => (id ? PRODUCT_NAMES[id] ?? id : "unknown");

/** Apple's subscription status codes (Get All Subscription Statuses). */
export const APPLE_STATUS: Record<number, string> = {
  1: "active",
  2: "expired",
  3: "billing retry",
  4: "grace period",
  5: "revoked",
};

export type SubscriptionState = "active" | "grace" | "billing_retry" | "lapsed" | "revoked";

/** What the mirror says a subscription is right now. Revocation wins,
 * then Apple's own status when it has one, then the expiry clock. */
export function subscriptionState(row: MirrorRow, now = new Date()): SubscriptionState {
  if (row.revoked_at) return "revoked";
  if (row.apple_status === 5) return "revoked";
  if (row.apple_status === 4) return "grace";
  if (row.apple_status === 3) return "billing_retry";
  if (row.expires_at && Date.parse(row.expires_at) > now.getTime()) return "active";
  if (!row.expires_at && row.apple_status === 1) return "active";
  return "lapsed";
}

export const PAYING_STATES = new Set<SubscriptionState>(["active", "grace", "billing_retry"]);

export async function loadMirror(): Promise<MirrorRow[]> {
  const { rows } = await pageAll<MirrorRow>((from, to) =>
    supabaseAdmin()
      .from("gather_entitlement_mirror")
      .select(
        "original_transaction_id, environment, product_id, tier, expires_at, auto_renew, revoked_at, apple_status, last_notification_type, last_notification_subtype, reconciled_at, created_at, updated_at",
      )
      .order("created_at", { ascending: false })
      .range(from, to),
  );
  return rows;
}

export interface NotificationRow {
  notification_uuid: string;
  notification_type: string;
  subtype: string | null;
  environment: Environment;
  signed_date: string | null;
  received_at: string;
}

export async function loadNotifications(since: Date, limit = 5_000): Promise<NotificationRow[]> {
  const { rows } = await pageAll<NotificationRow>(
    (from, to) =>
      supabaseAdmin()
        .from("gather_appstore_notifications")
        .select("notification_uuid, notification_type, subtype, environment, signed_date, received_at")
        .gte("received_at", since.toISOString())
        .order("received_at", { ascending: false })
        .range(from, to),
    limit,
  );
  return rows;
}

export interface ProductSummary {
  productId: string;
  name: string;
  active: number;
  grace: number;
  billingRetry: number;
  lapsed: number;
  revoked: number;
  autoRenewOff: number;
  /** Estimated monthly recurring revenue in cents from the price settings. */
  mrrCents: number | null;
}

export interface MirrorSummary {
  environment: Environment;
  total: number;
  paying: number;
  autoRenewOff: number;
  mrrCents: number | null;
  priced: boolean;
  products: ProductSummary[];
  newByDay: { key: string; value: number }[];
  endedByDay: { key: string; value: number }[];
  expiringSoon: MirrorRow[];
  stale: number;
}

const MONTH_DAYS = 365 / 12;

function monthlyCents(productId: string, settings: Settings): number | null {
  const price = settings.prices[productId];
  if (!price || price.cents <= 0) return null;
  return price.period === "year" ? Math.round(price.cents / 12) : price.cents;
}

export function summarizeMirror(
  rows: MirrorRow[],
  environment: Environment,
  since: Date,
  until: Date,
  settings: Settings,
  now = new Date(),
): MirrorSummary {
  const inEnv = rows.filter((row) => row.environment === environment);
  const products = new Map<string, ProductSummary>();
  const productFor = (id: string | null) => {
    const key = id ?? "unknown";
    let summary = products.get(key);
    if (!summary) {
      summary = {
        productId: key,
        name: productName(id),
        active: 0,
        grace: 0,
        billingRetry: 0,
        lapsed: 0,
        revoked: 0,
        autoRenewOff: 0,
        mrrCents: null,
      };
      products.set(key, summary);
    }
    return summary;
  };
  let paying = 0;
  let autoRenewOff = 0;
  let mrr = 0;
  let priced = true;
  let stale = 0;
  const newCounts = new Map<string, number>();
  const endedCounts = new Map<string, number>();
  const expiringSoon: MirrorRow[] = [];
  for (const row of inEnv) {
    const summary = productFor(row.product_id);
    const state = subscriptionState(row, now);
    switch (state) {
      case "active":
        summary.active += 1;
        break;
      case "grace":
        summary.grace += 1;
        break;
      case "billing_retry":
        summary.billingRetry += 1;
        break;
      case "lapsed":
        summary.lapsed += 1;
        break;
      case "revoked":
        summary.revoked += 1;
        break;
    }
    if (PAYING_STATES.has(state)) {
      paying += 1;
      if (row.auto_renew === false) {
        autoRenewOff += 1;
        summary.autoRenewOff += 1;
      }
      const cents = row.product_id ? monthlyCents(row.product_id, settings) : null;
      if (cents === null) priced = false;
      else {
        mrr += cents;
        summary.mrrCents = (summary.mrrCents ?? 0) + cents;
      }
      if (row.expires_at) {
        const daysLeft = (Date.parse(row.expires_at) - now.getTime()) / 86_400_000;
        if (daysLeft <= 7 && row.auto_renew === false) expiringSoon.push(row);
      }
      if (row.reconciled_at && now.getTime() - Date.parse(row.reconciled_at) > 3 * 86_400_000) stale += 1;
    }
    const created = Date.parse(row.created_at);
    if (created >= since.getTime() && created <= until.getTime()) {
      const key = dayKey(new Date(created));
      newCounts.set(key, (newCounts.get(key) ?? 0) + 1);
    }
    const endedAt = row.revoked_at ?? (state === "lapsed" ? row.expires_at : null);
    if (endedAt) {
      const ended = Date.parse(endedAt);
      if (ended >= since.getTime() && ended <= until.getTime()) {
        const key = dayKey(new Date(ended));
        endedCounts.set(key, (endedCounts.get(key) ?? 0) + 1);
      }
    }
  }
  const keys = bucketKeys(since, until, "day");
  const ordered = [...products.values()].sort(
    (a, b) => PRODUCT_ORDER.indexOf(a.productId) - PRODUCT_ORDER.indexOf(b.productId),
  );
  return {
    environment,
    total: inEnv.length,
    paying,
    autoRenewOff,
    mrrCents: paying === 0 ? 0 : priced ? mrr : null,
    priced,
    products: ordered,
    newByDay: keys.map((key) => ({ key, value: newCounts.get(key) ?? 0 })),
    endedByDay: keys.map((key) => ({ key, value: endedCounts.get(key) ?? 0 })),
    expiringSoon: expiringSoon.sort((a, b) => (a.expires_at ?? "").localeCompare(b.expires_at ?? "")),
    stale,
  };
}

export interface Funnel {
  paywallShown: number;
  paywallViewers: number;
  purchaseStarted: number;
  purchaseCompleted: number;
  purchaseFailed: number;
  dismissed: number;
  practiceBlocked: number;
  bySource: { name: string; shown: number; completed: number }[];
}

export function purchaseFunnel(events: EventRow[]): Funnel {
  const viewers = new Set<string>();
  const sources = new Map<string, { shown: number; completed: number }>();
  for (const event of events) {
    if (event.name === "paywall_shown") {
      viewers.add(event.player_id ?? event.device_id);
      const source = typeof event.payload?.source === "string" ? event.payload.source : "unknown";
      const entry = sources.get(source) ?? { shown: 0, completed: 0 };
      entry.shown += 1;
      sources.set(source, entry);
    } else if (event.name === "purchase_completed") {
      const source = typeof event.payload?.source === "string" ? event.payload.source : "unknown";
      const entry = sources.get(source) ?? { shown: 0, completed: 0 };
      entry.completed += 1;
      sources.set(source, entry);
    }
  }
  return {
    paywallShown: countWhere(events, (e) => e.name === "paywall_shown"),
    paywallViewers: viewers.size,
    purchaseStarted: countWhere(events, (e) => e.name === "purchase_started"),
    purchaseCompleted: countWhere(events, (e) => e.name === "purchase_completed"),
    purchaseFailed: countWhere(events, (e) => e.name === "purchase_failed"),
    dismissed: countWhere(events, (e) => e.name === "paywall_dismissed"),
    practiceBlocked: countWhere(events, (e) => e.name === "practice_blocked"),
    bySource: [...sources.entries()]
      .map(([name, counts]) => ({ name, ...counts }))
      .sort((a, b) => b.shown - a.shown),
  };
}

export { loadSettings, MONTH_DAYS };

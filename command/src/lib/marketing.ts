// Marketing spend (migration 043, gather_marketing_spend) and the
// acquisition math on top of it. Spend is entered by hand or pasted as CSV
// — there is no ad-network integration yet — and installs come from
// gather_installs, subscriptions from the entitlement mirror, so CAC is
// blended by default and per-channel only where attributed installs were
// entered alongside the spend.
import { isMissingTable, pageAll, supabaseAdmin } from "./db.ts";
import { bucketKeys } from "./time.ts";

export interface SpendRow {
  id: string;
  day: string;
  channel: string;
  campaign: string | null;
  spend_cents: number;
  currency: string;
  impressions: number | null;
  clicks: number | null;
  installs_attributed: number | null;
  notes: string | null;
  created_at: string;
}

export interface SpendInput {
  day: string;
  channel: string;
  campaign?: string | null;
  spend_cents: number;
  currency?: string;
  impressions?: number | null;
  clicks?: number | null;
  installs_attributed?: number | null;
  notes?: string | null;
}

export const CHANNELS = [
  "apple-search-ads",
  "meta",
  "tiktok",
  "google",
  "influencer",
  "pr",
  "referral",
  "other",
] as const;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const CHANNEL_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

export function parseSpendInput(raw: unknown): { ok: true; row: SpendInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "json object required" };
  const value = raw as Record<string, unknown>;
  const day = typeof value.day === "string" ? value.day.trim() : "";
  if (!DAY_RE.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) {
    return { ok: false, error: "day must be YYYY-MM-DD" };
  }
  const channel = typeof value.channel === "string" ? value.channel.trim().toLowerCase() : "";
  if (!CHANNEL_RE.test(channel)) return { ok: false, error: "channel must be a short lowercase slug" };
  const spendCents = Number(value.spend_cents);
  if (!Number.isInteger(spendCents) || spendCents < 0 || spendCents > 1_000_000_00) {
    return { ok: false, error: "spend_cents must be a whole number of cents" };
  }
  const optionalCount = (key: string): number | null | { error: string } => {
    const candidate = value[key];
    if (candidate === undefined || candidate === null || candidate === "") return null;
    const parsed = Number(candidate);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 1_000_000_000) return { error: `${key} must be a whole number` };
    return parsed;
  };
  const impressions = optionalCount("impressions");
  if (impressions && typeof impressions === "object") return { ok: false, error: impressions.error };
  const clicks = optionalCount("clicks");
  if (clicks && typeof clicks === "object") return { ok: false, error: clicks.error };
  const installs = optionalCount("installs_attributed");
  if (installs && typeof installs === "object") return { ok: false, error: installs.error };
  const currency =
    typeof value.currency === "string" && /^[A-Za-z]{3}$/.test(value.currency.trim())
      ? value.currency.trim().toUpperCase()
      : "USD";
  const text = (key: string, max: number): string | null => {
    const candidate = value[key];
    if (typeof candidate !== "string") return null;
    const trimmed = candidate.trim().slice(0, max);
    return trimmed.length > 0 ? trimmed : null;
  };
  return {
    ok: true,
    row: {
      day,
      channel,
      campaign: text("campaign", 120),
      spend_cents: spendCents,
      currency,
      impressions: impressions as number | null,
      clicks: clicks as number | null,
      installs_attributed: installs as number | null,
      notes: text("notes", 500),
    },
  };
}

/** CSV with a header row: day,channel,spend[,campaign,impressions,clicks,
 * installs,notes]. Spend is dollars ("12.50") or cents when the header says
 * spend_cents. Returns rows and per-line errors; nothing is written until
 * the caller has seen both. */
export function parseSpendCSV(text: string): { rows: SpendInput[]; errors: string[] } {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) return { rows: [], errors: ["need a header row and at least one data row"] };
  const header = splitCSVLine(lines[0]).map((cell) => cell.trim().toLowerCase());
  const index = (name: string) => header.indexOf(name);
  const dayAt = index("day") >= 0 ? index("day") : index("date");
  const channelAt = index("channel");
  const spendAt = index("spend");
  const spendCentsAt = index("spend_cents");
  if (dayAt < 0 || channelAt < 0 || (spendAt < 0 && spendCentsAt < 0)) {
    return { rows: [], errors: ["header must include day, channel and spend (or spend_cents)"] };
  }
  const rows: SpendInput[] = [];
  const errors: string[] = [];
  lines.slice(1).forEach((line, offset) => {
    const cells = splitCSVLine(line);
    const cell = (at: number) => (at >= 0 ? (cells[at] ?? "").trim() : "");
    const spendCents =
      spendCentsAt >= 0 ? Number(cell(spendCentsAt)) : Math.round(Number(cell(spendAt).replace(/[$,]/g, "")) * 100);
    const parsed = parseSpendInput({
      day: cell(dayAt),
      channel: cell(channelAt),
      spend_cents: spendCents,
      campaign: cell(index("campaign")),
      impressions: cell(index("impressions")),
      clicks: cell(index("clicks")),
      installs_attributed: cell(index("installs")) || cell(index("installs_attributed")),
      notes: cell(index("notes")),
      currency: cell(index("currency")) || "USD",
    });
    if (parsed.ok) rows.push(parsed.row);
    else errors.push(`line ${offset + 2}: ${parsed.error}`);
  });
  return { rows, errors };
}

function splitCSVLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else current += char;
  }
  cells.push(current);
  return cells;
}

export interface SpendLoad {
  rows: SpendRow[];
  applied: boolean;
}

export async function loadSpend(since: Date): Promise<SpendLoad> {
  const sinceDay = since.toISOString().slice(0, 10);
  try {
    const { rows } = await pageAll<SpendRow>((from, to) =>
      supabaseAdmin()
        .from("gather_marketing_spend")
        .select("id, day, channel, campaign, spend_cents, currency, impressions, clicks, installs_attributed, notes, created_at")
        .gte("day", sinceDay)
        .order("day", { ascending: false })
        .range(from, to),
    );
    return { rows, applied: true };
  } catch (err) {
    if (isMissingTable({ message: err instanceof Error ? err.message : String(err) })) {
      return { rows: [], applied: false };
    }
    throw err;
  }
}

export async function insertSpend(rows: SpendInput[]): Promise<number> {
  if (rows.length === 0) return 0;
  const { error, count } = await supabaseAdmin()
    .from("gather_marketing_spend")
    .insert(rows, { count: "exact" });
  if (error) throw new Error(error.message);
  return count ?? rows.length;
}

export async function deleteSpend(id: string): Promise<void> {
  const { error } = await supabaseAdmin().from("gather_marketing_spend").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export interface ChannelSummary {
  channel: string;
  spendCents: number;
  impressions: number;
  clicks: number;
  installsAttributed: number;
  /** Cost per attributed install, cents; null without attributed installs. */
  cacCents: number | null;
}

export interface AcquisitionSummary {
  spendCents: number;
  newInstalls: number;
  newSubscribers: number;
  /** Blended cost per new install and per new paying subscriber, cents. */
  blendedCacCents: number | null;
  costPerSubscriberCents: number | null;
  channels: ChannelSummary[];
  spendByDay: { key: string; value: number }[];
  installsByDay: { key: string; value: number }[];
}

export function summarizeAcquisition(
  spend: SpendRow[],
  installDays: string[],
  newSubscribers: number,
  since: Date,
  until: Date,
): AcquisitionSummary {
  const channels = new Map<string, ChannelSummary>();
  const spendByDay = new Map<string, number>();
  let spendCents = 0;
  for (const row of spend) {
    spendCents += row.spend_cents;
    spendByDay.set(row.day, (spendByDay.get(row.day) ?? 0) + row.spend_cents);
    let summary = channels.get(row.channel);
    if (!summary) {
      summary = { channel: row.channel, spendCents: 0, impressions: 0, clicks: 0, installsAttributed: 0, cacCents: null };
      channels.set(row.channel, summary);
    }
    summary.spendCents += row.spend_cents;
    summary.impressions += row.impressions ?? 0;
    summary.clicks += row.clicks ?? 0;
    summary.installsAttributed += row.installs_attributed ?? 0;
  }
  for (const summary of channels.values()) {
    summary.cacCents = summary.installsAttributed > 0 ? Math.round(summary.spendCents / summary.installsAttributed) : null;
  }
  const installsByDay = new Map<string, number>();
  for (const day of installDays) installsByDay.set(day, (installsByDay.get(day) ?? 0) + 1);
  const keys = bucketKeys(since, until, "day");
  const newInstalls = installDays.length;
  return {
    spendCents,
    newInstalls,
    newSubscribers,
    blendedCacCents: newInstalls > 0 && spendCents > 0 ? Math.round(spendCents / newInstalls) : null,
    costPerSubscriberCents: newSubscribers > 0 && spendCents > 0 ? Math.round(spendCents / newSubscribers) : null,
    channels: [...channels.values()].sort((a, b) => b.spendCents - a.spendCents),
    spendByDay: keys.map((key) => ({ key, value: spendByDay.get(key) ?? 0 })),
    installsByDay: keys.map((key) => ({ key, value: installsByDay.get(key) ?? 0 })),
  };
}

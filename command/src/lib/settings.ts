// Command-center settings: a key/value table (migration 043,
// gather_command_settings) so prices and the like are editable from the
// UI rather than baked into a deploy. Missing table → defaults.
import { isMissingTable, supabaseAdmin } from "./db.ts";

export interface PriceSetting {
  cents: number;
  period: "month" | "year";
  currency: string;
}

export interface Settings {
  /** Product id → list price. PRODUCT_MODEL §3: Club Monthly $5.99, Club
   * Annual $39.99, Family TBD (0 = unpriced, MRR shows as unknown). */
  prices: Record<string, PriceSetting>;
  /** Apple's cut used for net-revenue estimates: 15% under the Small
   * Business Program (PRODUCT_MODEL §3 step 1), 30% otherwise. */
  appleCommissionPercent: number;
  applied: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  prices: {
    "my.lgc.gather.club.monthly": { cents: 599, period: "month", currency: "USD" },
    "my.lgc.gather.club.annual": { cents: 3999, period: "year", currency: "USD" },
    "my.lgc.gather.family.annual": { cents: 0, period: "year", currency: "USD" },
  },
  appleCommissionPercent: 15,
  applied: false,
};

interface SettingRow {
  key: string;
  value: unknown;
}

export async function loadSettings(): Promise<Settings> {
  const { data, error } = await supabaseAdmin().from("gather_command_settings").select("key, value");
  if (error) {
    if (isMissingTable(error)) return { ...DEFAULT_SETTINGS, applied: false };
    throw new Error(error.message);
  }
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    prices: { ...DEFAULT_SETTINGS.prices },
    applied: true,
  };
  for (const row of (data ?? []) as SettingRow[]) {
    if (row.key === "prices" && row.value && typeof row.value === "object") {
      for (const [productId, raw] of Object.entries(row.value as Record<string, unknown>)) {
        const parsed = parsePrice(raw);
        if (parsed) settings.prices[productId] = parsed;
      }
    } else if (row.key === "apple_commission_percent" && typeof row.value === "number") {
      settings.appleCommissionPercent = row.value;
    }
  }
  return settings;
}

export function parsePrice(raw: unknown): PriceSetting | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const cents = Number(value.cents);
  const period = value.period === "year" ? "year" : value.period === "month" ? "month" : null;
  if (!Number.isInteger(cents) || cents < 0 || cents > 100_000_00 || !period) return null;
  const currency = typeof value.currency === "string" && /^[A-Z]{3}$/.test(value.currency) ? value.currency : "USD";
  return { cents, period, currency };
}

export async function saveSetting(key: string, value: unknown): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("gather_command_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(error.message);
}

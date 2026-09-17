// App Store Connect Sales Reports — downloads, updates and proceeds per
// day — pulled with an App Store Connect API key (a THIRD Apple key:
// distinct from the portal's Sign in with Apple key and its App Store
// Server API key, which cannot read reports). Env: ASC_ISSUER_ID,
// ASC_KEY_ID, ASC_PRIVATE_KEY (the .p8), ASC_VENDOR_NUMBER (Payments and
// Financial Reports → the vendor number). Reports are cached in migration
// 043's gather_appstore_sales_daily so the page never waits on Apple; the
// Refresh button (POST /api/appstore/sales/refresh) fills the gaps.
import { createPrivateKey, sign } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { isMissingTable, supabaseAdmin } from "./db.ts";

export interface ASCConfig {
  issuerId: string;
  keyId: string;
  privateKeyPEM: string;
  vendorNumber: string;
}

export function ascConfig(): ASCConfig | null {
  const issuerId = process.env.ASC_ISSUER_ID ?? "";
  const keyId = process.env.ASC_KEY_ID ?? "";
  const privateKeyPEM = process.env.ASC_PRIVATE_KEY ?? "";
  const vendorNumber = process.env.ASC_VENDOR_NUMBER ?? "";
  if (!issuerId || !keyId || !privateKeyPEM || !vendorNumber) return null;
  return { issuerId, keyId, privateKeyPEM, vendorNumber };
}

const base64url = (input: Buffer | string): string => Buffer.from(input).toString("base64url");

/** ES256 bearer for the App Store Connect API (max 20 minutes; five is
 * plenty for one report call). Same signing idiom as the portal's
 * buildAppStoreAPIToken: raw R||S, nothing persisted. */
export function buildASCToken(config: ASCConfig, at = new Date()): string {
  const header = base64url(JSON.stringify({ alg: "ES256", kid: config.keyId, typ: "JWT" }));
  const issuedAt = Math.floor(at.getTime() / 1000);
  const payload = base64url(
    JSON.stringify({ iss: config.issuerId, iat: issuedAt, exp: issuedAt + 5 * 60, aud: "appstoreconnect-v1" }),
  );
  const signingInput = `${header}.${payload}`;
  const signature = sign("sha256", Buffer.from(signingInput, "utf8"), {
    key: createPrivateKey(config.privateKeyPEM),
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${base64url(signature)}`;
}

export interface DailySales {
  day: string;
  downloads: number;
  updates: number;
  redownloads: number;
  /** Paid in-app purchase and subscription units (IA1/IA9/IAY…). */
  iapUnits: number;
  /** Free-trial and introductory subscription starts (IAC / IAY with a
   * zero proceeds line are counted as trials only when the price is 0). */
  trialStarts: number;
  proceedsCents: number;
  proceedsCurrency: string | null;
  countries: number;
}

/** Parse a SALES/SUMMARY/DAILY report (tab-separated, header row). Product
 * Type Identifier prefixes per Apple's report guide: 1/1F/1T/F1 = app
 * download, 7/7F/7T/F7 = update, 3/3F/3T/F3 = redownload, IA* = in-app.
 * Developer Proceeds is per unit, in the "Currency of Proceeds". */
export function parseSalesReport(tsv: string, day: string): DailySales {
  const lines = tsv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const result: DailySales = {
    day,
    downloads: 0,
    updates: 0,
    redownloads: 0,
    iapUnits: 0,
    trialStarts: 0,
    proceedsCents: 0,
    proceedsCurrency: null,
    countries: 0,
  };
  if (lines.length < 2) return result;
  const header = lines[0].split("\t").map((cell) => cell.trim().toLowerCase());
  const column = (name: string) => header.indexOf(name);
  const typeAt = column("product type identifier");
  const unitsAt = column("units");
  const proceedsAt = column("developer proceeds");
  const currencyAt = column("currency of proceeds");
  const countryAt = column("country code");
  const priceAt = column("customer price");
  const countries = new Set<string>();
  const currencies = new Map<string, number>();
  for (const line of lines.slice(1)) {
    const cells = line.split("\t");
    const type = (cells[typeAt] ?? "").trim();
    const units = Number(cells[unitsAt] ?? 0);
    if (!Number.isFinite(units)) continue;
    const proceeds = Number(cells[proceedsAt] ?? 0);
    const price = Number(cells[priceAt] ?? 0);
    const currency = (cells[currencyAt] ?? "").trim();
    if (countryAt >= 0 && cells[countryAt]) countries.add(cells[countryAt].trim());
    if (/^(1|1F|1T|F1)$/.test(type)) result.downloads += units;
    else if (/^(7|7F|7T|F7)$/.test(type)) result.updates += units;
    else if (/^(3|3F|3T|F3)$/.test(type)) result.redownloads += units;
    else if (type.startsWith("IA")) {
      if (Number.isFinite(price) && price === 0) result.trialStarts += units;
      else result.iapUnits += units;
    }
    if (Number.isFinite(proceeds) && proceeds !== 0 && currency) {
      currencies.set(currency, (currencies.get(currency) ?? 0) + proceeds * units);
    }
  }
  result.countries = countries.size;
  if (currencies.size > 0) {
    // One currency per vendor in practice (proceeds are paid in the
    // vendor's currency). If Apple ever mixes them, the largest wins and
    // the rest are dropped rather than summed across currencies.
    const [currency, amount] = [...currencies.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
    result.proceedsCurrency = currency;
    result.proceedsCents = Math.round(amount * 100);
  }
  return result;
}

export type ReportFetcher = (url: string, bearer: string) => Promise<{ status: number; body: ArrayBuffer }>;

const defaultFetcher: ReportFetcher = async (url, bearer) => {
  const response = await fetch(url, { headers: { authorization: `Bearer ${bearer}` }, cache: "no-store" });
  return { status: response.status, body: await response.arrayBuffer() };
};

/** One day's report; null when Apple has no report for that day yet (404
 * is normal for today and often yesterday before ~5am Pacific). */
export async function fetchDailySales(
  config: ASCConfig,
  day: string,
  fetcher: ReportFetcher = defaultFetcher,
): Promise<DailySales | null> {
  const url =
    "https://api.appstoreconnect.apple.com/v1/salesReports" +
    `?filter[frequency]=DAILY&filter[reportSubType]=SUMMARY&filter[reportType]=SALES` +
    `&filter[vendorNumber]=${encodeURIComponent(config.vendorNumber)}&filter[reportDate]=${day}`;
  const { status, body } = await fetcher(url, buildASCToken(config));
  if (status === 404) return null;
  if (status !== 200) throw new Error(`App Store Connect answered ${status} for ${day}`);
  const tsv = gunzipSync(Buffer.from(body)).toString("utf8");
  return parseSalesReport(tsv, day);
}

export interface SalesRow {
  day: string;
  downloads: number;
  updates: number;
  redownloads: number;
  iap_units: number;
  trial_starts: number;
  proceeds_cents: number;
  proceeds_currency: string | null;
  countries: number;
  fetched_at: string;
}

export async function loadSales(since: Date): Promise<{ rows: SalesRow[]; applied: boolean }> {
  const { data, error } = await supabaseAdmin()
    .from("gather_appstore_sales_daily")
    .select("day, downloads, updates, redownloads, iap_units, trial_starts, proceeds_cents, proceeds_currency, countries, fetched_at")
    .gte("day", since.toISOString().slice(0, 10))
    .order("day", { ascending: true })
    .limit(400);
  if (error) {
    if (isMissingTable(error)) return { rows: [], applied: false };
    throw new Error(error.message);
  }
  return { rows: (data ?? []) as SalesRow[], applied: true };
}

export async function upsertSales(sales: DailySales): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("gather_appstore_sales_daily")
    .upsert(
      {
        day: sales.day,
        downloads: sales.downloads,
        updates: sales.updates,
        redownloads: sales.redownloads,
        iap_units: sales.iapUnits,
        trial_starts: sales.trialStarts,
        proceeds_cents: sales.proceedsCents,
        proceeds_currency: sales.proceedsCurrency,
        countries: sales.countries,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "day" },
    );
  if (error) throw new Error(error.message);
}

/** Which days in the last `days` are not cached yet. Today is never
 * asked for (Apple publishes a day after it ends). */
export function missingDays(cached: Iterable<string>, days: number, now = new Date()): string[] {
  const have = new Set(cached);
  const missing: string[] = [];
  for (let back = 1; back <= days; back += 1) {
    const day = new Date(now.getTime() - back * 86_400_000).toISOString().slice(0, 10);
    if (!have.has(day)) missing.push(day);
  }
  return missing;
}

export interface RefreshReport {
  requested: number;
  fetched: number;
  unavailable: number;
  errors: string[];
}

export async function refreshSales(days = 30, fetcher: ReportFetcher = defaultFetcher): Promise<RefreshReport> {
  const config = ascConfig();
  if (!config) throw new Error("ASC_ISSUER_ID, ASC_KEY_ID, ASC_PRIVATE_KEY and ASC_VENDOR_NUMBER must be set");
  const { rows, applied } = await loadSales(new Date(Date.now() - (days + 1) * 86_400_000));
  if (!applied) throw new Error("migration 043 (gather_appstore_sales_daily) has not been applied");
  const report: RefreshReport = { requested: 0, fetched: 0, unavailable: 0, errors: [] };
  for (const day of missingDays(rows.map((row) => row.day), days)) {
    report.requested += 1;
    try {
      const sales = await fetchDailySales(config, day, fetcher);
      if (sales === null) {
        report.unavailable += 1;
        continue;
      }
      await upsertSales(sales);
      report.fetched += 1;
    } catch (err) {
      report.errors.push(`${day}: ${err instanceof Error ? err.message : "failed"}`);
      if (report.errors.length >= 3) break;
    }
  }
  return report;
}

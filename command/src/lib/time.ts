// Time bucketing for the command center. Pure (no I/O) so node:test can
// exercise it. Days follow the app's own clock: the Daily boards key to a
// Pacific day (portal migration 029), and the owner is in Manhattan Beach,
// so "today" here means today in America/Los_Angeles.

export const DASHBOARD_TIME_ZONE = "America/Los_Angeles";

export type Granularity = "minute" | "hour" | "day";

export interface Range {
  key: RangeKey;
  label: string;
  /** Window length in milliseconds. */
  ms: number;
  /** Default bucket size for the window. */
  granularity: Granularity;
}

export type RangeKey = "1h" | "6h" | "24h" | "7d" | "30d" | "90d";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const RANGES: Range[] = [
  { key: "1h", label: "Last hour", ms: HOUR, granularity: "minute" },
  { key: "6h", label: "6 hours", ms: 6 * HOUR, granularity: "minute" },
  { key: "24h", label: "24 hours", ms: DAY, granularity: "hour" },
  { key: "7d", label: "7 days", ms: 7 * DAY, granularity: "hour" },
  { key: "30d", label: "30 days", ms: 30 * DAY, granularity: "day" },
  { key: "90d", label: "90 days", ms: 90 * DAY, granularity: "day" },
];

export const DEFAULT_RANGE: RangeKey = "7d";

export function rangeFor(key: string | undefined | null): Range {
  return RANGES.find((range) => range.key === key) ?? RANGES.find((r) => r.key === DEFAULT_RANGE)!;
}

/** The bucket sizes that make sense for a window: never more than ~1,500
 * points, never fewer than two. */
export function granularitiesFor(range: Range): Granularity[] {
  const all: Granularity[] = ["minute", "hour", "day"];
  return all.filter((granularity) => {
    const points = range.ms / bucketMs(granularity);
    return points >= 2 && points <= 1_500;
  });
}

export function granularityFor(range: Range, requested: string | undefined | null): Granularity {
  const allowed = granularitiesFor(range);
  if (requested && (allowed as string[]).includes(requested)) return requested as Granularity;
  return allowed.includes(range.granularity) ? range.granularity : allowed[allowed.length - 1];
}

export function bucketMs(granularity: Granularity): number {
  switch (granularity) {
    case "minute":
      return 60_000;
    case "hour":
      return HOUR;
    case "day":
      return DAY;
  }
}

// --- zoned calendar helpers -------------------------------------------------

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let cached = partsFormatters.get(timeZone);
  if (!cached) {
    cached = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    });
    partsFormatters.set(timeZone, cached);
  }
  return cached;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function zonedParts(at: Date, timeZone = DASHBOARD_TIME_ZONE): ZonedParts {
  const parts = formatter(timeZone).formatToParts(at);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: Math.max(0, WEEKDAYS.indexOf(get("weekday"))),
  };
}

/** YYYY-MM-DD of the instant in the dashboard time zone. */
export function dayKey(at: Date, timeZone = DASHBOARD_TIME_ZONE): string {
  const { year, month, day } = zonedParts(at, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Bucket identity for an instant. Minute and hour buckets are exact UTC
 * multiples (a minute is a minute anywhere); day buckets are calendar days
 * in the dashboard zone, so a game at 11pm Pacific is "today", not
 * tomorrow's UTC date. */
export function bucketKey(at: Date, granularity: Granularity, timeZone = DASHBOARD_TIME_ZONE): string {
  if (granularity === "day") return dayKey(at, timeZone);
  const size = bucketMs(granularity);
  return new Date(Math.floor(at.getTime() / size) * size).toISOString();
}

/** Every bucket key between `since` and `until`, inclusive, in order — so a
 * quiet bucket plots as zero rather than vanishing. */
export function bucketKeys(
  since: Date,
  until: Date,
  granularity: Granularity,
  timeZone = DASHBOARD_TIME_ZONE,
): string[] {
  const keys: string[] = [];
  if (granularity === "day") {
    // Step in 12-hour increments so a DST transition can't skip a day, and
    // dedupe by calendar key.
    let cursor = since.getTime();
    let last = "";
    while (cursor <= until.getTime()) {
      const key = dayKey(new Date(cursor), timeZone);
      if (key !== last) {
        keys.push(key);
        last = key;
      }
      cursor += 12 * HOUR;
    }
    const finalKey = dayKey(until, timeZone);
    if (keys[keys.length - 1] !== finalKey) keys.push(finalKey);
    return keys;
  }
  const size = bucketMs(granularity);
  const start = Math.floor(since.getTime() / size) * size;
  const end = Math.floor(until.getTime() / size) * size;
  for (let cursor = start; cursor <= end; cursor += size) {
    keys.push(new Date(cursor).toISOString());
  }
  return keys;
}

/** Short axis label for a bucket key. */
export function bucketLabel(key: string, granularity: Granularity, timeZone = DASHBOARD_TIME_ZONE): string {
  if (granularity === "day") {
    const [year, month, day] = key.split("-").map(Number);
    const at = new Date(Date.UTC(year, month - 1, day, 12));
    return at.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  }
  const at = new Date(key);
  if (granularity === "hour") {
    return at.toLocaleString("en-US", { timeZone, month: "short", day: "numeric", hour: "numeric" });
  }
  return at.toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
}

/** Start of the current day (dashboard zone) as an instant. */
export function startOfToday(now = new Date(), timeZone = DASHBOARD_TIME_ZONE): Date {
  // Walk back minute by minute until the day key changes: cheap enough
  // (<= 1,440 steps) and immune to offset arithmetic mistakes.
  const today = dayKey(now, timeZone);
  let cursor = Math.floor(now.getTime() / 60_000) * 60_000;
  while (dayKey(new Date(cursor - 60_000), timeZone) === today) cursor -= 60_000;
  return new Date(cursor);
}

/** Monday-based start of the calendar week containing `at`, as a day key. */
export function weekKey(at: Date, timeZone = DASHBOARD_TIME_ZONE): string {
  const parts = zonedParts(at, timeZone);
  const offset = (parts.weekday + 6) % 7; // Monday = 0
  const noon = Date.UTC(parts.year, parts.month - 1, parts.day, 12);
  return new Date(noon - offset * DAY).toISOString().slice(0, 10);
}

export function monthKey(at: Date, timeZone = DASHBOARD_TIME_ZONE): string {
  return dayKey(at, timeZone).slice(0, 7);
}

export function ago(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return "never";
  const ms = now.getTime() - Date.parse(iso);
  if (!Number.isFinite(ms)) return "unknown";
  if (ms < 0) return "in the future";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function formatWhen(iso: string | null | undefined, timeZone = DASHBOARD_TIME_ZONE): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Attach axis labels to a series so a client chart never needs a
 * formatter function. `short` drops the date from hour labels (24-hour
 * views where the day is obvious). */
export function labelled<P extends { key: string }>(points: P[], granularity: Granularity, short = false): (P & { label: string })[] {
  return points.map((point) => {
    let label = bucketLabel(point.key, granularity);
    if (short && granularity === "hour") label = label.replace(/^\w+ \d+, /, "");
    return { ...point, label };
  });
}

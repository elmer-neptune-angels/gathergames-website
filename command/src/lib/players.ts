// Who plays: installs (gather_installs), accounts (gather_accounts), and the
// active-player counts derived from events. "Player" is the pseudonymous
// player_id the app stamps on every batch (PRODUCT_MODEL §4); an account
// can own several, so account counts are lower than player counts.
import { pageAll, supabaseAdmin } from "./db.ts";
import { actor, type EventRow } from "./events.ts";
import { bucketKeys, dayKey } from "./time.ts";

const DAY = 86_400_000;

export interface InstallRow {
  install_id: string;
  player_id: string;
  created_at: string;
  last_seen_at: string;
}

export async function loadInstalls(since: Date): Promise<InstallRow[]> {
  const sinceISO = since.toISOString();
  const { rows } = await pageAll<InstallRow>((from, to) =>
    supabaseAdmin()
      .from("gather_installs")
      .select("install_id, player_id, created_at, last_seen_at")
      .gte("created_at", sinceISO)
      .order("created_at", { ascending: true })
      .range(from, to),
  );
  return rows;
}

export async function countInstalls(): Promise<number> {
  const { count, error } = await supabaseAdmin()
    .from("gather_installs")
    .select("install_id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function countInstallsSeenSince(since: Date): Promise<number> {
  const { count, error } = await supabaseAdmin()
    .from("gather_installs")
    .select("install_id", { count: "exact", head: true })
    .gte("last_seen_at", since.toISOString());
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function countAccounts(): Promise<number> {
  const { count, error } = await supabaseAdmin()
    .from("gather_accounts")
    .select("account_id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export interface ActiveCounts {
  dau: number;
  wau: number;
  mau: number;
}

/** Distinct players with any event in the last 1 / 7 / 30 days, computed
 * from an event window that spans at least 30 days. */
export function activeCounts(events: EventRow[], now = new Date()): ActiveCounts {
  const day = new Set<string>();
  const week = new Set<string>();
  const month = new Set<string>();
  for (const event of events) {
    const age = now.getTime() - Date.parse(event.occurred_at);
    if (age < 0) continue;
    const who = actor(event);
    if (age <= DAY) day.add(who);
    if (age <= 7 * DAY) week.add(who);
    if (age <= 30 * DAY) month.add(who);
  }
  return { dau: day.size, wau: week.size, mau: month.size };
}

export interface RollingPoint {
  key: string;
  dau: number;
  wau: number;
  mau: number;
}

/** Per-day rolling actives across a window — the MAU line. O(days × events)
 * is fine at family scale; move to SQL when it is not. */
export function rollingActives(events: EventRow[], since: Date, until: Date): RollingPoint[] {
  const byActor = new Map<string, number[]>();
  for (const event of events) {
    const at = Date.parse(event.occurred_at);
    if (!Number.isFinite(at)) continue;
    const who = actor(event);
    const list = byActor.get(who);
    if (list) list.push(at);
    else byActor.set(who, [at]);
  }
  const dayEnds = bucketKeys(since, until, "day").map((key) => {
    const [year, month, day] = key.split("-").map(Number);
    // End of that calendar day, approximated in UTC then corrected by the
    // zone: a day key's end is the last instant whose dayKey matches.
    let end = Date.UTC(year, month - 1, day, 23, 59, 59);
    while (dayKey(new Date(end + 60_000)) === key) end += 60_000;
    while (dayKey(new Date(end)) !== key) end -= 60_000;
    return { key, end };
  });
  return dayEnds.map(({ key, end }) => {
    let dau = 0;
    let wau = 0;
    let mau = 0;
    for (const stamps of byActor.values()) {
      let seenDay = false;
      let seenWeek = false;
      let seenMonth = false;
      for (const at of stamps) {
        const age = end - at;
        if (age < 0) continue;
        if (age <= DAY) seenDay = true;
        if (age <= 7 * DAY) seenWeek = true;
        if (age <= 30 * DAY) {
          seenMonth = true;
          if (seenDay) break;
        }
      }
      if (seenDay) dau += 1;
      if (seenWeek) wau += 1;
      if (seenMonth) mau += 1;
    }
    return { key, dau, wau, mau };
  });
}

export interface RetentionCohort {
  week: string;
  installs: number;
  d1: number;
  d7: number;
  d30: number;
  /** Which of the three windows have fully elapsed for the cohort. */
  mature: { d1: boolean; d7: boolean; d30: boolean };
}

/** Weekly install cohorts and how many came back on or after day 1 / 7 /
 * 30 (any event from that player at least N days after the install). */
export function retentionCohorts(
  installs: InstallRow[],
  events: EventRow[],
  now = new Date(),
): RetentionCohort[] {
  const lastSeen = new Map<string, number[]>();
  for (const event of events) {
    if (!event.player_id) continue;
    const at = Date.parse(event.occurred_at);
    const list = lastSeen.get(event.player_id);
    if (list) list.push(at);
    else lastSeen.set(event.player_id, [at]);
  }
  const cohorts = new Map<string, RetentionCohort>();
  for (const install of installs) {
    const created = Date.parse(install.created_at);
    const weekStart = mondayOf(new Date(created));
    let cohort = cohorts.get(weekStart);
    if (!cohort) {
      cohort = {
        week: weekStart,
        installs: 0,
        d1: 0,
        d7: 0,
        d30: 0,
        mature: { d1: false, d7: false, d30: false },
      };
      cohorts.set(weekStart, cohort);
    }
    cohort.installs += 1;
    const stamps = lastSeen.get(install.player_id) ?? [];
    const returnedAfter = (days: number) => stamps.some((at) => at - created >= days * DAY);
    if (returnedAfter(1)) cohort.d1 += 1;
    if (returnedAfter(7)) cohort.d7 += 1;
    if (returnedAfter(30)) cohort.d30 += 1;
  }
  for (const cohort of cohorts.values()) {
    const weekEnd = Date.parse(`${cohort.week}T00:00:00Z`) + 7 * DAY;
    cohort.mature = {
      d1: now.getTime() - weekEnd >= DAY,
      d7: now.getTime() - weekEnd >= 7 * DAY,
      d30: now.getTime() - weekEnd >= 30 * DAY,
    };
  }
  return [...cohorts.values()].sort((a, b) => b.week.localeCompare(a.week));
}

function mondayOf(at: Date): string {
  const key = dayKey(at);
  const [year, month, day] = key.split("-").map(Number);
  const noon = new Date(Date.UTC(year, month - 1, day, 12));
  const offset = (noon.getUTCDay() + 6) % 7;
  return new Date(noon.getTime() - offset * DAY).toISOString().slice(0, 10);
}

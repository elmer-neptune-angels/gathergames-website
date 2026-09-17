// gather_events, read and aggregated. Event names are the 49 the app
// compiles in (portal privacy page, "Usage events"); the payload keys used
// here are the ones App/AppModel.swift's track() calls send.
import { pageAll, supabaseAdmin } from "./db.ts";
import {
  bucketKey,
  bucketKeys,
  type Granularity,
  zonedParts,
} from "./time.ts";

export interface EventRow {
  id: string;
  name: string;
  game_id: string | null;
  device_id: string;
  player_id: string | null;
  role: string | null;
  app_version: string | null;
  locale_region: string | null;
  occurred_at: string;
  received_at: string;
  payload: Record<string, unknown>;
}

export const EVENT_COLUMNS =
  "id, name, game_id, device_id, player_id, role, app_version, locale_region, occurred_at, received_at, payload";

/** One round played = one host-side game_started; solo Quick Play and the
 * Daily start rounds of their own. */
export const PLAY_EVENTS = new Set([
  "game_started",
  "quick_play_started",
  "daily_quick_play_started",
]);

/** Events that mean something went wrong for a player (a quit round is
 * not one; game_abandoned lives on the Play page). Not crashes — the
 * app has no crash reporter yet (see the System page) — but every refusal,
 * failure, and block the app records. `app_crash` is reserved: the moment
 * the app starts sending it (MetricKit's MXCrashDiagnostic on next launch)
 * it lights up here without a code change. */
export const ERROR_EVENTS = new Set([
  "app_crash",
  "purchase_failed",
  "apple_identity_link_failed",
  "online_room_ticket_refused",
  "match_refused",
  "match_blocked",
  "daily_quick_play_blocked",
  "practice_blocked",
]);

export interface EventWindow {
  since: Date;
  until: Date;
  events: EventRow[];
  truncated: boolean;
}

export async function loadEvents(since: Date, until = new Date(), cap = 60_000): Promise<EventWindow> {
  const sinceISO = since.toISOString();
  const untilISO = until.toISOString();
  const { rows, truncated } = await pageAll<EventRow>(
    (from, to) =>
      supabaseAdmin()
        .from("gather_events")
        .select(EVENT_COLUMNS)
        .gte("occurred_at", sinceISO)
        .lte("occurred_at", untilISO)
        .order("occurred_at", { ascending: false })
        .range(from, to),
    cap,
  );
  return { since, until, events: rows, truncated };
}

export async function loadRecentEvents(limit = 40): Promise<EventRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("gather_events")
    .select(EVENT_COLUMNS)
    .order("received_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as EventRow[];
}

export async function loadLatestReceivedAt(): Promise<string | null> {
  const { data, error } = await supabaseAdmin()
    .from("gather_events")
    .select("received_at")
    .order("received_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return (data?.[0] as { received_at: string } | undefined)?.received_at ?? null;
}

// --- aggregations -----------------------------------------------------------

export interface SeriesPoint {
  key: string;
  value: number;
}

export function countSeries(
  events: EventRow[],
  since: Date,
  until: Date,
  granularity: Granularity,
  match: (event: EventRow) => boolean,
): SeriesPoint[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (!match(event)) continue;
    const key = bucketKey(new Date(event.occurred_at), granularity);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return bucketKeys(since, until, granularity).map((key) => ({ key, value: counts.get(key) ?? 0 }));
}

/** Distinct players per bucket (falls back to device_id for a batch that
 * predates player identity). */
export function distinctSeries(
  events: EventRow[],
  since: Date,
  until: Date,
  granularity: Granularity,
): SeriesPoint[] {
  const sets = new Map<string, Set<string>>();
  for (const event of events) {
    const key = bucketKey(new Date(event.occurred_at), granularity);
    let set = sets.get(key);
    if (!set) {
      set = new Set();
      sets.set(key, set);
    }
    set.add(actor(event));
  }
  return bucketKeys(since, until, granularity).map((key) => ({ key, value: sets.get(key)?.size ?? 0 }));
}

export const actor = (event: EventRow): string => event.player_id ?? `device:${event.device_id}`;

export function distinctActors(events: EventRow[], match: (event: EventRow) => boolean = () => true): number {
  const set = new Set<string>();
  for (const event of events) if (match(event)) set.add(actor(event));
  return set.size;
}

export function countWhere(events: EventRow[], match: (event: EventRow) => boolean): number {
  let total = 0;
  for (const event of events) if (match(event)) total += 1;
  return total;
}

export interface GameActivity {
  gameId: string;
  proposed: number;
  started: number;
  finished: number;
  cancelled: number;
  abandoned: number;
  players: number;
  durationS: number;
  lastPlayed: string | null;
}

export function activityByGame(events: EventRow[]): GameActivity[] {
  const byGame = new Map<string, GameActivity>();
  for (const event of events) {
    if (!event.game_id) continue;
    let row = byGame.get(event.game_id);
    if (!row) {
      row = {
        gameId: event.game_id,
        proposed: 0,
        started: 0,
        finished: 0,
        cancelled: 0,
        abandoned: 0,
        players: 0,
        durationS: 0,
        lastPlayed: null,
      };
      byGame.set(event.game_id, row);
    }
    switch (event.name) {
      case "game_proposed":
        row.proposed += 1;
        break;
      case "game_started":
      case "quick_play_started":
      case "daily_quick_play_started": {
        row.started += 1;
        const players = Number(event.payload?.players ?? 1);
        row.players += Number.isFinite(players) ? players : 1;
        if (!row.lastPlayed || event.occurred_at > row.lastPlayed) row.lastPlayed = event.occurred_at;
        break;
      }
      case "game_finished": {
        row.finished += 1;
        const seconds = Number(event.payload?.duration_s ?? 0);
        if (Number.isFinite(seconds)) row.durationS += seconds;
        break;
      }
      case "game_cancelled":
        row.cancelled += 1;
        break;
      case "game_abandoned":
        row.abandoned += 1;
        break;
    }
  }
  return [...byGame.values()].sort((a, b) => b.started - a.started || a.gameId.localeCompare(b.gameId));
}

/** 7 × 24 grid of counts, rows Monday..Sunday, columns 0..23 (dashboard
 * zone), for the "when do people play" heatmap. */
export function weekdayHourGrid(events: EventRow[], match: (event: EventRow) => boolean): number[][] {
  const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const event of events) {
    if (!match(event)) continue;
    const parts = zonedParts(new Date(event.occurred_at));
    const row = (parts.weekday + 6) % 7; // Monday first
    grid[row][parts.hour] += 1;
  }
  return grid;
}

export interface NamedCount {
  name: string;
  count: number;
}

export function countBy(events: EventRow[], keyOf: (event: EventRow) => string | null): NamedCount[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    const key = keyOf(event);
    if (key === null) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Upload lag: how long queued offline events took to arrive. */
export function lagPercentiles(events: EventRow[]): { p50: number; p95: number; max: number } {
  const lags = events
    .map((event) => (Date.parse(event.received_at) - Date.parse(event.occurred_at)) / 1000)
    .filter((lag) => Number.isFinite(lag) && lag >= 0)
    .sort((a, b) => a - b);
  if (lags.length === 0) return { p50: 0, p95: 0, max: 0 };
  const at = (fraction: number) => lags[Math.min(lags.length - 1, Math.floor(fraction * lags.length))];
  return { p50: at(0.5), p95: at(0.95), max: lags[lags.length - 1] };
}

export function payloadString(event: EventRow, key: string): string | null {
  const value = event.payload?.[key];
  return typeof value === "string" ? value : null;
}

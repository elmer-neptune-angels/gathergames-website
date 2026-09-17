// System health: the two Vercel crons' receipts (portal migration 041), the
// relay host's heartbeats (042), how fresh the ingest is, and live probes
// of the portal and the relay. Nothing here writes.
import { isMissingTable, supabaseAdmin } from "./db.ts";

export interface CronRun {
  run_id: string;
  job: string;
  started_at: string;
  finished_at: string | null;
  ok: boolean | null;
  detail: Record<string, number | boolean>;
}

export const CRON_JOBS: { job: string; label: string; schedule: string }[] = [
  { job: "appstore_reconcile", label: "App Store reconcile", schedule: "09:00 UTC daily" },
  { job: "match_sweep", label: "Challenge sweep", schedule: "10:00 UTC daily" },
];

export async function loadCronRuns(limit = 40): Promise<{ runs: CronRun[]; applied: boolean }> {
  const { data, error } = await supabaseAdmin()
    .from("gather_cron_runs")
    .select("run_id, job, started_at, finished_at, ok, detail")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingTable(error)) return { runs: [], applied: false };
    throw new Error(error.message);
  }
  return { runs: (data ?? []) as CronRun[], applied: true };
}

export interface CronStatus {
  job: string;
  label: string;
  schedule: string;
  last: CronRun | null;
  /** "ok" when the last run finished ok within 36 hours; "late" when no
   * run in 36 hours; "failed" when the last run failed or never closed. */
  status: "ok" | "late" | "failed" | "unknown";
  recentFailures: number;
}

export function cronStatuses(runs: CronRun[], now = new Date()): CronStatus[] {
  return CRON_JOBS.map(({ job, label, schedule }) => {
    const mine = runs.filter((run) => run.job === job);
    const last = mine[0] ?? null;
    let status: CronStatus["status"] = "unknown";
    if (last) {
      const age = now.getTime() - Date.parse(last.started_at);
      const open = last.finished_at === null && age > 15 * 60_000;
      if (last.ok === false || open) status = "failed";
      else if (age > 36 * 3_600_000) status = "late";
      else status = "ok";
    }
    return {
      job,
      label,
      schedule,
      last,
      status,
      recentFailures: mine.slice(0, 7).filter((run) => run.ok === false).length,
    };
  });
}

export interface Heartbeat {
  beat_id: string;
  host_build: string;
  live_rooms: number;
  connections: number;
  refused_tickets: number;
  beat_at: string;
}

export async function loadHeartbeats(since: Date, limit = 2_000): Promise<{ beats: Heartbeat[]; applied: boolean }> {
  const { data, error } = await supabaseAdmin()
    .from("gather_host_heartbeats")
    .select("beat_id, host_build, live_rooms, connections, refused_tickets, beat_at")
    .gte("beat_at", since.toISOString())
    .order("beat_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingTable(error)) return { beats: [], applied: false };
    throw new Error(error.message);
  }
  return { beats: (data ?? []) as Heartbeat[], applied: true };
}

export interface Probe {
  name: string;
  url: string;
  ok: boolean;
  status: number | null;
  ms: number;
  note: string;
}

/** Live checks the page runs on every load: the portal's public config
 * endpoint (what every phone fetches on launch), the relay's /healthz, and
 * a trivial Supabase read. URLs come from env with the deployed defaults
 * (portal README; host/README.md). */
export async function probeAll(): Promise<Probe[]> {
  const portal = (process.env.PORTAL_BASE_URL ?? "https://gather-smoky.vercel.app").replace(/\/$/, "");
  const relay = (process.env.RELAY_HOST_URL ?? "https://gather-host.fly.dev").replace(/\/$/, "");
  const [config, healthz, database] = await Promise.all([
    probe("Portal · GET /api/config", `${portal}/api/config`, async (response) => {
      const body = (await response.json()) as { version?: number; games?: Record<string, unknown>; online_rooms?: boolean };
      const disabled = Object.values(body.games ?? {}).filter(
        (game) => (game as { enabled?: boolean }).enabled === false,
      ).length;
      return `config v${body.version ?? "?"} · ${disabled} game${disabled === 1 ? "" : "s"} off · online rooms ${body.online_rooms ? "on" : "off"}`;
    }),
    probe("Relay · GET /healthz", `${relay}/healthz`, async (response) => {
      const text = await response.text();
      return text.slice(0, 120).replace(/\s+/g, " ");
    }),
    probeDatabase(),
  ]);
  return [config, healthz, database];
}

async function probe(name: string, url: string, describe: (response: Response) => Promise<string>): Promise<Probe> {
  const started = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    clearTimeout(timer);
    const ms = Date.now() - started;
    let note = "";
    try {
      note = await describe(response);
    } catch {
      note = "unreadable body";
    }
    return { name, url, ok: response.ok, status: response.status, ms, note };
  } catch (err) {
    return {
      name,
      url,
      ok: false,
      status: null,
      ms: Date.now() - started,
      note: err instanceof Error && err.name === "AbortError" ? "timed out after 8s" : "unreachable",
    };
  }
}

async function probeDatabase(): Promise<Probe> {
  const started = Date.now();
  const url = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
  try {
    const { error, count } = await supabaseAdmin()
      .from("gather_game_config")
      .select("game_id", { count: "exact", head: true });
    if (error) throw new Error(error.message);
    return {
      name: "Supabase · gather_game_config",
      url,
      ok: true,
      status: 200,
      ms: Date.now() - started,
      note: `${count ?? 0} config rows`,
    };
  } catch (err) {
    return {
      name: "Supabase · gather_game_config",
      url,
      ok: false,
      status: null,
      ms: Date.now() - started,
      note: err instanceof Error ? err.message.slice(0, 120) : "query failed",
    };
  }
}

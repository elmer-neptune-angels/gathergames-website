import { redirect } from "next/navigation";
import { Card, ErrorBlock, Notice, Status } from "@/components/ui";
import { isAdmin } from "@/lib/auth";
import { activityByGame, loadEvents } from "@/lib/events";
import { games } from "@/lib/matrix";
import { supabaseAdmin } from "@/lib/db";
import GamesTable, { type GameRow } from "./GamesTable";

export const dynamic = "force-dynamic";

interface ConfigRow {
  game_id: string;
  enabled: boolean;
  params: Record<string, unknown> | null;
  notes: string | null;
  updated_at: string;
}

interface ServedConfig {
  version?: number;
  games?: Record<string, { enabled?: boolean }>;
  online_rooms?: boolean;
}

export default async function ControlsPage() {
  if (!(await isAdmin())) redirect("/login");
  const portal = (process.env.PORTAL_BASE_URL ?? "https://gather-smoky.vercel.app").replace(/\/$/, "");
  try {
    const [{ data, error }, { events }, served] = await Promise.all([
      supabaseAdmin().from("gather_game_config").select("game_id, enabled, params, notes, updated_at").order("game_id"),
      loadEvents(new Date(Date.now() - 7 * 86_400_000)),
      fetch(`${portal}/api/config`, { cache: "no-store" })
        .then(async (response) => (response.ok ? ((await response.json()) as ServedConfig) : null))
        .catch(() => null),
    ]);
    if (error) throw new Error(error.message);
    const configByID = new Map(((data ?? []) as ConfigRow[]).map((row) => [row.game_id, row]));
    const rounds = new Map(activityByGame(events).map((game) => [game.gameId, game.started]));
    const rows: GameRow[] = games.map((game) => {
      const config = configByID.get(game.id);
      return {
        gameId: game.id,
        name: game.name,
        implemented: game.implemented,
        held: game.availability === "held",
        enabled: config?.enabled ?? true,
        params: config?.params ? JSON.stringify(config.params) : "",
        notes: config?.notes ?? "",
        updatedAt: config?.updated_at ?? null,
        rounds7d: rounds.get(game.id) ?? 0,
      };
    });
    const servedOff = served?.games ? Object.entries(served.games).filter(([, value]) => value.enabled === false).map(([id]) => id) : [];
    const dbOff = rows.filter((row) => !row.enabled).map((row) => row.gameId);
    const drift = served ? servedOff.filter((id) => !dbOff.includes(id)).concat(dbOff.filter((id) => !servedOff.includes(id))) : [];
    return (
      <div>
        <div className="page-head">
          <div>
            <h1>Controls</h1>
            <p className="muted">Remote switches every phone honours the next time it checks in (launch or foreground, online). More controls land here as they are built; each one is a row in gather_game_config or a setting the app already reads.</p>
          </div>
        </div>
        <Card title="What phones are being served right now" subtitle={`GET ${portal}/api/config`}>
          {served === null ? (
            <Notice kind="bad">Could not fetch the live config from the portal. Phones may be running on their cached copy.</Notice>
          ) : (
            <div className="checks">
              <Status level="good">config v{served.version ?? "?"}</Status>
              <Status level={servedOff.length ? "warn" : "good"}>{servedOff.length} game{servedOff.length === 1 ? "" : "s"} off</Status>
              <Status level={served.online_rooms ? "good" : "off"}>online rooms {served.online_rooms ? "on" : "off (ONLINE_ROOMS_ENABLED on the portal)"}</Status>
              {drift.length > 0 && <Status level="warn">served config differs from the database for: {drift.join(", ")} (cache lag or a stale deploy)</Status>}
            </div>
          )}
        </Card>
        <Card title="Games" subtitle="Turning a game off removes it from every device's game list. Params are JSON handed to the game engine (Road Trip Bingo understands {&quot;winBonus&quot;: 10}); the app bounds every numeric value before use.">
          <GamesTable initialRows={rows} />
        </Card>
      </div>
    );
  } catch (err) {
    return <ErrorBlock title="Controls" error={err} />;
  }
}

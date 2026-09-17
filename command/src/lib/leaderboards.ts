// Leaderboards, read from the portal's own SQL: the all-time rollup view
// (gather_game_leaderboard_rollup, per game × board × grid), the one-row-
// per-player Fastest view (gather_game_fastest_runs), and the Daily
// ranking function (gather_ranked_daily_leaderboard, Pacific day). The
// app's precise ranking rules live in portal/src/lib/leaderboard-ranking.ts;
// this page shows the standings an owner wants to eyeball, not the exact
// in-app order for every metric.
import { pageAll, supabaseAdmin } from "./db.ts";
import { games } from "./matrix.ts";
import { dayKey } from "./time.ts";

export const FASTEST_TIME_GAMES = new Set([
  "crossword",
  "sudoku",
  "spot-the-difference",
  "countdown",
  "geode",
  "twin-balance",
  "waythread",
  "rectosaic",
  "crownlock",
]);

export const DAILY_GAMES = [
  "glyph",
  "countdown",
  "crossword",
  "memory-match",
  "spot-the-difference",
  "sudoku",
  "twin-balance",
  "waythread",
  "rectosaic",
  "crownlock",
  "geode",
];

export const LEADERBOARD_GAMES = games.filter(
  (game) => game.leaderboardEligible && game.availability === "launch",
);

export interface RollupRow {
  game_id: string;
  player_id: string;
  display_name: string;
  board_key: string | null;
  grid_size: number | null;
  games_played: number;
  wins: number;
  points: number;
  average_score: number;
  high_score: number;
  win_percentage: number;
  completed_games: number;
  average_duration_ms: number | null;
  best_duration_ms: number | null;
  timed_completions: number;
  latest_result_at: string | null;
}

export async function loadRollup(gameId: string): Promise<RollupRow[]> {
  const { rows } = await pageAll<RollupRow>(
    (from, to) =>
      supabaseAdmin()
        .from("gather_game_leaderboard_rollup")
        .select(
          "game_id, player_id, display_name, board_key, grid_size, games_played, wins, points, average_score, high_score, win_percentage, completed_games, average_duration_ms, best_duration_ms, timed_completions, latest_result_at",
        )
        .eq("game_id", gameId)
        .order("player_id", { ascending: true })
        .range(from, to),
    20_000,
  );
  return rows;
}

export interface Standing {
  rank: number;
  playerId: string;
  name: string;
  boardKey: string | null;
  gamesPlayed: number;
  wins: number;
  points: number;
  value: string;
  latest: string | null;
}

export type Board = "points" | "games" | "average_time" | "fastest";

export function boardsFor(gameId: string): Board[] {
  const boards: Board[] = ["points", "games"];
  if (FASTEST_TIME_GAMES.has(gameId)) boards.unshift("average_time", "fastest");
  return boards;
}

export const BOARD_LABELS: Record<Board, string> = {
  points: "Points",
  games: "Most played",
  average_time: "Avg time",
  fastest: "Fastest",
};

function ms(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.round(seconds - minutes * 60)).padStart(2, "0")}`;
}

/** Top N on one board. Rows are per (player, board_key, grid); the app's
 * "player" is the account-canonical identity, which the rollup already
 * folds (migration 034). */
export function rankRollup(rows: RollupRow[], board: Board, limit = 10, minimumGames = 1): Standing[] {
  let sorted: RollupRow[];
  let value: (row: RollupRow) => string;
  switch (board) {
    case "points":
      sorted = [...rows].sort((a, b) => b.points - a.points || b.wins - a.wins || a.games_played - b.games_played);
      value = (row) => row.points.toLocaleString("en-US");
      break;
    case "games":
      sorted = [...rows].sort((a, b) => b.games_played - a.games_played || b.wins - a.wins);
      value = (row) => `${row.games_played}`;
      break;
    case "average_time":
      sorted = rows
        .filter((row) => row.average_duration_ms !== null && (row.timed_completions ?? 0) >= minimumGames)
        .sort((a, b) => (a.average_duration_ms ?? Infinity) - (b.average_duration_ms ?? Infinity));
      value = (row) => ms(row.average_duration_ms);
      break;
    case "fastest":
      sorted = rows
        .filter((row) => row.best_duration_ms !== null)
        .sort((a, b) => (a.best_duration_ms ?? Infinity) - (b.best_duration_ms ?? Infinity));
      value = (row) => ms(row.best_duration_ms);
      break;
  }
  return sorted.slice(0, limit).map((row, index) => ({
    rank: index + 1,
    playerId: row.player_id,
    name: row.display_name,
    boardKey: row.board_key,
    gamesPlayed: row.games_played,
    wins: row.wins,
    points: row.points,
    value: value(row),
    latest: row.latest_result_at,
  }));
}

export interface DailyRow {
  rank: number;
  player_id: string;
  display_name: string;
  board_key: string;
  completed: boolean;
  score: number | null;
  duration_ms: number | null;
  guesses: number | null;
  created_at: string;
}

export async function loadDaily(gameId: string, day = dayKey(new Date()), limit = 10): Promise<DailyRow[]> {
  const { data, error } = await supabaseAdmin().rpc("gather_ranked_daily_leaderboard", {
    p_game_id: gameId,
    p_daily_key: day,
    p_player_ids: null,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as DailyRow[]).slice(0, limit);
}

export interface ResultVolume {
  game_id: string;
  count: number;
}

/** How many results landed per game in a window — leaderboard traffic. */
export async function loadResultVolume(since: Date): Promise<ResultVolume[]> {
  const { rows } = await pageAll<{ game_id: string }>(
    (from, to) =>
      supabaseAdmin()
        .from("gather_game_results")
        .select("game_id")
        .gte("created_at", since.toISOString())
        .range(from, to),
    50_000,
  );
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.game_id, (counts.get(row.game_id) ?? 0) + 1);
  return [...counts.entries()].map(([game_id, count]) => ({ game_id, count })).sort((a, b) => b.count - a.count);
}

export function formatDailyValue(row: DailyRow): string {
  if (row.guesses !== null && row.guesses !== undefined) return `${row.guesses} guess${row.guesses === 1 ? "" : "es"}`;
  if (row.duration_ms !== null && row.duration_ms !== undefined) return ms(row.duration_ms);
  if (row.score !== null && row.score !== undefined) return `${row.score} pts`;
  return row.completed ? "done" : "—";
}

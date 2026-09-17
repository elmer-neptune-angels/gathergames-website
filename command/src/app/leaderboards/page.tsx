import { redirect } from "next/navigation";
import { BarList } from "@/components/charts";
import { Card, ErrorBlock, Notice } from "@/components/ui";
import { isAdmin } from "@/lib/auth";
import { BOARD_LABELS, boardsFor, DAILY_GAMES, formatDailyValue, LEADERBOARD_GAMES, loadDaily, loadResultVolume, loadRollup, rankRollup } from "@/lib/leaderboards";
import { gameName } from "@/lib/matrix";
import { param, type SearchParams } from "@/lib/params";
import { dayKey, formatWhen } from "@/lib/time";
import GamePicker from "./GamePicker";

export const dynamic = "force-dynamic";

export default async function LeaderboardsPage({ searchParams }: { searchParams: SearchParams }) {
  if (!(await isAdmin())) redirect("/login");
  const requested = await param(searchParams, "game");
  const game = LEADERBOARD_GAMES.find((g) => g.id === requested) ?? LEADERBOARD_GAMES[0];
  const today = dayKey(new Date());
  try {
    const [rollup, daily, volume7, volume30] = await Promise.all([
      loadRollup(game.id),
      DAILY_GAMES.includes(game.id) ? loadDaily(game.id, today, 10).catch((err: Error) => err) : Promise.resolve(null),
      loadResultVolume(new Date(Date.now() - 7 * 86_400_000)),
      loadResultVolume(new Date(Date.now() - 30 * 86_400_000)),
    ]);
    const boards = boardsFor(game.id);
    const boardKeys = [...new Set(rollup.map((row) => row.board_key ?? "all"))].sort();
    const players = new Set(rollup.map((row) => row.player_id)).size;
    const results = rollup.reduce((sum, row) => sum + row.games_played, 0);
    return (
      <div>
        <div className="page-head">
          <div>
            <h1>Leaderboards</h1>
            <p className="muted">What players see in the app, from the same SQL views the app reads. Names are the display names players published.</p>
          </div>
          <GamePicker games={LEADERBOARD_GAMES.map((g) => ({ id: g.id, name: g.name }))} selected={game.id} />
        </div>
        <div className="tiles">
          <div className="tile">
            <div className="tile-label">{game.name} · ranked players</div>
            <div className="tile-value">{players.toLocaleString("en-US")}</div>
            <div className="tile-foot muted">{results.toLocaleString("en-US")} results all-time{boardKeys.length > 1 ? ` · boards: ${boardKeys.join(", ")}` : ""}</div>
          </div>
          <div className="tile">
            <div className="tile-label">Results uploaded · 7 days, all games</div>
            <div className="tile-value">{volume7.reduce((sum, row) => sum + row.count, 0).toLocaleString("en-US")}</div>
            <div className="tile-foot muted">{volume30.reduce((sum, row) => sum + row.count, 0).toLocaleString("en-US")} in 30 days</div>
          </div>
        </div>
        <div className="grid">
          {boards.map((board) => {
            const standings = rankRollup(rollup, board, 10, board === "average_time" ? 3 : 1);
            return (
              <Card key={board} title={`${game.name} · ${BOARD_LABELS[board]}`} subtitle={board === "average_time" ? "At least 3 timed completions. Rows are per board (difficulty or mode)." : "All-time, one row per player and board."}>
                {standings.length === 0 ? (
                  <p className="muted">No ranked results yet.</p>
                ) : (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th className="rank">#</th>
                          <th>Player</th>
                          {boardKeys.length > 1 && <th>Board</th>}
                          <th className="num">{BOARD_LABELS[board]}</th>
                          <th className="num">Played</th>
                          <th className="num">Wins</th>
                          <th>Latest</th>
                        </tr>
                      </thead>
                      <tbody>
                        {standings.map((row) => (
                          <tr key={`${row.playerId}-${row.boardKey}`} className={row.rank <= 3 ? `medal-${row.rank}` : ""}>
                            <td className="rank">{row.rank}</td>
                            <td>{row.name}</td>
                            {boardKeys.length > 1 && <td className="muted">{row.boardKey ?? "—"}</td>}
                            <td className="num">{row.value}</td>
                            <td className="num">{row.gamesPlayed}</td>
                            <td className="num">{row.wins}</td>
                            <td className="muted when">{formatWhen(row.latest)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}
          {daily !== null && (
            <Card title={`${game.name} · Daily · ${today}`} subtitle="Today's Pacific-day board, first attempt per player.">
              {daily instanceof Error ? (
                <Notice kind="warn">Daily board unavailable: {daily.message}</Notice>
              ) : daily.length === 0 ? (
                <p className="muted">Nobody has played today&apos;s Daily yet.</p>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th className="rank">#</th>
                        <th>Player</th>
                        <th className="num">Result</th>
                        <th>When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {daily.map((row) => (
                        <tr key={row.player_id} className={row.rank <= 3 ? `medal-${row.rank}` : ""}>
                          <td className="rank">{row.rank}</td>
                          <td>{row.display_name}</td>
                          <td className="num">{formatDailyValue(row)}</td>
                          <td className="muted when">{formatWhen(row.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
          <Card title="Results uploaded by game · 7 days" subtitle="Leaderboard traffic: rows landing in gather_game_results.">
            <BarList rows={volume7.slice(0, 12).map((row) => ({ label: gameName(row.game_id), value: row.count }))} ariaLabel="Results uploaded per game in the last 7 days" />
          </Card>
        </div>
      </div>
    );
  } catch (err) {
    return <ErrorBlock title="Leaderboards" error={err} />;
  }
}

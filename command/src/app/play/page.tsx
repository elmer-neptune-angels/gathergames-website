import { redirect } from "next/navigation";
import RangePicker from "@/components/RangePicker";
import { BarList, ColumnChart, Heatmap, LineChart } from "@/components/charts";
import { Card, ErrorBlock, Notice, StatTile } from "@/components/ui";
import { isAdmin } from "@/lib/auth";
import { activityByGame, countBy, countSeries, countWhere, distinctActors, loadEvents, PLAY_EVENTS, weekdayHourGrid } from "@/lib/events";
import { compact, duration, percent } from "@/lib/format";
import { gameName } from "@/lib/matrix";
import { windowFrom, type SearchParams } from "@/lib/params";
import { bucketLabel, labelled } from "@/lib/time";

export const dynamic = "force-dynamic";

const HOURS = Array.from({ length: 24 }, (_, hour) => (hour === 0 ? "12a" : hour < 12 ? `${hour}a` : hour === 12 ? "12p" : `${hour - 12}p`));
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function PlayPage({ searchParams }: { searchParams: SearchParams }) {
  if (!(await isAdmin())) redirect("/login");
  const window = await windowFrom(searchParams);
  try {
    const { events, truncated } = await loadEvents(window.since, window.until);
    const isPlay = (e: { name: string }) => PLAY_EVENTS.has(e.name);
    const label = <P extends { key: string }>(points: P[]) => labelled(points, window.granularity, window.range.ms <= 86_400_000);
    const rounds = countSeries(events, window.since, window.until, window.granularity, isPlay);
    const roomRounds = countSeries(events, window.since, window.until, window.granularity, (e) => e.name === "game_started");
    const solo = countSeries(events, window.since, window.until, window.granularity, (e) => e.name === "quick_play_started" || e.name === "daily_quick_play_started");
    const rooms = countSeries(events, window.since, window.until, window.granularity, (e) => e.name === "room_created" || e.name === "room_reopened");
    const started = countWhere(events, isPlay);
    const finished = countWhere(events, (e) => e.name === "game_finished");
    const abandoned = countWhere(events, (e) => e.name === "game_abandoned" || e.name === "game_cancelled");
    const games = activityByGame(events);
    const totalPlayers = games.reduce((sum, game) => sum + game.players, 0);
    const roomStarts = games.reduce((sum, game) => sum + game.started, 0);
    const transports = countBy(events, (e) => (e.name === "room_created" ? (typeof e.payload?.transport === "string" ? e.payload.transport : "nearby") : null));
    const difficulty = countBy(events, (e) => (e.name === "game_started" && typeof e.payload?.difficulty_mode === "string" ? e.payload.difficulty_mode : null));
    const grid = weekdayHourGrid(events, isPlay);
    return (
      <div>
        <div className="page-head">
          <div>
            <h1>Play</h1>
            <p className="muted">Rounds by minute, hour or day; which games, how long, how many at the table, and when.</p>
          </div>
        </div>
        <RangePicker range={window.range.key} granularity={window.granularity} granularities={window.granularities} />
        {truncated && <Notice kind="warn">This window hit the event cap; counts below are a lower bound. Pick a shorter window.</Notice>}
        <div className="tiles">
          <StatTile label="Rounds started" value={compact(started)} note={`${compact(distinctActors(events, isPlay))} hosts/players`} />
          <StatTile label="Rounds finished" value={compact(finished)} note={`${percent(finished, started)} completion`} />
          <StatTile label="Abandoned or cancelled" value={compact(abandoned)} note={percent(abandoned, started)} />
          <StatTile label="Avg players per round" value={roomStarts ? (totalPlayers / roomStarts).toFixed(1) : "—"} />
          <StatTile label="Rooms opened" value={compact(countWhere(events, (e) => e.name === "room_created"))} note={transports.map((t) => `${t.name} ${t.count}`).join(" · ")} />
          <StatTile label="Avg round length" value={duration(finished ? games.reduce((sum, g) => sum + g.durationS, 0) / finished : null)} />
        </div>
        <div className="grid">
          <Card title={`Rounds by ${window.granularity}`} subtitle="Room rounds are host-side starts; solo is Quick Play and the Daily." wide>
            <LineChart
              series={[
                { name: "room rounds", points: label(roomRounds), slot: 1 },
                { name: "solo rounds", points: label(solo), slot: 2 },
              ]}
              ariaLabel="Rounds started per bucket, room versus solo"
            />
          </Card>
          <Card title="All rounds" subtitle="Room and solo together.">
            {window.granularity === "day" ? (
              <ColumnChart points={label(rounds)} ariaLabel="Rounds per day" />
            ) : (
              <LineChart series={[{ name: "rounds", points: label(rounds) }]} area ariaLabel="Rounds per bucket" />
            )}
          </Card>
          <Card title="Rooms opened" subtitle="room_created plus room_reopened.">
            <ColumnChart points={label(rooms)} ariaLabel="Rooms opened per bucket" />
          </Card>
          <Card title="When people play" subtitle="Rounds by weekday and hour, Pacific." wide>
            <Heatmap grid={grid} rowLabels={DAYS} colLabels={HOURS} ariaLabel="Rounds by weekday and hour" />
          </Card>
          <Card title="Difficulty mode" subtitle="How room rounds were started.">
            <BarList rows={difficulty.map((row) => ({ label: row.name, value: row.count }))} ariaLabel="Rounds by difficulty mode" />
          </Card>
          <Card title="Rounds by game" subtitle="Proposed, started, finished; completion and length." wide>
            {games.length === 0 ? (
              <p className="muted">No rounds in this window.</p>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Game</th>
                      <th className="num">Proposed</th>
                      <th className="num">Started</th>
                      <th className="num">Finished</th>
                      <th className="num">Completion</th>
                      <th className="num">Abandoned</th>
                      <th className="num">Avg players</th>
                      <th className="num">Avg round</th>
                      <th>Last played</th>
                    </tr>
                  </thead>
                  <tbody>
                    {games.map((game) => (
                      <tr key={game.gameId}>
                        <td>{gameName(game.gameId)}</td>
                        <td className="num">{game.proposed}</td>
                        <td className="num">{game.started}</td>
                        <td className="num">{game.finished}</td>
                        <td className="num">{percent(game.finished, game.started)}</td>
                        <td className="num">{game.abandoned + game.cancelled}</td>
                        <td className="num">{game.started ? (game.players / game.started).toFixed(1) : "—"}</td>
                        <td className="num">{duration(game.finished ? game.durationS / game.finished : null)}</td>
                        <td className="muted">{game.lastPlayed ? bucketLabel(game.lastPlayed, "minute") : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    );
  } catch (err) {
    return <ErrorBlock title="Play" error={err} />;
  }
}

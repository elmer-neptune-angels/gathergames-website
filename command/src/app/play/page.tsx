import { redirect } from "next/navigation";
import RangePicker from "@/components/RangePicker";
import { BarList, ColumnChart, Heatmap, LineChart } from "@/components/charts";
import { Card, ErrorBlock, Notice, StatTile } from "@/components/ui";
import { isAdmin } from "@/lib/auth";
import { activityByGame, countBy, countSeries, countWhere, distinctActors, isRoundStart, isSoloRound, LAUNCH_DAILY, LAUNCH_QUICK_PLAY, loadEvents, weekdayHourGrid } from "@/lib/events";
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
    const isPlay = isRoundStart;
    const label = <P extends { key: string }>(points: P[]) => labelled(points, window.granularity, window.range.ms <= 86_400_000);
    const rounds = countSeries(events, window.since, window.until, window.granularity, isPlay);
    // Split from one event's own payload rather than by counting a second
    // event: a solo round emits BOTH game_started and a launch marker, so
    // adding the markers would count it twice.
    const soloRounds = countSeries(events, window.since, window.until, window.granularity, isSoloRound);
    const groupRounds = countSeries(events, window.since, window.until, window.granularity, (e) => isRoundStart(e) && !isSoloRound(e));
    const rooms = countSeries(events, window.since, window.until, window.granularity, (e) => e.name === "room_created" || e.name === "room_reopened");
    const started = countWhere(events, isPlay);
    const finished = countWhere(events, (e) => e.name === "game_finished");
    const abandoned = countWhere(events, (e) => e.name === "game_abandoned" || e.name === "game_cancelled");
    const games = activityByGame(events);
    // Launch markers describe rounds already counted above, so they are
    // reported beside the round count rather than added to it.
    const dailyLaunches = countWhere(events, (e) => e.name === LAUNCH_DAILY);
    const quickLaunches = countWhere(events, (e) => e.name === LAUNCH_QUICK_PLAY);
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
          <StatTile label="Launched from the Daily" value={compact(dailyLaunches)} note={`${compact(quickLaunches)} from Quick Play`} />
          <StatTile label="Rounds finished" value={compact(finished)} note={`${percent(finished, started)} completion`} />
          <StatTile label="Abandoned or cancelled" value={compact(abandoned)} note={percent(abandoned, started)} />
          <StatTile label="Avg players per round" value={roomStarts ? (totalPlayers / roomStarts).toFixed(1) : "—"} />
          <StatTile label="Rooms opened" value={compact(countWhere(events, (e) => e.name === "room_created"))} note={transports.map((t) => `${t.name} ${t.count}`).join(" · ")} />
          <StatTile label="Avg round length" value={duration(finished ? games.reduce((sum, g) => sum + g.durationS, 0) / finished : null)} />
        </div>
        <div className="grid">
          <Card title={`Rounds by ${window.granularity}`} subtitle="Every round emits one host-side start; the split is how many players were dealt in." wide>
            <LineChart
              series={[
                { name: "two or more players", points: label(groupRounds), slot: 1 },
                { name: "one player", points: label(soloRounds), slot: 2 },
              ]}
              ariaLabel="Rounds started per bucket, split by how many players were dealt in"
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
          <Card title="Difficulty mode" subtitle="How rounds were started, room and solo alike.">
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
                      <th className="num">Of those, Daily</th>
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
                        <td className="num">{game.dailyLaunches || "—"}</td>
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

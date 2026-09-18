import { redirect } from "next/navigation";
import { AutoRefresh } from "@/components/Shell";
import Feed from "@/components/Feed";
import { ColumnChart, LineChart, BarList } from "@/components/charts";
import { Card, ErrorBlock, StatTile, Status } from "@/components/ui";
import { loadMirror, PAYING_STATES, subscriptionState } from "@/lib/apple";
import { isAdmin } from "@/lib/auth";
import {
  activityByGame,
  countSeries,
  countWhere,
  ERROR_EVENTS,
  loadEvents,
  loadLatestReceivedAt,
  loadRecentEvents,
  isRoundStart,
} from "@/lib/events";
import { compact } from "@/lib/format";
import { gameName } from "@/lib/matrix";
import { activeCounts, countInstalls, loadInstalls } from "@/lib/players";
import { cronStatuses, loadCronRuns, loadHeartbeats } from "@/lib/system";
import { ago, dayKey, labelled, startOfToday } from "@/lib/time";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;

export default async function OverviewPage() {
  if (!(await isAdmin())) redirect("/login");
  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * DAY);
  try {
    const [window30, recent, latestReceived, mirror, installs, installsTotal, cron, beats] = await Promise.all([
      loadEvents(since30, now),
      loadRecentEvents(40),
      loadLatestReceivedAt(),
      loadMirror().catch(() => []),
      loadInstalls(since30),
      countInstalls(),
      loadCronRuns(20).catch(() => ({ runs: [], applied: false })),
      loadHeartbeats(new Date(now.getTime() - DAY), 5).catch(() => ({ beats: [], applied: false })),
    ]);
    const events = window30.events;
    const isPlay = isRoundStart;
    const todayStart = startOfToday(now);
    const todayKey = dayKey(now);
    const yesterdayKey = dayKey(new Date(todayStart.getTime() - 1000));
    const playedToday = countWhere(events, (e) => isPlay(e) && Date.parse(e.occurred_at) >= todayStart.getTime());
    const playedYesterday = countWhere(events, (e) => isPlay(e) && dayKey(new Date(e.occurred_at)) === yesterdayKey);
    const active = activeCounts(events, now);
    const last7 = events.filter((e) => now.getTime() - Date.parse(e.occurred_at) <= 7 * DAY);
    const prior7 = events.filter((e) => {
      const age = now.getTime() - Date.parse(e.occurred_at);
      return age > 7 * DAY && age <= 14 * DAY;
    });
    const played7 = countWhere(last7, isPlay);
    const playedPrior7 = countWhere(prior7, isPlay);
    const roomsToday = countWhere(events, (e) => e.name === "room_created" && Date.parse(e.occurred_at) >= todayStart.getTime());
    const errors24 = countWhere(events, (e) => ERROR_EVENTS.has(e.name) && now.getTime() - Date.parse(e.occurred_at) <= DAY);
    const errorsPrior24 = countWhere(events, (e) => {
      const age = now.getTime() - Date.parse(e.occurred_at);
      return ERROR_EVENTS.has(e.name) && age > DAY && age <= 2 * DAY;
    });
    const installsToday = installs.filter((row) => Date.parse(row.created_at) >= todayStart.getTime()).length;
    const installs7 = installs.filter((row) => now.getTime() - Date.parse(row.created_at) <= 7 * DAY).length;
    const paying = mirror.filter((row) => row.environment === "Production" && PAYING_STATES.has(subscriptionState(row, now))).length;
    const perHour = countSeries(events, new Date(now.getTime() - DAY), now, "hour", isPlay);
    const perDay = countSeries(events, since30, now, "day", isPlay);
    const topGames = activityByGame(last7).slice(0, 8);
    const crons = cronStatuses(cron.runs, now);
    const beat = beats.beats[0] ?? null;
    const beatAge = beat ? now.getTime() - Date.parse(beat.beat_at) : null;
    const ingestAge = latestReceived ? now.getTime() - Date.parse(latestReceived) : null;

    return (
      <div>
        <div className="page-head">
          <div>
            <h1>Overview</h1>
            <p className="muted">Today is {todayKey} in Pacific time. Rounds count host-side starts, so one round is one number however many phones were at the table.</p>
          </div>
          <AutoRefresh seconds={30} />
        </div>

        <div className="tiles">
          <StatTile hero label="Rounds played today" value={compact(playedToday)} delta={playedToday - playedYesterday} deltaLabel="vs all of yesterday" trend={perDay.slice(-14)} />
          <StatTile label="Rounds · 7 days" value={compact(played7)} delta={played7 - playedPrior7} deltaLabel="vs prior 7d" />
          <StatTile label="Daily active players" value={compact(active.dau)} note={`WAU ${compact(active.wau)}`} />
          <StatTile label="Monthly active players" value={compact(active.mau)} note={`${compact(installsTotal)} installs all-time`} />
          <StatTile label="Rooms opened today" value={compact(roomsToday)} />
          <StatTile label="New installs today" value={compact(installsToday)} note={`${installs7} this week`} />
          <StatTile label="Paying subscribers" value={compact(paying)} note="Production, per Apple mirror" />
          <StatTile label="Errors · 24h" value={compact(errors24)} delta={errors24 - errorsPrior24} deltaLabel="vs prior 24h" upIsGood={false} />
        </div>

        <div className="grid">
          <Card title="Rounds per hour · last 24 hours" subtitle="Hover for the count; times are Pacific.">
            <ColumnChart points={labelled(perHour, "hour", true)} ariaLabel="Rounds played per hour over the last 24 hours" />
          </Card>
          <Card title="Rounds per day · last 30 days">
            <LineChart series={[{ name: "rounds", points: labelled(perDay, "day") }]} area ariaLabel="Rounds played per day over the last 30 days" />
          </Card>
          <Card title="Most played · 7 days" subtitle="Rounds started, by game.">
            <BarList rows={topGames.map((game) => ({ label: gameName(game.gameId), value: game.started, note: game.finished ? `· ${game.finished} finished` : undefined }))} ariaLabel="Most played games in the last 7 days" />
          </Card>
          <Card title="System" subtitle="Detail on the System page.">
            <div className="checks">
              <Status level={ingestAge === null ? "off" : ingestAge < 6 * 3_600_000 ? "good" : ingestAge < 2 * DAY ? "warn" : "bad"}>
                ingest {ago(latestReceived, now)}
              </Status>
              {crons.map((job) => (
                <Status key={job.job} level={job.status === "ok" ? "good" : job.status === "late" ? "warn" : job.status === "failed" ? "bad" : "off"}>
                  {job.label} {job.last ? ago(job.last.started_at, now) : "no runs"}
                </Status>
              ))}
              <Status level={beatAge === null ? "off" : beatAge < 5 * 60_000 ? "good" : beatAge < 3_600_000 ? "warn" : "bad"}>
                relay {beat ? `${beat.live_rooms} rooms · ${beat.connections} conn · beat ${ago(beat.beat_at, now)}` : "no heartbeat"}
              </Status>
              {window30.truncated && <Status level="warn">30-day event window truncated at cap</Status>}
            </div>
          </Card>
          <Card title="Live feed" subtitle="The newest events as they arrive. Error-class events in red." wide>
            <Feed events={recent} />
          </Card>
        </div>
      </div>
    );
  } catch (err) {
    return <ErrorBlock title="Overview" error={err} />;
  }
}

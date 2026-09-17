import { redirect } from "next/navigation";
import { AutoRefresh } from "@/components/Shell";
import { BarList, ColumnChart, LineChart } from "@/components/charts";
import { Card, ErrorBlock, Notice, StatTile, Status } from "@/components/ui";
import { isAdmin } from "@/lib/auth";
import { countBy, countSeries, ERROR_EVENTS, lagPercentiles, loadEvents, loadLatestReceivedAt, payloadString } from "@/lib/events";
import { compact, duration } from "@/lib/format";
import { gameName } from "@/lib/matrix";
import { cronStatuses, loadCronRuns, loadHeartbeats, probeAll } from "@/lib/system";
import { ago, bucketKey, bucketKeys, formatWhen, labelled } from "@/lib/time";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;

export default async function SystemPage() {
  if (!(await isAdmin())) redirect("/login");
  const now = new Date();
  try {
    const [probes, latestReceived, { events, truncated }, cron, beats] = await Promise.all([
      probeAll(),
      loadLatestReceivedAt(),
      loadEvents(new Date(now.getTime() - 7 * DAY), now),
      loadCronRuns(40),
      loadHeartbeats(new Date(now.getTime() - DAY)),
    ]);
    const last24 = events.filter((e) => now.getTime() - Date.parse(e.occurred_at) <= DAY);
    const errors7 = events.filter((e) => ERROR_EVENTS.has(e.name));
    const errorSeries = countSeries(events, new Date(now.getTime() - 7 * DAY), now, "hour", (e) => ERROR_EVENTS.has(e.name));
    const errorTypes = countBy(errors7, (e) => e.name);
    const reasons = countBy(errors7, (e) => {
      const reason = payloadString(e, "reason") ?? payloadString(e, "outcome") ?? payloadString(e, "error_domain");
      return reason ? `${reason} · ${e.name}${e.game_id ? ` · ${gameName(e.game_id)}` : ""}` : null;
    });
    const crashes = events.filter((e) => e.name === "app_crash");
    const received = (() => {
      const since = new Date(now.getTime() - DAY);
      const counts = new Map<string, number>();
      for (const event of last24) {
        const key = bucketKey(new Date(event.received_at), "hour");
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return bucketKeys(since, now, "hour").map((key) => ({ key, value: counts.get(key) ?? 0 }));
    })();
    const lag = lagPercentiles(last24);
    const crons = cronStatuses(cron.runs, now);
    const beat = beats.beats[0] ?? null;
    const beatAge = beat ? now.getTime() - Date.parse(beat.beat_at) : null;
    const beatSeries = [...beats.beats].reverse();
    const ingestAge = latestReceived ? now.getTime() - Date.parse(latestReceived) : null;
    return (
      <div>
        <div className="page-head">
          <div>
            <h1>System</h1>
            <p className="muted">Live probes of the portal, the relay and the database; the crons&apos; receipts; ingest freshness; and every error-class event the app reports.</p>
          </div>
          <AutoRefresh seconds={60} />
        </div>
        <div className="tiles">
          {probes.map((probe) => (
            <div key={probe.name} className="tile">
              <div className="tile-label">{probe.name}</div>
              <div className="tile-value" style={{ fontSize: 22 }}>
                <Status level={probe.ok ? (probe.ms > 3000 ? "warn" : "good") : "bad"}>
                  {probe.status ?? "—"} · {probe.ms} ms
                </Status>
              </div>
              <div className="tile-foot muted">{probe.note}</div>
            </div>
          ))}
          <StatTile label="Last event received" value={ago(latestReceived, now)} note={latestReceived ? formatWhen(latestReceived) : "no events yet"} />
          <StatTile label="Events · 24h" value={compact(last24.length)} note={`upload lag p50 ${duration(lag.p50)} · p95 ${duration(lag.p95)}`} />
          <StatTile label="Error events · 24h" value={compact(last24.filter((e) => ERROR_EVENTS.has(e.name)).length)} upIsGood={false} note={`${errors7.length} in 7 days`} />
          <StatTile label="App crashes · 7d" value={compact(crashes.length)} upIsGood={false} note={crashes.length === 0 ? "no crash reporter wired yet" : "from app_crash events"} />
        </div>
        {ingestAge !== null && ingestAge > 2 * DAY && <Notice kind="warn">Nothing has been received from any phone for {ago(latestReceived, now)}. Either nobody has opened the app online, or the ingest path is broken — check the portal probe above and the app&apos;s /api/ingest route.</Notice>}
        {truncated && <Notice kind="warn">7-day event window truncated; error counts are a lower bound.</Notice>}
        <div className="grid">
          <Card title="Scheduled jobs" subtitle="Receipts from gather_cron_runs (migration 041). A job with no receipt in 36 hours is late; a run that never closed is a failure." wide>
            {!cron.applied ? (
              <Notice kind="warn">Migration 041 is not applied; no receipts to read.</Notice>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Job</th>
                      <th>Status</th>
                      <th>Last run</th>
                      <th className="num">Took</th>
                      <th>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {crons.map((job) => (
                      <tr key={job.job}>
                        <td>
                          {job.label}
                          <div className="muted" style={{ fontSize: 12 }}>{job.schedule}</div>
                        </td>
                        <td>
                          <Status level={job.status === "ok" ? "good" : job.status === "late" ? "warn" : job.status === "failed" ? "bad" : "off"}>{job.status}</Status>
                          {job.recentFailures > 0 && <div className="muted" style={{ fontSize: 12 }}>{job.recentFailures} of last 7 failed</div>}
                        </td>
                        <td className="muted">{job.last ? `${formatWhen(job.last.started_at)} (${ago(job.last.started_at, now)})` : "never"}</td>
                        <td className="num">{job.last?.finished_at ? `${Math.round((Date.parse(job.last.finished_at) - Date.parse(job.last.started_at)) / 1000)}s` : "—"}</td>
                        <td className="mono muted">{job.last ? Object.entries(job.last.detail).map(([key, value]) => `${key}=${value}`).join(" ") : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <Card title="Relay host" subtitle="Heartbeats from the Fly.io relay (gather_host_heartbeats). Rooms and connections it is carrying right now.">
            {!beats.applied ? (
              <Notice kind="warn">Migration 042 is not applied.</Notice>
            ) : beat === null ? (
              <p className="muted">No heartbeat in the last 24 hours. The relay is down, or ROOM_HOST_SECRET / GATHER_PORTAL_BASE_URL are unset on Fly.</p>
            ) : (
              <>
                <div className="checks" style={{ marginBottom: 10 }}>
                  <Status level={beatAge !== null && beatAge < 5 * 60_000 ? "good" : beatAge !== null && beatAge < 3_600_000 ? "warn" : "bad"}>last beat {ago(beat.beat_at, now)}</Status>
                  <span className="muted">build {beat.host_build.slice(0, 7)} · {beat.live_rooms} rooms · {beat.connections} connections · {beat.refused_tickets} refused tickets</span>
                </div>
                <LineChart
                  series={[
                    { name: "rooms", points: labelled(beatSeries.map((b) => ({ key: b.beat_at, value: b.live_rooms })), "minute"), slot: 1 },
                    { name: "connections", points: labelled(beatSeries.map((b) => ({ key: b.beat_at, value: b.connections })), "minute"), slot: 2 },
                  ]}
                  height={160}
                  ariaLabel="Relay live rooms and connections over the last 24 hours"
                />
              </>
            )}
          </Card>
          <Card title="Events received per hour · 24h" subtitle="By the time the portal stored them — an idle ingest reads as a flat line.">
            <ColumnChart points={labelled(received, "hour", true)} ariaLabel="Events received per hour" />
          </Card>
          <Card title="Error-class events per hour · 7 days">
            <LineChart series={[{ name: "errors", points: labelled(errorSeries, "hour"), slot: 8 }]} area ariaLabel="Error events per hour over 7 days" />
          </Card>
          <Card title="Errors by type · 7 days" subtitle="Failures, refusals and blocks the app records.">
            <BarList rows={errorTypes.map((t) => ({ label: t.name, value: t.count, slot: 8 }))} ariaLabel="Error events by type" />
          </Card>
          <Card title="Top reasons · 7 days" subtitle="The reason word each refusal carried.">
            <BarList rows={reasons.slice(0, 12).map((t) => ({ label: t.name, value: t.count, slot: 8 }))} ariaLabel="Error reasons" />
          </Card>
          <Card title="Crash reporting" subtitle="Not wired yet." wide>
            <p className="muted" style={{ fontSize: 13.5, maxWidth: "80ch" }}>
              The app sends no crash diagnostics today, so the only crash signal is Xcode Organizer / App Store Connect. To see crashes here, have the app subscribe to
              MetricKit (<code className="mono">MXMetricManager.shared.add(self)</code>) and, on the next launch after a crash, queue one <code className="mono">app_crash</code> telemetry event carrying the
              diagnostic&apos;s exception type and signal as short labels (never a stack trace, to keep the privacy page true). This page and the Overview already count
              <code className="mono"> app_crash</code> events, so nothing on the portal side needs to change. Adding a 50th event name means updating the privacy page&apos;s
              usage-event list and the parity test that pins it.
            </p>
          </Card>
        </div>
      </div>
    );
  } catch (err) {
    return <ErrorBlock title="System" error={err} />;
  }
}

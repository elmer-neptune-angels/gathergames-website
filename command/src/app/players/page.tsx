import { redirect } from "next/navigation";
import RangePicker from "@/components/RangePicker";
import { BarList, ColumnChart, LineChart } from "@/components/charts";
import { Card, ErrorBlock, Notice, StatTile } from "@/components/ui";
import { isAdmin } from "@/lib/auth";
import { actor, countBy, countSeries, distinctSeries, loadEvents } from "@/lib/events";
import { compact, percent } from "@/lib/format";
import { windowFrom, type SearchParams } from "@/lib/params";
import { activeCounts, countAccounts, countInstalls, countInstallsSeenSince, loadInstalls, retentionCohorts, rollingActives } from "@/lib/players";
import { dayKey, labelled } from "@/lib/time";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;

export default async function PlayersPage({ searchParams }: { searchParams: SearchParams }) {
  if (!(await isAdmin())) redirect("/login");
  const window = await windowFrom(searchParams);
  const now = window.until;
  // Actives and retention need 30 days of history whatever the window.
  const historySince = new Date(Math.min(window.since.getTime(), now.getTime() - 60 * DAY));
  try {
    const [{ events, truncated }, installs, installsTotal, accounts, seen30] = await Promise.all([
      loadEvents(historySince, now, 80_000),
      loadInstalls(new Date(now.getTime() - 90 * DAY)),
      countInstalls(),
      countAccounts(),
      countInstallsSeenSince(new Date(now.getTime() - 30 * DAY)),
    ]);
    const inWindow = events.filter((e) => Date.parse(e.occurred_at) >= window.since.getTime());
    const active = activeCounts(events, now);
    const rolling = rollingActives(events, new Date(now.getTime() - 30 * DAY), now);
    const label = <P extends { key: string }>(points: P[]) => labelled(points, window.granularity, window.range.ms <= 86_400_000);
    const activePerBucket = distinctSeries(inWindow, window.since, window.until, window.granularity);
    const opens = countSeries(inWindow, window.since, window.until, window.granularity, (e) => e.name === "app_open");
    const installsInWindow = installs.filter((row) => Date.parse(row.created_at) >= window.since.getTime());
    const installSeries = (() => {
      const counts = new Map<string, number>();
      for (const row of installsInWindow) {
        const key = window.granularity === "day" ? dayKey(new Date(row.created_at)) : new Date(Math.floor(Date.parse(row.created_at) / (window.granularity === "hour" ? 3_600_000 : 60_000)) * (window.granularity === "hour" ? 3_600_000 : 60_000)).toISOString();
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return activePerBucket.map((point) => ({ key: point.key, value: counts.get(point.key) ?? 0 }));
    })();
    const regions = countBy(inWindow, (e) => e.locale_region ?? null);
    const regionPlayers = (() => {
      const byRegion = new Map<string, Set<string>>();
      for (const event of inWindow) {
        const region = event.locale_region ?? "unknown";
        let set = byRegion.get(region);
        if (!set) {
          set = new Set();
          byRegion.set(region, set);
        }
        set.add(actor(event));
      }
      return [...byRegion.entries()].map(([name, set]) => ({ label: name, value: set.size })).sort((a, b) => b.value - a.value).slice(0, 10);
    })();
    const versions = (() => {
      const byVersion = new Map<string, Set<string>>();
      for (const event of inWindow) {
        const version = event.app_version ?? "unknown";
        let set = byVersion.get(version);
        if (!set) {
          set = new Set();
          byVersion.set(version, set);
        }
        set.add(actor(event));
      }
      return [...byVersion.entries()].map(([name, set]) => ({ label: name, value: set.size })).sort((a, b) => b.value - a.value).slice(0, 10);
    })();
    const sessions = inWindow.filter((e) => e.name === "app_background" && Number.isFinite(Number(e.payload?.foreground_s)));
    const avgSession = sessions.length ? sessions.reduce((sum, e) => sum + Number(e.payload?.foreground_s), 0) / sessions.length : null;
    const cohorts = retentionCohorts(installs, events, now).slice(0, 10);
    void regions;
    return (
      <div>
        <div className="page-head">
          <div>
            <h1>Players</h1>
            <p className="muted">Pseudonymous player ids from event batches. Accounts are optional Sign in with Apple links, so they run well below players.</p>
          </div>
        </div>
        <RangePicker range={window.range.key} granularity={window.granularity} granularities={window.granularities} />
        {truncated && <Notice kind="warn">The 60-day history hit the event cap; actives and retention are lower bounds.</Notice>}
        <div className="tiles">
          <StatTile label="Daily active" value={compact(active.dau)} trend={rolling.slice(-14).map((p) => ({ key: p.key, value: p.dau }))} />
          <StatTile label="Weekly active" value={compact(active.wau)} trend={rolling.slice(-14).map((p) => ({ key: p.key, value: p.wau }))} />
          <StatTile label="Monthly active" value={compact(active.mau)} note={`DAU/MAU ${percent(active.dau, active.mau)}`} trend={rolling.slice(-14).map((p) => ({ key: p.key, value: p.mau }))} />
          <StatTile label="Installs registered" value={compact(installsTotal)} note={`${compact(seen30)} seen in 30d`} />
          <StatTile label={`New installs · ${window.range.label.toLowerCase()}`} value={compact(installsInWindow.length)} />
          <StatTile label="Accounts (Apple sign-in)" value={compact(accounts)} />
          <StatTile label="Avg foreground session" value={avgSession === null ? "—" : `${Math.round(avgSession / 60)} min`} note={`${compact(sessions.length)} sessions`} />
        </div>
        <div className="grid">
          <Card title="Active players · rolling 30 days" subtitle="Distinct players with any event in the trailing 1, 7 and 30 days." wide>
            <LineChart
              series={[
                { name: "MAU", points: labelled(rolling.map((p) => ({ key: p.key, value: p.mau })), "day"), slot: 1 },
                { name: "WAU", points: labelled(rolling.map((p) => ({ key: p.key, value: p.wau })), "day"), slot: 2 },
                { name: "DAU", points: labelled(rolling.map((p) => ({ key: p.key, value: p.dau })), "day"), slot: 3 },
              ]}
              ariaLabel="Rolling daily, weekly and monthly active players"
            />
          </Card>
          <Card title={`Active players by ${window.granularity}`}>
            <LineChart series={[{ name: "players", points: label(activePerBucket) }]} area ariaLabel="Distinct active players per bucket" />
          </Card>
          <Card title={`App opens by ${window.granularity}`}>
            <ColumnChart points={label(opens)} ariaLabel="App opens per bucket" />
          </Card>
          <Card title={`New installs by ${window.granularity}`} subtitle="Install credentials registered (gather_installs).">
            <ColumnChart points={label(installSeries)} ariaLabel="New installs per bucket" slot={3} />
          </Card>
          <Card title="Retention by install week" subtitle="Share of each week's installs seen again 1, 7 and 30+ days after installing. Greyed cells have not matured yet.">
            {cohorts.length === 0 ? (
              <p className="muted">No installs in the last 90 days.</p>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Week of</th>
                      <th className="num">Installs</th>
                      <th className="num">D1</th>
                      <th className="num">D7</th>
                      <th className="num">D30</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cohorts.map((cohort) => (
                      <tr key={cohort.week}>
                        <td>{cohort.week}</td>
                        <td className="num">{cohort.installs}</td>
                        <td className={`num${cohort.mature.d1 ? "" : " muted"}`}>{percent(cohort.d1, cohort.installs)}</td>
                        <td className={`num${cohort.mature.d7 ? "" : " muted"}`}>{percent(cohort.d7, cohort.installs)}</td>
                        <td className={`num${cohort.mature.d30 ? "" : " muted"}`}>{percent(cohort.d30, cohort.installs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <Card title="Players by region" subtitle="Device region code, never IP.">
            <BarList rows={regionPlayers} ariaLabel="Players by region" />
          </Card>
          <Card title="Players by app version" subtitle="Who is on which build.">
            <BarList rows={versions} ariaLabel="Players by app version" />
          </Card>
        </div>
      </div>
    );
  } catch (err) {
    return <ErrorBlock title="Players" error={err} />;
  }
}

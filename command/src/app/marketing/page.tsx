import { redirect } from "next/navigation";
import RangePicker from "@/components/RangePicker";
import { BarList, ColumnChart } from "@/components/charts";
import { Card, ErrorBlock, Notice, StatTile } from "@/components/ui";
import { loadMirror } from "@/lib/apple";
import { isAdmin } from "@/lib/auth";
import { compact, money, percent } from "@/lib/format";
import { CHANNELS, loadSpend, summarizeAcquisition } from "@/lib/marketing";
import { windowFrom, type SearchParams } from "@/lib/params";
import { loadInstalls } from "@/lib/players";
import { dayKey, labelled } from "@/lib/time";
import SpendEditor from "./SpendEditor";

export const dynamic = "force-dynamic";

export default async function MarketingPage({ searchParams }: { searchParams: SearchParams }) {
  if (!(await isAdmin())) redirect("/login");
  const window = await windowFrom(searchParams);
  try {
    const [spend, installs, mirror] = await Promise.all([loadSpend(window.since), loadInstalls(window.since), loadMirror().catch(() => [])]);
    const newSubscribers = mirror.filter((row) => row.environment === "Production" && Date.parse(row.created_at) >= window.since.getTime()).length;
    const summary = summarizeAcquisition(spend.rows, installs.map((row) => dayKey(new Date(row.created_at))), newSubscribers, window.since, window.until);
    const channelSet = [...new Set([...CHANNELS, ...spend.rows.map((row) => row.channel)])];
    const clicks = summary.channels.reduce((sum, c) => sum + c.clicks, 0);
    const impressions = summary.channels.reduce((sum, c) => sum + c.impressions, 0);
    const attributed = summary.channels.reduce((sum, c) => sum + c.installsAttributed, 0);
    return (
      <div>
        <div className="page-head">
          <div>
            <h1>Marketing</h1>
            <p className="muted">Spend is logged here by hand or CSV until an ad network is wired in. Blended CAC divides spend by real install registrations; per-channel CAC uses what the network claims.</p>
          </div>
        </div>
        <RangePicker range={window.range.key} granularity={window.granularity} granularities={["day"]} />
        {!spend.applied && <Notice kind="warn">Migration 043 has not been applied, so there is no spend table yet. Run supabase/migrations/043_command_center.sql in the Supabase SQL editor.</Notice>}
        <div className="tiles">
          <StatTile hero label={`Spend · ${window.range.label.toLowerCase()}`} value={money(summary.spendCents)} note={`${summary.channels.length} channel${summary.channels.length === 1 ? "" : "s"}`} />
          <StatTile label="New installs" value={compact(summary.newInstalls)} note={attributed ? `${attributed} attributed by networks` : "from install registrations"} />
          <StatTile label="Blended CAC" value={summary.blendedCacCents === null ? "—" : money(summary.blendedCacCents)} note="spend ÷ new installs" />
          <StatTile label="New subscribers" value={compact(summary.newSubscribers)} note="Production subscriptions started" />
          <StatTile label="Cost per subscriber" value={summary.costPerSubscriberCents === null ? "—" : money(summary.costPerSubscriberCents)} note="spend ÷ new subscribers" />
          <StatTile label="Click-through" value={percent(clicks, impressions)} note={`${compact(clicks)} clicks · ${compact(impressions)} impressions`} />
          <StatTile label="Install rate" value={percent(attributed, clicks)} note="attributed installs ÷ clicks" />
        </div>
        <div className="grid">
          <Card title="Spend per day">
            <ColumnChart points={labelled(summary.spendByDay.map((p) => ({ key: p.key, value: p.value / 100 })), "day")} money="USD" ariaLabel="Marketing spend per day" />
          </Card>
          <Card title="New installs per day" subtitle="Install credentials registered, on its own axis beside spend — never overlaid.">
            <ColumnChart points={labelled(summary.installsByDay, "day")} ariaLabel="New installs per day" slot={3} />
          </Card>
          <Card title="Spend by channel">
            <BarList rows={summary.channels.map((c) => ({ label: c.channel, value: c.spendCents / 100, note: c.cacCents !== null ? `· CAC ${money(c.cacCents)}` : undefined }))} money="USD" ariaLabel="Spend by channel" />
          </Card>
          <Card title="Channel detail" wide>
            {summary.channels.length === 0 ? (
              <p className="muted">Nothing logged yet.</p>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Channel</th>
                      <th className="num">Spend</th>
                      <th className="num">Impr.</th>
                      <th className="num">Clicks</th>
                      <th className="num">CTR</th>
                      <th className="num">Installs</th>
                      <th className="num">CAC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.channels.map((c) => (
                      <tr key={c.channel}>
                        <td>{c.channel}</td>
                        <td className="num">{money(c.spendCents)}</td>
                        <td className="num">{compact(c.impressions)}</td>
                        <td className="num">{compact(c.clicks)}</td>
                        <td className="num">{percent(c.clicks, c.impressions)}</td>
                        <td className="num">{c.installsAttributed || "—"}</td>
                        <td className="num">{c.cacCents === null ? "—" : money(c.cacCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <Card title="Log spend" wide>
            <SpendEditor
              applied={spend.applied}
              channels={channelSet}
              rows={spend.rows.map((row) => ({
                id: row.id,
                day: row.day,
                channel: row.channel,
                campaign: row.campaign ?? "",
                spend: money(row.spend_cents, row.currency),
                impressions: row.impressions?.toLocaleString("en-US") ?? "",
                clicks: row.clicks?.toLocaleString("en-US") ?? "",
                installs: row.installs_attributed?.toLocaleString("en-US") ?? "",
                notes: row.notes ?? "",
              }))}
            />
          </Card>
        </div>
      </div>
    );
  } catch (err) {
    return <ErrorBlock title="Marketing" error={err} />;
  }
}

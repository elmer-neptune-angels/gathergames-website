import { redirect } from "next/navigation";
import RangePicker from "@/components/RangePicker";
import { BarList, ColumnChart, LineChart } from "@/components/charts";
import { Card, ErrorBlock, Notice, StatTile } from "@/components/ui";
import { APPLE_STATUS, loadMirror, loadNotifications, productName, purchaseFunnel, summarizeMirror } from "@/lib/apple";
import { ascConfig, loadSales } from "@/lib/appstore-sales";
import { isAdmin } from "@/lib/auth";
import { countBy, countSeries, loadEvents } from "@/lib/events";
import { compact, money, percent } from "@/lib/format";
import { windowFrom, type SearchParams } from "@/lib/params";
import { loadSettings } from "@/lib/settings";
import { ago, bucketLabel, formatWhen, labelled } from "@/lib/time";
import PriceSettings from "./PriceSettings";
import RefreshSales from "./RefreshSales";

export const dynamic = "force-dynamic";

export default async function RevenuePage({ searchParams }: { searchParams: SearchParams }) {
  if (!(await isAdmin())) redirect("/login");
  const window = await windowFrom(searchParams);
  const now = window.until;
  try {
    const [mirror, notifications, { events, truncated }, settings, sales] = await Promise.all([
      loadMirror(),
      loadNotifications(window.since),
      loadEvents(window.since, now),
      loadSettings(),
      loadSales(window.since),
    ]);
    const production = summarizeMirror(mirror, "Production", window.since, now, settings, now);
    const sandbox = summarizeMirror(mirror, "Sandbox", window.since, now, settings, now);
    const funnel = purchaseFunnel(events);
    const label = <P extends { key: string }>(points: P[]) => labelled(points, window.granularity, window.range.ms <= 86_400_000);
    const paywalls = countSeries(events, window.since, now, window.granularity, (e) => e.name === "paywall_shown");
    const purchases = countSeries(events, window.since, now, window.granularity, (e) => e.name === "purchase_completed");
    const newSubs = production.newByDay.reduce((sum, p) => sum + p.value, 0);
    const ended = production.endedByDay.reduce((sum, p) => sum + p.value, 0);
    const notificationTypes = countBy(
      notifications.filter((n) => n.environment === "Production").map((n) => ({ ...emptyEvent, name: n.notification_type })),
      (e) => e.name,
    );
    const netFactor = 1 - settings.appleCommissionPercent / 100;
    const asc = ascConfig() !== null;
    const salesDownloads = sales.rows.map((row) => ({ key: row.day, value: row.downloads }));
    const salesProceeds = sales.rows.map((row) => ({ key: row.day, value: row.proceeds_cents / 100 }));
    const totalDownloads = sales.rows.reduce((sum, row) => sum + row.downloads, 0);
    const totalProceeds = sales.rows.reduce((sum, row) => sum + row.proceeds_cents, 0);
    return (
      <div>
        <div className="page-head">
          <div>
            <h1>Revenue</h1>
            <p className="muted">Subscriptions from the App Store Server Notifications mirror (healed daily by the reconcile cron), the paywall funnel from app events, and App Store Connect sales when the API key is configured.</p>
          </div>
        </div>
        <RangePicker range={window.range.key} granularity={window.granularity} granularities={window.granularities} />
        {truncated && <Notice kind="warn">Event window truncated; funnel counts are a lower bound.</Notice>}
        <div className="tiles">
          <StatTile hero label="Paying subscribers · Production" value={compact(production.paying)} note={`${production.autoRenewOff} set to lapse · ${production.products.map((p) => `${p.name} ${p.active + p.grace + p.billingRetry}`).join(" · ")}`} />
          <StatTile label="Estimated MRR" value={production.mrrCents === null ? "unpriced" : money(production.mrrCents)} note={production.mrrCents === null ? "set every product price below" : `≈ ${money(Math.round(production.mrrCents * netFactor))} net of Apple`} />
          <StatTile label={`New subscriptions · ${window.range.label.toLowerCase()}`} value={compact(newSubs)} delta={newSubs - ended} deltaLabel="net of lapses" />
          <StatTile label="Lapsed or refunded" value={compact(ended)} upIsGood={false} />
          <StatTile label="Paywall → purchase" value={percent(funnel.purchaseCompleted, funnel.paywallViewers)} note={`${funnel.paywallViewers} viewers · ${funnel.purchaseCompleted} purchases`} />
          <StatTile label="Purchase failures" value={compact(funnel.purchaseFailed)} upIsGood={false} note={`${funnel.purchaseStarted} started`} />
          {sandbox.total > 0 && <StatTile label="Sandbox rows" value={compact(sandbox.total)} note={`${sandbox.paying} active in Sandbox`} />}
        </div>
        <div className="grid">
          <Card title="Subscriptions by product" subtitle="Current state of every Production subscription the mirror knows." wide>
            {production.products.length === 0 ? (
              <p className="muted">No Production subscriptions yet.</p>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th className="num">Active</th>
                      <th className="num">Grace</th>
                      <th className="num">Billing retry</th>
                      <th className="num">Lapsed</th>
                      <th className="num">Revoked</th>
                      <th className="num">Auto-renew off</th>
                      <th className="num">MRR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {production.products.map((product) => (
                      <tr key={product.productId}>
                        <td>{product.name}</td>
                        <td className="num">{product.active}</td>
                        <td className="num">{product.grace}</td>
                        <td className="num">{product.billingRetry}</td>
                        <td className="num">{product.lapsed}</td>
                        <td className="num">{product.revoked}</td>
                        <td className="num">{product.autoRenewOff}</td>
                        <td className="num">{product.mrrCents === null ? "—" : money(product.mrrCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <Card title="New vs lapsed subscriptions · by day" subtitle="From the mirror's created_at and expiry/revocation stamps.">
            <LineChart
              series={[
                { name: "new", points: labelled(production.newByDay, "day"), slot: 1 },
                { name: "lapsed / refunded", points: labelled(production.endedByDay, "day"), slot: 2 },
              ]}
              ariaLabel="New versus lapsed subscriptions per day"
            />
          </Card>
          <Card title={`Paywall views by ${window.granularity}`}>
            <ColumnChart points={label(paywalls)} ariaLabel="Paywall views per bucket" />
          </Card>
          <Card title={`Purchases completed by ${window.granularity}`}>
            <ColumnChart points={label(purchases)} ariaLabel="Purchases per bucket" slot={3} />
          </Card>
          <Card title="Paywall sources" subtitle="Where the paywall was opened from, and how many of those converted.">
            <BarList rows={funnel.bySource.map((s) => ({ label: s.name, value: s.shown, note: `· ${s.completed} bought` }))} ariaLabel="Paywall views by source" />
          </Card>
          <Card title="Apple notifications · Production" subtitle={`${notifications.length} received in the window (both environments).`}>
            <BarList rows={notificationTypes.map((t) => ({ label: t.name, value: t.count }))} ariaLabel="App Store notifications by type" />
          </Card>
          <Card title="App Store Connect · downloads and proceeds" subtitle={asc ? `${sales.rows.length} days cached · last fetched ${ago(sales.rows.at(-1)?.fetched_at, now)}` : "Set ASC_ISSUER_ID, ASC_KEY_ID, ASC_PRIVATE_KEY and ASC_VENDOR_NUMBER on the deployment to pull daily Sales reports."} actions={<RefreshSales configured={asc && sales.applied} />} wide>
            {!sales.applied ? (
              <Notice kind="warn">Migration 043 (gather_appstore_sales_daily) is not applied.</Notice>
            ) : sales.rows.length === 0 ? (
              <p className="muted">No days cached yet{asc ? " — press Refresh from Apple." : "."}</p>
            ) : (
              <div className="grid" style={{ marginBottom: 0 }}>
                <div>
                  <p className="muted" style={{ fontSize: 13 }}>Downloads per day · {compact(totalDownloads)} in window</p>
                  <ColumnChart points={labelled(salesDownloads, "day")} ariaLabel="App Store downloads per day" />
                </div>
                <div>
                  <p className="muted" style={{ fontSize: 13 }}>Developer proceeds per day · {money(totalProceeds, sales.rows[0].proceeds_currency ?? "USD")} in window</p>
                  <ColumnChart points={labelled(salesProceeds, "day")} money={sales.rows[0].proceeds_currency ?? "USD"} ariaLabel="Developer proceeds per day" slot={3} />
                </div>
              </div>
            )}
          </Card>
          <Card title="Lapsing within 7 days" subtitle="Active subscriptions with auto-renew off.">
            {production.expiringSoon.length === 0 ? (
              <p className="muted">None.</p>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Expires</th>
                      <th>Apple status</th>
                      <th>Last notification</th>
                    </tr>
                  </thead>
                  <tbody>
                    {production.expiringSoon.slice(0, 20).map((row) => (
                      <tr key={row.original_transaction_id}>
                        <td>{productName(row.product_id)}</td>
                        <td>{formatWhen(row.expires_at)}</td>
                        <td>{row.apple_status ? APPLE_STATUS[row.apple_status] : "—"}</td>
                        <td className="muted">{row.last_notification_type ?? "—"}{row.last_notification_subtype ? ` / ${row.last_notification_subtype}` : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {production.stale > 0 && <p className="muted" style={{ marginTop: 8 }}>{production.stale} paying rows have not been reconciled with Apple in 3+ days.</p>}
          </Card>
          <Card title="Prices for the MRR estimate" subtitle="List prices; Family is TBD in PRODUCT_MODEL §3 and reads as unpriced until set.">
            <PriceSettings
              applied={settings.applied}
              commission={settings.appleCommissionPercent}
              prices={Object.entries(settings.prices).map(([productId, price]) => ({ productId, name: productName(productId), cents: price.cents, period: price.period }))}
            />
          </Card>
        </div>
      </div>
    );
  } catch (err) {
    return <ErrorBlock title="Revenue" error={err} />;
  }
}

const emptyEvent = {
  id: "",
  game_id: null,
  device_id: "",
  player_id: null,
  role: null,
  app_version: null,
  locale_region: null,
  occurred_at: "",
  received_at: "",
  payload: {},
};

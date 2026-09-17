"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface SpendLine {
  id: string;
  day: string;
  channel: string;
  campaign: string;
  spend: string;
  impressions: string;
  clicks: string;
  installs: string;
  notes: string;
}

export default function SpendEditor({ rows, channels, applied }: { rows: SpendLine[]; channels: readonly string[]; applied: boolean }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ day: today, channel: channels[0], campaign: "", spend: "", impressions: "", clicks: "", installs: "", notes: "" });
  const [csv, setCsv] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function post(body: unknown) {
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/marketing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    if (response.ok) {
      setMessage({ kind: "ok", text: `Saved ${payload.inserted} row${payload.inserted === 1 ? "" : "s"}${payload.errors?.length ? `; skipped ${payload.errors.length}: ${payload.errors.slice(0, 3).join("; ")}` : ""}` });
      setCsv("");
      setForm((current) => ({ ...current, campaign: "", spend: "", impressions: "", clicks: "", installs: "", notes: "" }));
      router.refresh();
    } else {
      setMessage({ kind: "error", text: payload.error ?? `failed (${response.status})` });
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this spend line?")) return;
    const response = await fetch(`/api/marketing?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (response.ok) router.refresh();
  }

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((current) => ({ ...current, [key]: event.target.value })),
  });

  return (
    <div>
      {!applied && <p className="error">Migration 043 (gather_marketing_spend) is not applied yet; entries cannot be saved.</p>}
      <div className="form-grid">
        <label>
          Day
          <input type="date" {...field("day")} />
        </label>
        <label>
          Channel
          <select {...field("channel")}>
            {channels.map((channel) => (
              <option key={channel} value={channel}>
                {channel}
              </option>
            ))}
          </select>
        </label>
        <label>
          Campaign
          <input type="text" placeholder="optional" {...field("campaign")} />
        </label>
        <label>
          Spend (USD)
          <input type="number" step="0.01" min="0" placeholder="0.00" {...field("spend")} />
        </label>
        <label>
          Impressions
          <input type="number" min="0" {...field("impressions")} />
        </label>
        <label>
          Clicks
          <input type="number" min="0" {...field("clicks")} />
        </label>
        <label>
          Installs (network-attributed)
          <input type="number" min="0" {...field("installs")} />
        </label>
        <label>
          Notes
          <input type="text" {...field("notes")} />
        </label>
        <div>
          <button
            disabled={!applied || busy || !form.spend}
            onClick={() =>
              post({
                rows: [
                  {
                    day: form.day,
                    channel: form.channel,
                    campaign: form.campaign,
                    spend_cents: Math.round(Number(form.spend) * 100),
                    impressions: form.impressions,
                    clicks: form.clicks,
                    installs_attributed: form.installs,
                    notes: form.notes,
                  },
                ],
              })
            }
          >
            Add spend
          </button>
        </div>
      </div>
      <details style={{ marginTop: 12 }}>
        <summary className="muted" style={{ cursor: "pointer", fontSize: 13 }}>Paste CSV instead (day,channel,spend[,campaign,impressions,clicks,installs,notes])</summary>
        <textarea rows={5} value={csv} onChange={(event) => setCsv(event.target.value)} placeholder={"day,channel,spend,campaign,impressions,clicks,installs\n2026-09-15,apple-search-ads,42.10,launch,12000,340,18"} style={{ marginTop: 8 }} />
        <button className="secondary" style={{ marginTop: 8 }} disabled={!applied || busy || csv.trim().length === 0} onClick={() => post({ csv })}>
          Import CSV
        </button>
      </details>
      {message && <p className={message.kind === "ok" ? "ok" : "error"} style={{ marginTop: 8 }}>{message.text}</p>}
      <h2 style={{ marginTop: 18 }}>Entries</h2>
      {rows.length === 0 ? (
        <p className="muted">No spend logged in this window.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Day</th>
                <th>Channel</th>
                <th>Campaign</th>
                <th className="num">Spend</th>
                <th className="num">Impr.</th>
                <th className="num">Clicks</th>
                <th className="num">Installs</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.day}</td>
                  <td>{row.channel}</td>
                  <td className="muted">{row.campaign || "—"}</td>
                  <td className="num">{row.spend}</td>
                  <td className="num">{row.impressions || "—"}</td>
                  <td className="num">{row.clicks || "—"}</td>
                  <td className="num">{row.installs || "—"}</td>
                  <td className="muted">{row.notes}</td>
                  <td>
                    <button className="danger" onClick={() => remove(row.id)} style={{ padding: "2px 8px", fontSize: 12 }}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

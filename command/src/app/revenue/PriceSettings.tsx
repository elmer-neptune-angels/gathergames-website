"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface PriceRow {
  productId: string;
  name: string;
  cents: number;
  period: "month" | "year";
}

export default function PriceSettings({ prices, commission, applied }: { prices: PriceRow[]; commission: number; applied: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState(prices);
  const [cut, setCut] = useState(String(commission));
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  async function save() {
    setState("saving");
    const body = {
      prices: Object.fromEntries(rows.map((row) => [row.productId, { cents: row.cents, period: row.period, currency: "USD" }])),
      apple_commission_percent: Number(cut),
    };
    const response = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (response.ok) {
      setState("saved");
      router.refresh();
    } else {
      const payload = await response.json().catch(() => ({}));
      setError(payload.error ?? `save failed (${response.status})`);
      setState("error");
    }
  }

  return (
    <div>
      {!applied && <p className="error">Migration 043 is not applied, so prices cannot be saved yet; the defaults from PRODUCT_MODEL §3 are in use.</p>}
      <div className="form-grid">
        {rows.map((row) => (
          <label key={row.productId}>
            {row.name} ({row.period === "year" ? "per year" : "per month"}), USD
            <input
              type="number"
              step="0.01"
              min="0"
              value={(row.cents / 100).toFixed(2)}
              onChange={(event) => {
                const cents = Math.round(Number(event.target.value) * 100);
                setRows((current) => current.map((r) => (r.productId === row.productId ? { ...r, cents: Number.isFinite(cents) ? cents : 0 } : r)));
                setState("idle");
              }}
            />
          </label>
        ))}
        <label>
          Apple commission %
          <input type="number" min="0" max="100" value={cut} onChange={(event) => { setCut(event.target.value); setState("idle"); }} />
        </label>
        <div>
          <button onClick={save} disabled={!applied || state === "saving"}>
            {state === "saving" ? "Saving…" : "Save prices"}
          </button>
          {state === "saved" && <span className="ok"> Saved ✓</span>}
          {state === "error" && <span className="error"> {error}</span>}
        </div>
      </div>
    </div>
  );
}

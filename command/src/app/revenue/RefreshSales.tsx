"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RefreshSales({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function refresh() {
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/appstore/sales/refresh", { method: "POST" });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (response.ok) {
      setMessage(`fetched ${body.fetched}, ${body.unavailable} not published yet${body.errors?.length ? `, ${body.errors.length} errors` : ""}`);
      router.refresh();
    } else setMessage(body.error ?? `failed (${response.status})`);
  }
  return (
    <div>
      <button className="secondary" onClick={refresh} disabled={!configured || busy} title={configured ? "Pull missing days from App Store Connect" : "Set ASC_* env vars first"}>
        {busy ? "Fetching…" : "Refresh from Apple"}
      </button>
      {message && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{message}</div>}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface GameRow {
  gameId: string;
  name: string;
  implemented: boolean;
  held: boolean;
  enabled: boolean;
  params: string;
  notes: string;
  updatedAt: string | null;
  /** Rounds started in the last 7 days, for context beside the switch. */
  rounds7d: number;
}

type SaveState = "idle" | "saving" | "saved" | "error";

// The portal's games table, with a filter and a bulk switch. Writes go to
// PATCH /api/games (the same upsert the portal uses), so both UIs agree.
export default function GamesTable({ initialRows }: { initialRows: GameRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  function update(gameId: string, patch: Partial<GameRow>) {
    setRows((current) => current.map((row) => (row.gameId === gameId ? { ...row, ...patch } : row)));
    setSaveStates((current) => ({ ...current, [gameId]: "idle" }));
  }

  async function save(row: GameRow): Promise<boolean> {
    let params: Record<string, unknown> | null = null;
    if (row.params.trim().length > 0) {
      try {
        const parsed: unknown = JSON.parse(row.params);
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
        params = parsed as Record<string, unknown>;
      } catch {
        setSaveStates((current) => ({ ...current, [row.gameId]: "error" }));
        setErrors((current) => ({ ...current, [row.gameId]: "Params must be a JSON object" }));
        return false;
      }
    }
    setSaveStates((current) => ({ ...current, [row.gameId]: "saving" }));
    const response = await fetch("/api/games", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game_id: row.gameId, enabled: row.enabled, params, notes: row.notes.trim() || null }),
    });
    if (response.ok) {
      setSaveStates((current) => ({ ...current, [row.gameId]: "saved" }));
      return true;
    }
    const body = await response.json().catch(() => ({}));
    setErrors((current) => ({ ...current, [row.gameId]: body.error ?? `save failed (${response.status})` }));
    setSaveStates((current) => ({ ...current, [row.gameId]: "error" }));
    return false;
  }

  async function bulk(enabled: boolean) {
    const verb = enabled ? "turn ON every launch game" : "turn OFF every launch game";
    if (!confirm(`This will ${verb} for every phone the next time it checks in. Continue?`)) return;
    setBulkBusy(true);
    const targets = rows.filter((row) => !row.held && row.enabled !== enabled);
    for (const row of targets) {
      const next = { ...row, enabled };
      update(row.gameId, { enabled });
      // eslint-disable-next-line no-await-in-loop
      await save(next);
    }
    setBulkBusy(false);
    router.refresh();
  }

  const visible = rows.filter((row) => row.name.toLowerCase().includes(filter.toLowerCase()) || row.gameId.includes(filter.toLowerCase()));
  const offCount = rows.filter((row) => !row.enabled && !row.held).length;

  return (
    <div>
      <div className="filters" style={{ alignItems: "center" }}>
        <input type="text" placeholder="Filter games" value={filter} onChange={(event) => setFilter(event.target.value)} style={{ width: 220 }} />
        <span className="muted" style={{ fontSize: 13 }}>{offCount} launch game{offCount === 1 ? "" : "s"} off</span>
        <button className="secondary" onClick={() => bulk(true)} disabled={bulkBusy}>
          All on
        </button>
        <button className="danger" onClick={() => bulk(false)} disabled={bulkBusy}>
          All off
        </button>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Game</th>
              <th>Status</th>
              <th>On</th>
              <th className="num">Rounds 7d</th>
              <th style={{ width: "20%" }}>Params (JSON)</th>
              <th style={{ width: "24%" }}>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const state = saveStates[row.gameId] ?? "idle";
              return (
                <tr key={row.gameId}>
                  <td>
                    {row.name}
                    <div className="mono muted" style={{ fontSize: 11 }}>{row.gameId}</div>
                    {!row.implemented && <span className="muted"> · not built yet</span>}
                  </td>
                  <td>
                    <span className={`pill ${row.enabled ? "on" : "off"}`}>{row.enabled ? "live" : "off"}</span>
                    {row.held && (
                      <span className="muted" title="Held out of the launch catalog — the app hides this game before the switch, so the toggle has no effect until it returns.">
                        {" "}· held
                      </span>
                    )}
                    {row.updatedAt && <div className="muted" style={{ fontSize: 11 }}>changed {new Date(row.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>}
                  </td>
                  <td>
                    <input type="checkbox" checked={row.enabled} onChange={(event) => update(row.gameId, { enabled: event.target.checked })} aria-label={`${row.name} enabled`} />
                  </td>
                  <td className="num">{row.rounds7d}</td>
                  <td>
                    <textarea value={row.params} placeholder="{}" onChange={(event) => update(row.gameId, { params: event.target.value })} />
                  </td>
                  <td>
                    <input type="text" value={row.notes} placeholder="Why is it off? What changed?" onChange={(event) => update(row.gameId, { notes: event.target.value })} />
                  </td>
                  <td>
                    <button onClick={() => save(row)} disabled={state === "saving"}>
                      {state === "saving" ? "Saving…" : "Save"}
                    </button>
                    {state === "saved" && <div className="ok">Saved ✓</div>}
                    {state === "error" && <div className="error">{errors[row.gameId]}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

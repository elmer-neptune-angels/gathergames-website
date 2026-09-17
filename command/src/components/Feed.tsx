import { ERROR_EVENTS, payloadString, type EventRow } from "@/lib/events";
import { gameName } from "@/lib/matrix";
import { DASHBOARD_TIME_ZONE } from "@/lib/time";

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { timeZone: DASHBOARD_TIME_ZONE, hour: "numeric", minute: "2-digit" });
}

function detail(event: EventRow): string {
  const bits: string[] = [];
  if (event.game_id) bits.push(gameName(event.game_id));
  const players = Number(event.payload?.players);
  if (Number.isFinite(players) && players > 0) bits.push(`${players} player${players === 1 ? "" : "s"}`);
  const seconds = Number(event.payload?.duration_s);
  if (Number.isFinite(seconds) && seconds > 0) bits.push(`${Math.round(seconds / 60)} min`);
  for (const key of ["reason", "source", "transport", "product_id", "tier", "outcome"]) {
    const value = payloadString(event, key);
    if (value) bits.push(`${key} ${value}`);
  }
  if (event.role) bits.push(event.role);
  if (event.app_version) bits.push(`v${event.app_version}`);
  if (event.locale_region) bits.push(event.locale_region);
  return bits.join(" · ");
}

export default function Feed({ events }: { events: EventRow[] }) {
  if (events.length === 0) return <p className="muted">Nothing received yet.</p>;
  return (
    <div className="feed">
      {events.map((event) => (
        <div key={event.id} className={`feed-row${ERROR_EVENTS.has(event.name) ? " err" : ""}`}>
          <span className="when" title={`occurred ${event.occurred_at} · received ${event.received_at}`}>
            {clock(event.occurred_at)}
          </span>
          <span className="what">
            <b>{event.name}</b>
            <span className="muted"> {detail(event)}</span>
          </span>
          <span className="mono muted" title={event.player_id ?? event.device_id}>
            {(event.player_id ?? event.device_id).slice(0, 6)}
          </span>
        </div>
      ))}
    </div>
  );
}

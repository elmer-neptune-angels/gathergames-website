import type { ReactNode } from "react";
import { Sparkline, type Point } from "./charts";

export function StatTile({
  label,
  value,
  delta,
  deltaLabel,
  upIsGood = true,
  trend,
  note,
  hero = false,
}: {
  label: string;
  value: string;
  delta?: number | null;
  deltaLabel?: string;
  upIsGood?: boolean;
  trend?: Point[];
  note?: string;
  hero?: boolean;
}) {
  let deltaClass = "flat";
  if (typeof delta === "number" && delta !== 0) deltaClass = delta > 0 === upIsGood ? "good" : "bad";
  return (
    <div className={`tile${hero ? " hero" : ""}`}>
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
      <div className="tile-foot">
        {typeof delta === "number" && (
          <span className={`delta ${deltaClass}`}>
            {delta > 0 ? "▲" : delta < 0 ? "▼" : "•"} {Math.abs(delta).toLocaleString("en-US")}
            {deltaLabel ? ` ${deltaLabel}` : ""}
          </span>
        )}
        {note && <span className="muted">{note}</span>}
        {trend && trend.length > 1 && <Sparkline points={trend} />}
      </div>
    </div>
  );
}

export function Card({ title, subtitle, children, actions, wide = false }: { title: string; subtitle?: string; children: ReactNode; actions?: ReactNode; wide?: boolean }) {
  return (
    <section className={`card${wide ? " wide" : ""}`}>
      <header className="card-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

export function Status({ level, children }: { level: "good" | "warn" | "bad" | "off"; children: ReactNode }) {
  const icon = level === "good" ? "✓" : level === "warn" ? "!" : level === "bad" ? "✕" : "–";
  return (
    <span className={`status ${level}`}>
      <i aria-hidden="true">{icon}</i> {children}
    </span>
  );
}

export function Notice({ kind = "info", children }: { kind?: "info" | "warn" | "bad"; children: ReactNode }) {
  return <div className={`notice ${kind}`}>{children}</div>;
}

export function ErrorBlock({ title, error }: { title: string; error: unknown }) {
  return (
    <div>
      <h1>{title}</h1>
      <Notice kind="bad">
        Couldn&apos;t load: {error instanceof Error ? error.message : "unknown error"}. Check SUPABASE_URL and
        SUPABASE_SERVICE_ROLE_KEY, and that the portal migrations have been run.
      </Notice>
    </div>
  );
}

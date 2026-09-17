"use client";

// Dependency-free SVG charts. Every chart is a client component so it can
// carry its own hover layer (crosshair + tooltip on lines, per-mark
// tooltip on bars and cells) and still render server-side as static SVG.
// Marks follow the dataviz specs: 2px lines, ≤24px bars with a 4px
// rounded data end and square baseline, hairline solid grid, text in text
// tokens (never the series color). Series colors are CSS variables
// --series-1..8 defined in globals.css (the validated categorical
// palette); a single-series chart uses --accent-mark (the app's teal).

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

/** The SVG viewBox follows the card's width so tick text stays 11px in a
 * narrow card instead of scaling down with a fixed viewBox. Server render
 * and first paint use the fallback; ResizeObserver corrects on mount. */
function useMeasuredWidth(fallback = 720) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0]?.contentRect.width ?? 0);
      if (next > 0) setWidth(Math.max(240, next));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

export interface Point {
  key: string;
  value: number;
  /** Axis / tooltip label. Computed server-side (lib/time.ts labelled())
   * because a client component cannot receive a formatter function. */
  label?: string;
}

/** ISO 4217 code → values are whole units of that currency. */
const formatterFor = (money?: string) =>
  money
    ? (value: number) => value.toLocaleString("en-US", { style: "currency", currency: money, maximumFractionDigits: 2 })
    : (value: number) => value.toLocaleString("en-US");

const labelOf = (point: Point | undefined) => point?.label ?? point?.key ?? "";

export interface Series {
  name: string;
  points: Point[];
  /** 1..8 — categorical slot; omitted = single-series accent. */
  slot?: number;
}

const seriesColor = (slot?: number) => (slot ? `var(--series-${slot})` : "var(--accent-mark)");

function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const rough = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / magnitude;
  const step = (residual >= 5 ? 10 : residual >= 2 ? 5 : residual >= 1 ? 2 : 1) * magnitude;
  const ticks: number[] = [];
  for (let value = 0; value <= max + step * 0.001; value += step) ticks.push(Math.round(value * 1000) / 1000);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

const tickLabel = (value: number): string =>
  value >= 1_000_000 ? `${value / 1_000_000}M` : value >= 1_000 ? `${value / 1_000}K` : `${value}`;

export interface LineChartProps {
  series: Series[];
  money?: string;
  height?: number;
  /** Fill under the (single) series. */
  area?: boolean;
  /** Y-axis unit for the tooltip. */
  unit?: string;
  ariaLabel: string;
}

export function LineChart({ series, money, height = 220, area = false, unit = "", ariaLabel }: LineChartProps) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const { ref, width } = useMeasuredWidth();
  const pad = { top: 12, right: 16, bottom: 28, left: 44 };
  const keys = series[0]?.points.map((point) => point.key) ?? [];
  const labelFor = (index: number) => labelOf(series[0]?.points[index]);
  const n = keys.length;
  const max = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.value)));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const x = (index: number) => pad.left + (n <= 1 ? innerW / 2 : (index / (n - 1)) * innerW);
  const y = (value: number) => pad.top + innerH - (value / top) * innerH;
  const fmt = formatterFor(money);
  const paths = useMemo(
    () =>
      series.map((s) => {
        const d = s.points.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ");
        const fill = `${d} L${x(n - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;
        return { d, fill };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, n, top, height, width],
  );
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW / 110))));
  const total = series.length === 1 ? series[0].points.reduce((sum, point) => sum + point.value, 0) : null;

  function onMove(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * width;
    if (n === 0) return;
    const index = Math.round(((px - pad.left) / innerW) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, index)));
  }

  if (n === 0) return <div className="chart-empty">No data in this window.</div>;

  return (
    <div className="chart" ref={ref}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label={ariaLabel}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        className="chart-svg"
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} className="grid" />
            <text x={pad.left - 8} y={y(tick) + 4} textAnchor="end" className="tick">
              {tickLabel(tick)}
            </text>
          </g>
        ))}
        {keys.map((key, index) =>
          (index % labelEvery === 0 && n - 1 - index >= labelEvery / 2) || index === n - 1 ? (
            <text key={key} x={x(index)} y={height - 8} textAnchor={index === n - 1 ? "end" : index === 0 ? "start" : "middle"} className="tick">
              {labelFor(index)}
            </text>
          ) : null,
        )}
        {series.map((s, index) => (
          <g key={s.name}>
            {area && series.length === 1 && <path d={paths[index].fill} fill={seriesColor(s.slot)} opacity={0.1} />}
            <path d={paths[index].d} fill="none" stroke={seriesColor(s.slot)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={x(n - 1)} cy={y(s.points[n - 1].value)} r={4} fill={seriesColor(s.slot)} className="ring" />
          </g>
        ))}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + innerH} className="crosshair" />
            {series.map((s) => (
              <circle key={s.name} cx={x(hover)} cy={y(s.points[hover].value)} r={4} fill={seriesColor(s.slot)} className="ring" />
            ))}
          </g>
        )}
        <clipPath id={id}>
          <rect x={0} y={0} width={width} height={height} />
        </clipPath>
      </svg>
      {hover !== null && (
        <div className="tooltip" style={{ left: `${(x(hover) / width) * 100}%` }}>
          <div className="tooltip-title">{labelFor(hover)}</div>
          {series.map((s) => (
            <div key={s.name} className="tooltip-row">
              <span className="key" style={{ background: seriesColor(s.slot) }} />
              <strong>{fmt(s.points[hover].value)}{unit}</strong>
              <span className="muted">{s.name}</span>
            </div>
          ))}
        </div>
      )}
      {series.length > 1 && (
        <div className="legend">
          {series.map((s) => (
            <span key={s.name}>
              <i style={{ background: seriesColor(s.slot) }} /> {s.name}
            </span>
          ))}
        </div>
      )}
      {total !== null && <div className="chart-foot muted">Total {fmt(total)}{unit}</div>}
    </div>
  );
}

export interface BarChartProps {
  points: Point[];
  money?: string;
  height?: number;
  unit?: string;
  ariaLabel: string;
  slot?: number;
}

/** Vertical columns for a time series or a short category list. */
export function ColumnChart({ points, money, height = 200, unit = "", ariaLabel, slot }: BarChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const { ref, width } = useMeasuredWidth();
  const pad = { top: 12, right: 16, bottom: 28, left: 44 };
  const n = points.length;
  const max = Math.max(1, ...points.map((p) => p.value));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const band = n > 0 ? innerW / n : innerW;
  const bar = Math.min(24, Math.max(2, band - 2));
  const y = (value: number) => pad.top + innerH - (value / top) * innerH;
  const fmt = formatterFor(money);
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW / 110))));
  if (n === 0) return <div className="chart-empty">No data in this window.</div>;
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={ariaLabel} className="chart-svg" onPointerLeave={() => setHover(null)}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} className="grid" />
            <text x={pad.left - 8} y={y(tick) + 4} textAnchor="end" className="tick">
              {tickLabel(tick)}
            </text>
          </g>
        ))}
        {points.map((point, index) => {
          const cx = pad.left + band * index + band / 2;
          const h = Math.max(0, y(0) - y(point.value));
          const r = Math.min(4, bar / 2, h);
          const x0 = cx - bar / 2;
          const y0 = y(point.value);
          const path =
            h === 0
              ? ""
              : `M${x0},${y(0)} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + bar - r} Q${x0 + bar},${y0} ${x0 + bar},${y0 + r} V${y(0)} Z`;
          return (
            <g key={point.key} onPointerEnter={() => setHover(index)} onFocus={() => setHover(index)} tabIndex={-1}>
              <rect x={pad.left + band * index} y={pad.top} width={band} height={innerH} fill="transparent" />
              {path && <path d={path} fill={seriesColor(slot)} opacity={hover === null || hover === index ? 1 : 0.55} />}
              {((index % labelEvery === 0 && n - 1 - index >= labelEvery / 2) || index === n - 1) && (
                <text x={cx} y={height - 8} textAnchor="middle" className="tick">
                  {labelOf(point)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="tooltip" style={{ left: `${((pad.left + band * hover + band / 2) / width) * 100}%` }}>
          <div className="tooltip-title">{labelOf(points[hover])}</div>
          <div className="tooltip-row">
            <span className="key" style={{ background: seriesColor(slot) }} />
            <strong>{fmt(points[hover].value)}{unit}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

export interface BarRow {
  label: string;
  value: number;
  /** Optional secondary text after the value. */
  note?: string;
  slot?: number;
}

/** Horizontal bars for ranked categories (games, channels, event names). */
export function BarList({ rows, money, max, ariaLabel }: { rows: BarRow[]; money?: string; max?: number; ariaLabel: string }) {
  const fmt = formatterFor(money);
  const top = Math.max(1, max ?? Math.max(0, ...rows.map((row) => row.value)));
  if (rows.length === 0) return <div className="chart-empty">Nothing in this window.</div>;
  return (
    <div className="barlist" role="list" aria-label={ariaLabel}>
      {rows.map((row) => (
        <div key={row.label} className="barrow" role="listitem" title={`${row.label}: ${fmt(row.value)}`}>
          <span className="barlabel">{row.label}</span>
          <span className="bartrack">
            <span className="barfill" style={{ width: `${(row.value / top) * 100}%`, background: seriesColor(row.slot) }} />
          </span>
          <span className="barvalue">
            {fmt(row.value)}
            {row.note && <span className="muted"> {row.note}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Heatmap({ grid, rowLabels, colLabels, ariaLabel }: { grid: number[][]; rowLabels: string[]; colLabels: string[]; ariaLabel: string }) {
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const max = Math.max(1, ...grid.flat());
  const steps = ["var(--seq-1)", "var(--seq-2)", "var(--seq-3)", "var(--seq-4)", "var(--seq-5)", "var(--seq-6)"];
  const shade = (value: number) => {
    if (value === 0) return "var(--surface-2)";
    const index = Math.min(steps.length - 1, Math.floor((value / max) * steps.length));
    return steps[index];
  };
  return (
    <div className="heatmap-wrap">
      <div className="heatmap" role="img" aria-label={ariaLabel} style={{ gridTemplateColumns: `auto repeat(${colLabels.length}, 1fr)` }} onPointerLeave={() => setHover(null)}>
        <span />
        {colLabels.map((label, c) => (
          <span key={label} className="heat-col">
            {c % 3 === 0 ? label : ""}
          </span>
        ))}
        {grid.map((row, r) => (
          <FragmentRow key={rowLabels[r]}>
            <span className="heat-row">{rowLabels[r]}</span>
            {row.map((value, c) => (
              <span
                key={c}
                className="heat-cell"
                style={{ background: shade(value), outline: hover && hover.r === r && hover.c === c ? "2px solid var(--ink)" : "none" }}
                onPointerEnter={() => setHover({ r, c })}
                title={`${rowLabels[r]} ${colLabels[c]}: ${value}`}
              />
            ))}
          </FragmentRow>
        ))}
      </div>
      <div className="chart-foot muted">
        {hover ? `${rowLabels[hover.r]} · ${colLabels[hover.c]} · ${grid[hover.r][hover.c]} rounds` : "Hover a cell · darker = more rounds"}
      </div>
    </div>
  );
}

const FragmentRow = ({ children }: { children: ReactNode }) => <>{children}</>;

export function Sparkline({ points, slot }: { points: Point[]; slot?: number }) {
  const width = 96;
  const height = 28;
  const max = Math.max(1, ...points.map((p) => p.value));
  const n = points.length;
  if (n < 2) return null;
  const x = (index: number) => (index / (n - 1)) * (width - 4) + 2;
  const y = (value: number) => height - 3 - (value / max) * (height - 6);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="sparkline" aria-hidden="true">
      <path d={d} fill="none" stroke={seriesColor(slot)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(n - 1)} cy={y(points[n - 1].value)} r={3} fill={seriesColor(slot)} />
    </svg>
  );
}

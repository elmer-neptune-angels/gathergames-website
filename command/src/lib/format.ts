export function compact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 10_000) return `${(value / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}K`;
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function money(cents: number | null | undefined, currency = "USD"): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return "—";
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: cents % 100 === 0 && Math.abs(cents) >= 100_000 ? 0 : 2,
  });
}

export function percent(numerator: number, denominator: number): string {
  if (!denominator) return "—";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

export function duration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "—";
  if (seconds < 90) return `${Math.round(seconds)}s`;
  const minutes = seconds / 60;
  if (minutes < 90) return `${minutes.toFixed(minutes < 10 ? 1 : 0)} min`;
  return `${(minutes / 60).toFixed(1)} h`;
}

export function signed(value: number): string {
  if (value > 0) return `+${compact(value)}`;
  return compact(value);
}

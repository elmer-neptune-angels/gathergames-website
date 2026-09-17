"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RANGES, type Granularity, type RangeKey } from "@/lib/time";

/** The one filter row: window presets first, then the bucket size. It
 * rewrites the URL so every chart, tile and table below re-renders against
 * the same slice. */
export default function RangePicker({ range, granularity, granularities }: { range: RangeKey; granularity: Granularity; granularities: Granularity[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    next.set(key, value);
    if (key === "range") next.delete("by");
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="filters" role="group" aria-label="Time window">
      <div className="segmented">
        {RANGES.map((option) => (
          <button key={option.key} className={option.key === range ? "on" : ""} onClick={() => set("range", option.key)}>
            {option.label}
          </button>
        ))}
      </div>
      <div className="segmented">
        {granularities.map((option) => (
          <button key={option} className={option === granularity ? "on" : ""} onClick={() => set("by", option)}>
            by {option}
          </button>
        ))}
      </div>
    </div>
  );
}

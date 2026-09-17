import { granularitiesFor, granularityFor, rangeFor, type Granularity, type Range } from "./time.ts";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export interface Window {
  range: Range;
  granularity: Granularity;
  granularities: Granularity[];
  since: Date;
  until: Date;
}

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export async function windowFrom(searchParams: SearchParams, now = new Date()): Promise<Window> {
  const values = await searchParams;
  const range = rangeFor(one(values.range));
  const granularity = granularityFor(range, one(values.by));
  return {
    range,
    granularity,
    granularities: granularitiesFor(range),
    since: new Date(now.getTime() - range.ms),
    until: now,
  };
}

export async function param(searchParams: SearchParams, key: string): Promise<string | undefined> {
  const values = await searchParams;
  return one(values[key]);
}

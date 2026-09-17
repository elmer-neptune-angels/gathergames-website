import { supabaseAdmin } from "./supabase.ts";

// PostgREST caps a single response (Supabase's default max_rows is 1,000),
// so every read that can exceed a page walks .range() pages, the way the
// portal's leaderboard route does. `cap` bounds the walk so one runaway
// query can't hold a request open; callers surface `truncated`.
export interface PagedResult<Row> {
  rows: Row[];
  truncated: boolean;
}

export const PAGE_SIZE = 1_000;

export async function pageAll<Row>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  cap = 50_000,
): Promise<PagedResult<Row>> {
  const rows: Row[] = [];
  for (let from = 0; from < cap; from += PAGE_SIZE) {
    const { data, error } = await build(from, Math.min(from + PAGE_SIZE, cap) - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

/** A table that migration 043 (or a later one) adds may not be applied
 * yet: PostgREST answers PGRST205 / Postgres 42P01. Callers that can live
 * without the table treat that as "empty, not applied" instead of failing
 * the whole page. */
export function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "PGRST205" || error.code === "42P01" || /schema cache|does not exist/i.test(error.message ?? "");
}

export { supabaseAdmin };

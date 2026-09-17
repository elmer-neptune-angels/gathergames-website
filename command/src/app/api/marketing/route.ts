import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { deleteSpend, insertSpend, parseSpendCSV, parseSpendInput, type SpendInput } from "@/lib/marketing";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST { rows: [...] } or { csv: "..." } — validated line by line; bad
// lines are reported, good ones written.
export async function POST(request: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { rows?: unknown; csv?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const rows: SpendInput[] = [];
  const errors: string[] = [];
  if (Array.isArray(body.rows)) {
    body.rows.forEach((raw, index) => {
      const parsed = parseSpendInput(raw);
      if (parsed.ok) rows.push(parsed.row);
      else errors.push(`row ${index + 1}: ${parsed.error}`);
    });
  } else if (typeof body.csv === "string") {
    if (body.csv.length > 200_000) return NextResponse.json({ error: "csv too large" }, { status: 413 });
    const parsed = parseSpendCSV(body.csv);
    rows.push(...parsed.rows);
    errors.push(...parsed.errors);
  } else {
    return NextResponse.json({ error: "rows or csv required" }, { status: 400 });
  }
  if (rows.length === 0) return NextResponse.json({ error: errors[0] ?? "nothing to save", errors }, { status: 400 });
  if (rows.length > 2_000) return NextResponse.json({ error: "at most 2000 rows per import" }, { status: 400 });
  try {
    const inserted = await insertSpend(rows);
    return NextResponse.json({ ok: true, inserted, errors });
  } catch (err) {
    console.error("spend insert failed", err);
    return NextResponse.json({ error: "save failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    await deleteSpend(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("spend delete failed", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}

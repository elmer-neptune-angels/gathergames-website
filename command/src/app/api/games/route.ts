import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// The catch's one fixed 500 body (ledger 2026-09-08, the follow-up's
// review): a thrown error carries the database's own words — the 039/040
// triggers' `player retired` among them — which stay server-side in the
// log, never on the wire. install-recovery-parity pins every route.
const UPDATE_FAILED = "update failed";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Admin-only: toggle a game or update its params/notes from the portal UI.
export async function PATCH(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!isPlainObject(parsed)) {
    return NextResponse.json({ error: "json object required" }, { status: 400 });
  }

  const body = parsed as {
    game_id?: string;
    enabled?: boolean;
    params?: unknown;
    notes?: string | null;
  };

  if (typeof body.game_id !== "string" || body.game_id.length === 0 || body.game_id.length > 64) {
    return NextResponse.json({ error: "game_id required" }, { status: 400 });
  }
  if ("params" in body && body.params !== null && !isPlainObject(body.params)) {
    return NextResponse.json({ error: "params must be a JSON object or null" }, { status: 400 });
  }
  if ("notes" in body && body.notes !== null && typeof body.notes !== "string") {
    return NextResponse.json({ error: "notes must be text or null" }, { status: 400 });
  }

  const row: Record<string, unknown> = {
    game_id: body.game_id,
    updated_at: new Date().toISOString(),
  };
  if (typeof body.enabled === "boolean") row.enabled = body.enabled;
  if ("params" in body) row.params = body.params ?? null;
  if ("notes" in body) row.notes = body.notes?.slice(0, 2_000) ?? null;

  try {
    const { error } = await supabaseAdmin()
      .from("gather_game_config")
      .upsert(row, { onConflict: "game_id" });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(UPDATE_FAILED, err);
    return NextResponse.json(
      { error: UPDATE_FAILED },
      { status: 500 }
    );
  }
}

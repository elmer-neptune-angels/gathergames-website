import { NextResponse } from "next/server";
import { refreshSales } from "@/lib/appstore-sales";
import { isAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
// One Apple call per missing day, sequentially: 30 days can take a while.
export const maxDuration = 60;

export async function POST() {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const report = await refreshSales(30);
    return NextResponse.json({ ok: true, ...report });
  } catch (err) {
    console.error("sales refresh failed", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "refresh failed" }, { status: 500 });
  }
}

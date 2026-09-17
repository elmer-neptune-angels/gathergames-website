import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { parsePrice, saveSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { prices?: unknown; apple_commission_percent?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  try {
    if (body.prices !== undefined) {
      if (!body.prices || typeof body.prices !== "object" || Array.isArray(body.prices)) {
        return NextResponse.json({ error: "prices must be an object" }, { status: 400 });
      }
      const prices: Record<string, unknown> = {};
      for (const [productId, raw] of Object.entries(body.prices as Record<string, unknown>)) {
        const price = parsePrice(raw);
        if (!price || !/^[a-z0-9.]{1,80}$/.test(productId)) {
          return NextResponse.json({ error: `bad price for ${productId}` }, { status: 400 });
        }
        prices[productId] = price;
      }
      await saveSetting("prices", prices);
    }
    if (body.apple_commission_percent !== undefined) {
      const percent = Number(body.apple_commission_percent);
      if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
        return NextResponse.json({ error: "commission must be 0–100" }, { status: 400 });
      }
      await saveSetting("apple_commission_percent", percent);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("settings update failed", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

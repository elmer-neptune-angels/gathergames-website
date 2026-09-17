import { NextRequest, NextResponse } from "next/server";
import { passwordMatches, sessionToken, SESSION_COOKIE } from "@/lib/auth";
import { clientBucket } from "@/lib/login-policy";
import { clearBucket, guard, recordFailure } from "@/lib/login-throttle";

export const dynamic = "force-dynamic";

// Rate limited because this dashboard sits on a publicly reachable URL
// and a single shared password is the only thing in front of revenue and
// player data. The counters are durable (migration 044) so they survive
// the serverless instance churn an attacker would otherwise ride through;
// see lib/login-throttle.ts. The password compare itself is constant-time
// (lib/auth.ts).
export async function POST(request: NextRequest) {
  const bucket = clientBucket(request.headers);

  // Checked BEFORE the body is read or any comparison happens, so a
  // locked-out caller costs nothing and learns nothing.
  const gate = await guard(bucket);
  if (!gate.allowed) {
    return NextResponse.json(
      { error: "too many attempts", retry_after_seconds: gate.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(gate.retryAfterSeconds) } },
    );
  }

  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!passwordMatches(body.password ?? "")) {
    const after = await recordFailure(bucket);
    return NextResponse.json(
      {
        error: "wrong password",
        remaining: after.remaining,
        retry_after_seconds: after.retryAfterSeconds,
      },
      {
        status: after.retryAfterSeconds > 0 ? 429 : 401,
        headers: after.retryAfterSeconds > 0 ? { "Retry-After": String(after.retryAfterSeconds) } : {},
      },
    );
  }

  await clearBucket(bucket);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, sessionToken(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return response;
}

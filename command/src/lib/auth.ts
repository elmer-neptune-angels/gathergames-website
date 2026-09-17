import { createHash, createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

// Single-admin auth: the session cookie is an HMAC of ADMIN_PASSWORD, so
// logins survive deploys and rotating the password invalidates sessions.
// Copied from gather/portal with two changes, both because this dashboard
// sits on a publicly reachable URL and shows revenue and player names:
// every secret comparison is constant-time (below), and the login route
// is rate limited (lib/login-throttle.ts).

export const SESSION_COOKIE = "gather_admin";

/** Compare two secrets without leaking their contents through timing.
 *
 * Both sides are SHA-256'd first for two reasons: timingSafeEqual throws
 * on length mismatch, and comparing raw values would leak the secret's
 * LENGTH through that throw. Digests are always 32 bytes, so the compare
 * is uniform whatever the inputs. */
export function constantTimeEqual(a: string, b: string): boolean {
  const left = createHash("sha256").update(a, "utf8").digest();
  const right = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(left, right);
}

export function sessionToken(): string {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error("ADMIN_PASSWORD must be set");
  return createHmac("sha256", "gather-portal-session-v1")
    .update(password)
    .digest("hex");
}

export function passwordMatches(candidate: string): boolean {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return false;
  return constantTimeEqual(candidate, password);
}

export async function isAdmin(): Promise<boolean> {
  try {
    const store = await cookies();
    const presented = store.get(SESSION_COOKIE)?.value;
    if (!presented) return false;
    return constantTimeEqual(presented, sessionToken());
  } catch {
    return false;
  }
}

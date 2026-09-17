import { createHmac } from "crypto";
import { cookies } from "next/headers";

// Single-admin auth: the session cookie is an HMAC of ADMIN_PASSWORD, so
// logins survive deploys and rotating the password invalidates sessions.
// Good enough for a one-person internal tool; swap for real auth if the
// portal ever grows more users.

export const SESSION_COOKIE = "gather_admin";

export function sessionToken(): string {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error("ADMIN_PASSWORD must be set");
  return createHmac("sha256", "gather-portal-session-v1")
    .update(password)
    .digest("hex");
}

export function passwordMatches(candidate: string): boolean {
  const password = process.env.ADMIN_PASSWORD;
  return !!password && candidate === password;
}

export async function isAdmin(): Promise<boolean> {
  try {
    const store = await cookies();
    return store.get(SESSION_COOKIE)?.value === sessionToken();
  } catch {
    return false;
  }
}

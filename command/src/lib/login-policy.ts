// The login throttle policy, as pure functions with no imports, so
// node:test can exercise it directly and so the in-process fallback in
// login-throttle.ts and the SQL in migration 044 can be held to the same
// rules. If you change a constant here, change it in 044 too; the test
// suite pins the shape of the escalation, not the database.

/** Failures inside one window before a lockout starts. */
export const MAX_FAILURES = 5;
/** Failures older than this stop counting. */
export const WINDOW_MS = 15 * 60_000;
/** The first lockout, doubling with each further failure. */
export const BASE_LOCK_MS = 60_000;
/** However long an attack runs, a lockout never exceeds this. */
export const LOCK_CEILING_MS = 60 * 60_000;

export interface AttemptState {
  failures: number;
  firstFailureAt: number | null;
  lockedUntil: number | null;
}

/** How long a lockout lasts after `failures` failures, or null while the
 * bucket is still under the threshold. */
export function lockMsFor(failures: number): number | null {
  if (failures < MAX_FAILURES) return null;
  // Clamped so a long-running attack cannot overflow the exponent.
  const steps = Math.min(failures - MAX_FAILURES, 20);
  return Math.min(LOCK_CEILING_MS, BASE_LOCK_MS * 2 ** steps);
}

/** Whether the window a bucket is counting in has elapsed. */
export function windowElapsed(state: AttemptState | null, now: number): boolean {
  return !state || state.firstFailureAt === null || state.firstFailureAt < now - WINDOW_MS;
}

/** The bucket's state after counting one more failed attempt. */
export function afterFailure(state: AttemptState | null, now: number): AttemptState {
  const stale = windowElapsed(state, now);
  const failures = stale ? 1 : state!.failures + 1;
  const lock = lockMsFor(failures);
  return {
    failures,
    firstFailureAt: stale ? now : state!.firstFailureAt,
    lockedUntil: lock === null ? null : now + lock,
  };
}

/** Seconds until a lockout expires; 0 when there is no live lockout. */
export function retryAfterSeconds(lockedUntil: number | null, now: number): number {
  if (lockedUntil === null) return 0;
  return Math.max(0, Math.ceil((lockedUntil - now) / 1000));
}

/** Attempts left before the next lockout, for the sign-in page's hint. */
export function remainingAttempts(state: AttemptState | null, now: number): number {
  if (windowElapsed(state, now)) return MAX_FAILURES;
  return Math.max(0, MAX_FAILURES - state!.failures);
}

export type Decision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/** Whether a bucket may attempt a sign-in right now. */
export function decide(state: AttemptState | null, now: number): Decision {
  if (!state || state.lockedUntil === null || state.lockedUntil <= now) return { allowed: true };
  return { allowed: false, retryAfterSeconds: retryAfterSeconds(state.lockedUntil, now) };
}

/** The rate-limit bucket for a request.
 *
 * `x-real-ip` is preferred over `x-forwarded-for`: Vercel sets it to the
 * address it actually accepted the connection from, whereas the leftmost
 * entry of x-forwarded-for originates with the caller and can be forged
 * to get a fresh bucket per guess. A request with neither header still
 * gets a bucket, so a missing header is never an exemption. */
export function clientBucket(headers: { get(name: string): string | null }): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return `ip:${real.slice(0, 80)}`;
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return `ip:${forwarded.slice(0, 80)}`;
  return "ip:unknown";
}

/** "3 minutes", "45 seconds" — for the message shown to a locked-out user. */
export function describeWait(seconds: number): string {
  if (seconds <= 90) return `${Math.max(1, seconds)} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

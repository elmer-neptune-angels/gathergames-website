// The store behind the login throttle. The policy itself is in
// login-policy.ts; this module only decides WHERE the counters live.
//
// Durable by default (migration 044), because Vercel runs this app as
// many short-lived serverless instances and an in-process counter resets
// with every new one. The in-process map below is a fallback for two
// cases: migration 044 not applied yet, and Supabase unreachable.
//
// It FAILS OPEN. If the database cannot be reached, a sign-in is allowed
// through under the weaker in-process limit rather than refused. Failing
// closed would mean a Supabase outage locks the owner out of the
// dashboard that would tell them about the outage. The durable limiter is
// the control; the fallback keeps the door usable when the control is
// unavailable, and both are behind whatever deployment protection the
// hosting provider adds.
import { supabaseAdmin } from "./db.ts";
import {
  afterFailure,
  decide,
  remainingAttempts,
  type AttemptState,
  type Decision,
} from "./login-policy.ts";

interface AttemptRow {
  failures: number;
  first_failure_at: string | null;
  locked_until: string | null;
}

const fallback = new Map<string, AttemptState>();
/** Bounded so a rotating-address attack cannot grow this without limit. */
const FALLBACK_MAX_BUCKETS = 5_000;

let durableWorks = true;

function toState(row: AttemptRow | null): AttemptState | null {
  if (!row) return null;
  return {
    failures: row.failures,
    firstFailureAt: row.first_failure_at ? Date.parse(row.first_failure_at) : null,
    lockedUntil: row.locked_until ? Date.parse(row.locked_until) : null,
  };
}

function rememberFallback(bucket: string, state: AttemptState): void {
  if (fallback.size >= FALLBACK_MAX_BUCKETS && !fallback.has(bucket)) {
    // Drop the oldest insertion; Map preserves insertion order.
    const oldest = fallback.keys().next();
    if (!oldest.done) fallback.delete(oldest.value);
  }
  fallback.set(bucket, state);
}

/** May this bucket attempt a sign-in right now? */
export async function guard(bucket: string, now = Date.now()): Promise<Decision & { remaining: number }> {
  let state: AttemptState | null = null;
  try {
    const { data, error } = await supabaseAdmin()
      .from("gather_command_login_attempts")
      .select("failures, first_failure_at, locked_until")
      .eq("bucket", bucket)
      .maybeSingle();
    if (error) throw new Error(error.message);
    state = toState((data as AttemptRow | null) ?? null);
    durableWorks = true;
  } catch {
    // Missing table or unreachable database: fall back, quietly. This is
    // expected before 044 is applied, so it is not logged per request.
    durableWorks = false;
    state = fallback.get(bucket) ?? null;
  }
  return { ...decide(state, now), remaining: remainingAttempts(state, now) };
}

/** Count one failed attempt. Returns the state that resulted. */
export async function recordFailure(bucket: string, now = Date.now()): Promise<{ retryAfterSeconds: number; remaining: number }> {
  if (durableWorks) {
    try {
      const { data, error } = await supabaseAdmin().rpc("gather_command_login_record_failure", {
        p_bucket: bucket,
      });
      if (error) throw new Error(error.message);
      const row = (data as { failures: number; locked_until: string | null }[] | null)?.[0];
      if (row) {
        const state: AttemptState = {
          failures: row.failures,
          firstFailureAt: now,
          lockedUntil: row.locked_until ? Date.parse(row.locked_until) : null,
        };
        rememberFallback(bucket, state);
        const verdict = decide(state, now);
        return {
          retryAfterSeconds: verdict.allowed ? 0 : verdict.retryAfterSeconds,
          remaining: remainingAttempts(state, now),
        };
      }
    } catch {
      durableWorks = false;
    }
  }
  const next = afterFailure(fallback.get(bucket) ?? null, now);
  rememberFallback(bucket, next);
  const verdict = decide(next, now);
  return {
    retryAfterSeconds: verdict.allowed ? 0 : verdict.retryAfterSeconds,
    remaining: remainingAttempts(next, now),
  };
}

/** A correct password clears the bucket. */
export async function clearBucket(bucket: string): Promise<void> {
  fallback.delete(bucket);
  try {
    const { error } = await supabaseAdmin().rpc("gather_command_login_reset", { p_bucket: bucket });
    if (error) throw new Error(error.message);
  } catch {
    // The in-process copy is already cleared; nothing else to do.
  }
}

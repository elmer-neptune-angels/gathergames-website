import assert from "node:assert/strict";
import { test } from "node:test";
import {
  afterFailure,
  BASE_LOCK_MS,
  clientBucket,
  decide,
  describeWait,
  LOCK_CEILING_MS,
  lockMsFor,
  MAX_FAILURES,
  remainingAttempts,
  retryAfterSeconds,
  WINDOW_MS,
} from "../src/lib/login-policy.ts";

const now = 1_800_000_000_000;
const headers = (map) => ({ get: (name) => map[name.toLowerCase()] ?? null });

test("the first four failures do not lock; the fifth does", () => {
  let state = null;
  for (let attempt = 1; attempt < MAX_FAILURES; attempt += 1) {
    state = afterFailure(state, now);
    assert.equal(state.failures, attempt);
    assert.equal(state.lockedUntil, null, `attempt ${attempt} must not lock`);
    assert.equal(decide(state, now).allowed, true);
  }
  state = afterFailure(state, now);
  assert.equal(state.failures, MAX_FAILURES);
  assert.equal(state.lockedUntil, now + BASE_LOCK_MS);
  assert.equal(decide(state, now).allowed, false);
});

test("each further failure doubles the lockout, up to the ceiling", () => {
  assert.equal(lockMsFor(MAX_FAILURES - 1), null);
  assert.equal(lockMsFor(MAX_FAILURES), BASE_LOCK_MS);
  assert.equal(lockMsFor(MAX_FAILURES + 1), BASE_LOCK_MS * 2);
  assert.equal(lockMsFor(MAX_FAILURES + 2), BASE_LOCK_MS * 4);
  assert.equal(lockMsFor(MAX_FAILURES + 3), BASE_LOCK_MS * 8);
  // Matches the SQL in migration 044, verified against Postgres.
  assert.equal(lockMsFor(MAX_FAILURES + 6), LOCK_CEILING_MS);
  assert.equal(lockMsFor(9_999), LOCK_CEILING_MS, "a long attack must not overflow");
});

test("a lockout expires, and the window resets a stale count", () => {
  const locked = { failures: 5, firstFailureAt: now, lockedUntil: now + BASE_LOCK_MS };
  assert.equal(decide(locked, now + BASE_LOCK_MS - 1).allowed, false);
  assert.equal(decide(locked, now + BASE_LOCK_MS).allowed, true);

  const stale = { failures: 4, firstFailureAt: now - WINDOW_MS - 1, lockedUntil: null };
  assert.equal(afterFailure(stale, now).failures, 1, "an elapsed window starts over");
  assert.equal(remainingAttempts(stale, now), MAX_FAILURES);

  const fresh = { failures: 4, firstFailureAt: now - 1_000, lockedUntil: null };
  assert.equal(afterFailure(fresh, now).failures, 5, "a live window keeps counting");
  assert.equal(remainingAttempts(fresh, now), 1);
});

test("retryAfterSeconds rounds up and never goes negative", () => {
  assert.equal(retryAfterSeconds(null, now), 0);
  assert.equal(retryAfterSeconds(now - 5_000, now), 0);
  assert.equal(retryAfterSeconds(now + 1, now), 1);
  assert.equal(retryAfterSeconds(now + 90_000, now), 90);
});

test("the bucket prefers the address the platform saw, not one the caller supplies", () => {
  assert.equal(clientBucket(headers({ "x-real-ip": "203.0.113.7" })), "ip:203.0.113.7");
  // A forged x-forwarded-for must not win a fresh bucket per guess.
  assert.equal(
    clientBucket(headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "1.2.3.4, 5.6.7.8" })),
    "ip:203.0.113.7",
  );
  assert.equal(clientBucket(headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" })), "ip:1.2.3.4");
  // No headers still gets a bucket, so it is never an exemption.
  assert.equal(clientBucket(headers({})), "ip:unknown");
  assert.ok(clientBucket(headers({ "x-real-ip": "a".repeat(500) })).length <= 84);
});

test("describeWait reads naturally at both scales", () => {
  assert.equal(describeWait(1), "1 second");
  assert.equal(describeWait(45), "45 seconds");
  assert.equal(describeWait(120), "2 minutes");
  assert.equal(describeWait(61 * 60), "61 minutes");
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { cronStatuses } from "../src/lib/system.ts";

const now = new Date("2026-09-17T12:00:00Z");
const run = (job, hoursAgo, ok, closed = true) => ({
  run_id: `${job}-${hoursAgo}`,
  job,
  started_at: new Date(now.getTime() - hoursAgo * 3_600_000).toISOString(),
  finished_at: closed ? new Date(now.getTime() - hoursAgo * 3_600_000 + 5_000).toISOString() : null,
  ok: closed ? ok : null,
  detail: {},
});

test("cronStatuses: ok, late, failed, unknown", () => {
  const statuses = cronStatuses([run("appstore_reconcile", 3, true), run("appstore_reconcile", 27, false), run("match_sweep", 50, true)], now);
  assert.equal(statuses[0].status, "ok");
  assert.equal(statuses[0].recentFailures, 1);
  assert.equal(statuses[1].status, "late");
  const failed = cronStatuses([run("appstore_reconcile", 2, false)], now);
  assert.equal(failed[0].status, "failed");
  const open = cronStatuses([run("match_sweep", 1, null, false)], now);
  assert.equal(open[1].status, "failed");
  assert.equal(cronStatuses([], now)[0].status, "unknown");
});

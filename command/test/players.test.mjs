import assert from "node:assert/strict";
import { test } from "node:test";
import { activeCounts, retentionCohorts, rollingActives } from "../src/lib/players.ts";

const now = new Date("2026-09-17T12:00:00Z");
const daysAgo = (days) => new Date(now.getTime() - days * 86_400_000).toISOString();
const event = (player, at) => ({ id: `${player}-${at}`, name: "app_open", game_id: null, device_id: player, player_id: player, role: null, app_version: null, locale_region: null, occurred_at: at, received_at: at, payload: {} });

test("activeCounts splits DAU / WAU / MAU by recency", () => {
  const events = [event("a", daysAgo(0.5)), event("b", daysAgo(3)), event("c", daysAgo(20)), event("d", daysAgo(40)), event("a", daysAgo(25))];
  assert.deepEqual(activeCounts(events, now), { dau: 1, wau: 2, mau: 3 });
});

test("rollingActives produces one point per day with monotone windows", () => {
  // "a" played 2 hours ago (today, Pacific); "b" ten days ago.
  const events = [event("a", daysAgo(0.08)), event("b", daysAgo(10))];
  const points = rollingActives(events, new Date(now.getTime() - 3 * 86_400_000), now);
  assert.equal(points.length, 4);
  const last = points[points.length - 1];
  assert.equal(last.dau, 1);
  assert.equal(last.wau, 1);
  assert.equal(last.mau, 2);
  for (const point of points) assert.ok(point.dau <= point.wau && point.wau <= point.mau);
});

test("retentionCohorts counts returners per install week and marks immature windows", () => {
  const installs = [
    { install_id: "i1", player_id: "a", created_at: daysAgo(20), last_seen_at: daysAgo(1) },
    { install_id: "i2", player_id: "b", created_at: daysAgo(20), last_seen_at: daysAgo(20) },
    { install_id: "i3", player_id: "c", created_at: daysAgo(2), last_seen_at: daysAgo(2) },
  ];
  const events = [event("a", daysAgo(19)), event("a", daysAgo(12)), event("b", daysAgo(20)), event("c", daysAgo(1))];
  const cohorts = retentionCohorts(installs, events, now);
  assert.equal(cohorts.length, 2);
  const older = cohorts.find((c) => c.installs === 2);
  assert.equal(older.d1, 1);
  assert.equal(older.d7, 1);
  assert.equal(older.d30, 0);
  assert.equal(older.mature.d7, true);
  assert.equal(older.mature.d30, false);
  const newer = cohorts.find((c) => c.installs === 1);
  assert.equal(newer.d1, 1);
});

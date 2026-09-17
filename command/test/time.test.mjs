import assert from "node:assert/strict";
import { test } from "node:test";
import { bucketKey, bucketKeys, dayKey, granularitiesFor, granularityFor, rangeFor, startOfToday, weekKey } from "../src/lib/time.ts";

test("day keys follow the Pacific calendar, not UTC", () => {
  // 2026-03-15 06:30 UTC is 2026-03-14 23:30 Pacific (PDT).
  assert.equal(dayKey(new Date("2026-03-15T06:30:00Z")), "2026-03-14");
  // 2026-03-15 07:30 UTC is 2026-03-15 00:30 Pacific.
  assert.equal(dayKey(new Date("2026-03-15T07:30:00Z")), "2026-03-15");
  // PST in January: 07:59 UTC is still the previous day.
  assert.equal(dayKey(new Date("2026-01-10T07:59:00Z")), "2026-01-09");
});

test("minute and hour buckets floor to UTC multiples", () => {
  assert.equal(bucketKey(new Date("2026-09-17T10:23:45Z"), "minute"), "2026-09-17T10:23:00.000Z");
  assert.equal(bucketKey(new Date("2026-09-17T10:23:45Z"), "hour"), "2026-09-17T10:00:00.000Z");
});

test("bucketKeys covers every bucket including quiet ones, across a DST change", () => {
  const since = new Date("2026-03-07T20:00:00Z");
  const until = new Date("2026-03-10T20:00:00Z");
  assert.deepEqual(bucketKeys(since, until, "day"), ["2026-03-07", "2026-03-08", "2026-03-09", "2026-03-10"]);
  assert.equal(bucketKeys(new Date("2026-09-17T10:00:00Z"), new Date("2026-09-17T12:00:00Z"), "hour").length, 3);
  assert.equal(bucketKeys(new Date("2026-09-17T10:00:00Z"), new Date("2026-09-17T10:05:00Z"), "minute").length, 6);
});

test("granularity options keep charts between 2 and 1500 points", () => {
  assert.deepEqual(granularitiesFor(rangeFor("1h")), ["minute"]);
  assert.deepEqual(granularitiesFor(rangeFor("24h")), ["minute", "hour"]);
  assert.deepEqual(granularitiesFor(rangeFor("7d")), ["hour", "day"]);
  assert.deepEqual(granularitiesFor(rangeFor("90d")), ["day"]);
  assert.equal(granularityFor(rangeFor("90d"), "minute"), "day");
  assert.equal(granularityFor(rangeFor("7d"), "day"), "day");
  assert.equal(rangeFor("bogus").key, "7d");
});

test("startOfToday is midnight Pacific", () => {
  const start = startOfToday(new Date("2026-09-17T15:00:00Z"));
  assert.equal(start.toISOString(), "2026-09-17T07:00:00.000Z");
  assert.equal(weekKey(new Date("2026-09-17T15:00:00Z")), "2026-09-14");
});

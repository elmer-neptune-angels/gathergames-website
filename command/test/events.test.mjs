import assert from "node:assert/strict";
import { test } from "node:test";
import { activityByGame, countBy, countSeries, countWhere, distinctSeries, isRoundStart, isSoloRound, lagPercentiles, weekdayHourGrid } from "../src/lib/events.ts";

const event = (name, occurred_at, extra = {}) => ({
  id: `${name}-${occurred_at}`,
  name,
  game_id: null,
  device_id: "d1",
  player_id: "p1",
  role: null,
  app_version: "1.0",
  locale_region: "US",
  occurred_at,
  received_at: occurred_at,
  payload: {},
  ...extra,
});

test("countSeries fills quiet buckets with zero", () => {
  const since = new Date("2026-09-17T10:00:00Z");
  const until = new Date("2026-09-17T12:00:00Z");
  const events = [event("game_started", "2026-09-17T10:15:00Z"), event("game_started", "2026-09-17T10:45:00Z"), event("app_open", "2026-09-17T11:10:00Z")];
  const series = countSeries(events, since, until, "hour", (e) => e.name === "game_started");
  assert.deepEqual(series.map((p) => p.value), [2, 0, 0]);
});

test("distinctSeries counts players, falling back to device when there is no player id", () => {
  const since = new Date("2026-09-17T10:00:00Z");
  const events = [
    event("app_open", "2026-09-17T10:01:00Z", { player_id: "a" }),
    event("app_open", "2026-09-17T10:02:00Z", { player_id: "a" }),
    event("app_open", "2026-09-17T10:03:00Z", { player_id: null, device_id: "z" }),
  ];
  assert.deepEqual(distinctSeries(events, since, since, "hour").map((p) => p.value), [2]);
});

test("activityByGame aggregates the lifecycle events per game", () => {
  const events = [
    event("game_proposed", "2026-09-17T10:00:00Z", { game_id: "sudoku" }),
    event("game_started", "2026-09-17T10:01:00Z", { game_id: "sudoku", payload: { players: 4 } }),
    event("game_finished", "2026-09-17T10:20:00Z", { game_id: "sudoku", payload: { duration_s: 600 } }),
    event("game_started", "2026-09-17T11:00:00Z", { game_id: "sudoku", payload: { players: 2 } }),
    event("game_abandoned", "2026-09-17T11:05:00Z", { game_id: "sudoku" }),
  ];
  const [sudoku] = activityByGame(events);
  assert.equal(sudoku.gameId, "sudoku");
  assert.equal(sudoku.proposed, 1);
  assert.equal(sudoku.started, 2);
  assert.equal(sudoku.finished, 1);
  assert.equal(sudoku.abandoned, 1);
  assert.equal(sudoku.players, 6);
  assert.equal(sudoku.durationS, 600);
  assert.equal(sudoku.lastPlayed, "2026-09-17T11:00:00Z");
});

// The app emits BOTH game_started and a launch marker for one solo round:
// launchSoloGame() calls startGame(), which emits game_started, and only
// then emits its own marker. Counting the marker as a round counted every
// Daily and Quick Play twice.
test("a Daily round counts once, not twice", () => {
  const daily = [
    event("game_started", "2026-09-17T11:30:00Z", { game_id: "glyph", payload: { players: 1 } }),
    event("daily_quick_play_started", "2026-09-17T11:30:01Z", { game_id: "glyph" }),
  ];
  const [glyph] = activityByGame(daily);
  assert.equal(glyph.started, 1, "one round, not two");
  assert.equal(glyph.players, 1);
  assert.equal(glyph.dailyLaunches, 1, "the marker is reported as a breakdown");
  assert.equal(glyph.quickLaunches, 0);
  assert.equal(countWhere(daily, isRoundStart), 1);
  assert.equal(countWhere(daily, isSoloRound), 1);
});

test("a launch that never dealt is not a round", () => {
  // startGame() can refuse (locked gate, round could not be created) while
  // launchSoloGame() emits its marker regardless.
  const failed = [event("quick_play_started", "2026-09-17T12:00:00Z", { game_id: "sudoku" })];
  const [sudoku] = activityByGame(failed);
  assert.equal(sudoku.started, 0);
  assert.equal(sudoku.quickLaunches, 1);
  assert.equal(countWhere(failed, isRoundStart), 0);
});

test("a one-player round inside a room counts as solo", () => {
  const inRoom = [event("game_started", "2026-09-17T12:00:00Z", { game_id: "sudoku", payload: { players: 1 } })];
  assert.equal(countWhere(inRoom, isSoloRound), 1);
  const group = [event("game_started", "2026-09-17T12:00:00Z", { game_id: "sudoku", payload: { players: 3 } })];
  assert.equal(countWhere(group, isSoloRound), 0);
  // A game_started with no payload must not be read as a full room.
  const bare = [event("game_started", "2026-09-17T12:00:00Z", { game_id: "sudoku" })];
  assert.equal(countWhere(bare, isSoloRound), 1);
});

test("weekdayHourGrid places a Sunday-evening round on the Sunday row in Pacific hours", () => {
  // 2026-09-14 03:30 UTC is Sunday 2026-09-13 20:30 PDT.
  const grid = weekdayHourGrid([event("game_started", "2026-09-14T03:30:00Z")], () => true);
  assert.equal(grid[6][20], 1);
  assert.equal(grid.flat().reduce((a, b) => a + b, 0), 1);
});

test("countBy and lagPercentiles", () => {
  const events = [
    event("purchase_failed", "2026-09-17T10:00:00Z", { received_at: "2026-09-17T10:00:10Z" }),
    event("purchase_failed", "2026-09-17T10:00:00Z", { received_at: "2026-09-17T10:01:40Z" }),
    event("app_open", "2026-09-17T10:00:00Z", { received_at: "2026-09-17T10:00:00Z" }),
  ];
  assert.deepEqual(countBy(events, (e) => e.name), [
    { name: "purchase_failed", count: 2 },
    { name: "app_open", count: 1 },
  ]);
  const lag = lagPercentiles(events);
  assert.equal(lag.max, 100);
  assert.equal(lag.p50, 10);
});

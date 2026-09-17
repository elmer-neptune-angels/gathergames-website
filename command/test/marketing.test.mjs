import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSpendCSV, parseSpendInput, summarizeAcquisition } from "../src/lib/marketing.ts";

test("parseSpendInput validates and normalizes a line item", () => {
  const ok = parseSpendInput({ day: "2026-09-15", channel: "Apple-Search-Ads", spend_cents: 4210, impressions: "12000", clicks: "", installs_attributed: 18, campaign: "  launch  ", currency: "usd" });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.row, { day: "2026-09-15", channel: "apple-search-ads", campaign: "launch", spend_cents: 4210, currency: "USD", impressions: 12000, clicks: null, installs_attributed: 18, notes: null });
  assert.equal(parseSpendInput({ day: "15/09/2026", channel: "meta", spend_cents: 1 }).ok, false);
  assert.equal(parseSpendInput({ day: "2026-09-15", channel: "meta", spend_cents: 12.5 }).ok, false);
  assert.equal(parseSpendInput({ day: "2026-09-15", channel: "Bad Channel!", spend_cents: 1 }).ok, false);
  assert.equal(parseSpendInput({ day: "2026-09-15", channel: "meta", spend_cents: 1, clicks: -1 }).ok, false);
});

test("parseSpendCSV reads dollars, quoted fields, and reports bad lines", () => {
  const { rows, errors } = parseSpendCSV(`day,channel,spend,campaign,impressions,clicks,installs
2026-09-15,apple-search-ads,"$1,042.10","launch, wave 1",12000,340,18
2026-09-16,meta,20,,,,
not-a-day,meta,5,,,,`);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].spend_cents, 104210);
  assert.equal(rows[0].campaign, "launch, wave 1");
  assert.equal(rows[1].spend_cents, 2000);
  assert.equal(rows[1].impressions, null);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /line 4/);
  assert.equal(parseSpendCSV("day,channel\n2026-09-15,meta").errors.length, 1);
});

test("summarizeAcquisition computes blended and per-channel CAC", () => {
  // Pacific midnights: the spend table keys by calendar day, and days are Pacific.
  const since = new Date("2026-09-14T07:00:00Z");
  const until = new Date("2026-09-16T19:00:00Z");
  const spend = [
    { id: "1", day: "2026-09-14", channel: "meta", campaign: null, spend_cents: 10000, currency: "USD", impressions: 1000, clicks: 100, installs_attributed: 10, notes: null, created_at: "" },
    { id: "2", day: "2026-09-15", channel: "meta", campaign: null, spend_cents: 5000, currency: "USD", impressions: null, clicks: null, installs_attributed: null, notes: null, created_at: "" },
    { id: "3", day: "2026-09-15", channel: "pr", campaign: null, spend_cents: 3000, currency: "USD", impressions: null, clicks: null, installs_attributed: null, notes: null, created_at: "" },
  ];
  const summary = summarizeAcquisition(spend, ["2026-09-14", "2026-09-14", "2026-09-15", "2026-09-16"], 2, since, until);
  assert.equal(summary.spendCents, 18000);
  assert.equal(summary.newInstalls, 4);
  assert.equal(summary.blendedCacCents, 4500);
  assert.equal(summary.costPerSubscriberCents, 9000);
  assert.equal(summary.channels[0].channel, "meta");
  assert.equal(summary.channels[0].cacCents, 1500);
  assert.equal(summary.channels[1].cacCents, null);
  assert.deepEqual(summary.spendByDay.map((p) => p.value), [10000, 8000, 0]);
  assert.deepEqual(summary.installsByDay.map((p) => p.value), [2, 1, 1]);
});

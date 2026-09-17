import assert from "node:assert/strict";
import { test } from "node:test";
import { purchaseFunnel, subscriptionState, summarizeMirror } from "../src/lib/apple.ts";
import { DEFAULT_SETTINGS } from "../src/lib/settings.ts";

const now = new Date("2026-09-17T12:00:00Z");
const row = (overrides) => ({
  original_transaction_id: Math.random().toString(36).slice(2),
  environment: "Production",
  product_id: "my.lgc.gather.club.annual",
  tier: "club",
  expires_at: "2027-01-01T00:00:00Z",
  auto_renew: true,
  revoked_at: null,
  apple_status: 1,
  last_notification_type: "SUBSCRIBED",
  last_notification_subtype: null,
  reconciled_at: "2026-09-17T09:00:00Z",
  created_at: "2026-09-10T00:00:00Z",
  updated_at: "2026-09-17T09:00:00Z",
  ...overrides,
});

test("subscriptionState: revocation wins, then Apple status, then the expiry clock", () => {
  assert.equal(subscriptionState(row({}), now), "active");
  assert.equal(subscriptionState(row({ revoked_at: "2026-09-01T00:00:00Z" }), now), "revoked");
  assert.equal(subscriptionState(row({ apple_status: 4 }), now), "grace");
  assert.equal(subscriptionState(row({ apple_status: 3 }), now), "billing_retry");
  assert.equal(subscriptionState(row({ apple_status: 2, expires_at: "2026-09-01T00:00:00Z" }), now), "lapsed");
  assert.equal(subscriptionState(row({ apple_status: null, expires_at: "2026-09-01T00:00:00Z" }), now), "lapsed");
});

test("summarizeMirror counts paying rows, MRR from prices, and new/ended per day", () => {
  const rows = [
    row({}),
    row({ product_id: "my.lgc.gather.club.monthly", auto_renew: false, expires_at: "2026-09-20T00:00:00Z" }),
    row({ apple_status: 2, expires_at: "2026-09-15T00:00:00Z", created_at: "2026-08-01T00:00:00Z" }),
    row({ environment: "Sandbox" }),
  ];
  const since = new Date("2026-09-01T00:00:00Z");
  const summary = summarizeMirror(rows, "Production", since, now, DEFAULT_SETTINGS, now);
  assert.equal(summary.total, 3);
  assert.equal(summary.paying, 2);
  assert.equal(summary.autoRenewOff, 1);
  // 3999/12 = 333 + 599 = 932
  assert.equal(summary.mrrCents, 932);
  assert.equal(summary.newByDay.reduce((sum, p) => sum + p.value, 0), 2);
  assert.equal(summary.endedByDay.reduce((sum, p) => sum + p.value, 0), 1);
  assert.equal(summary.expiringSoon.length, 1);
  assert.equal(summary.products.find((p) => p.name === "Club Annual").lapsed, 1);
});

test("summarizeMirror reports MRR as unknown when a paying product is unpriced", () => {
  const rows = [row({ product_id: "my.lgc.gather.family.annual", tier: "family" })];
  const summary = summarizeMirror(rows, "Production", now, now, DEFAULT_SETTINGS, now);
  assert.equal(summary.paying, 1);
  assert.equal(summary.mrrCents, null);
  assert.equal(summary.priced, false);
});

test("purchaseFunnel counts viewers once and groups by source", () => {
  const e = (name, player, source) => ({ id: `${name}${player}${Math.random()}`, name, game_id: null, device_id: player, player_id: player, role: null, app_version: null, locale_region: null, occurred_at: "2026-09-17T10:00:00Z", received_at: "2026-09-17T10:00:00Z", payload: { source } });
  const funnel = purchaseFunnel([e("paywall_shown", "a", "practice"), e("paywall_shown", "a", "practice"), e("paywall_shown", "b", "home"), e("purchase_started", "a", "practice"), e("purchase_completed", "a", "practice"), e("purchase_failed", "b", "home")]);
  assert.equal(funnel.paywallShown, 3);
  assert.equal(funnel.paywallViewers, 2);
  assert.equal(funnel.purchaseCompleted, 1);
  assert.equal(funnel.purchaseFailed, 1);
  assert.deepEqual(funnel.bySource[0], { name: "practice", shown: 2, completed: 1 });
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import { fetchDailySales, missingDays, parseSalesReport } from "../src/lib/appstore-sales.ts";

const HEADER = "Provider\tProvider Country\tSKU\tDeveloper\tTitle\tVersion\tProduct Type Identifier\tUnits\tDeveloper Proceeds\tBegin Date\tEnd Date\tCustomer Currency\tCountry Code\tCurrency of Proceeds\tApple Identifier\tCustomer Price\tPromo Code\tParent Identifier\tSubscription\tPeriod\tCategory\tCMB\tDevice\tSupported Platforms\tProceeds Reason\tPreserved Pricing\tClient\tOrder Type";
const line = (type, units, proceeds, country, price) => `APPLE\tUS\tGATHER\tNeptune Angels\tGather\t1.0\t${type}\t${units}\t${proceeds}\t09/16/2026\t09/16/2026\tUSD\t${country}\tUSD\t123\t${price}\t\t\t\t\tGames\t\tiPhone\tiOS\t\t\t\t`;

test("parseSalesReport classifies units and sums per-unit proceeds", () => {
  const tsv = [HEADER, line("1F", 12, 0, "US", 0), line("1F", 3, 0, "GB", 0), line("7F", 40, 0, "US", 0), line("3F", 2, 0, "US", 0), line("IAY", 2, 33.99, "US", 39.99), line("IAY", 1, 0, "US", 0)].join("\n");
  const sales = parseSalesReport(tsv, "2026-09-16");
  assert.equal(sales.downloads, 15);
  assert.equal(sales.updates, 40);
  assert.equal(sales.redownloads, 2);
  assert.equal(sales.iapUnits, 2);
  assert.equal(sales.trialStarts, 1);
  assert.equal(sales.proceedsCents, 6798);
  assert.equal(sales.proceedsCurrency, "USD");
  assert.equal(sales.countries, 2);
});

test("fetchDailySales gunzips the report and treats 404 as not published", async () => {
  const config = { issuerId: "iss", keyId: "kid", privateKeyPEM: TEST_KEY, vendorNumber: "8" };
  const body = gzipSync(Buffer.from([HEADER, line("1F", 5, 0, "US", 0)].join("\n")));
  let seenURL = "";
  const sales = await fetchDailySales(config, "2026-09-16", async (url, bearer) => {
    seenURL = url;
    assert.match(bearer, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    return { status: 200, body: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) };
  });
  assert.equal(sales.downloads, 5);
  assert.match(seenURL, /filter\[reportDate\]=2026-09-16/);
  assert.equal(await fetchDailySales(config, "2026-09-17", async () => ({ status: 404, body: new ArrayBuffer(0) })), null);
});

test("missingDays never asks for today and skips cached days", () => {
  const now = new Date("2026-09-17T12:00:00Z");
  assert.deepEqual(missingDays(["2026-09-15"], 3, now), ["2026-09-16", "2026-09-14"]);
});

// A throwaway P-256 key for the JWT signer; never used anywhere real.
const TEST_KEY = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgevZzL1gdAFr88hb2
OF/2NxApJCzGCEDdfSp6VQO30hyhRANCAAQRWz+jn65BtOMvdyHKcvjBeBSDZH2r
1RTwjmYSi9R/zpBnuQ4EiMnCqfMPWiZqB4QdbAd0E7oH50VpuZ1P087G
-----END PRIVATE KEY-----`;

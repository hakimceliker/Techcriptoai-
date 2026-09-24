import assert from "node:assert/strict";
import test from "node:test";
import { decide } from "../src/crypto/engine.ts";
import type { MarketInput } from "../src/crypto/types.ts";

const now = 1_700_000_000_000;
const base: MarketInput = {
  symbol: "BTCUSDT",
  ts: now,
  price: 100_000,
  emaFast: 100_200,
  emaSlow: 100_000,
  rsi: 55,
  volumeZ: 1.5,
  buyPressure: 60,
  sellPressure: 40,
  bidDepth: 140,
  askDepth: 90,
  longLiq: 20,
  shortLiq: 80,
  atrPct: 0.003,
};

test("data older than 2.5 seconds returns NO_TRADE", () => {
  const result = decide({ ...base, ts: now - 2_501 }, now);
  assert.equal(result.side, "NO_TRADE");
  assert.equal(result.fresh, false);
});

test("valid bullish consensus returns LONG with bounded risk levels", () => {
  const result = decide(base, now);
  assert.equal(result.side, "LONG");
  assert.equal(result.entry, base.price);
  assert.ok(result.stop !== undefined && result.stop < base.price);
  assert.ok(result.target1 !== undefined && result.target1 > base.price);
  assert.ok(result.target2 !== undefined && result.target2 > result.target1!);
});

test("conflicting directional evidence returns NO_TRADE", () => {
  const result = decide(
    { ...base, emaFast: 99_800, emaSlow: 100_000, bidDepth: 160, askDepth: 80, longLiq: 50, shortLiq: 50 },
    now,
  );
  assert.equal(result.side, "NO_TRADE");
});

test("fake-breakout veto overrides directional evidence", () => {
  const result = decide({ ...base, volumeZ: 3, buyPressure: 50, sellPressure: 49 }, now);
  assert.equal(result.side, "NO_TRADE");
  assert.equal(result.confidence, 20);
});

test("future timestamps fail closed", () => {
  const result = decide({ ...base, ts: now + 1 }, now);
  assert.equal(result.side, "NO_TRADE");
  assert.equal(result.fresh, false);
});

test("non-finite, impossible, and malformed inputs fail closed without throwing", () => {
  const invalid: unknown[] = [
    { ...base, price: Number.NaN },
    { ...base, price: 0 },
    { ...base, emaFast: 0 },
    { ...base, rsi: 101 },
    { ...base, bidDepth: -1 },
    { ...base, symbol: " " },
    null,
    {},
    { ...base, symbol: null },
    42,
  ];
  for (const value of invalid) {
    const result = decide(value, now);
    assert.equal(result.side, "NO_TRADE");
    assert.equal(result.fresh, false);
  }
});

test("overflowing or non-positive risk levels return NO_TRADE", () => {
  const overflow = decide({ ...base, price: Number.MAX_VALUE, emaFast: Number.MAX_VALUE }, now);
  assert.equal(overflow.side, "NO_TRADE");
  assert.equal(overflow.entry, undefined);
  assert.equal(overflow.stop, undefined);
});

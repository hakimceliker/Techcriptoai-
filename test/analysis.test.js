import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, NOW } from '../examples/fixture.js';
import { analyzeSnapshot, momentum, reversal, orderbook, liquidations, breakout, validator, entryExit } from '../src/index.js';
const combined = () => { const x = fixture(); return { ...x, signals: analyzeSnapshot(x, NOW).signals }; };
test('complete synthetic pipeline yields hypothetical watch, never an order', () => {
  const out = analyzeSnapshot(fixture(), NOW);
  assert.equal(out.validation.direction, 'LONG');
  assert.equal(out.plan.decision, 'WATCH');
  assert.ok(out.plan.evidence.stop < out.plan.evidence.entry);
  assert.ok(out.plan.evidence.target > out.plan.evidence.entry);
  for (const s of [...out.signals, out.validation, out.plan]) assert.equal(s.executionAllowed, false);
});
for (const [name, fn] of Object.entries({ momentum, reversal, orderbook, liquidations, breakout, validator, entryExit })) {
  test(`${name}: missing input fails closed`, () => assert.equal(fn(null, NOW).decision, 'NO-TRADE'));
  test(`${name}: stale data fails closed`, () => assert.equal(fn(combined(), NOW + 200000).decision, 'NO-TRADE'));
  test(`${name}: future data fails closed`, () => assert.equal(fn(combined(), NOW - 1).decision, 'NO-TRADE'));
}
test('momentum short and flat cases', () => {
  const x = fixture();
  x.candles.forEach((r, i) => Object.assign(r, { open: 110 - i, close: 110 - i, high: 111 - i, low: 109 - i }));
  assert.equal(momentum(x, NOW).direction, 'SHORT');
  x.candles.forEach(r => Object.assign(r, { open: 100, close: 100, high: 101, low: 99 }));
  assert.equal(momentum(x, NOW).decision, 'NO-TRADE');
});
test('confirmed downward reversal', () => {
  const x = fixture(); Object.assign(x.candles.at(-1), { close: 102, low: 101, volume: 200 });
  assert.equal(reversal(x, NOW).direction, 'SHORT');
});
test('confirmed upward reversal', () => {
  const x = fixture();
  x.candles.forEach((r, i) => Object.assign(r, { open: 110 - i, close: 110 - i, high: 110.5 - i, low: 109.5 - i }));
  Object.assign(x.candles.at(-1), { close: 108, high: 109, volume: 200 });
  assert.equal(reversal(x, NOW).direction, 'LONG');
});
for (const mutate of [x => x.candles[2].closedAt++, x => x.candles[0].close = NaN, x => x.candles[0].closed = false, x => x.candles[0].high = 1]) {
  test('invalid candle stream vetoes whole pipeline', () => { const x = fixture(); mutate(x); assert.equal(analyzeSnapshot(x, NOW).plan.decision, 'NO-TRADE'); });
}
test('book spread, ordering, synchronization and numeric validation', () => {
  for (const mutate of [x => x.book.bids[0][0] = 200, x => x.book.asks[1][0] = 1, x => x.book.synchronized = false, x => x.book.bids[0][1] = Infinity, x => x.book.asks = [[107, 1], [108, 1], [109, 1]]]) {
    const x = fixture(); mutate(x); assert.equal(orderbook(x, NOW).decision, 'NO-TRADE');
  }
});
test('liquidation cascade and incomplete feed veto', () => {
  for (const mutate of [x => x.liquidations.longUsd = 300, x => x.liquidations.complete = false]) {
    const x = fixture(); mutate(x); assert.equal(analyzeSnapshot(x, NOW).plan.decision, 'NO-TRADE');
  }
});
test('failed upper and lower breakouts veto', () => {
  for (const mutate of [x => Object.assign(x.candles.at(-1), { close: 104.5, low: 104 }), x => x.candles.at(-1).low = 90]) {
    const x = fixture(); mutate(x); assert.equal(breakout(x, NOW).evidence.veto, true); assert.equal(analyzeSnapshot(x, NOW).plan.decision, 'NO-TRADE');
  }
});
for (const [name, mutate] of Object.entries({
  conflict: x => { x.signals[1].direction = 'SHORT'; x.signals[1].decision = 'WATCH'; x.signals[1].reasons = []; },
  symbol: x => x.signals[0].symbol = 'ETH/USDT', venue: x => x.signals[0].venue = 'elsewhere',
  snapshot: x => x.signals[0].snapshotId = 'other', timeframe: x => x.signals[0].timeframe = '1h',
  duplicate: x => x.signals[1] = x.signals[0], missing: x => x.signals.pop(),
  expired: x => x.signals[0].validUntil = NOW - 1,
  malformed: x => x.signals[0].direction = 'BUY',
  execution: x => x.signals[0].executionAllowed = true,
  veto: x => x.signals[3].evidence.veto = true,
  insufficient: x => { x.signals[2].direction = 'NEUTRAL'; x.signals[2].decision = 'NO-TRADE'; }
})) test(`validator and entry engine reject ${name}`, () => {
  const x = combined(); mutate(x);
  assert.equal(validator(x, NOW).decision, 'NO-TRADE'); assert.equal(entryExit(x, NOW).decision, 'NO-TRADE');
});
test('freshness boundary is inclusive and expiration is preserved', () => {
  const x = fixture(); assert.equal(orderbook(x, NOW + 5000).direction, 'LONG'); assert.equal(orderbook(x, NOW + 5001).decision, 'NO-TRADE');
  assert.equal(analyzeSnapshot(x, NOW).plan.validUntil, NOW + 5000);
});
test('input is not mutated and calls are deterministic', () => {
  const x = fixture(), before = structuredClone(x);
  assert.deepEqual(analyzeSnapshot(x, NOW), analyzeSnapshot(x, NOW)); assert.deepEqual(x, before);
});
test('numeric overflow does not become a momentum signal', () => {
  const x = fixture();
  x.candles.forEach((r, i) => { const p = i ? 1e308 : 1e-308; Object.assign(r, { open: p, high: p, low: p, close: p }); });
  assert.equal(momentum(x, NOW).decision, 'NO-TRADE');
  assert.ok(momentum(x, NOW).reasons.includes('NUMERIC_OVERFLOW'));
});
test('entry engine rejects zero range and excessive range', () => {
  for (const wide of [false, true]) {
    const x = combined();
    x.candles.forEach(r => Object.assign(r, { open: r.close, high: r.close + (wide ? 20 : 0), low: r.close - (wide ? 20 : 0) }));
    assert.equal(entryExit(x, NOW).decision, 'NO-TRADE');
  }
});
test('short plan has stop above entry and target below', () => {
  const x = combined();
  for (const s of x.signals) if (s.direction === 'LONG') s.direction = 'SHORT';
  const p = entryExit(x, NOW);
  assert.equal(p.direction, 'SHORT'); assert.ok(p.evidence.stop > p.evidence.entry); assert.ok(p.evidence.target < p.evidence.entry);
});

export const MODULES = ['crypto-momentum', 'reversal-detector', 'orderbook-pressure', 'liquidation-radar', 'fake-breakout'];
export const TTL = { candles: 120000, book: 5000, liquidations: 30000 };
export function requireValue(condition, reason = 'INVALID_DATA') {
  if (!condition) throw new Error(reason);
}
export const finite = x => typeof x === 'number' && Number.isFinite(x);
export const positive = x => finite(x) && x > 0;
export function fresh(timestamp, now, ttl) {
  requireValue(Number.isSafeInteger(now) && now > 0 && Number.isSafeInteger(timestamp), 'INVALID_TIMESTAMP');
  requireValue(timestamp <= now, 'FUTURE_DATA');
  requireValue(now - timestamp <= ttl, 'STALE_DATA');
}
export function context(input) {
  requireValue(input && typeof input === 'object');
  for (const key of ['symbol', 'venue', 'timeframe', 'snapshotId']) requireValue(typeof input[key] === 'string' && input[key].trim().length > 0, 'MISSING_CONTEXT');
}
export function result(module, input, now, direction = 'NEUTRAL', reasons = [], evidence = {}, validUntil = now) {
  return { schemaVersion: 1, module, symbol: input?.symbol ?? null, venue: input?.venue ?? null,
    timeframe: input?.timeframe ?? null, snapshotId: input?.snapshotId ?? null,
    evaluatedAt: now, validUntil, direction, decision: direction === 'NEUTRAL' ? 'NO-TRADE' : 'WATCH',
    label: direction === 'NEUTRAL' ? 'BEKLE' : 'IZLE', reasons, evidence, executionAllowed: false };
}
export function guarded(module, input, now, fn) {
  try { context(input); fresh(now, now, 0); return fn(); }
  catch (error) { return result(module, input, now, 'NEUTRAL', [error.message]); }
}
export function candles(input, now) {
  const rows = input.candles;
  requireValue(Array.isArray(rows) && rows.length >= 6, 'INSUFFICIENT_CANDLES');
  requireValue(Number.isSafeInteger(input.intervalMs) && input.intervalMs > 0, 'INVALID_INTERVAL');
  rows.forEach((r, i) => {
    requireValue(r && [r.open, r.high, r.low, r.close].every(positive) && finite(r.volume) && r.volume >= 0 && r.closed === true);
    requireValue(r.low <= Math.min(r.open, r.close) && r.high >= Math.max(r.open, r.close), 'INVALID_OHLC');
    requireValue(Number.isSafeInteger(r.closedAt) && r.closedAt <= now, 'INVALID_CANDLE_TIME');
    if (i) requireValue(r.closedAt - rows[i - 1].closedAt === input.intervalMs, 'CANDLE_GAP_OR_ORDER');
  });
  fresh(rows.at(-1).closedAt, now, TTL.candles);
  return rows;
}

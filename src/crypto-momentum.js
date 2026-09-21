import { guarded, candles, result, TTL, requireValue, finite } from './contracts.js';
export function analyze(input, now = Date.now()) {
  return guarded('crypto-momentum', input, now, () => {
    const rows = candles(input, now).slice(-6);
    const change = rows.at(-1).close / rows[0].close - 1;
    requireValue(finite(change), 'NUMERIC_OVERFLOW');
    const steps = rows.slice(1).map((r, i) => Math.sign(r.close - rows[i].close));
    const direction = change >= 0.01 && steps.every(x => x > 0) ? 'LONG' : change <= -0.01 && steps.every(x => x < 0) ? 'SHORT' : 'NEUTRAL';
    return result('crypto-momentum', input, now, direction, direction === 'NEUTRAL' ? ['NO_CONFIRMED_MOMENTUM'] : [], { change }, rows.at(-1).closedAt + TTL.candles);
  });
}

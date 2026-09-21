import { guarded, candles, result, TTL } from './contracts.js';
export function analyze(input, now = Date.now()) {
  return guarded('reversal-detector', input, now, () => {
    const rows = candles(input, now).slice(-6), last = rows.at(-1), prev = rows.at(-2);
    const steps = rows.slice(1, -1).map((r, i) => Math.sign(r.close - rows[i].close));
    const volumeConfirmed = last.volume > prev.volume * 1.5 && prev.volume > 0;
    const direction = volumeConfirmed && steps.every(x => x < 0) && last.close > prev.high ? 'LONG' : volumeConfirmed && steps.every(x => x > 0) && last.close < prev.low ? 'SHORT' : 'NEUTRAL';
    return result('reversal-detector', input, now, direction, direction === 'NEUTRAL' ? ['NO_CONFIRMED_REVERSAL'] : [], { volumeConfirmed }, last.closedAt + TTL.candles);
  });
}

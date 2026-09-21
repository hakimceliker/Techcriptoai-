import { guarded, result, TTL, candles } from './contracts.js';
export function analyze(input, now = Date.now()) {
  return guarded('fake-breakout', input, now, () => {
    const rows = candles(input, now).slice(-6), last = rows.at(-1), history = rows.slice(0, -1);
    const resistance = Math.max(...history.map(r => r.high)), support = Math.min(...history.map(r => r.low));
    const veto = (last.high > resistance && last.close <= resistance) || (last.low < support && last.close >= support);
    return result('fake-breakout', input, now, 'NEUTRAL', veto ? ['FAILED_BREAKOUT'] : [], { veto, support, resistance }, last.closedAt + TTL.candles);
  });
}

import { guarded, result, requireValue, positive, candles, TTL } from './contracts.js';
import { analyze as validate } from './signal-validator.js';
export function analyze(input, now = Date.now()) {
  return guarded('entry-exit-engine', input, now, () => {
    const validation = validate(input, now);
    requireValue(validation.decision === 'WATCH', validation.reasons[0] ?? 'VALIDATION_FAILED');
    const rows = candles(input, now).slice(-6), entry = rows.at(-1).close;
    const range = rows.reduce((a, r) => a + r.high - r.low, 0) / rows.length;
    requireValue(positive(range) && range / entry <= 0.05, 'INVALID_RISK_DISTANCE');
    const sign = validation.direction === 'LONG' ? 1 : -1;
    const stop = entry - sign * 1.5 * range, target = entry + sign * 3 * range;
    requireValue([entry, stop, target].every(positive), 'INVALID_PLAN');
    return result('entry-exit-engine', input, now, validation.direction, [], { hypotheticalOnly: true, entry, stop, target, rewardRiskRatio: 2, costsIncluded: false }, Math.min(validation.validUntil, rows.at(-1).closedAt + TTL.candles));
  });
}

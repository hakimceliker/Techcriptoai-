import { MODULES, guarded, result, fresh, requireValue } from './contracts.js';
export function analyze(input, now = Date.now()) {
  return guarded('signal-validator', input, now, () => {
    requireValue(Array.isArray(input.signals) && input.signals.length === MODULES.length, 'MISSING_SIGNALS');
    requireValue(new Set(input.signals.map(s => s?.module)).size === MODULES.length, 'DUPLICATE_SIGNALS');
    for (const s of input.signals) {
      requireValue(s && MODULES.includes(s.module) && s.schemaVersion === 1 && s.executionAllowed === false, 'INVALID_SIGNAL');
      for (const key of ['symbol', 'venue', 'timeframe', 'snapshotId']) requireValue(s[key] === input[key], 'CONTEXT_MISMATCH');
      fresh(s.evaluatedAt, now, 5000);
      requireValue(Number.isSafeInteger(s.validUntil) && s.validUntil >= now && s.validUntil >= s.evaluatedAt && s.validUntil <= s.evaluatedAt + 120000, 'EXPIRED_SIGNAL');
      requireValue(['LONG', 'SHORT', 'NEUTRAL'].includes(s.direction) && Array.isArray(s.reasons) && s.evidence && typeof s.evidence === 'object', 'INVALID_SIGNAL');
      requireValue(s.decision === (s.direction === 'NEUTRAL' ? 'NO-TRADE' : 'WATCH'), 'INVALID_SIGNAL');
      const normal = ['NO_CONFIRMED_MOMENTUM', 'NO_CONFIRMED_REVERSAL', 'BALANCED_BOOK'];
      requireValue(s.reasons.every(r => normal.includes(r)), 'UPSTREAM_VETO_OR_INVALID_DATA');
      if (['fake-breakout', 'liquidation-radar'].includes(s.module)) requireValue(s.evidence.veto === false && s.direction === 'NEUTRAL', 'RISK_VETO');
    }
    const directional = input.signals.filter(s => s.direction !== 'NEUTRAL');
    requireValue(new Set(directional.map(s => s.direction)).size <= 1, 'CONFLICTING_SIGNALS');
    requireValue(directional.length >= 2, 'INSUFFICIENT_CONFIRMATION');
    return result('signal-validator', input, now, directional[0].direction, [], { confirmations: directional.map(s => s.module) }, Math.min(...input.signals.map(s => s.validUntil)));
  });
}

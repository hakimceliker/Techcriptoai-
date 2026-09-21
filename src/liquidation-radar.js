import { guarded, result, TTL, fresh, requireValue, finite, positive } from './contracts.js';
export function analyze(input, now = Date.now()) {
  return guarded('liquidation-radar', input, now, () => {
    const l = input.liquidations;
    requireValue(l && l.complete === true, 'INCOMPLETE_LIQUIDATIONS');
    fresh(l.observedAt, now, TTL.liquidations);
    requireValue([l.longUsd, l.shortUsd].every(x => finite(x) && x >= 0) && positive(l.baselineUsd) && l.windowMs === 60000);
    const total = l.longUsd + l.shortUsd;
    requireValue(finite(total));
    const veto = total >= 3 * l.baselineUsd;
    return result('liquidation-radar', input, now, 'NEUTRAL', veto ? ['LIQUIDATION_CASCADE'] : [], { veto, totalUsd: total }, l.observedAt + TTL.liquidations);
  });
}

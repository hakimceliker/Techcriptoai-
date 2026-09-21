export const NOW = 1800000000000;
export function fixture(now = NOW) {
  return { symbol: 'BTC/USDT', venue: 'fixture-only', timeframe: '1m', snapshotId: 'synthetic-1', intervalMs: 60000,
    candles: Array.from({ length: 6 }, (_, i) => ({ open: 100 + i, close: 100.5 + i, high: 100.7 + i, low: 99.8 + i, volume: 100, closed: true, closedAt: now - (5 - i) * 60000 })),
    book: { synchronized: true, observedAt: now, bids: [[105.4, 10], [105.3, 10], [105.2, 10]], asks: [[105.6, 1], [105.7, 1], [105.8, 1]] },
    liquidations: { complete: true, observedAt: now, longUsd: 10, shortUsd: 10, baselineUsd: 100, windowMs: 60000 } };
}

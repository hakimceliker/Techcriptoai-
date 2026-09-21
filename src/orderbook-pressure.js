import { guarded, result, TTL, fresh, requireValue, positive } from './contracts.js';
export function analyze(input, now = Date.now()) {
  return guarded('orderbook-pressure', input, now, () => {
    const b = input.book;
    requireValue(b && b.synchronized === true, 'UNSYNCHRONIZED_BOOK');
    fresh(b.observedAt, now, TTL.book);
    for (const side of ['bids', 'asks']) {
      requireValue(Array.isArray(b[side]) && b[side].length >= 3, 'INSUFFICIENT_DEPTH');
      b[side].forEach((r, i) => {
        requireValue(Array.isArray(r) && r.length === 2 && r.every(positive));
        if (i) requireValue(side === 'bids' ? r[0] < b[side][i - 1][0] : r[0] > b[side][i - 1][0], 'INVALID_BOOK_ORDER');
      });
    }
    requireValue(b.bids[0][0] < b.asks[0][0], 'CROSSED_BOOK');
    const mid = (b.bids[0][0] + b.asks[0][0]) / 2;
    const spread = (b.asks[0][0] - b.bids[0][0]) / mid;
    requireValue(spread <= 0.005, 'WIDE_SPREAD');
    const sum = side => b[side].filter(r => Math.abs(r[0] / mid - 1) <= 0.01).reduce((a, r) => a + r[0] * r[1], 0);
    const bid = sum('bids'), ask = sum('asks');
    requireValue(positive(bid) && positive(ask) && Number.isFinite(bid + ask));
    const imbalance = (bid - ask) / (bid + ask);
    const direction = imbalance > 0.25 ? 'LONG' : imbalance < -0.25 ? 'SHORT' : 'NEUTRAL';
    return result('orderbook-pressure', input, now, direction, direction === 'NEUTRAL' ? ['BALANCED_BOOK'] : [], { imbalance, spread }, b.observedAt + TTL.book);
  });
}

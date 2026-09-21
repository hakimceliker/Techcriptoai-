import { analyze as momentum } from './crypto-momentum.js';
import { analyze as reversal } from './reversal-detector.js';
import { analyze as orderbook } from './orderbook-pressure.js';
import { analyze as liquidations } from './liquidation-radar.js';
import { analyze as breakout } from './fake-breakout.js';
import { analyze as validator } from './signal-validator.js';
import { analyze as entryExit } from './entry-exit-engine.js';
export { momentum, reversal, orderbook, liquidations, breakout, validator, entryExit };
export function analyzeSnapshot(input, now = Date.now()) {
  const signals = [momentum, reversal, orderbook, liquidations, breakout].map(fn => fn(input, now));
  const combined = { ...input, signals };
  return { signals, validation: validator(combined, now), plan: entryExit(combined, now) };
}

# TechCriptoAI Signal Engine
Decision-support layer for live crypto dashboards. It never places exchange orders.

## Modules
crypto-momentum, reversal-detector, orderbook-pressure, liquidation-radar, fake-breakout, signal-validator, entry-exit-engine.

## Gates
Data older than 2.5 seconds => NO_TRADE. Conflicting/weak signals => NO_TRADE. Fake-breakout risk => veto. Entry/stop/targets appear only after consensus.

Normalize live feed data to MarketInput and call decide(input). Backtest and paper-trade before production use.

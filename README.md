# TechCriptoAI Signal Engine
Decision-support layer for live crypto dashboards. It never places exchange orders.

## Modules
crypto-momentum, reversal-detector, orderbook-pressure, liquidation-radar, fake-breakout, signal-validator, entry-exit-engine.

## Gates
Data older than 2.5 seconds or malformed/future-dated input => NO_TRADE. Conflicting/weak signals => NO_TRADE. Fake-breakout risk => veto. Entry/stop/targets appear only after consensus.

Normalize live feed data to MarketInput and call decide(input). Backtest and paper-trade before production use.

## Binance USDⓈ-M depth synchronization core
`BinanceUsdmDepthBookSynchronizer` is a deterministic, transport-free core. It buffers decoded depth events, installs a REST depth snapshot, requires the first applied event to overlap that snapshot, and checks each later `pu` against the previous `u`. The current book is returned only while synchronized. Malformed events, symbol mismatches, gaps, empty sides, or buffer/level limits clear the book and require a fresh synchronization cycle. The output is explicitly marked `snapshot-limited`: it contains the levels returned in the REST snapshot plus later touched levels, not a guarantee of the exchange's complete depth. Price and quantity strings are normalized and sorted with integer arithmetic, without floating-point conversion.

`BinanceUsdmMarketDataAdapter` connects to Binance's public `/public/stream` depth stream and gets snapshots from `/fapi/v1/depth`. It buffers before snapshot installation, withholds the book until sequence reconciliation succeeds, checks local data age, and reconnects with capped exponential backoff after a transport error, stale feed, invalid payload, or sequence gap. `getBook()` returns `undefined` unless the socket is connected and the book is fresh. Defaults are 100 ms stream updates, a 1,000-level snapshot, and a 2.5-second stale limit; the snapshot-limited coverage caveat still applies.

`ExecutionInterlock` starts disarmed. Its execution callback only runs when explicitly armed, the decision is directional, fresh, above the confidence threshold and has valid risk levels, and matching market data is connected, synchronized, and fresh. It does not contain credentials or implement any Binance order endpoint; an application must deliberately supply its execution callback.

See Binance's [local order book procedure](https://developers.binance.com/en/docs/products/derivatives-trading-usds-futures/websocket-market-streams/How-to-manage-a-local-order-book-correctly), [WebSocket base URL migration](https://developers.binance.com/en/docs/products/derivatives-trading-usds-futures/websocket-market-streams/Important-WebSocket-Change-Notice), and [REST depth endpoint](https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/market-data).

## Tests
Requires Node.js 24.12 or newer. Run `npm ci`, `npm run typecheck`, and `npm test` locally. GitHub Actions runs typechecking and the deterministic engine, depth-sync, adapter, and interlock suites on pull requests, pushes to main, and daily at 08:00 Türkiye time. Each run keeps a TAP test log for 90 days.

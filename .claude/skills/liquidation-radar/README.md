# liquidation-radar

Gerçekleşmiş likidasyon akışında yoğunlaşma riskini kontrol eder.

## Giriş

Ortak alanlar: symbol, venue, timeframe, snapshotId. Ek alanlar: liquidations. [Alan tipleri ve tazelik sınırları](../../../docs/contracts.md). Fonksiyon: `analyze(input, now)` — [uygulama](../../../src/liquidation-radar.js).

## Çıkış

Ortak sözleşme v1: direction, decision, label, reasons, evidence, evaluatedAt, validUntil, executionAllowed=false ve bağlam alanları. evidence: veto: boolean, totalUsd: sayı. Hatalarda NEUTRAL / BEKLE / NO-TRADE; nedeni reasons içinde.

## Karar

60 saniyelik toplam >= baselineUsd değerinin üç katı ise veto. Yön tahmini yapmaz; normal durumda da NEUTRAL döner.

Gelecek veya süresi dolmuş veri reddedilir. Çelişkili sinyaller ortak validator tarafından NO-TRADE sonucuna çevrilir. Modül tek başına işlem kararı vermez.

## Test

Repo kökünde `npm test`. [Davranış testleri](../../../test/analysis.test.js) eksik/eski/gelecek veriyi, modül kararlarını ve ortak çelişki vetosunu sınar. Sentetik örnek: `npm run demo`. Eşikler deneysel olup backtest ile doğrulanmış değildir.

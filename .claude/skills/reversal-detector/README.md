# reversal-detector

Önceki eğilime karşı hacimle teyit edilen dönüşleri inceler.

## Giriş

Ortak alanlar: symbol, venue, timeframe, snapshotId. Ek alanlar: candles, intervalMs. [Alan tipleri ve tazelik sınırları](../../../docs/contracts.md). Fonksiyon: `analyze(input, now)` — [uygulama](../../../src/reversal-detector.js).

## Çıkış

Ortak sözleşme v1: direction, decision, label, reasons, evidence, evaluatedAt, validUntil, executionAllowed=false ve bağlam alanları. evidence: volumeConfirmed: boolean. Hatalarda NEUTRAL / BEKLE / NO-TRADE; nedeni reasons içinde.

## Karar

Önceki dört kapanış hareketi aynı yönde olmalı; son kapanış önceki mumun karşı sınırını aşmalı ve hacim önceki hacmin 1.5 katından büyük olmalı. Aksi halde NO-TRADE.

Gelecek veya süresi dolmuş veri reddedilir. Çelişkili sinyaller ortak validator tarafından NO-TRADE sonucuna çevrilir. Modül tek başına işlem kararı vermez.

## Test

Repo kökünde `npm test`. [Davranış testleri](../../../test/analysis.test.js) eksik/eski/gelecek veriyi, modül kararlarını ve ortak çelişki vetosunu sınar. Sentetik örnek: `npm run demo`. Eşikler deneysel olup backtest ile doğrulanmış değildir.

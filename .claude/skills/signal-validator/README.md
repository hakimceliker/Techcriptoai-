# signal-validator

Beş analiz sonucunu bağlam, tazelik, veto ve yön tutarlılığı açısından doğrular.

## Giriş

Ortak alanlar: symbol, venue, timeframe, snapshotId. Ek alanlar: signals. [Alan tipleri ve tazelik sınırları](../../../docs/contracts.md). Fonksiyon: `analyze(input, now)` — [uygulama](../../../src/signal-validator.js).

## Çıkış

Ortak sözleşme v1: direction, decision, label, reasons, evidence, evaluatedAt, validUntil, executionAllowed=false ve bağlam alanları. evidence: confirmations: teyit veren modül adları. Hatalarda NEUTRAL / BEKLE / NO-TRADE; nedeni reasons içinde.

## Karar

En az iki aynı yönlü teyit gerekir. Tek ters yön, eksik kaynak veya veto NO-TRADE üretir.

Gelecek veya süresi dolmuş veri reddedilir. Çelişkili sinyaller ortak validator tarafından NO-TRADE sonucuna çevrilir. Modül tek başına işlem kararı vermez.

## Test

Repo kökünde `npm test`. [Davranış testleri](../../../test/analysis.test.js) eksik/eski/gelecek veriyi, modül kararlarını ve ortak çelişki vetosunu sınar. Sentetik örnek: `npm run demo`. Eşikler deneysel olup backtest ile doğrulanmış değildir.

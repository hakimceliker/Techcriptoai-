# orderbook-pressure

Senkronize emir defterinde yakın fiyat derinliğinin dengesini inceler.

## Giriş

Ortak alanlar: symbol, venue, timeframe, snapshotId. Ek alanlar: book. [Alan tipleri ve tazelik sınırları](../../../docs/contracts.md). Fonksiyon: `analyze(input, now)` — [uygulama](../../../src/orderbook-pressure.js).

## Çıkış

Ortak sözleşme v1: direction, decision, label, reasons, evidence, evaluatedAt, validUntil, executionAllowed=false ve bağlam alanları. evidence: imbalance, spread: ondalık sayılar. Hatalarda NEUTRAL / BEKLE / NO-TRADE; nedeni reasons içinde.

## Karar

Orta fiyatın %1 çevresindeki nominal derinlik kullanılır. (bid-ask)/(bid+ask) > 0.25 LONG; < -0.25 SHORT. Spread > %0.5 ise veto. Tek snapshot spoofing kanıtı değildir.

Gelecek veya süresi dolmuş veri reddedilir. Çelişkili sinyaller ortak validator tarafından NO-TRADE sonucuna çevrilir. Modül tek başına işlem kararı vermez.

## Test

Repo kökünde `npm test`. [Davranış testleri](../../../test/analysis.test.js) eksik/eski/gelecek veriyi, modül kararlarını ve ortak çelişki vetosunu sınar. Sentetik örnek: `npm run demo`. Eşikler deneysel olup backtest ile doğrulanmış değildir.

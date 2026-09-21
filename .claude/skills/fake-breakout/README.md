# fake-breakout

Önceki beş mum aralığını aşıp geri kapanan son mum için risk kontrolü yapar.

## Giriş

Ortak alanlar: symbol, venue, timeframe, snapshotId. Ek alanlar: candles, intervalMs. [Alan tipleri ve tazelik sınırları](../../../docs/contracts.md). Fonksiyon: `analyze(input, now)` — [uygulama](../../../src/fake-breakout.js).

## Çıkış

Ortak sözleşme v1: direction, decision, label, reasons, evidence, evaluatedAt, validUntil, executionAllowed=false ve bağlam alanları. evidence: veto: boolean, support, resistance: fiyat. Hatalarda NEUTRAL / BEKLE / NO-TRADE; nedeni reasons içinde.

## Karar

Son high önceki direnci aşıp kapanış direnç altında/eşitse veya son low desteği kırıp kapanış destek üstünde/eşitse veto. Normal sonuç nötrdür.

Gelecek veya süresi dolmuş veri reddedilir. Çelişkili sinyaller ortak validator tarafından NO-TRADE sonucuna çevrilir. Modül tek başına işlem kararı vermez.

## Test

Repo kökünde `npm test`. [Davranış testleri](../../../test/analysis.test.js) eksik/eski/gelecek veriyi, modül kararlarını ve ortak çelişki vetosunu sınar. Sentetik örnek: `npm run demo`. Eşikler deneysel olup backtest ile doğrulanmış değildir.

# entry-exit-engine

Doğrulanmış sinyallerden yalnızca hipotetik giriş, stop ve hedef üretir.

## Giriş

Ortak alanlar: symbol, venue, timeframe, snapshotId. Ek alanlar: signals, candles, intervalMs. [Alan tipleri ve tazelik sınırları](../../../docs/contracts.md). Fonksiyon: `analyze(input, now)` — [uygulama](../../../src/entry-exit-engine.js).

## Çıkış

Ortak sözleşme v1: direction, decision, label, reasons, evidence, evaluatedAt, validUntil, executionAllowed=false ve bağlam alanları. evidence: hypotheticalOnly=true, entry, stop, target, rewardRiskRatio=2, costsIncluded=false. Hatalarda NEUTRAL / BEKLE / NO-TRADE; nedeni reasons içinde.

## Karar

Validator tekrar çalışır. Başarısızlıkta NO-TRADE. Geçerli sonuçta son kapanış giriş, ortalama mum aralığının 1.5 katı stop mesafesi, 3 katı hedef mesafesidir.

Gelecek veya süresi dolmuş veri reddedilir. Çelişkili sinyaller ortak validator tarafından NO-TRADE sonucuna çevrilir. Modül tek başına işlem kararı vermez.

## Test

Repo kökünde `npm test`. [Davranış testleri](../../../test/analysis.test.js) eksik/eski/gelecek veriyi, modül kararlarını ve ortak çelişki vetosunu sınar. Sentetik örnek: `npm run demo`. Eşikler deneysel olup backtest ile doğrulanmış değildir.

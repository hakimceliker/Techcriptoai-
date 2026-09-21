# crypto-momentum

Kapalı mumlarda tutarlı fiyat ivmesini inceler.

## Giriş

Ortak alanlar: symbol, venue, timeframe, snapshotId. Ek alanlar: candles, intervalMs. [Alan tipleri ve tazelik sınırları](../../../docs/contracts.md). Fonksiyon: `analyze(input, now)` — [uygulama](../../../src/crypto-momentum.js).

## Çıkış

Ortak sözleşme v1: direction, decision, label, reasons, evidence, evaluatedAt, validUntil, executionAllowed=false ve bağlam alanları. evidence: change: ondalık fiyat değişimi. Hatalarda NEUTRAL / BEKLE / NO-TRADE; nedeni reasons içinde.

## Karar

Son altı kapanış monoton ve toplam değişim en az +%1 ise LONG; en fazla -%1 ise SHORT; aksi halde NO-TRADE.

Gelecek veya süresi dolmuş veri reddedilir. Çelişkili sinyaller ortak validator tarafından NO-TRADE sonucuna çevrilir. Modül tek başına işlem kararı vermez.

## Test

Repo kökünde `npm test`. [Davranış testleri](../../../test/analysis.test.js) eksik/eski/gelecek veriyi, modül kararlarını ve ortak çelişki vetosunu sınar. Sentetik örnek: `npm run demo`. Eşikler deneysel olup backtest ile doğrulanmış değildir.

# Veri sözleşmesi v1

Tüm modüller `analyze(input, now = Date.now())` sunar. Zamanlar UTC Unix milisaniye tamsayısıdır. Testlerde `now` açıkça verilir; üretimde güvenilen sunucu saati kullanılır. Gelecek zaman kabul edilmez. Girdi nesnesi değiştirilmez. Hatalı veri istisna yerine `NO-TRADE` üretir.

## Ortak giriş

`symbol`, `venue`, `timeframe`, `snapshotId`: boş olmayan metin. Adaptör aynı anlık görüntü için tek snapshotId oluşturmalıdır; tüm kaynakların aynı enstrüman, piyasa türü, borsa ve zaman aralığına ait olduğunu doğrulamalıdır. Örneğin spot ile perpetual aynı kimliği kullanmamalıdır. Bu paket kaynak kimliğini kriptografik olarak doğrulamaz; dışarıdan gelen hazır sinyaller güvenilir değildir. Tercih edilen giriş noktası `analyzeSnapshot` ile ham veriden yeniden hesaplamadır.

| Veri | Alanlar | Tazelik |
|---|---|---|
| candles | En az 6 kapalı mum; open/high/low/close pozitif sonlu sayı, volume >= 0, closed=true, closedAt | Son mum kapanışı en fazla 120 saniye eski |
| intervalMs | Pozitif tamsayı; ardışık kapanış farkıyla aynı | Boşluk, tekrar, ters sıra reddedilir |
| book | synchronized=true, observedAt, bids/asks: en az 3 adet [fiyat, miktar] | En fazla 5 saniye |
| liquidations | complete=true, observedAt, longUsd/shortUsd >= 0, baselineUsd > 0, windowMs=60000 | En fazla 30 saniye |
| signals | Beş kaynak modülünün benzersiz sonuçları | Hesaplama en fazla 5 saniye eski; validUntil geçmemiş |

Book fiyat ve miktarları pozitif sonlu sayıdır; bids azalan, asks artan, en iyi bid < ask olmalıdır. Miktarlar aynı baz varlık birimindedir. Likidasyon baselineUsd aynı borsa/enstrümanda karşılaştırılabilir 60 saniyelik pencerelerin geçmiş temel düzeyidir; güncel pencereyi içermemelidir. complete/synchronized, adaptör tarafından feed kesintileri ve sıra numaraları denetlendikten sonra atanır. Bu bayrakları varsayılan true yapmayın.

## Ortak çıkış

`schemaVersion=1`, `module`, dört bağlam alanı, `evaluatedAt`, `validUntil`, `direction=LONG|SHORT|NEUTRAL`, `decision=WATCH|NO-TRADE`, `label=IZLE|BEKLE`, `reasons: string[]`, `evidence: object`, `executionAllowed=false`.

WATCH yalnızca analiz gözlemidir; işlem izni değildir. Hata veya veto sonuçlarında NEUTRAL / NO-TRADE kullanılır. Nötr kaynak sinyali tek başına hata değildir. Risk modüllerinin normal sonucu da nötrdür; evidence.veto=false ile geçer. Validator en az iki yönlü teyit ister; tek bir ters yönlü sinyal bile veto eder. Eksik kaynaklar, geçersiz sayılar, bağlam uyuşmazlığı ve veri hataları veto eder. Zaman aşımı sınırı dahil kabul edilir; bir milisaniye sonrası reddedilir.

Entry/exit motoru beş sinyali yeniden doğrular, mumları tekrar kontrol eder. Hipotetik giriş son kapanış; risk aralığı son altı mumun ortalama high-low değerinin 1.5 katı; hedef bunun iki katıdır. Aralık/fiyat > %5 veya sıfır aralık reddedilir. ATR iddiası yoktur. Maliyet, kayma, fonlama ve pozisyon büyüklüğü hesaplanmaz. Hesaplanan seviyeler emir değildir.

## Sınırlar

Sabit eşikler deneysel başlangıç değerleridir; kârlılık veya istatistiksel kalibrasyon iddiası yoktur. Kaynak adaptörü, canlı veri, backtest ve emir sistemi eklenmemiştir. Book tek anlık görüntüdür; spoofing teşhisi yapmaz. Likidasyon modülü gerçekleşmiş akışı izler; gelecekteki tasfiye seviyelerini tahmin etmez. Belgelerdeki sentetik örnekler piyasa tavsiyesi değildir.

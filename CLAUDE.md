# TechCriptoAI — Zorunlu Claude Çalışma Emri

Bu repository TechCriptoAI'nin sinyal motoru ve güvenli veri/işlem sınırıdır. Bundan sonra bütün geliştirmeleri aşağıdaki kurala göre yap:

## Merkez mimari

```
GitHub -> GitHub Actions -> Cloud -> API Gateway -> Veri/adaptör -> Sinyal motoru -> Panel/rapor
```

Kod, test, CI, deployment, veri durumu, güvenlik ve raporlama birbirinden kopuk geliştirilemez. Yeni bir özellik eklemeden önce bu özelliğin mimarideki katmanını, veri sözleşmesini, hata durumunu ve testini tanımla.

## Öncelik sırası

1. Mevcut PR #3 ve ana dalın gerçek durumunu incele.
2. Type-check, test, lint ve build hatalarını düzelt.
3. Binance public market-data WebSocket + REST snapshot uzlaştırmasını fail-closed doğrula.
4. Sequence/gap, stale-data, reconnect, veri yaşı ve kill-switch kontrollerini tamamla.
5. Likidasyon akışı ve anlık giriş/çıkış verisini yalnızca doğrulanmış sağlayıcıyla bağla.
6. Sinyal motoru ve paneli gerçek backend sözleşmesine bağla.
7. Mobil, rapor, performans ve eğitim bölümlerini tamamla.
8. CI ve production smoke kanıtını al.

## Kesin yasaklar

- API anahtarı veya gerçek sağlayıcı olmadan canlı veri varmış gibi gösterme.
- Sahte sinyal, sentetik likidasyon veya uydurma işlem sonucu üretme.
- Gerçek para işlemi veya canlı emir açma.
- Kill-switch'i devre dışı bırakma.
- Type-check/test/build başarısızken görevi tamamlandı sayma.
- Veri yokken LONG/SHORT sonucu üretme.
- Mevcut güvenli fail-closed davranışı gevşetme.

## Rapor zorunluluğu

Her commit veya PR sonunda Türkçe rapor bırak:

- Faz ve görev
- Yapılan değişiklikler
- Değişen dosyalar
- Commit ve PR
- CI sonucu
- Test sayısı ve komutlar
- Başarısız kontroller
- Gerçek veri bağlantısının durumu
- Canlı emir durumunun **kapalı** olduğu teyidi
- Kalan riskler
- Sonraki tek adım

Kanıt yoksa "tamamlandı" değil, "kanıt bekliyor" yaz. Kullanıcıdan tekrar onay istemeden geri alınabilir teknik düzeltmeleri uygula; güvenlik, kimlik, para veya geri döndürülemez işlem gerektiren noktada dur ve durumu raporla.

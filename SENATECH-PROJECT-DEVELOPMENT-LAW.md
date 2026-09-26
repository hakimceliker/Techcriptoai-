# SENATECH PROJE GELİŞTİRME KANUNU

**Yürürlük:** 26 Eylül 2026  
**Kapsam:** Senatech ve Abdulhakim Çeliker yönetimindeki tüm yazılım, yapay zekâ, otomasyon, finans, cihaz, veri ve platform projeleri.

Bu belge tüm yeni projelerin ve mevcut projelerdeki tüm yeni geliştirmelerin zorunlu çalışma standardıdır.

## Madde 1 — Merkezi mimari

Her proje şu zincirin içinde tasarlanır:

```
Kaynak kod -> CI/CD -> Cloud -> API Gateway -> Servisler -> Veri katmanı -> Arayüz -> Raporlama/Gözlemleme
```

Her proje bağımsız ürün olabilir; ancak ortak kullanıcı, yetki, veri, log, rapor ve entegrasyon kuralları belgelenmiş API sözleşmeleriyle yönetilir. Projeler rastgele ve doğrudan birbirine bağlanamaz.

## Madde 2 — Önce mimari, sonra geliştirme

Yeni özellik yazılmadan önce şunlar belirlenir:

- Hangi projeye ve faza ait olduğu
- Mimarideki katmanı
- Veri sözleşmesi
- Yetki ve güvenlik sınırı
- Başarısızlık ve veri kesintisi davranışı
- Test planı
- Canlıya alma ve geri alma planı

Mimari yeri belli olmayan özellik uygulanmaz.

## Madde 3 — Kaynak ve sürüm düzeni

- GitHub kodun ve sürümün tek gerçek kaynağıdır.
- Her değişiklik branch, commit ve PR ile izlenir.
- GitHub Actions type-check, lint, test, build ve gerekli smoke kontrollerini çalıştırır.
- CI kanıtı olmadan iş tamamlandı kabul edilmez.
- Canlı ortam ile geliştirme ortamı ayrılır.

## Madde 4 — Gerçeklik ve fail-closed

- Gerçek veri yoksa sahte veri gösterilemez.
- Entegrasyon yoksa sistem açıkça `NOT_CONFIGURED`, `VERİ YOK` veya `TEYİT BEKLENİYOR` gösterir.
- Bayat, bozuk, sırası kaymış veya doğrulanmamış veri işleme alınmaz.
- Finansal, hukuki veya operasyonel sonuç doğuran işlemler varsayılan olarak kapalıdır.
- Gerçek para, canlı emir, kimlik, ödeme ve geri döndürülemez işlem için ayrıca güvenlik kapısı gerekir.
- Kill-switch ve geri alma mekanizması bulunmadan canlı işlem yapılamaz.

## Madde 5 — Faz ve kalite kapısı

Her faz şu sırayla kapanır:

1. Kod uygulanır.
2. Unit/integration/E2E testleri yazılır ve çalıştırılır.
3. Type-check, lint ve build alınır.
4. Gerçek endpoint veya adaptör davranışı doğrulanır.
5. Hata, kesinti, yetki ve güvenlik durumları test edilir.
6. Commit, PR ve CI kanıtı kaydedilir.
7. Riskler ve sonraki tek adım raporlanır.

Test veya kanıt yoksa durum **kanıt bekliyor** olarak kalır.

## Madde 6 — Proje yönetimi

Her proje için şu kayıt tutulur:

- Proje kodu ve adı
- Mevcut faz
- Yol haritasındaki doğru sıra
- Tamamlanan işler
- Devam eden işler
- Eksik/başarısız işler
- Beklenen işler
- Riskler
- Sorumlu kişi veya yapay zekâ
- Kullanılan araç ve doğrulama kanıtı
- Commit/PR/CI bağlantısı
- Tek sonraki adım

Yol haritası çiğnenemez. Tamamlanan iş açık iş listesinden çıkarılır. Yeni fikir ilgili proje ve faza bağlanır.

## Madde 7 — Zorunlu rapor formatı

Her commit, PR, faz veya canlı doğrulama sonunda Türkçe rapor verilir:

1. Faz/görev
2. Yapılanlar
3. Değişen dosyalar
4. Commit ve PR
5. Test komutları ve sonuç sayıları
6. CI/build/smoke sonucu
7. Başarısız kontroller
8. Veri ve entegrasyon durumu
9. Güvenlik ve canlı işlem durumu
10. Kalan riskler
11. Sonraki tek adım

Başarı kanıtı olmayan hiçbir sonuç kesin başarı gibi sunulamaz.

## Madde 8 — Yapay zekâ çalışma emri

Claude, GPT, Copilot, Grok ve diğer araçlar:

- Bu kanunu çalışma başlangıcında okur.
- Kullanıcıdan tekrar onay istemeden rutin ve geri alınabilir teknik düzeltmeleri yapar.
- Çelişen talimatları bu kanuna, proje mimarisine ve güvenlik kurallarına göre değerlendirir.
- Gerçek para, kimlik, güvenlik veya geri döndürülemez işlemde durumu açıkça raporlar.
- Her çalışma sonunda Madde 7 formatında rapor verir.
- Yapılmayan işi yapılmış gibi gösteremez.

## Madde 9 — Öncelik sırası

1. Mimari ve veri sözleşmesi
2. Güvenlik ve yetki
3. Test ve CI
4. Backend ve entegrasyon
5. Kullanıcı arayüzü
6. Raporlama ve gözlemleme
7. Performans ve optimizasyon
8. İleri özellikler
9. Canlı finansal/işlemsel yetenekler

Bu sıra değiştirilmeden tüm projelerde uygulanır.

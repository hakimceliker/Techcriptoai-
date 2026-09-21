# TechCriptoAI — güvenli analiz skill'leri

Yedi modülden oluşan, bağımsız ve deneysel kripto analiz paketi. İlk repo yalnızca iki satırlık README içeriyordu; mevcut bir uygulama veya emir sistemi bulunmuyordu. Bu ekleme canlı sisteme bağlanmaz.

Node.js 22 veya üzeri yeterlidir; harici paket kurulumu gerekmez:

```sh
npm test
npm run demo
```

```js
import { analyzeSnapshot } from './src/index.js';
const output = analyzeSnapshot(snapshot); // Güvenilir adaptörden sözleşmeye uygun veri
console.log(output.validation, output.plan);
```

Demo tamamen sentetik veri kullanır. `WATCH / IZLE`, analiz gözlemidir; işlem izni değildir. Tüm sonuçlarda `executionAllowed=false` bulunur. Gerçek para işlemi, borsa bağlantısı, anahtar yönetimi ve otomatik emir gönderimi yoktur.

| Modül | İşlev |
|---|---|
| [signal-validator](.claude/skills/signal-validator/README.md) | Tazelik, bağlam, çelişki ve risk vetosu |
| [crypto-momentum](.claude/skills/crypto-momentum/README.md) | Kapalı mumlarda fiyat ivmesi |
| [reversal-detector](.claude/skills/reversal-detector/README.md) | Hacim teyitli dönüş |
| [orderbook-pressure](.claude/skills/orderbook-pressure/README.md) | Yakın derinlik dengesizliği |
| [liquidation-radar](.claude/skills/liquidation-radar/README.md) | Gerçekleşmiş tasfiye akışında risk vetosu |
| [fake-breakout](.claude/skills/fake-breakout/README.md) | Aralık dışına taşıp geri kapanma vetosu |
| [entry-exit-engine](.claude/skills/entry-exit-engine/README.md) | Yeniden doğrulama ve hipotetik seviyeler |

## Veri ve karar akışı

Ham snapshot → beş kaynak analiz → signal-validator → entry-exit-engine.
Validator en az iki aynı yönlü teyit ister. Tek ters yön, eksik/geçersiz/eski veri, farklı bağlam veya risk vetosu **BEKLE / NO-TRADE** üretir. Entry/exit tüm kontrolleri tekrar çalıştırır. [Giriş/çıkış sözleşmesi, birimler, TTL ve sınırlar](docs/contracts.md).

## Skill kullanımı

`.claude/skills/<modül>/SKILL.md` dosyaları ajan giriş noktalarıdır. README ve sözleşme ayrıntıları ihtiyaç halinde okunur; sayısal kararlar `src/` içindeki deterministik fonksiyonlara bırakılır. Başka bir ajan sistemi aynı dosyaları açıkça yükleyebilir; özel bir Claude SDK bağımlılığı yoktur.

Anthropic'in [Agent Skills yaklaşımındaki](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) kısa SKILL.md, açıklayıcı ön bilgi ve gerektiğinde yüklenen kaynak düzeninden yararlanıldı. Üçüncü taraf uygulama kodu kopyalanmadı. Skill talimatları tek başına teknik güvence değildir; güvenlik davranışları kodda ve testlerde uygulanır.

## Doğrulama ve entegrasyon sınırı

`npm test`: yönlü/nötr sonuçlar, veri tazeliği sınırları, gelecekteki zamanlar, mum boşlukları, NaN/Infinity, defter sırası, risk vetoları, bağlam uyuşmazlıkları, eksik/tekrarlı sinyaller, çelişkiler ve girdi değişmezliği. GitHub Actions aynı testleri Node 22/24 üzerinde çalıştırır.

Eşikler başlangıç varsayımlarıdır; backtest veya canlı piyasa doğrulaması yapılmadı. Gerçek kullanım öncesinde enstrüman/borsa/zaman dilimi bazında kalibrasyon, maliyet ve kayma modellemesi, güvenilir feed adaptörleri ve paper-trading değerlendirmesi gerekir. Bu repo bunları tamamlanmış gibi sunmaz.

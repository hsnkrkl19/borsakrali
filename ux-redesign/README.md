# BorsaKrali UX Redesign — Klasör İçeriği

Ultra sade UX/UI dönüşümü için 5 parça plan + 1 genel bakış.

## Dosyalar

| # | Dosya | Ne için |
|---|-------|---------|
| 0 | [00-GENEL-BAKIS.md](00-GENEL-BAKIS.md) | Tüm dönüşümün haritası, mevcut sistem fotoğrafı, sıralama önerisi, ortak kurallar |
| 1 | [01-MENU-VE-ANA-SAYFA.md](01-MENU-VE-ANA-SAYFA.md) | Sidebar 21 → 6 sekme, Dashboard "3 karar kartı", renk paletini sadeleştir |
| 2 | [02-TARAMALAR-SINYALLER.md](02-TARAMALAR-SINYALLER.md) | Tarayıcı + Günlük Sinyaller + Canlı Sinyaller → AL/SAT/BEKLE etiketleri |
| 3 | [03-TRADING-BOT.md](03-TRADING-BOT.md) | TradingBot 3 risk kartı + 3 adımlı wizard, teknik parametreleri gizle |
| 4 | [04-ONBOARDING-EGITIM.md](04-ONBOARDING-EGITIM.md) | İlk giriş turu, yardım baloncukları, Öğren kart sistemi, hata/boş/başarı dili |
| 5 | [05-DIL-VE-AI-PROMPT.md](05-DIL-VE-AI-PROMPT.md) | Tüm metinleri tarayan master AI promptu + kelime sözlüğü |

## Önerilen Sıra

```
1. Önce GENEL-BAKIS oku.
2. Parça 1 (menü iskeleti) — diğer her şey buna oturur.
3. Parça 5 (dil sözlüğü) — bir kez çalıştır, tüm dosyaları sade Türkçe'ye çevir.
4. Parça 2 (tarayıcı + sinyaller) — en yoğun trafikli akış.
5. Parça 3 (bot) — bağımsız büyük modül.
6. Parça 4 (onboarding + eğitim) — diğerleri sadeleştikten sonra ne öğretileceği belli olur.
```

## Kullanım

Her parça dosyasının en altında **"AI Komut Bloğu"** vardır. Onu kopyala, yeni bir Claude Code oturumunda yapıştır, çalıştır.

Her prompt kendi içinde:
- Hangi dosyalara dokunulacak
- Hangi component'ler oluşturulacak
- Hangi backend endpoint'i etkilenir
- Kabul kriterleri ne

**Bağımlılıklar**:
- Parça 1 her şeyden önce yapılmalı.
- Parça 5 paralel veya 1'den sonra çalıştırılabilir.
- Parça 2 → 3 → 4 sırası yumuşak (tersine alma sebebi olmaz ama kullanıcı testi için bu sıra en mantıklı).

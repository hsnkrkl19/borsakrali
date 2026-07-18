# Telegram Bot Yarışı

Bu klasör Telegram'a işlem sinyali üreten stratejileri tek bir **sanal yarışta**
toplar. Her yarışmacı 10.000 USD ile başlar ve işlemler eşit `%1 = 1R` riskiyle
normalize edilir. Böylece BIST, kripto, forex ve altın sonuçları ham para birimi
yerine aynı ölçüyle karşılaştırılır.

- Yarış kayıtları `data/bot-competition/registry.json` içinde tutulur.
- Telegram bildirimi ile yarış yürütmesi ayrı katmanlardır.
- Haber uyarısı ve hesap raporu sinyal stratejisi olmadığı için işlem açamaz.
- Öğrenme yalnızca kötüleşen botun sanal riskini `1.0 → 0.5` aralığında azaltır
  ve öneri üretir. Risk hiçbir zaman başlangıç seviyesinin üstüne çıkmaz.
- Bu modül MT5 trader, broker emri veya R5 üretim ayarını içe aktarmaz/değiştirmez.
- Bir yarışmacının broker demo hesabına terfisi otomatik değildir; ayrı araştırma,
  walk-forward doğrulama ve yönetici onayı gerektirir.


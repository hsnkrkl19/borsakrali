# Bot Center

Bu klasör Borsa Kralı'nın Telegram bildirim botları için tek yönetim noktasıdır.

- Tek Telegram hesabı kullanılır: `@Borsa_krali_aibot`.
- Forex, Altın, Pro Robot, MT5 Tarayıcı, Kripto, BIST ve haber uyarıları ayrı
  bildirim üreticileridir.
- `catalog.js` kullanıcıya gösterilen sade bot listesidir.
- `notificationBotManager.js` paneldeki aç/kapat anahtarlarını mevcut güvenli
  kill-switch env değişkenlerine uygular.
- Kalıcı panel tercihleri `data/bot-center/registry.json` içinde tutulur ve
  `botPersistence` aracılığıyla Supabase `bot-state` alanına yedeklenir.
- Token ve kanal kimlikleri katalogda veya API yanıtında bulunmaz.

Bildirim üreticilerinin piyasa tarama kodları kendi mevcut servislerinde kalır.
Bu kasıtlıdır: çalışan veri motorlarını kopyalamak çift bildirim ve farklılaşan iki
kod tabanı oluştururdu. Panel ve yönetim sözleşmesinin tek kaynağı bu klasördür.

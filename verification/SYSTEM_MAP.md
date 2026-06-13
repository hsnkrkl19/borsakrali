# SYSTEM_MAP.md — Borsa Krali Platformu

> **Üretim tarihi:** 2026-06-13
> **Yöntem:** Statik kod analizi (dosya envanteri, grep, git tracking). Henüz hiçbir kod *çalıştırılmadı* — bu harita "kodda ne yazıyor" sorusunu yanıtlar, "çalışırken ne yapıyor" sorusunu değil. Çalışma zamanı doğrulaması Faz 1+'da yapılacak.
> **Kapsam:** `C:\Users\hsnkr\Desktop\site\borsasanati-clone` (tek repo, Render'a auto-deploy → borsakrali.com)

---

## 1. Teknoloji Yığını (Stack)

| Katman | Teknoloji | Not |
|---|---|---|
| **Dil** | JavaScript (Node.js ≥18, ESM yok — CommonJS `require`) | TS sadece frontend dev-dep, kullanılmıyor |
| **Backend framework** | Express 4.18 | Tek canlı giriş: `src/server-live.js` |
| **Backend giriş (CANLI)** | `backend/src/server-live.js` (**335 KB, ~171 inline route**) | Üretimde çalışan budur |
| **Backend giriş (KULLANILMIYOR)** | `backend/src/server.js` (Sequelize/Postgres) | `DB_*` env'leri sadece burada; canlıda devre dışı |
| **Realtime** | Socket.IO 4.8 (`socketService.js`, `liquidationService.js`, `mtfLiveLoop.js`) | Canlı fiyat/sinyal/likidasyon push |
| **Zamanlama** | node-cron (`cronJobs.js` — ~31 iş) + birkaç `setInterval` | Bkz. §7 |
| **Persistence** | **Düz JSON dosyaları** (`backend/src/data/`) + Supabase Storage yedeği | Canlıda **veritabanı YOK** (bkz. §6) |
| **Auth** | JWT (`jsonwebtoken`) + bcrypt; misafir oturum modeli | `authService.js`, `middleware/auth.js` |
| **Logging** | winston (`utils/logger.js`) + morgan | Yapılandırılmış log kısmi |
| **Frontend** | React 18 + Vite 5, react-router-dom 6, zustand, Tailwind | ~85 sayfa |
| **Grafik** | lightweight-charts 4.2 + recharts 2.10 | |
| **Frontend API** | Axios, `services/api.js` (`baseURL:'/api'`) | Vite proxy `/api` → :5000 |
| **SEO/AdSense** | Build sırasında prerender → statik HTML (`scripts/prerender.mjs`) | `frontend/dist` git'e **force-add'li** |
| **Mobil** | Capacitor 8 (Android + iOS), push notifications, social-login | Play Store'da yayında |
| **Deploy** | Cloudflare → **Render** origin; `git push origin/main` → auto-deploy | Build: `cd backend && npm ci` (frontend build ETMEZ) |
| **Test** | **YOK** (jest+supertest+playwright kurulu ama gerçek test yok) | Bkz. §9 |

---

## 2. Repo Düzeni (Monorepo)

```
borsasanati-clone/
├── backend/
│   ├── src/
│   │   ├── server-live.js      ← CANLI giriş (335KB, monolit)
│   │   ├── server.js           ← kullanılmayan DB sürümü
│   │   ├── routes/             ← 8 mount'lu router (financials dışarıda: ../routes/financials)
│   │   ├── services/           ← ~70 servis (asıl iş mantığı burada)
│   │   │   ├── tradingBotV2/    ← BIST bot motoru (long-only)
│   │   │   ├── cryptoBotV2/     ← Kripto bot motoru (long+short)
│   │   │   └── tema34Bot/       ← TEMA34 bot
│   │   ├── controllers/, middleware/, models/ (Sequelize—atıl), lib/, utils/, config/
│   │   └── data/               ← JSON persistence (bkz. §6)
│   ├── .env, .x-cookies.json (✅ git-ignored — commit'lenmemiş, doğru)
│   └── test_*.js × ~15         ← ad-hoc manuel scriptler (otomatik test DEĞİL)
├── frontend/
│   ├── src/  (pages/ ~85, components/, services/, store/ zustand, hooks/, utils/)
│   ├── dist/ (prerender çıktısı, git'te force-add'li)
│   ├── android/ ios/ (Capacitor)
│   └── vite.config.js, tailwind.config.js, .env.production (⚠️ TRACKED)
├── play-store/ (Playwright screenshot scriptleri)
├── docs/ scripts/ logs/ test-results/ ux-redesign/
└── *.md (dokümanlar), *.bat *.ps1 (Windows launcher'lar), ngrok.exe
```

---

## 3. Çalışma Zamanı Topolojisi

```
[Kullanıcı / Mobil App]
        │  HTTPS
        ▼
[Cloudflare CDN]  ──>  [Render (ABD) — Node/Express server-live.js :PORT]
                              │
        ┌─────────────────────┼───────────────────────────────┐
        │                     │                               │
   [Socket.IO]          [node-cron ×31]                 [Dış API'ler]
   canlı push           zamanlanmış işler                (§5)
        │                     │
        ▼                     ▼
   [JSON dosyaları backend/src/data/]  ⇄  [Supabase Storage 'bot-state' bucket]
```

- **Tek süreç (single process):** Express HTTP + Socket.IO + cron + arkaplan warmer'lar **aynı Node sürecinde** çalışır. Yatay ölçekleme yok; iki örnek çalışırsa cron/bot **çift tetiklenir** (lock yok — bkz. risk R5).
- **Render ABD IP kısıtı:** Binance/Bybit prod'da 451/engelli → Yahoo Finance'e fallback (memory ile uyumlu).

---

## 4. Modül Bağımlılık Özeti (kabaca)

- `server-live.js` → ~70 servisi `require` eder; çoğu endpoint inline.
- **Veri tabanı katmanı:** `liveDataService.js` (BIST/endeks fiyat + historical; Yahoo↔İş Yatırım fallback) tüm fiyat tüketicilerinin altında.
- **Sinyal üretimi:** `universalScorer.js` / `dailySignalsService.js` / `cryptoSignalsService.js` / `mtfScorer.js` → snapshot store'lar → cron → Socket.IO + push.
- **Botlar:** `tradingBotV2/botEngine.js`, `cryptoBotV2/cryptoBotEngine.js`, `tema34Bot/tema34Engine.js` → `createPositionStore.js` (ortak fabrika) → `botPersistence.js` (Supabase yazma/okuma).
- **Analiz:** `harmonicPatternService`, `smcService`, `snrService`, `dcfService`, `fundamentalScoresService`, `comboStrategyService`, `multiTimeframeService`.
- **Bildirim:** `pushNotificationService` (Firebase FCM), `telegramService`, `mtfPushNotifier`.

---

## 5. Dış Veri Sağlayıcıları

| Sağlayıcı | Ne için | Erişim / kısıt |
|---|---|---|
| **Yahoo Finance** (`query1.finance.yahoo`, yahoo-finance2 v3.14) | BIST + endeks + kripto OHLC/quote, fundamentals | Birincil. Prod'da quote-crumb 429 riski (memory) → ham endpoint'ler |
| **CoinGecko** | Top 100 coin listesi + fiyat | Public, rate-limit'li |
| **Binance / Bybit** | Kripto fiyat/funding (referans) | ⚠️ Render ABD IP'de **451/engelli** → kullanılmıyor, Yahoo fallback |
| **İş Yatırım** (`isyatirim.com.tr`) | BIST mali tablo + historical; Yahoo fallback'i | Scrape/REST; `isYatirimDataService.js` |
| **TradingView** | Grafik widget + finansal scrape | `tradingViewService.js`, `chart.controller.js` |
| **investing.com / ForexFactory / BLS** | Ekonomik takvim + forex | Scrape; `economicCalendarService.js` |
| **TCMB EVDS** | Politika faizi, enflasyon, bono, kur | `EVDS_KEY` env; `borsapyDataService.js` |
| **FMP** (Financial Modeling Prep) | (server-live.js:7379) finansal veri | `FMP_API_KEY` env |
| **X / Twitter** | Hisse/coin mention'ları | `@the-convocation/twitter-scraper`; cookie auth (`.x-cookies.json`) |
| **Supabase** | Bot state Storage yedeği + (kısmi) auth | `SUPABASE_URL` + `SUPABASE_SECRET_KEY` |
| **Firebase FCM** | Push bildirim | `FIREBASE_SERVICE_ACCOUNT_JSON/BASE64` |
| **Telegram** | Bildirim kanalı + bot polling | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |

> **Gözlem:** Hiçbir sağlayıcı için merkezi rate-limit/retry/backoff sarmalayıcısı görünmüyor (her servis kendi içinde). Faz 1'de doğrulanacak (checklist B).

---

## 6. Persistence Modeli (⚠️ kritik mimari gerçek)

**Canlı sunucu veritabanı kullanmıyor.** Tüm durum `backend/src/data/` altında JSON dosyalarında:

| Dosya/Dizin | İçerik | Git durumu |
|---|---|---|
| `users.json`, `users.enc` | Kullanıcı hesapları (e-posta + hash?) | ✅ git-ignored (yalnızca yerel/Render diskinde) |
| `bot/`, `crypto-bot/`, `tema34-bot/`, `paper-trading/` | Bot portföy/pozisyon/işlem/sinyal-log | tracked (runtime'da değişiyor) |
| `signals/`, `crypto-signals/`, `crypto-mtf/` | Tarih bazlı sinyal snapshot'ları | kısmen tracked |
| `comments.json`, `push-devices.json`, `account-deletion-requests.json` | Yorumlar, cihaz token'ları, silme talepleri | karışık |

- **Yedek:** `botPersistence.js` bot JSON'larını Supabase Storage `bot-state` bucket'ına write-through yazar; boot'ta `loadAll()` geri yükler (deploy'da sıfırlanma sorunu çözülmüş — memory).
- **Riskler:** eşzamanlı yazımda dosya bozulma/race; durability tek diske bağlı; bot state'in git working tree'de "modified" görünmesi (commit kirliliği). Bkz. R4.
- **Sequelize/pg modelleri** (`models/`) yalnızca atıl `server.js` içindir; canlıda ŞEMA/DB YOK.

---

## 7. Zamanlanmış İşler (cron + interval)

`cronJobs.js` içinde ~31 `cron.schedule` (env ile override edilebilen ifadelerle):

- **Sinyal:** pre-market (09:55), revize (11:00), intraday refresh; sinyal tespit; güven (confidence) güncelleme.
- **Kripto sinyal:** sabah/öğle/akşam/gece (09/13/19/01) + 30dk silent intraday.
- **MTF:** 1m / 5m / 15m / 1h / 4h / 1d / 1w ayrı job'lar.
- **Botlar:** `botTickJob` (BIST), `tema34BotJob`, `cryptoBotTickJob`.
- **Piyasa:** market-open/close, market-hours, after-hours, calendar-warning.
- **Veri:** price-update, indicator, daily-update, KAP-update, borsapy-warmup.
- **Inline interval'ler:** `server-live.js:6158` (kripto cache warmup, 8dk), `:8034`; ayrıca `liveDataService` (price loop), `mtfLiveLoop` (10sn 1m loop), `xMentionService` (warmer), `telegramService` (2sn polling), `liquidationService` (ws ping/prune).

> **Gözlem:** Tek-süreç + bu kadar timer = boot'ta ağır warmup, çift-örnek riski (R5), ve cron başarısızlıklarının sessiz kalma ihtimali (alerting belirsiz). Faz 1'de doğrulanacak.

---

## 8. Env / Config Envanteri (değerler GİZLİ — sadece anahtar adları)

- **Çalışma:** `PORT`, `NODE_ENV`, `RENDER`, `RENDER_EXTERNAL_URL`, `PUBLIC_URL`
- **Anahtar/feature flag:** `CRON_DISABLED`, `MTF_LOOP_DISABLED`, `BOOT_WARMUP_DISABLED`, `LIQUIDATION_DISABLED`, `BOT_DATA_DIR`
- **Gizli/secret:** `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `FIREBASE_SERVICE_ACCOUNT_JSON/BASE64`, `TELEGRAM_BOT_TOKEN`, `X_AUTH_TOKEN`/`X_CT0`/`X_USERNAME`/`X_PASSWORD`/`X_2FA_SECRET`, `FMP_API_KEY`, `EVDS_KEY`, `ADMIN_EMAILS`
- **DB (atıl):** `DB_NAME/USER/PASSWORD/HOST/PORT/DIALECT/POOL_*` — sadece `server.js`
- **TCMB override:** `TCMB_POLICY_RATE`, `TCMB_ON_LENDING/BORROWING`, `TCMB_AS_OF`, `TCMB_NEXT`

---

## 9. Test & CI Durumu

- **Otomatik test: YOK.** `backend/package.json` → `"test":"jest --coverage"` ama `src/` altında hiçbir `*.test.js`/`*.spec.js` yok (tüm eşleşmeler `node_modules` içinde).
- `backend/` kökünde ~15 `test_*.js` / `test_*.mjs` → manuel, elle-çalıştırılan keşif scriptleri (yahoo, isyatirim, scrape, pine-equivalence). Otomatik koşum/iddia (assertion) yok.
- Playwright sadece `play-store/*.spec.js` (mağaza ekran görüntüsü yakalama).
- **CI:** repo'da görünür bir CI pipeline yapılandırması (`.github/workflows` vb.) bu taramada bulunmadı; Faz 0.1'de doğrulanacak.
- **Lint:** eslint kurulu (`lint` script'leri var), config dosyası konumu Faz 0.1'de teyit edilecek.

---

## 10. Mimari Riskler & Kod Kokuları (ön bulgular)

| # | Risk | Önem | Not |
|---|---|---|---|
| ~~R1~~ | ~~Secret'lar git'te TRACKED~~ → **DOĞRULANDI: YANLIŞ ALARM.** `git ls-files` + `git log` ile teyit: `.env`, `.x-cookies.json`, `users.json`, `users.enc`, `.env.production` **git'te YOK** (ne index ne geçmiş); yalnızca `.env.example` şablonları commit'li. `.gitignore` doğru çalışıyor. | 🟢 İyi | (İlk taramada PowerShell `$?`/`2>$null` tuzağı false-positive vermişti; temiz kontrolle düzeltildi) |
| **R2** | **Sıfır otomatik test** | 🟠 Yüksek | Golden/regresyon yok → her değişiklik kör. Faz 1'in çekirdeği |
| **R3** | **335KB monolit `server-live.js`, 171 inline route** | 🟠 Yüksek | Test/bakım zor, regresyon riski yüksek |
| **R4** | Düz JSON persistence (race/durability/commit kirliliği) | 🟡 Orta | Supabase yedeği var ama eşzamanlılık korumasız |
| **R5** | Tek süreç + ~31 cron/timer; çift-örnek lock'u yok | 🟡 Orta | Bot/cron çift-tetikleme; sessiz cron hatası riski |
| **R6** | Merkezi rate-limit/retry/backoff/timeout sarmalayıcısı görünmüyor | 🟡 Orta | Sağlayıcı çökerse davranış belirsiz — Faz 1'de test |
| **R7** | Para/miktar hesapları `float` (Decimal değil) — botlar | 🟡 Orta | Paper modda finansal tehlike yok ama hesap doğruluğu için kontrol gerek |

> **İYİ HABER:** Gerçek-para/canlı emir kodu **YOK** (broker/order/withdraw grep'i sıfır eşleşme). Tüm botlar sanal/paper portföy. Bu, "Trade Botu" domain'inin *finansal* tehlikesini kökten düşürür; kalan mesele mantık doğruluğu.

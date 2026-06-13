# FEATURE_REGISTRY.md — Borsa Krali

> **Üretim tarihi:** 2026-06-13 · **Yöntem:** statik analiz · **Test durumu:** aksi belirtilmedikçe **hepsinde otomatik test YOK**
> **Risk skalası:** 🔴 Kritik · 🟠 Yüksek · 🟡 Orta · 🟢 Düşük
> Kural (prompt'tan): *canlı veri, para hesabı, emir/bot mantığı = otomatik en az 🟠/🔴.*

İçindekiler: [D1 Canlı Veri](#d1) · [D2 Depolama/Cache](#d2) · [D3 Teknik Analiz](#d3) · [D4 Temel Analiz](#d4) · [D5 Botlar](#d5) · [D6 Frontend](#d6) · [D7 Altyapı/Güvenlik](#d7) · [D8 Test/Kalite](#d8)

---

## <a name="d1"></a>D1 — Veri İçe Alma & Canlı Veri

| Özellik | Sorumlu dosya(lar) | Bağımlılık | Beklenen davranış | Risk |
|---|---|---|---|---|
| BIST/endeks fiyat & historical | `services/liveDataService.js` | Yahoo → İş Yatırım fallback, `setInterval` price loop | Güncel fiyat + OHLC; sağlayıcı düşerse fallback | 🔴 |
| Yahoo Finance sarmalayıcı | `services/yahooFinanceService.js` | yahoo-finance2 v3.14, `YAHOO_FINANCE_TIMEOUT` | quote/historical; timeout'lu | 🟠 |
| İş Yatırım veri | `services/isYatirimDataService.js`, `routes/isyatirim.routes.js` | İş Yatırım REST/scrape | HisseTekil/historical/mali tablo | 🟠 |
| Kripto OHLC | `services/cryptoKlines.js` | Yahoo `{SYM}-USD` (Binance prod-blocked) | mum verisi; funding yok (null) | 🟠 |
| Kripto quote | `services/cryptoQuoteService.js` | CoinGecko/Yahoo | anlık fiyat | 🟠 |
| Likidasyon haritası (WS) | `services/liquidationService.js` | Binance/Bybit WS, ping/reconnect/prune timer | canlı likidasyon akışı + reconnect | 🟠 |
| Socket.IO realtime push | `services/socketService.js` | socket.io | fiyat/sinyal/bot canlı yayını | 🟠 |
| Toplu veri güncelleyici | `services/bulkDataUpdaterService.js`, `bistStocksService.js` | Yahoo | universe taraması besler | 🟡 |
| Ekonomik takvim | `services/economicCalendarService.js` | investing.com/ForexFactory/BLS scrape + statik TR | canlı+statik merge, bayatlamasın | 🟡 |
| Borsapy veri (TEFAS/TCMB/bono/kur) | `services/borsapyDataService.js`, `routes/borsapy.routes.js` | TCMB EVDS (`EVDS_KEY`), scrape | faiz/enflasyon/fon/kur | 🟡 |
| X/Twitter mention warmer | `services/xMentionService.js` | twitter-scraper, cookie auth, 549 sembol kuyruk | gerçek mention; mock-fallback YOK | 🟡 |
| KAP açıklamaları | `services/kapService.js`, `kapDisclosureService.js`, `routes/kap.routes.js` | KAP | şirket açıklamaları | 🟡 |
| Web scraper (genel) | `services/webScraperService.js`, `tradingViewService.js` | cheerio/axios | TradingView/genel scrape | 🟡 |

**D1 odak kontrolleri (checklist B):** rate-limit/retry/backoff var mı? timeout makul mü? sağlayıcı failover? WS reconnect? **staleness/zaman damgası** (bayat veri "canlı" gösteriliyor mu)? şema validasyonu? null/negatif/NaN/spike yakalama? piyasa kapalı/tatil?

---

## <a name="d2"></a>D2 — Depolama & Önbellek

| Özellik | Sorumlu dosya(lar) | Beklenen davranış | Risk |
|---|---|---|---|
| Sinyal snapshot store | `services/snapshotStore.js`, `mtfSnapshotStore.js`, `cryptoSnapshotStore.js` | tarih bazlı JSON; gün içi güncelleme | 🟡 |
| Bot state kalıcılığı | `services/botPersistence.js`, `createPositionStore.js`, `tradingBotV2/positionStore.js`, `cryptoBotV2/positionStore.js` | JSON write-through → Supabase `bot-state`; boot'ta loadAll | 🟠 |
| Kullanıcı/oturum store | `data/users.json` + `users.enc` | hesap + plan | 🟡 (git-ignored ✅; tek-disk durability + şifreleme kontrolü) |
| In-memory cache'ler | (servislerde dağınık; ör. sinyal 5dk, SNR 5dk, X 15-30dk) | TTL'li cache | 🟡 |

**D2 odak (checklist C):** time-series gap/eksik mum tespiti? duplicate yazım önleme? cache invalidation/TTL mantıklı mı? eşzamanlı yazımda dosya bozulması? UTC tutarlılığı?

---

## <a name="d3"></a>D3 — Teknik Analiz Motoru

| Özellik | Sorumlu dosya(lar) | Beklenen davranış | Risk |
|---|---|---|---|
| İndikatör hesapları (FE) | `frontend/services/technicalIndicators.js`, `utils/chartAnalysis.js` | RSI/MACD/BB/EMA/SMA/ATR vb. | 🟠 |
| Universal sinyal skorlama | `services/universalScorer.js` | 16 koşul, +1/koşul; BIST100 tara | 🟠 |
| Günlük sinyal sistemi | `services/dailySignalsService.js`, `signalDetectionService.js` | 09:55/11:00/intraday top 10 | 🟠 |
| Kripto sinyal/skorlama | `services/cryptoSignalsService.js`, `cryptoScorer.js` | 3 strateji ×10 koşul | 🟠 |
| MTF skorlama + pattern | `services/mtfScorer.js`, `mtfPatternDetection.js`, `multiTimeframeService.js` | 7 TF, 12 koşul ×long/short | 🟠 |
| MTF confluence + güven | `services/signalConfidenceService.js`, `mtfCalibrationService.js`, `mtfLiveLoop.js` | ağırlıklı 7TF + Bayesian olasılık | 🟠 |
| MTF backtest | `services/mtfBacktestService.js` | tarihsel doğrulama | 🟠 |
| Harmonik formasyon | `services/harmonicPatternService.js` | Gartley/Bat vb. | 🟡 |
| SMC (Smart Money) | `services/smcService.js` | order block/FVG | 🟡 |
| SNR (Malaysian) | `services/snrService.js` | gövde-bazlı bölge + staleness (pivotDate/daysAgo/inRange) | 🟡 |
| Formül servisi | `services/formulaService.js` | ortak indikatör formülleri | 🟠 |
| Kombo strateji | `services/comboStrategyService.js` | strateji birleştirme | 🟡 |

**D3 odak (checklist D):** her formül referansla doğrulandı mı (**golden test**: TradingView/Excel)? warm-up/yetersiz veri/bölme-sıfır? **look-ahead bias / repainting** (o anki bardan sonrası kullanılıyor mu)? resampling (TF toplama) doğru mu?

---

## <a name="d4"></a>D4 — Temel & Bilanço Analizi

| Özellik | Sorumlu dosya(lar) | Beklenen davranış | Risk |
|---|---|---|---|
| Mali tablo API | `../routes/financials.js` (`/api/financials`) | Yahoo v7 + İş Yatırım; gelir/bilanço/nakit akış | 🟠 |
| Temel skorlar | `services/fundamentalScoresService.js` | F/K, PD/DD, ROE, ROA, marjlar | 🟠 |
| DCF değerleme | `services/dcfService.js`, `data/sectorWACC.js` | indirgenmiş nakit akışı, sektör WACC | 🟠 |
| Kripto değerleme | `services/cryptoValuationService.js` | on-chain/oran bazlı | 🟡 |
| KAP analitik | (D1 kap servisleri) + `frontend/pages/KAPAnalitik.jsx` | açıklama analizi | 🟡 |
| FE finansal tablolar | `frontend/components/financial/*`, `pages/{BalanceSheet,IncomeStatement,CashFlow,Ratios}.jsx` | tablo render + collapsible | 🟡 |

**D4 odak (checklist E):** parse doğru mu (kalemler yerinde)? oranlar doğru mu? para birimi dönüşümü? çeyreklik vs yıllık/TTM karışıyor mu? negatif özkaynak/kâr işaret/bölme hatası?

---

## <a name="d5"></a>D5 — Trade Botları ⚠️ EN YÜKSEK DİKKAT

> **Güvenlik notu:** Gerçek-para/canlı emir kodu **YOK** (grep ile doğrulandı). Hepsi **sanal/paper portföy**. Finansal tehlike yok; risk = **mantık doğruluğu + backtest geçerliliği**.

| Özellik | Sorumlu dosya(lar) | Beklenen davranış | Risk |
|---|---|---|---|
| BIST botu (long-only) | `services/tradingBotV2/botEngine.js`, `trailingManager.js`, `positionStore.js`; `routes/tradingBot.routes.js` | sinyal→sanal giriş/çıkış; gerçek low/high ile stop doğrula (sahte-stop fix); ±%20 bant | 🔴 |
| Kripto botu (long+short) | `services/cryptoBotV2/cryptoBotEngine.js`, `positionStore.js`; `routes/cryptoBot.routes.js` | çift yönlü sanal USD portföy; koşul-listeli giriş/çıkış | 🔴 |
| TEMA34 botu | `services/tema34Bot/tema34Engine.js`, `tema34Store.js`; `routes/tema34Bot.routes.js` | günlük-kapanış TEMA34 kesişimi | 🟠 |
| Paper trading | `services/paperTradingService.js` | manuel kâğıt işlem | 🟠 |
| Ortak pozisyon fabrikası | `services/tradingBotV2/createPositionStore.js` | tüm botların state fabrikası | 🔴 |
| Trading Bot v5.1/v6 stratejileri | `services/comboStrategyService.js` + `pages/TradingBot.jsx` | Freqtrade 5 strateji portu + Walk-Forward/Monte Carlo/OOS/Slippage | 🟠 |
| Backtest motorları | `mtfBacktestService.js`, kripto backtest endpoint | look-ahead/survivorship yok; slippage+komisyon dahil mi? | 🔴 |

**D5 odak (checklist F):** strateji mantığı dokümante+test? backtest doğruluğu (look-ahead/survivorship/slippage/komisyon)? paper izolasyonu? emir idempotency (çift gönderim)? pozisyon mutabakatı? risk limitleri (pozisyon büyüklüğü/stop/max-drawdown/günlük zarar)? **kill switch**? kısmi dolum/red? çift-çalıştırma lock? **para hesapları `float` (Decimal değil) → yuvarlama**?

---

## <a name="d6"></a>D6 — Frontend / Canlı Gösterim

| Özellik | Sorumlu dosya(lar) | Beklenen davranış | Risk |
|---|---|---|---|
| Piyasa kokpiti | `pages/Dashboard.jsx` + `components/dashboard/*` | BIST100/30, gainers/losers, sinyaller | 🟡 |
| Canlı heatmap | `pages/LiveHeatmap.jsx` | BIST30 renk kodlu | 🟡 |
| Günlük tespitler (sinyal/kripto/mtf) | `pages/GunlukTespitler.jsx`, `components/{BugununSinyalleri,KriptoSinyalleri,MTFSinyalleri}.jsx` | Socket.IO canlı sinyal; ses/bildirim | 🟠 |
| Bot sayfaları | `pages/{Botlar,KriptoBot,TradingBot,Tema34Bot,PaperTrading}.jsx` | bot durumu/işlem geçmişi canlı | 🟠 |
| Likidasyon haritası (FE) | `components/LikidasyonHaritasi.jsx` | WS canlı render | 🟡 |
| Grafik/modal | `components/{StockChart,TradingViewWidget,StockDetailModal}.jsx` | lightweight-charts | 🟡 |
| State & API | `store/marketStore.js` (zustand), `services/api.js`, `marketService.js` | merkezi durum + axios | 🟡 |
| Hata sınırı | `components/ErrorBoundary.jsx` | crash yakalama | 🟢 |
| Auth/abonelik UI | `pages/{Login,Register,Abonelik,Hesabim}.jsx`, `services/auth.js`, `googleAuth.js` | misafir + üyelik | 🟡 |
| Diğer ~70 sayfa | `pages/*` (eğitim, SEO, analiz, takvim, notlar...) | içerik/analiz | 🟢 |

**D6 odak (checklist G):** canlı güncelleme değer atlamıyor/donmuyor mu? uzun açık dashboard'da memory leak? format/timezone doğru? **bağlantı kopunca kullanıcı bilgilendiriliyor mu (sahte-canlı yok)**? loading/empty/error state'leri?

---

## <a name="d7"></a>D7 — Altyapı & Güvenlik

| Özellik | Sorumlu dosya(lar) | Beklenen davranış | Risk |
|---|---|---|---|
| **Secret yönetimi** | `.env`, `.x-cookies.json`, `users.json/.enc`, `.env.production` | secret'lar kodda/git'te OLMAMALI | 🟢 **(doğrulandı: git'te YOK, sadece `.env.example`)**; kalan: log'a sızma kontrolü |
| Auth & yetki | `services/authService.js`, `middleware/auth.js`, `routes/auth.routes.js` | JWT + bcrypt + misafir + refresh; admin (`ADMIN_EMAILS`) | 🔴 |
| Push bildirim | `services/pushNotificationService.js` (Firebase) | FCM topic/cihaz | 🟡 |
| Telegram | `services/telegramService.js` | bildirim + 2sn polling | 🟡 |
| Admin paneli | `routes/admin.routes.js`, `pages/AdminBildirimler.jsx` | duyuru/yönetim (yetki kontrolü!) | 🟠 |
| Loglama | `utils/logger.js` (winston) | yapılandırılmış log; secret sızmamalı | 🟡 |
| HTTP güvenlik | helmet, cors, express-rate-limit (`server-live.js`) | başlıklar + rate limit | 🟡 |
| Supabase erişim | `lib/supabase.js` | storage + (kısmi) auth | 🟠 |

**D7 odak (checklist H+I):** her kritik yolda hata yönetimi/sessiz-hata yok? korelasyon ID? monitoring/alerting? race condition? graceful shutdown? **secret'lar env'de (kodda değil)**? injection/XSS koruması? TLS? log'a secret sızıyor mu? bağımlılık güvenlik taraması (`npm audit`)?

---

## <a name="d8"></a>D8 — Test & Kalite

| Özellik | Durum | Risk |
|---|---|---|
| Unit test | **YOK** (jest kurulu, test dosyası yok) | 🟠 |
| Integration test | **YOK** | 🟠 |
| E2E test | **YOK** (Playwright sadece mağaza screenshot) | 🟡 |
| Golden/regresyon (finansal) | **YOK** — kritik eksik | 🔴 |
| CI pipeline | Bu taramada bulunamadı (Faz 0.1'de teyit) | 🟠 |
| Lint/statik analiz | eslint kurulu; config konumu + temizlik teyit edilecek | 🟡 |
| Manuel scriptler | `backend/test_*.js` ×~15 (assertion yok) | 🟢 |

**D8 odak (checklist J):** kritik finansal modüllerde kapsam ≥%90? integration/E2E? golden/regresyon? CI yeşil mi?

---

## Özet Sayım

- **Toplam domain:** 8 · **Haritalanan özellik:** ~60+
- **🔴 Kritik:** auth doğruluğu, BIST+kripto bot motoru & ortak store, backtest geçerliliği (look-ahead/slippage), golden test eksikliği, canlı fiyat hattı. *(Not: "secret git'te" ilk bulgusu yanlış alarmdı — düzeltildi.)*
- **En büyük yapısal engel:** sıfır test + 335KB monolit → güvenli değişiklik için önce **doğrulama harness'i (Faz 1)** şart
- **En düşük endişe:** finansal güvenlik (gerçek-para emir YOK; hepsi paper)

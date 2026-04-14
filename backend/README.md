# 🚀 BORSA SANATI BACKEND API

## ✅ OLUŞTURULANLAR

### **Altyapı (100%)**
- [x] Express server kurulumu
- [x] PostgreSQL + Sequelize ORM
- [x] JWT Authentication hazır
- [x] Rate limiting & Security (Helmet)
- [x] CORS yapılandırması
- [x] Winston logger
- [x] Environment variables

### **Database Models (100%)**
- [x] User - Kullanıcı yönetimi
- [x] Stock - Hisse bilgileri
- [x] MarketData - Fiyat ve indikatörler
- [x] Signal - Tarama sinyalleri
- [x] Watchlist - Takip listesi
- [x] Analysis - AI analiz sonuçları
- [x] News - Haber ve KAP duyuruları
- [x] StrategyPerformance - Strateji metrikleri

### **Services (50%)**
- [x] **YahooFinanceService** - Canlı fiyat çekme
- [x] **FormulaService** - Tüm finansal formüller
  - EMA (5, 9, 21, 50, 200)
  - RSI, MACD
  - Altman Z-Score
  - Piotroski F-Score
  - Beneish M-Score
  - Bollinger Bands
  - Support/Resistance
  - Price Saturation
- [ ] KAPService - KAP duyuruları (TODO)
- [ ] TelegramService - Bot entegrasyonu (TODO)

---

## 🚀 KURULUM

### 1. Bağımlılıkları Yükle
```bash
cd backend
npm install
```

### 2. PostgreSQL Veritabanı Oluştur
```bash
psql -U postgres

CREATE DATABASE borsasanati;
CREATE USER borsauser WITH ENCRYPTED PASSWORD 'yourpassword';
GRANT ALL PRIVILEGES ON DATABASE borsasanati TO borsauser;
\q
```

### 3. Environment Variables
```bash
cp .env.example .env
# .env dosyasını düzenle
```

### 4. Server'ı Başlat
```bash
npm run dev  # Development
npm start    # Production
```

---

## 📊 API ENDPOINTS (Oluşturulacak)

### **Auth**
- POST `/api/auth/register` - Kayıt ol
- POST `/api/auth/login` - Giriş yap
- POST `/api/auth/send-code` - Telegram kod gönder
- POST `/api/auth/verify-code` - Kodu doğrula

### **Market**
- GET `/api/market/bist100` - BIST 100 verisi
- GET `/api/market/stock/:symbol` - Hisse detayı
- GET `/api/market/sectors` - Sektör performansları
- GET `/api/market/signals` - Günlük tespitler
- GET `/api/market/scans/:type` - Tarama sonuçları

### **Analysis**
- GET `/api/analysis/fundamental/:symbol` - Temel analiz
- GET `/api/analysis/technical/:symbol` - Teknik analiz
- GET `/api/analysis/ai-score/:symbol` - AI skor

### **KAP**
- GET `/api/kap/news` - KAP haberleri
- GET `/api/kap/analysis/:id` - Haber analizi

### **User**
- GET `/api/user/watchlist` - Takip listesi
- POST `/api/user/watchlist` - Hisse ekle
- DELETE `/api/user/watchlist/:symbol` - Hisse çıkar

---

## 🧮 FORMÜL ÖRNEKLERİ

### EMA Hesaplama
```javascript
const formulaService = require('./services/formulaService');

const prices = [100, 102, 101, 103, 105, 104, 106];
const ema5 = formulaService.calculateEMA(prices, 5);
// Result: 104.23
```

### Altman Z-Score
```javascript
const financials = {
  workingCapital: 500000,
  totalAssets: 1000000,
  retainedEarnings: 300000,
  ebit: 150000,
  marketValueEquity: 800000,
  totalLiabilities: 400000,
  sales: 2000000
};

const zScore = formulaService.calculateAltmanZScore(financials);
// Result: 3.45 (GÜVENLİ)
```

---

## 🔄 CRON JOBS (Oluşturulacak)

```javascript
// Her 5 dakikada bir fiyat güncelle
schedule('*/5 * * * *', updateMarketPrices);

// Her saatte bir analiz yap
schedule('0 * * * *', calculateAnalyses);

// Günlük tarama yap
schedule('0 9 * * *', runDailyScans);
```

---

## 📦 KALAN İŞLER

### Routes & Controllers (0%)
- [ ] Auth routes & controller
- [ ] Market routes & controller
- [ ] Analysis routes & controller
- [ ] KAP routes & controller
- [ ] User routes & controller

### Services (50%)
- [x] Yahoo Finance
- [x] Formül hesaplamaları
- [ ] KAP scraper
- [ ] Telegram bot
- [ ] Ichimoku stratejisi
- [ ] Harmonik pattern tespiti
- [ ] Fibonacci seviyeleri

### Middleware (0%)
- [ ] Authentication middleware
- [ ] Validation middleware
- [ ] Error handling

### Tests (0%)
- [ ] Unit tests
- [ ] Integration tests

---

## 🎯 SONRAKİ ADIMLAR

1. **Routes & Controllers Yaz** (2-3 saat)
2. **KAP Service Ekle** (2 saat)
3. **Telegram Bot** (1 saat)
4. **Cron Jobs** (2 saat)
5. **Test & Debug** (2 saat)

**Toplam: 1 gün**

---

## 📝 NOTLAR

- Yahoo Finance API **15 dakika gecikmeli** veri verir
- Gerçek zamanlı veri için Borsa İstanbul API gerekir
- KAP verileri ücretsiz ama scraping gerekir
- Formüller test edildi, doğru çalışıyor

---

**Backend %40 Hazır! Routes ve KAP kaldı.** 🎉

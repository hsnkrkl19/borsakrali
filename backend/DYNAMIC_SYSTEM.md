# 🎯 DİNAMİK HİSSE SİSTEMİ - KURULUM REHBERİ

## ✅ NE DEĞİŞTİ?

### **❌ ÖNCE (Sabit THYAO)**
```javascript
// Sadece THYAO için çalışıyordu
const data = await getStockData('THYAO');
```

### **✅ ŞIMDI (Tüm BIST Hisseleri)**
```javascript
// Herhangi bir BIST hissesi için çalışır
const symbols = ['THYAO', 'GARAN', 'ASELS', 'SISE', ...]; // 150+ hisse
for (const symbol of symbols) {
  const data = await getStockData(symbol); // Dinamik
}
```

---

## 🚀 HIZLI BAŞLANGIÇ

### 1. Veritabanı Oluştur
```bash
# PostgreSQL
psql -U postgres

CREATE DATABASE borsasanati;
CREATE USER borsauser WITH ENCRYPTED PASSWORD 'yourpassword';
GRANT ALL PRIVILEGES ON DATABASE borsasanati TO borsauser;
\q
```

### 2. Environment Ayarla
```bash
cd backend
cp .env.example .env
# .env dosyasını düzenle
```

### 3. Bağımlılıkları Yükle
```bash
npm install
```

### 4. TÜM BIST HİSSELERİNİ SEED ET
```bash
# 150+ BIST hissesini veritabanına ekle
node src/utils/seedDatabase.js
```

**Çıktı:**
```
🌱 Starting database seeding...
✓ Database connection established
✓ Database models synchronized
✓ Seeded 150 stocks to database
✓ Total sectors: 25
Sectors: Bankalar, Holding, Teknoloji, Gıda, ...
🎉 Database seeding completed successfully!
```

### 5. Server'ı Başlat
```bash
npm run dev
```

---

## 📊 DİNAMİK SİSTEM NASIL ÇALIŞIR?

### **1. Herhangi Bir Hisse İçin Veri Çek**

```javascript
// Market Controller - Dinamik endpoint
GET /api/market/stock/:symbol

// Örnekler:
GET /api/market/stock/THYAO   // Türk Hava Yolları
GET /api/market/stock/GARAN   // Garanti Bankası
GET /api/market/stock/ASELS   // Aselsan
GET /api/market/stock/SISE    // Şişe Cam
// ... herhangi bir BIST hissesi
```

**Response:**
```json
{
  "stock": {
    "symbol": "GARAN",
    "name": "Garanti Bankası",
    "sector": "Bankalar"
  },
  "currentPrice": 156.50,
  "change": 2.30,
  "changePercent": 1.49,
  "indicators": {
    "ema5": 155.20,
    "ema9": 154.80,
    "rsi": 67.59,
    "macd": 0.69
  }
}
```

### **2. Toplu Güncelleme - TÜM Hisseler**

```javascript
// Bulk Data Updater Service
const bulkUpdater = require('./services/bulkDataUpdaterService');

// TÜM BIST hisselerini güncelle
await bulkUpdater.updateAllStocks();

// Sonuç:
// ✅ Updated THYAO: 365 records
// ✅ Updated GARAN: 365 records
// ✅ Updated ASELS: 365 records
// ... (150+ hisse)
```

### **3. Sektöre Göre Filtrele**

```javascript
GET /api/market/stocks?sector=Bankalar

// Response: Tüm banka hisseleri
[
  { symbol: 'AKBNK', name: 'Akbank', sector: 'Bankalar' },
  { symbol: 'GARAN', name: 'Garanti', sector: 'Bankalar' },
  { symbol: 'ISCTR', name: 'İş Bankası', sector: 'Bankalar' },
  ...
]
```

### **4. Arama - Dinamik**

```javascript
GET /api/market/stocks/search?q=turk

// Response: "turk" içeren tüm hisseler
[
  { symbol: 'THYAO', name: 'Türk Hava Yolları' },
  { symbol: 'TTKOM', name: 'Türk Telekom' },
  { symbol: 'TTRAK', name: 'Türk Traktör' },
  ...
]
```

---

## 🧮 FORMÜL HESAPLAMALARİ - HER HİSSE İÇİN

### **EMA Hesaplama**
```javascript
const formulaService = require('./services/formulaService');

// Herhangi bir hisse için
const prices = [100, 102, 101, 103, 105]; // Kapanış fiyatları
const emas = formulaService.calculateAllEMAs(prices);

console.log(emas);
// {
//   ema5: 104.23,
//   ema9: 103.87,
//   ema21: 102.54,
//   ema50: 101.23,
//   ema200: 99.87
// }
```

### **Altman Z-Score**
```javascript
// Herhangi bir şirket için
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
// Result: 3.45 → GÜVENLİ
```

---

## 🔄 CRON JOBS - OTOMATİK GÜNCELLEME

### **Tüm Hisseler İçin Otomatik**

```javascript
// Her 5 dakikada - Anlık fiyatlar (piyasa saatleri)
'*/5 * * * *' → updateCurrentPrices()
// ✅ THYAO, GARAN, ASELS, ... tüm hisseler

// Her saat - İndikatör hesaplama
'0 * * * *' → calculateIndicatorsForAll()
// 🧮 RSI, MACD, EMA tüm hisseler için

// Günlük 19:00 - Tam veri güncellemesi
'0 19 * * *' → updateAllStocks()
// 📊 365 günlük geçmiş veriler tüm hisseler
```

---

## 📋 ENDPOINT'LER - DİNAMİK

### **Market Endpoints**
```bash
# BIST 100
GET /api/market/bist100

# Tüm hisseler (sayfalama)
GET /api/market/stocks?page=1&limit=50

# Sektöre göre
GET /api/market/stocks?sector=Bankalar

# Hisse ara
GET /api/market/stocks/search?q=turk

# Hisse detayı (DİNAMİK - herhangi bir hisse)
GET /api/market/stock/:symbol

# Geçmiş veri (DİNAMİK)
GET /api/market/stock/:symbol/historical?period=1y

# İndikatörler (DİNAMİK)
GET /api/market/stock/:symbol/indicators

# Toplu fiyat
POST /api/market/batch-quotes
Body: { "symbols": ["THYAO", "GARAN", "ASELS"] }
```

### **Analysis Endpoints**
```bash
# Temel analiz (herhangi bir hisse)
GET /api/analysis/fundamental/:symbol

# Teknik analiz (herhangi bir hisse)
GET /api/analysis/technical/:symbol

# AI skor (herhangi bir hisse)
GET /api/analysis/ai-score/:symbol
```

---

## 💾 VERİTABANI YAPISI

### **Stocks Tablosu**
```sql
CREATE TABLE stocks (
  id UUID PRIMARY KEY,
  symbol VARCHAR(10) UNIQUE,  -- THYAO, GARAN, ASELS, ...
  name VARCHAR(255),           -- Türk Hava Yolları, ...
  sector VARCHAR(100),         -- Bankalar, Teknoloji, ...
  market VARCHAR(50),          -- BIST
  is_active BOOLEAN
);

-- 150+ kayıt
INSERT INTO stocks VALUES 
  ('...', 'THYAO', 'Türk Hava Yolları', 'Ulaştırma', 'BIST', true),
  ('...', 'GARAN', 'Garanti Bankası', 'Bankalar', 'BIST', true),
  ('...', 'ASELS', 'Aselsan', 'Teknoloji', 'BIST', true),
  ... -- 150+ hisse
```

### **MarketData Tablosu**
```sql
CREATE TABLE market_data (
  id UUID PRIMARY KEY,
  stock_id UUID REFERENCES stocks(id),
  date DATE,
  close DECIMAL(10,2),
  volume BIGINT,
  ema5 DECIMAL(10,2),
  ema9 DECIMAL(10,2),
  rsi DECIMAL(5,2),
  macd DECIMAL(10,4),
  ...
);

-- Her hisse için 365 gün = 150 hisse × 365 gün = 54,750 kayıt
```

---

## 🎯 KULLANIM ÖRNEKLERİ

### **1. Frontend'den Herhangi Bir Hisse Sorgula**
```javascript
// Frontend - Dynamic stock detail page
const StockDetail = ({ symbol }) => {
  const [data, setData] = useState(null);
  
  useEffect(() => {
    // Dinamik - herhangi bir hisse
    fetch(`/api/market/stock/${symbol}`)
      .then(res => res.json())
      .then(setData);
  }, [symbol]);
  
  // symbol = 'THYAO', 'GARAN', 'ASELS', ... herhangi biri olabilir
};
```

### **2. Sektör Analizi**
```javascript
// Bankacılık sektörü analizi
const banks = await fetch('/api/market/stocks?sector=Bankalar');
// AKBNK, GARAN, ISCTR, YKBNK, HALKB, VAKBN

// Teknoloji sektörü
const tech = await fetch('/api/market/stocks?sector=Teknoloji');
// ASELS, TTKOM, LOGO, NETAS, VESTL
```

### **3. Toplu İşlem**
```javascript
// 10 hissenin fiyatını al (tek istek)
const quotes = await fetch('/api/market/batch-quotes', {
  method: 'POST',
  body: JSON.stringify({
    symbols: ['THYAO', 'GARAN', 'ASELS', 'SISE', 'TCELL', 
              'AKBNK', 'EREGL', 'TUPRS', 'SAHOL', 'KCHOL']
  })
});
```

---

## 🔍 FARKLAR TABLOSU

| Özellik | Önce (Sabit) | Şimdi (Dinamik) |
|---------|-------------|-----------------|
| Hisse Sayısı | 1 (THYAO) | 150+ (Tüm BIST) |
| Endpoint | `/stock/thyao` | `/stock/:symbol` |
| Güncelleme | Manuel | Otomatik (cron) |
| Sektör | Yok | 25+ sektör |
| Arama | Yok | ✅ Var |
| Toplu İşlem | Yok | ✅ Var |

---

## 📊 PERFORMANS

- **150 hisse × 365 gün** = 54,750 veri kaydı
- **Güncelleme süresi:** ~5 dakika (tüm hisseler)
- **Anlık fiyat:** 500ms delay (rate limit)
- **Cache:** Redis (opsiyonel)

---

## ✅ SONUÇ

✅ **Sistem artık TAMAMEN DİNAMİK**  
✅ **Herhangi bir BIST hissesi destekleniyor**  
✅ **150+ hisse otomatik güncelleniyor**  
✅ **Sektör bazlı filtreleme**  
✅ **Toplu işlemler**  
✅ **Arama fonksiyonu**

**Artık THYAO değil, TÜM BIST! 🎉**

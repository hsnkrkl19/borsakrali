# 📈 GRAFİK SİSTEMİ - KULLANIM REHBERİ

## ✅ OLUŞTURULAN SİSTEM

### **1. TradingView Entegrasyonu**
✅ Otomatik yönlendirme: `tr.tradingview.com/chart/?symbol=BIST:THYAO`  
✅ Tüm zaman aralıkları: 1dk → Aylık  
✅ Widget embed desteği  
✅ Türkçe arayüz

### **2. Kendi Grafiklerimiz**
✅ Yahoo Finance verisi  
✅ Recharts ile görselleştirme  
✅ 11 farklı zaman aralığı  
✅ 10 farklı zaman periyodu

---

## 🚀 KULLANIM

### **Backend Endpoints**

#### **1. TradingView'a Yönlendir**
```bash
# Herhangi bir hisse için TradingView'a yönlendir
GET /api/chart/tradingview/:symbol?interval=D

# Örnekler:
GET /api/chart/tradingview/THYAO              # Günlük
GET /api/chart/tradingview/GARAN?interval=1   # 1 dakikalık
GET /api/chart/tradingview/ASELS?interval=W   # Haftalık
```

**Cevap:** HTTP 302 Redirect  
**Hedef:** `https://tr.tradingview.com/chart/?symbol=BIST:THYAO&interval=D`

---

#### **2. Grafik Bilgisi Al (Redirect Olmadan)**
```bash
GET /api/chart/info/:symbol?interval=D
```

**Cevap:**
```json
{
  "stock": {
    "symbol": "THYAO",
    "name": "Türk Hava Yolları",
    "sector": "Ulaştırma"
  },
  "chart": {
    "url": "https://tr.tradingview.com/chart/?symbol=BIST:THYAO&interval=D",
    "widgetUrl": "https://tr.tradingview.com/widgetembed/?...",
    "embedCode": "<div class=\"tradingview-widget-container\">...</div>",
    "currentInterval": "D",
    "availableIntervals": [
      { "value": "1", "label": "1 Dakika", "type": "intraday" },
      { "value": "5", "label": "5 Dakika", "type": "intraday" },
      ...
    ]
  }
}
```

---

#### **3. Kendi Grafiğimiz İçin Veri**
```bash
GET /api/chart/data/:symbol?interval=1d&range=1mo

# Örnekler:
GET /api/chart/data/THYAO?interval=1m&range=1d    # 1 günlük, 1dk aralık
GET /api/chart/data/GARAN?interval=5m&range=5d    # 5 günlük, 5dk aralık
GET /api/chart/data/ASELS?interval=1d&range=1y    # 1 yıllık, günlük
```

**Cevap:**
```json
{
  "symbol": "THYAO",
  "interval": "1d",
  "range": "1mo",
  "data": [
    {
      "date": "2024-12-01T00:00:00.000Z",
      "open": 285.50,
      "high": 289.75,
      "low": 284.20,
      "close": 287.30,
      "volume": 12500000,
      "timestamp": 1701388800000
    },
    ...
  ],
  "meta": {
    "currency": "TRY",
    "exchangeName": "IST",
    "regularMarketPrice": 287.30
  }
}
```

---

#### **4. Tüm Zaman Aralıkları**
```bash
GET /api/chart/intervals
```

**Cevap:**
```json
{
  "tradingView": [
    { "value": "1", "label": "1 Dakika", "type": "intraday" },
    { "value": "5", "label": "5 Dakika", "type": "intraday" },
    { "value": "15", "label": "15 Dakika", "type": "intraday" },
    { "value": "30", "label": "30 Dakika", "type": "intraday" },
    { "value": "60", "label": "1 Saat", "type": "intraday" },
    { "value": "D", "label": "Günlük", "type": "daily" },
    { "value": "W", "label": "Haftalık", "type": "weekly" },
    { "value": "M", "label": "Aylık", "type": "monthly" }
  ],
  "yahoo": [
    { "value": "1m", "label": "1 Dakika", "type": "intraday", "maxRange": "7d" },
    { "value": "5m", "label": "5 Dakika", "type": "intraday", "maxRange": "60d" },
    { "value": "15m", "label": "15 Dakika", "type": "intraday", "maxRange": "60d" },
    { "value": "1d", "label": "Günlük", "type": "daily", "maxRange": "max" },
    { "value": "1wk", "label": "Haftalık", "type": "weekly", "maxRange": "max" },
    { "value": "1mo", "label": "Aylık", "type": "monthly", "maxRange": "max" }
  ],
  "ranges": [
    { "value": "1d", "label": "1 Gün" },
    { "value": "5d", "label": "5 Gün" },
    { "value": "1mo", "label": "1 Ay" },
    { "value": "3mo", "label": "3 Ay" },
    { "value": "6mo", "label": "6 Ay" },
    { "value": "1y", "label": "1 Yıl" },
    { "value": "max", "label": "Tümü" }
  ]
}
```

---

#### **5. TradingView Widget Embed Kodu**
```bash
POST /api/chart/embed
Content-Type: application/json

{
  "symbol": "THYAO",
  "interval": "D",
  "height": 600
}
```

**Cevap:**
```json
{
  "symbol": "THYAO",
  "interval": "D",
  "embedCode": "<div class=\"tradingview-widget-container\">...</div>"
}
```

---

#### **6. Toplu Grafik URL'leri**
```bash
POST /api/chart/batch-urls
Content-Type: application/json

{
  "symbols": ["THYAO", "GARAN", "ASELS"],
  "interval": "D"
}
```

**Cevap:**
```json
{
  "urls": [
    {
      "symbol": "THYAO",
      "chartUrl": "https://tr.tradingview.com/chart/?symbol=BIST:THYAO&interval=D",
      "widgetUrl": "https://tr.tradingview.com/widgetembed/?..."
    },
    ...
  ]
}
```

---

## 🎨 FRONTEND KULLANIMI

### **1. StockChart Component (Kendi Grafiğimiz)**

```jsx
import StockChart from './components/StockChart';

function MyPage() {
  return (
    <StockChart 
      symbol="THYAO" 
      defaultInterval="1d" 
      defaultRange="3mo" 
    />
  );
}
```

**Özellikler:**
✅ 8 zaman aralığı: 1dk, 5dk, 15dk, 30dk, 1s, 1G, 1H, 1A  
✅ 8 zaman periyodu: 1G, 5G, 1A, 3A, 6A, 1Y, 5Y, Tümü  
✅ 2 görünüm: Çizgi, Hacim  
✅ TradingView'a yönlendirme butonu

---

### **2. TradingView Widget Component**

```jsx
import TradingViewWidget from './components/TradingViewWidget';

function ChartPage() {
  return (
    <TradingViewWidget 
      symbol="GARAN" 
      interval="D" 
      height={600} 
    />
  );
}
```

**Özellikler:**
✅ Tam TradingView grafiği  
✅ Otomatik indikatörler (MA, RSI, MACD)  
✅ Türkçe arayüz  
✅ Dark theme

---

### **3. Stock Detail Modal (Grafik + Bilgi)**

```jsx
import { useState } from 'react';
import StockDetailModal from './components/StockDetailModal';

function StockList() {
  const [selectedStock, setSelectedStock] = useState(null);
  
  return (
    <>
      <button onClick={() => setSelectedStock('THYAO')}>
        THYAO Detayı Gör
      </button>
      
      {selectedStock && (
        <StockDetailModal 
          symbol={selectedStock}
          onClose={() => setSelectedStock(null)}
        />
      )}
    </>
  );
}
```

**Özellikler:**
✅ 3 sekme: Bizim Grafik, TradingView, İndikatörler  
✅ Tam ekran modal  
✅ TradingView'a yeni sekmede aç  
✅ Responsive tasarım

---

## 📊 ZAMAN ARALIĞI DETAYLARI

### **TradingView İnterval'leri**
| Değer | Açıklama | Türkçe |
|-------|----------|--------|
| `1` | 1 minute | 1 Dakika |
| `5` | 5 minutes | 5 Dakika |
| `15` | 15 minutes | 15 Dakika |
| `30` | 30 minutes | 30 Dakika |
| `60` | 1 hour | 1 Saat |
| `D` | Daily | Günlük |
| `W` | Weekly | Haftalık |
| `M` | Monthly | Aylık |

### **Yahoo Finance İnterval'leri**
| Değer | Açıklama | Maks. Range |
|-------|----------|-------------|
| `1m` | 1 minute | 7 days |
| `5m` | 5 minutes | 60 days |
| `15m` | 15 minutes | 60 days |
| `1d` | Daily | Max |
| `1wk` | Weekly | Max |
| `1mo` | Monthly | Max |

---

## 🔗 YÖNLENDIRME MANTIĞI

### **TradingView URL Formatı**
```
https://tr.tradingview.com/chart/?symbol=BIST:{SYMBOL}&interval={INTERVAL}

Örnekler:
https://tr.tradingview.com/chart/?symbol=BIST:THYAO&interval=D
https://tr.tradingview.com/chart/?symbol=BIST:GARAN&interval=1
https://tr.tradingview.com/chart/?symbol=BIST:ASELS&interval=W
```

### **Backend'de Yönlendirme**
```javascript
// Express route
router.get('/tradingview/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const { interval = 'D' } = req.query;
  
  const url = `https://tr.tradingview.com/chart/?symbol=BIST:${symbol}&interval=${interval}`;
  
  res.redirect(url); // HTTP 302
});
```

### **Frontend'de Kullanım**
```jsx
// Buton ile yönlendirme
<button onClick={() => {
  window.location.href = `/api/chart/tradingview/THYAO?interval=D`;
}}>
  TradingView'da Aç
</button>

// Yeni sekmede açma
<button onClick={() => {
  window.open(`https://tr.tradingview.com/chart/?symbol=BIST:THYAO&interval=D`, '_blank');
}}>
  Yeni Sekmede Aç
</button>
```

---

## ✅ ÖZET

| Özellik | Durum |
|---------|-------|
| **TradingView Yönlendirme** | ✅ Hazır |
| **Tüm Zaman Aralıkları** | ✅ 1dk → Aylık |
| **Kendi Grafiklerimiz** | ✅ Recharts |
| **Widget Embed** | ✅ Hazır |
| **Modal Detay** | ✅ 3 Sekme |
| **Türkçe Destek** | ✅ %100 |
| **Responsive** | ✅ Mobile Ready |

---

## 🎯 KULLANIM ÖRNEKLERİ

### **1. Basit Yönlendirme**
```bash
# THYAO günlük grafiği
curl -L http://localhost:5000/api/chart/tradingview/THYAO

# GARAN 1 dakikalık
curl -L http://localhost:5000/api/chart/tradingview/GARAN?interval=1
```

### **2. Frontend'de Kullan**
```jsx
// Günlük Tespitler sayfasında
<tr onClick={() => window.open(`/api/chart/tradingview/${stock.symbol}?interval=D`, '_blank')}>
  <td>{stock.symbol}</td>
  <td>{stock.price}</td>
</tr>
```

### **3. Modal ile Göster**
```jsx
const [showChart, setShowChart] = useState(false);

<button onClick={() => setShowChart(true)}>Grafik Gör</button>

{showChart && (
  <StockDetailModal symbol="THYAO" onClose={() => setShowChart(false)} />
)}
```

---

**Grafik sistemi hazır! 🎉📈**

# 🚀 BORSA SANATI CLONE - KURULUM REHBERİ

## 📋 İçindekiler
1. [Sistem Gereksinimleri](#sistem-gereksinimleri)
2. [Hızlı Başlangıç](#hızlı-başlangıç)
3. [Frontend Kurulumu](#frontend-kurulumu)
4. [Backend Kurulumu](#backend-kurulumu)
5. [Veri Kaynakları](#veri-kaynakları)
6. [Deployment](#deployment)

---

## 📦 Sistem Gereksinimleri

### Yazılım
- **Node.js**: v18.0.0 veya üzeri
- **npm** veya **yarn**: Son sürüm
- **PostgreSQL**: v14.0 veya üzeri
- **Redis**: v7.0 veya üzeri (opsiyonel, caching için)
- **Git**: Versiyon kontrolü için

### Donanım (Önerilen)
- **RAM**: Minimum 8GB (16GB önerilir)
- **CPU**: 4 core (8 core önerilir)
- **Disk**: 20GB boş alan

---

## ⚡ Hızlı Başlangıç

### 1. Projeyi Klonlayın
```bash
git clone <your-repo-url>
cd borsasanati-clone
```

### 2. Frontend Kurulumu
```bash
cd frontend
npm install
npm run dev
```
Frontend şimdi `http://localhost:3000` adresinde çalışıyor.

### 3. Backend Kurulumu (İleride)
```bash
cd backend
npm install
cp .env.example .env
# .env dosyasını düzenle
npm run dev
```
Backend `http://localhost:5000` adresinde çalışacak.

---

## 🎨 Frontend Kurulumu

### Adım 1: Bağımlılıkları Yükle
```bash
cd frontend
npm install
```

### Adım 2: Geliştirme Sunucusunu Başlat
```bash
npm run dev
```

### Adım 3: Production Build
```bash
npm run build
npm run preview
```

### Proje Yapısı
```
frontend/
├── public/              # Static dosyalar
├── src/
│   ├── components/      # Reusable componentler
│   │   ├── dashboard/   # Dashboard widget'ları
│   │   ├── Layout.jsx
│   │   ├── Sidebar.jsx
│   │   └── Header.jsx
│   ├── pages/           # Sayfa componentleri
│   │   ├── Dashboard.jsx
│   │   ├── GunlukTespitler.jsx
│   │   └── ...
│   ├── services/        # API servisleri
│   │   ├── api.js
│   │   └── marketService.js
│   ├── store/           # Zustand store'lar
│   │   ├── authStore.js
│   │   └── marketStore.js
│   ├── styles/          # CSS dosyaları
│   │   └── index.css
│   ├── utils/           # Utility fonksiyonlar
│   ├── App.jsx          # Ana App component
│   └── main.jsx         # Entry point
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
└── postcss.config.js
```

### Environment Variables
`.env` dosyası oluştur:
```env
VITE_API_URL=http://localhost:5000/api
VITE_APP_NAME=Borsa Sanatı
```

---

## 🔧 Backend Kurulumu

### Adım 1: Veritabanı Kurulumu

#### PostgreSQL Kurulumu
```bash
# Ubuntu/Debian
sudo apt-get install postgresql postgresql-contrib

# macOS (Homebrew)
brew install postgresql@14
brew services start postgresql@14

# Windows
# PostgreSQL installer kullanın
```

#### Veritabanı Oluşturma
```bash
psql -U postgres

CREATE DATABASE borsasanati;
CREATE USER borsauser WITH ENCRYPTED PASSWORD 'yourpassword';
GRANT ALL PRIVILEGES ON DATABASE borsasanati TO borsauser;
\q
```

### Adım 2: Backend Bağımlılıkları
```bash
cd backend
npm install
```

### Gerekli Paketler (package.json)
```json
{
  "dependencies": {
    "express": "^4.18.2",
    "pg": "^8.11.3",
    "pg-hstore": "^2.3.4",
    "sequelize": "^6.35.2",
    "axios": "^1.6.5",
    "jsonwebtoken": "^9.0.2",
    "bcrypt": "^5.1.1",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "node-cron": "^3.0.3",
    "node-telegram-bot-api": "^0.64.0",
    "redis": "^4.6.12"
  }
}
```

### Adım 3: Environment Variables
`.env` dosyası:
```env
PORT=5000
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=borsasanati
DB_USER=borsauser
DB_PASSWORD=yourpassword

# JWT
JWT_SECRET=your_super_secret_key_change_this
JWT_EXPIRE=7d

# Telegram Bot
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_ADMIN_CHAT_ID=your_chat_id

# Redis (Opsiyonel)
REDIS_HOST=localhost
REDIS_PORT=6379

# Yahoo Finance
YAHOO_FINANCE_API_KEY=optional_if_using_premium
```

### Adım 4: Database Migration
```bash
npm run migrate
npm run seed  # Demo data için
```

---

## 📊 Veri Kaynakları

### 1. Yahoo Finance API

**Ücretsiz** - 15 dakika gecikmeli veri

```javascript
// Örnek kullanım
const axios = require('axios');

const getStockData = async (symbol) => {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.IS?interval=1d&range=1mo`;
  const response = await axios.get(url);
  return response.data;
}

// THYAO hissesi için
const data = await getStockData('THYAO');
```

**Notlar:**
- BIST hisseleri için `.IS` uzantısı ekleyin (örn: `THYAO.IS`)
- Rate limit: ~2000 request/saat
- Ücretsiz, kayıt gerektirmez

### 2. KAP API

**Ücretsiz** - Resmi KAP verileri

```javascript
const getKAPNews = async (symbol) => {
  const url = `https://www.kap.org.tr/tr/api/disclosureSearchResult`;
  const response = await axios.post(url, {
    member: symbol,
    fromDate: '2024-01-01',
    toDate: '2025-01-29'
  });
  return response.data;
}
```

**Veri Türleri:**
- Mali tablolar
- Bilanço
- Gelir tablosu
- Özel durum açıklamaları
- Genel kurul kararları

### 3. Alternative Data Sources

#### Alpha Vantage (Opsiyonel - Premium)
- **Ücretsiz Plan**: 5 call/min, 500 call/gün
- **Premium**: $49.99/ay
- API Key gerekir

#### Finnhub (Opsiyonel - Premium)
- **Ücretsiz Plan**: 60 call/dakika
- **Premium**: $24/ay
- BIST desteği var

---

## 🧮 Finansal Formüller

### Altman Z-Score
```javascript
function calculateAltmanZScore(financials) {
  const X1 = financials.workingCapital / financials.totalAssets;
  const X2 = financials.retainedEarnings / financials.totalAssets;
  const X3 = financials.ebit / financials.totalAssets;
  const X4 = financials.marketValueEquity / financials.totalLiabilities;
  const X5 = financials.sales / financials.totalAssets;
  
  return (1.2 * X1) + (1.4 * X2) + (3.3 * X3) + (0.6 * X4) + (1.0 * X5);
}

// Yorumlama:
// Z > 2.99: Güvenli Bölge
// 1.81 < Z < 2.99: Gri Bölge
// Z < 1.81: Tehlike Bölgesi
```

### Piotroski F-Score
```javascript
function calculatePiotroskiScore(current, previous) {
  let score = 0;
  
  // Profitability (4 puan)
  if (current.netIncome > 0) score++;
  if (current.roa > 0) score++;
  if (current.operatingCashFlow > 0) score++;
  if (current.operatingCashFlow > current.netIncome) score++;
  
  // Leverage (3 puan)
  if (current.longTermDebt < previous.longTermDebt) score++;
  if (current.currentRatio > previous.currentRatio) score++;
  if (current.sharesOutstanding <= previous.sharesOutstanding) score++;
  
  // Operating Efficiency (2 puan)
  if (current.grossMargin > previous.grossMargin) score++;
  if (current.assetTurnover > previous.assetTurnover) score++;
  
  return score; // 0-9
}

// Yorumlama:
// 8-9: Çok Güçlü
// 5-7: İyi
// 0-4: Zayıf
```

### Beneish M-Score
```javascript
function calculateBeneishMScore(current, previous) {
  const DSRI = (current.receivables / current.sales) / 
                (previous.receivables / previous.sales);
  const GMI = (previous.grossProfit / previous.sales) / 
               (current.grossProfit / current.sales);
  const AQI = (1 - ((current.currentAssets + current.ppe) / current.totalAssets)) /
               (1 - ((previous.currentAssets + previous.ppe) / previous.totalAssets));
  // ... diğer ratiolar
  
  const mScore = (-4.84) + (0.92 * DSRI) + (0.528 * GMI) + (0.404 * AQI);
  
  return mScore;
}

// Yorumlama:
// M > -1.78: Manipülasyon riski yüksek
// M < -1.78: Manipülasyon riski düşük
```

---

## 🔐 Telegram Bot Kurulumu

### Adım 1: Bot Oluştur
1. Telegram'da `@BotFather` ara
2. `/newbot` komutunu gönder
3. Bot adı belirle
4. Bot username belirle
5. Token'ı kaydet

### Adım 2: Bot Kodunu Yaz
```javascript
const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Kod gönderme
async function sendVerificationCode(chatId, code) {
  await bot.sendMessage(chatId, `Giriş kodunuz: ${code}`);
}

// Örnek kullanım
app.post('/api/auth/send-code', async (req, res) => {
  const { email } = req.body;
  
  const code = Math.floor(100000 + Math.random() * 900000); // 6 haneli kod
  
  // DB'ye kaydet
  await saveVerificationCode(email, code);
  
  // Telegram'a gönder
  await sendVerificationCode(ADMIN_CHAT_ID, code);
  
  res.json({ success: true });
});
```

---

## 🚀 Deployment

### Frontend (Vercel)
```bash
# Vercel CLI
npm i -g vercel
vercel login
cd frontend
vercel
```

### Backend (DigitalOcean / AWS)
```bash
# PM2 ile production
npm i -g pm2
pm2 start server.js --name borsasanati-api
pm2 save
pm2 startup
```

### Nginx Reverse Proxy
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api {
        proxy_pass http://localhost:5000;
    }
}
```

---

## 📚 Ek Kaynaklar

- [React Dokümantasyonu](https://react.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Yahoo Finance API](https://www.yahoofinanceapi.com/)
- [KAP API](https://www.kap.org.tr/)
- [PostgreSQL Dokümantasyonu](https://www.postgresql.org/docs/)

---

## 🐛 Sorun Giderme

### Frontend çalışmıyor
```bash
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### Backend bağlantı hatası
- PostgreSQL çalışıyor mu kontrol et: `sudo service postgresql status`
- `.env` dosyasındaki bilgiler doğru mu?
- Firewall portları açık mı?

### Vercel deployment hatası
```bash
vercel --prod --debug
```

---

**Başarılar! 🎉**

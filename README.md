# 📊 Borsa Sanatı Clone - Tam Fonksiyonel Borsa Analiz Platformu

## 🎯 Proje Özeti
Borsasanati.com'un tam fonksiyonel klonu. AI destekli teknik ve temel analiz, canlı piyasa verileri, KAP entegrasyonu.

## 🏗️ Mimari

### Frontend
- **React 18** + TypeScript
- **Tailwind CSS** (Dark theme)
- **Recharts** (Grafikler)
- **React Router v6** (Routing)
- **Axios** (API)
- **Zustand** (State management)

### Backend
- **Node.js** + Express
- **PostgreSQL** (Veritabanı)
- **Redis** (Cache)
- **Telegram Bot API** (Authentication)
- **Cron Jobs** (Veri güncelleme)

### Veri Kaynakları
1. **Yahoo Finance API** - Fiyat, hacim, EMA verileri
2. **KAP API** - Mali tablolar, bilanço, KAP bildirimleri
3. **Custom Calculation Engine** - Finansal formüller

## 📋 Özellikler

### ✅ Sayfalar
- [x] Piyasa Kokpiti (Dashboard)
- [x] Günlük Tespitler
- [x] Takip Listem
- [x] Algoritma Performans
- [x] Temel Analiz AI
- [x] Teknik Analiz AI
- [x] Hisse AI Skor
- [x] KAP Analitik
- [x] Teknik Notlar
- [x] Taramalar (Piyasa Radarı)
- [x] Tarama Analiz Merkezi
- [x] İnceleme Kütüphanesi
- [x] Ayarlar & Takip
- [x] Login/Register (Telegram Bot)

### 📊 Finansal Formüller
- Altman Z-Score
- Piotroski F-Score
- Beneish M-Score
- Greenblatt Magic Formula
- Mohanram G-Score
- RSI, MACD, Bollinger Bands
- EMA (5, 9, 21, 50, 200)
- Fiyat Doygunluğu
- Hacim Dengesi

## 🚀 Kurulum

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Backend
```bash
cd backend
npm install
cp .env.example .env
# .env dosyasını düzenle
npm run dev
```

## 📦 Gereksinimler
- Node.js 18+
- PostgreSQL 14+
- Redis 7+
- Telegram Bot Token

## 🔑 API Keys
- Yahoo Finance API (ücretsiz)
- KAP API (ücretsiz)
- Telegram Bot Token

## 📖 Dokümantasyon
- [Frontend Dokümantasyonu](./docs/FRONTEND.md)
- [Backend API Dokümantasyonu](./docs/BACKEND_API.md)
- [Finansal Formüller](./docs/FORMULAS.md)
- [Veri Kaynakları](./docs/DATA_SOURCES.md)

## 🎨 Tasarım Sistemi
- Koyu tema (primary)
- Renk paleti: Lacivert, Mavi, Yeşil, Kırmızı, Sarı, Mor
- Responsive: Mobile-first

## 🔒 Güvenlik
- JWT Authentication
- Telegram 2FA
- Rate limiting
- SQL injection koruması

## 📝 Lisans
MIT License

## 👨‍💻 Geliştirici
Geliştirme: Claude (Anthropic AI)
Müşteri: [İsim]

---
**Not:** Bu proje eğitim amaçlıdır. Yatırım tavsiyesi değildir.

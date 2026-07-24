# BORSA KRALI — Güvenli Dağıtım Rehberi

Bu proje tek bir Git deposunda React/Vite arayüzü ile Node.js/Express API'sini
barındırır. Üretim trafiği Cloudflare üzerinden Render'daki Node servisine
ulaşır. Ana servis Render panosundan yönetilir; depo kökünde etkin bir
`render.yaml` bulunmaz.

## Mimari

- Üretim dalı: `main`
- Backend başlangıcı: `backend/src/server-live.js`
- Backend komutu: `cd backend && npm start`
- Sağlık kontrolü: `/health`
- Frontend üretim komutu: `cd frontend && npm run build:render`
- Statik çıktı: `frontend/dist`
- API ve zamanlanmış bot işleri aynı Node sürecinde çalışır.

Yatayda birden fazla örnek, cron ve bot işlerini birden çok kez çalıştırabilir.
Dağıtımdan önce Render servisinin tek örnek kullandığını veya dağıtık kilit
mekanizmasının etkin olduğunu doğrulayın.

## Gizli bilgiler

Gerçek anahtar, parola, token, sohbet kimliği veya servis hesabı hiçbir zaman
koda, belgeye, Git geçmişine ya da komut satırı örneğine yazılmaz. Değerler
yalnızca yerel `.env` dosyasından veya Render ortam değişkenlerinden okunur.

Gerekli olabilecek anahtar adları:

```env
NODE_ENV=production
PORT=5000
CORS_ORIGIN=https://borsakrali.com,https://www.borsakrali.com
TELEGRAM_BOT_TOKEN=<render-secret>
TELEGRAM_CHAT_ID=<render-secret>
JWT_SECRET=<render-secret>
SUPABASE_URL=<render-secret>
SUPABASE_SECRET_KEY=<render-secret>
FIREBASE_SERVICE_ACCOUNT_JSON=<render-secret>
```

Değerleri bu dosyaya eklemeyin. Sızdığı düşünülen bir kimlik bilgisini yalnızca
dosyadan silmek yeterli değildir: önce sağlayıcıdan iptal/yenileme yapın,
ardından üretim ortamını yeni değerle güncelleyin.

## Yayın öncesi kontroller

1. Yalnızca amaçlanan kaynak ve test dosyalarını stage edin. `git add -A`
   kullanmayın; `backend/src/data`, yerel önbellekler ve çalışma zamanı günlükleri
   yayın kapsamına girmez.
2. Stage edilen farkı ve dosya listesini gözden geçirin.
3. Backend testleri ile güvenlik denetimini çalıştırın:

   ```bash
   cd backend
   npm ci
   npm test
   npm audit --audit-level=high
   ```

4. Frontend bağımlılıklarını ve üretim derlemesini doğrulayın:

   ```bash
   cd frontend
   npm install --no-audit --no-fund
   npm audit --audit-level=critical
   npm run build:render
   ```

5. GitHub Actions'taki backend test/güvenlik ve frontend güvenlik/build
   adımlarının tamamının başarılı olduğunu kontrol edin.

## Render ayarları

Render panosunda her dağıtımdan önce şu alanları doğrulayın:

- Repository ve dal: bu depo / `main`
- Otomatik dağıtım: tercihen yalnız başarılı CI kontrollerinden sonra
- Build komutu: frontend `build:render` ve backend `npm ci` adımlarını içermeli
- Start komutu: `cd backend && npm start`
- Health check: `/health`
- Ortam değişkenleri: yalnız Render Secret olarak saklanmalı
- Örnek sayısı: cron çakışmasını önleyecek biçimde tek örnek veya dağıtık kilit

`backtest-service/render.yaml` yalnız backtest yan servisi için referanstır;
ana Node servisini yönetmez.

## Güvenli yayın akışı

1. Değişiklikleri ayrı bir özellik dalında commit edin.
2. Dalı GitHub'a gönderip pull request açın.
3. Tüm test, audit ve build adımları yeşil olmadan `main` dalına birleştirmeyin.
4. Render dağıtımı tamamlanana kadar yeni sürümü izleyin.
5. `/health`, ana sayfa, `/bot` ve gerekli yönetici API'lerinde kısa smoke test
   uygulayın.
6. Bot yarışının paper kapsamını, cron durumunu ve tek örnek çalışmasını kontrol
   edin; canlı broker yetkisini dağıtım doğrulaması sırasında değiştirmeyin.

## Geri alma

Sorun halinde geçmişi silen Git komutları kullanmayın. Önce Render'da son
başarılı sürüme geri dönün veya hatalı commit için yeni bir `git revert` commit'i
oluşturun. Sonrasında sağlık kontrolü ve yönetici panelini tekrar doğrulayın.

## DNS ve TLS

- Cloudflare proxy ve SSL/TLS modu üretim origin'iyle uyumlu olmalıdır.
- `borsakrali.com` ve `www.borsakrali.com` HTTPS'e yönlenmelidir.
- API aynı origin altında `/api` yolundan sunulur.
- HSTS veya DNS değişikliklerini doğrulamadan topluca uygulamayın.

Bu proje eğitim amaçlıdır; yatırım tavsiyesi değildir.

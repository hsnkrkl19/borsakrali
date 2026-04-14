# BORSA KRALI - Domain ve Hosting Rehberi

## Per.Tgm. Hasan KIRKIL

---

## 1. DOMAIN ALMA

### Türkiye'de Domain Sağlayıcıları:
- **Natro.com** - Türk şirketi, TL ile ödeme
- **Turhost.com** - Türk şirketi
- **İsimtescil.net** - Türk şirketi
- **GoDaddy.com** - Uluslararası
- **Namecheap.com** - Uluslararası, ucuz

### Önerilen Domain Adları:
- borsakrali.com
- borsakrali.com.tr
- borsasanati.com
- borsaanaliz.com

### Domain Fiyatları (Yaklaşık):
- .com: 150-300 TL/yıl
- .com.tr: 100-200 TL/yıl
- .net: 150-250 TL/yıl

---

## 2. HOSTING SEÇENEKLERİ

### A) VPS (Virtual Private Server) - ÖNERİLEN

**Neden VPS?**
- Node.js ve React için tam kontrol
- Telegram bot sürekli çalışır
- WebSocket desteği

**VPS Sağlayıcıları:**

| Sağlayıcı | Fiyat (Aylık) | RAM | CPU | Disk |
|-----------|---------------|-----|-----|------|
| **DigitalOcean** | $6 (~180 TL) | 1GB | 1 vCPU | 25GB SSD |
| **Contabo** | €5 (~160 TL) | 4GB | 2 vCPU | 50GB SSD |
| **Hetzner** | €4 (~130 TL) | 2GB | 1 vCPU | 20GB SSD |
| **Vultr** | $6 (~180 TL) | 1GB | 1 vCPU | 25GB SSD |
| **Turhost VPS** | 150 TL | 2GB | 1 vCPU | 30GB SSD |

**Önerim: Contabo veya Hetzner** - Ucuz ve güçlü

### B) Cloud Platform

| Platform | Ücretsiz | Ücretli |
|----------|----------|---------|
| **Railway.app** | 500 saat/ay | $5/ay |
| **Render.com** | 750 saat/ay | $7/ay |
| **Fly.io** | 3 VM ücretsiz | $5/ay |
| **Vercel** | Frontend ücretsiz | Backend için $20/ay |

---

## 3. VPS KURULUM ADIMLARI

### Adım 1: VPS Satın Al
1. Contabo veya Hetzner'dan VPS al
2. Ubuntu 22.04 LTS seç
3. SSH key veya şifre belirle

### Adım 2: Sunucuya Bağlan
```bash
ssh root@SUNUCU_IP_ADRESI
```

### Adım 3: Sistem Güncelle
```bash
apt update && apt upgrade -y
```

### Adım 4: Node.js Kur
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
apt install -y nodejs
node -v  # v20.x.x
npm -v
```

### Adım 5: PM2 Kur (Sürekli Çalışma İçin)
```bash
npm install -g pm2
```

### Adım 6: Nginx Kur (Reverse Proxy)
```bash
apt install nginx -y
systemctl enable nginx
```

### Adım 7: SSL Sertifikası (HTTPS)
```bash
apt install certbot python3-certbot-nginx -y
certbot --nginx -d borsakrali.com -d www.borsakrali.com
```

---

## 4. PROJE YÜKLEME

### Adım 1: Projeyi Sunucuya Aktar
```bash
# Git ile
cd /var/www
git clone https://github.com/KULLANICI/borsa-krali.git
cd borsa-krali

# Veya FileZilla/WinSCP ile FTP/SFTP
```

### Adım 2: Bağımlılıkları Kur
```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
npm run build  # Production build
```

### Adım 3: .env Dosyasını Düzenle
```bash
cd /var/www/borsa-krali/backend
nano .env
```

```env
NODE_ENV=production
PORT=5000

# Domain
CORS_ORIGIN=https://borsakrali.com,https://www.borsakrali.com

# Telegram
TELEGRAM_BOT_TOKEN=8374895928:AAGA830voVcjUoPlwzVUGoW1WRPrdru_Gv4
TELEGRAM_CHAT_ID=2116638354

# JWT - Güvenli bir key oluştur!
JWT_SECRET=COKGIZLIBIRANAHTAR123456789
```

### Adım 4: PM2 ile Başlat
```bash
# Backend
cd /var/www/borsa-krali/backend
pm2 start src/server-live.js --name "borsa-backend"

# Telegram Bot
pm2 start telegram-bot.js --name "borsa-telegram"

# Başlangıçta otomatik çalışsın
pm2 startup
pm2 save
```

---

## 5. NGINX YAPILANDIRMASI

```bash
nano /etc/nginx/sites-available/borsakrali
```

```nginx
# Backend API
server {
    listen 80;
    server_name api.borsakrali.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}

# Frontend
server {
    listen 80;
    server_name borsakrali.com www.borsakrali.com;

    root /var/www/borsa-krali/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Aktifleştir
ln -s /etc/nginx/sites-available/borsakrali /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx

# SSL ekle
certbot --nginx -d borsakrali.com -d www.borsakrali.com -d api.borsakrali.com
```

---

## 6. DNS AYARLARI

Domain sağlayıcınızda DNS ayarları:

| Tür | Ad | Değer | TTL |
|-----|-----|-------|-----|
| A | @ | SUNUCU_IP | 3600 |
| A | www | SUNUCU_IP | 3600 |
| A | api | SUNUCU_IP | 3600 |
| CNAME | www | borsakrali.com | 3600 |

---

## 7. FRONTEND .env GÜNCELLEME

Frontend'de API adresini güncelle:

```bash
cd /var/www/borsa-krali/frontend
nano .env.production
```

```env
VITE_API_URL=https://api.borsakrali.com
VITE_WS_URL=wss://api.borsakrali.com
```

```bash
npm run build
```

---

## 8. GÜVENLİK

### Firewall
```bash
ufw enable
ufw allow 22    # SSH
ufw allow 80    # HTTP
ufw allow 443   # HTTPS
ufw status
```

### Fail2ban (Brute Force Koruması)
```bash
apt install fail2ban -y
systemctl enable fail2ban
```

---

## 9. YEDEKLEME

### Otomatik Yedek Script
```bash
nano /root/backup.sh
```

```bash
#!/bin/bash
DATE=$(date +%Y%m%d)
tar -czvf /root/backups/borsa-$DATE.tar.gz /var/www/borsa-krali/backend/src/data/
```

```bash
chmod +x /root/backup.sh
crontab -e
# Her gün gece 3'te
0 3 * * * /root/backup.sh
```

---

## 10. İZLEME

### PM2 İzleme
```bash
pm2 status      # Durumları gör
pm2 logs        # Logları izle
pm2 monit       # Canlı izleme
```

### Uptime Kontrolü
- UptimeRobot.com (Ücretsiz)
- Healthchecks.io

---

## HIZLI KONTROL LİSTESİ

- [ ] Domain satın alındı
- [ ] VPS satın alındı
- [ ] Node.js kuruldu
- [ ] PM2 kuruldu
- [ ] Nginx kuruldu
- [ ] Proje yüklendi
- [ ] .env düzenlendi
- [ ] PM2 ile başlatıldı
- [ ] Nginx yapılandırıldı
- [ ] DNS ayarlandı
- [ ] SSL sertifikası alındı
- [ ] Firewall aktif
- [ ] Telegram bot çalışıyor
- [ ] Site erişilebilir

---

## TAHMİNİ AYLIK MALİYET

| Kalem | Fiyat |
|-------|-------|
| Domain | ~15 TL/ay (yıllık 180 TL) |
| VPS (Contabo) | ~160 TL/ay |
| **TOPLAM** | **~175 TL/ay** |

---

## YARDIM

Sorularınız için:
- Telegram: @Borsa_krali_aibot
- GitHub Issues

Per.Tgm. Hasan KIRKIL

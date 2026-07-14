# Altin Botu Panel Paketi

Bu paket, site reposuna kopyalanacak panel dosyalarini icerir.

Render'da yeni bir gizli degisken zorunlu degildir. Varsayilan baglanti:

```text
BOT_API_URL=https://botapi.borsakrali.com
BOT_API_TIMEOUT_MS=20000
```

Panel rotasi: `/bot`

Notlar:

- `/bot` sayfasi yalnizca admin rolundeki kullaniciya acilir.
- Backend proxy rotasi: `/api/bot/*`
- Bot yalnizca MT5 tarafindan demo olarak dogrulanan hesapta emir gonderir.
- Yerel paper modu ve gercek hesap modu yoktur.
- Backend once site oturumunu admin olarak dogrular ve ayni kisa omurlu Bearer
  oturumunu VPS'e iletir. VPS oturumu `/api/bot/session/verify` ucundan yeniden
  dogrular; Render ile VPS arasinda yeni statik sir paylasilmaz.
- Hesap kilidi, arastirma, aday onayi ve rollback islemleri `/bot` panelinden
  yonetilir. Yerel panel sifresi yalnizca VPS bakimi ve kurulum testi icindir.

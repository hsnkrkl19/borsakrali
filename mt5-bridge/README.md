# Borsa Krali → MetaTrader 5 Köprüsü

Backend'in ürettiği canlı forex sinyallerini (Telegram'daki `#kod`'ların aynısı) MT5'te
otomatik işleme çevirir. **Kimlik bilgin bu köprüde YOK** — MT5 terminaline sen giriş
yaparsın, köprü çalışan terminale bağlanır.

## Nasıl çalışır
Her `poll_seconds` saniyede backend'in `/api/forex/positions` ucunu yoklar; yeni `#kod`
için **piyasa emri** açar (lot = güven puanına göre 0.01–0.03), SL/TP'yi sinyalin girişe
göre **yüzde mesafesini broker dolum fiyatına** uygulayarak koyar (feed ile broker fiyatı
farklı olabildiğinden mutlak seviye kullanılmaz). Stop iz sürünce SL'i lehe günceller.

## Kurulum (Windows)

1. **MT5 terminalini kur** — broker'ından indir (ör. Exness/IC Markets/…), kur ve
   **hesabına giriş yap**. Menü: `Araçlar → Seçenekler → Uzman Danışmanlar` →
   "Algoritmik alım satıma izin ver" işaretli; üstteki **Algo Trading** düğmesi yeşil olsun.

2. **Python paketleri:**
   ```
   pip install -r requirements.txt
   ```

3. **config.json'u düzenle:**
   - `exec_token` → backend'deki `FOREX_EXEC_TOKEN` env ile **aynı** olmalı (kurulumda ayarlandı).
   - `symbols` → SOL taraf bizim enstrüman kodumuz, SAĞ taraf **senin broker'ındaki tam sembol
     adı** (ör. altın bazı brokerlarda `XAUUSD`, bazılarında `GOLD` / `XAUUSD.r`; Nasdaq
     `US100`/`USTEC`/`NAS100`). MT5 → Market Watch'ta sağ tık → "Tümünü Göster" ile gerçek
     adları gör. Broker'ında olmayan/yanlış sembolleri sil.
   - `dry_run` **true** kalsın (önce test).

4. **Çalıştır:** `run.bat` (çift tıkla) veya `python borsakrali_mt5.py`.

## Test → Canlı geçiş
- **dry_run=true**: hiçbir emir gitmez, log'da `[DRY] AÇ ...` satırlarını görürsün. Boru
  hattını doğrula (doğru sembol, mantıklı lot/SL/TP).
- Hazırsan `config.json` içinde `dry_run` → **false** yap. **Yeniden başlatmaya gerek yok**,
  köprü config'i her turda okur.

## Güvenlik / durdurma
- **Acil durdurma:** bu klasöre `STOP` adlı boş dosya koy → yeni emir açmaz (mevcutlara
  dokunmaz). Sil → devam.
- `enabled: false` → tamamen beklemeye alır.
- `max_open_positions`, `max_lot` tavanları config'te.
- `close_on_backend_close`: `false` (öneri) → MT5 kendi SL/TP'siyle kapatır (broker fiyatı
  = gerçek). `true` yaparsan backend sinyali kapatınca köprü de MT5 pozisyonunu kapatır.

## Loglar
- Konsol + `bridge.log` (aynı klasör).

## Notlar
- Bilgisayar/terminal kapanınca köprü durur. 7/24 için **Windows VPS** önerilir.
- Sinyal feed'i US IP'li backend'den gelir; **işlem senin broker'ında, kendi fiyatıyla**
  gerçekleşir (US kısıtı işlemi etkilemez).
- ⚠️ Bu sistem **eğitim amaçlıdır, yatırım tavsiyesi değildir**. Gerçek para riski sende.

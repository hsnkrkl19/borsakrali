# Borsa Krali → MetaTrader 5 Köprüsü

## Güvenli çalışma sözleşmesi (2026-07-29)

- Tüm örnek configler `dry_run: true`, `risk_profile: "balanced"` ve
  `aggressive_opt_in: false` ile gelir. Canlı/agresif geçiş otomatik değildir.
  Agresif değerler yalnız `risk_profile.aggressive.opt-in.example.json` içinde,
  otomatik yüklenmeyen ayrı bir şablondur; `aggressive_opt_in` varsayılanı orada da
  `false` kalır.
- Ortak hesap limitleri: günlük uyarı `%4.0`, flatten `%4.25`, hard-stop `%4.5`;
  toplam drawdown uyarı `%9.0`, flatten `%9.25`, hard-stop `%9.5`; kâr hedefi `%10`.
  Hedef açık risk `%1.5`, hard tavan `%2`; sembol+yön ve bot başına `%0.5`;
  beklenen kâr ve ilk hesaplanan risk en az `$15`. Güvenli risk hesabı `$15`
  altında lot üretiyorsa lot yukarı yuvarlanmaz; sinyal reddedilir. Acil,
  ters-sinyal ve kâr-koruma çıkışları bu dolar eşiğinden muaftır.
- R:R politikası: her giriş en az `3R` hedefler. Sinyal gücü `>=0.75` ise hedef
  `4R`, `>=0.90` ise `5R` olur. Feed'in TP'si daha yakınsa merkez beyin hedefi
  gereken çokluğa UZATIR (asla yakınlaştırmaz); daha uzak feed TP'si korunur.
  İki koruma: feed hedefi kendi başına `1.5R`'nin altındaysa (fiyat koşmuş /
  dejenere sinyal) hedef uydurulmaz, aday REDDEDİLİR; uzatılmış hedef geçerli
  bir broker fiyatı değilse (geniş SELL stopu hedefi sıfıra itebilir) aday yine
  REDDEDİLİR. Emirdeki gerçek broker TP'si ile Telegram açılış mesajı aynıdır.
  Beyin politikası yalnız `brain_min_rr` anahtarından okunur (`3/4/5`); köprü
  configlerindeki `min_rr` ayrı bir bayatlama süzgecidir, beyni etkilemez.
- İz süren stop: pozisyon `+3R` tepe gördükten sonra merkez beyin SL'i tepenin
  `1R` gerisinde broker tarafında kilitler ve yalnız LEHTE taşır
  (`trail_start_r`/`trail_distance_r`). TP'ye dokunulmaz; 4R/5R hedefli
  işlemler böylece en az `+2R` kilitlenmeden geri verilmez.
- `borsakrali_account_brain.py` diğer emir motorlarından önce çalışır. Scripti veya
  `config_brain.json` yoksa paket başlatıcısı güvenli biçimde işlemleri başlatmaz.
  Örneklerde `central_brain_enabled`, `brain_required` ve `risk_fail_closed` açıktır;
  hesap beyni yanıt vermezse emir açılmaz.
- `account_tier_max_lot` / `max_lot` değeri `1.0`, yalnız hesap-tier mutlak tavanıdır;
  işlem lotu değildir. Gerçek lot merkez beynin stop mesafesi ve yüzde-risk hesabıyla
  daha düşük belirlenir; minimum lota veya `$15` eşiğine ulaşmak için yukarı çekilmez.
- `STOP_MASTER` kalıcı ana kill-switch'tir. İnsan tarafından yazılan düz metin STOP
  tüm süreçleri durdurur. Risk beyni tarafından yazılan JSON STOP ise
  `closeOnly=true/emergencyFlatten=true` taşır: reboot/watchdog sonrasında yalnız merkez
  beyin yeniden başlar ve broker tüm pozisyonları sıfır gösterene kadar artık pozisyonu
  her tur kapatmayı dener. Hiçbir başlangıç/watchdog dosyası STOP'u silmez; resume yalnız
  kökteki `DEVAM.bat` ile açık insan onayından sonra yapılır.
- Gerçek token BAT/ZIP/git içine yazılmaz. Tercih edilen kaynak kullanıcı-seviyesi
  `BK_EXEC_TOKEN` ortam değişkenidir; `configure-secrets.ps1` değeri göstermeden
  yalnız git-dışındaki yerel configlere aktarır. İkinci seçenek, tokeni doğrudan
  yine yalnız yerel `config*.json` dosyalarına yazmaktır.

Kullanıcı ortam değişkenini bir kez ayarlamak için (değeri kendi güvenli kaynağından
gir ve ardından yeni PowerShell aç):

```powershell
[Environment]::SetEnvironmentVariable("BK_EXEC_TOKEN", "TOKENI_BURADA_GIR", "User")
```

Backend'in ürettiği canlı forex sinyallerini (Telegram'daki `#kod`'ların aynısı) MT5'te
otomatik işleme çevirir. **Kimlik bilgin bu köprüde YOK** — MT5 terminaline sen giriş
yaparsın, köprü çalışan terminale bağlanır.

## Nasıl çalışır
Köprüler backend feed'lerini izler; fakat hiçbir feed lotunu doğrudan MT5'e taşımaz.
Her yeni aday önce ortak `AccountBrain` kapısından geçer. Beyin canlı bakiye/equity,
broker tick değeri, SL mesafesi, mevcut tüm bot pozisyonları ve bekleyen atomik
rezervasyonlardan dolar-risk lotunu hesaplar. Aynı underlying'in bütün zaman
dilimleri tek pozisyon sayılır. Kuvvetli ve doğrulanmış ters sinyalde eski ticketlar
önce brokerda kapatılıp yokluğu doğrulandıktan sonra ters emir açılır.

`borsakrali_account_brain.py` bir saniyelik döngüyle hesabı ayrıca izler; kâr tepesinden
geri verme, hızlı hype ters dönüşü ve hızlanan ters hareket koşullarında TP/SL'yi
beklemeden kapatabilir. Açılış Telegram mesajı ancak broker ticketı görüldüğünde;
kapanış mesajı ancak gerçek MT5 deal'i görüldüğünde üretilir. Mesaj gönderilemezse
kalıcı outbox yeniden dener ve aynı ticket/deal ikinci kez duyurulmaz.
Emir brokerda dolar dolmaz açılış olayı önce yerel, atomik bir kuyruğa yazılır;
backend/Telegram geçici olarak kapalı olsa bile olay kaybolmaz. Nihai kapanış,
pozisyon tamamen bittikten sonra giriş ve çıkış komisyonu, fee ve swap dahil tek
net kayıt olarak bildirilir; kısmi kapanış ayrı bir “tam kapandı” mesajı üretmez.
Hesap login'i, broker server'ı ve MT5 `POSITION_IDENTIFIER` lifecycle kimliğine katılır;
farklı 10k/25k/50k/100k/200k hesaplarda aynı ticket birbirine karışmaz. Ters dönüşte
eski kapanış Telegram'ı, yeni açılış Telegram'ından önce kalıcı olarak sıralanır.

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

4. **Çalıştır:** ZIP'in kök dizinindeki `BASLAT.bat` dosyasını kullan. Bu akış
   merkez beyni önce başlatır, heartbeat'i kurar ve sonra emir köprülerini açar.
   `run.bat` tek başına canlı başlangıç yöntemi değildir; merkez heartbeat yoksa
   zaten fail-closed emir reddeder.

## Test → Canlı geçiş
- **dry_run=true**: hiçbir emir gitmez, log'da `[DRY] AÇ ...` satırlarını görürsün. Boru
  hattını doğrula (doğru sembol, mantıklı lot/SL/TP).
- Hazırsan ilgili tüm yerel `config*.json` dosyalarında aynı hesap ve aynı `dry_run`
  değerini kullan. Merkez beyin ile köprü arasında dry-run veya hesap uyuşmazlığı varsa
  emir fail-closed reddedilir.
- İlk canlı geçişten önce merkez beyni en az bir kez `dry_run=true` ile çalıştırıp
  `account_brain_runtime.json` başlangıç equity/account bilgisini oluştur. Canlı
  mod eksik, şema-dışı veya bozuk kalıcı baseline'ı otomatik sıfırlamaz; risk
  `STOP_MASTER` yazar, yeni emirleri kilitler ve close-only gözetimde hesabı düzleştirir.

## Güvenlik / durdurma
- **Tümünü kalıcı durdurma:** ZIP kökündeki `DURDUR.bat`, `STOP_MASTER` yazar.
  Dosyayı elle silme; yalnız kökteki `DEVAM.bat` açık onaylı resume akışını çalıştırır.
- **Tek motoru durdurma:** bu klasöre ilgili `STOP`, `STOP_ALL` veya `STOP_SCANNER`
  dosyasını koy. Watchdog bu dosyaları silmez ve motoru yeniden başlatmaz.
- `enabled: false` yalnız dry-run'da tamamen bekletir. Canlıda yeni emirleri kilitler;
  merkez beyin açık pozisyon riskini ve erken çıkışları izlemeyi sürdürür.
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

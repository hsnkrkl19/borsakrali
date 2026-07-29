# VPS paketini güvenli kullanma

1. İlk kurulumda `BASLAT.bat` örnek configleri `dry_run=true` ve `balanced`
   profille oluşturur. En az bir tam gözlem döngüsü ve MT5 sembol/SL/TP kontrolü
   yapılmadan canlı moda geçme.
2. Gerçek token hiçbir BAT/ZIP/git dosyasına gömülmez. Tercihen kullanıcı-seviyesi
   `BK_EXEC_TOKEN` ortam değişkenini ayarla; alternatif olarak yalnız paketteki
   git-dışı `mt5-bridge/config*.json` dosyalarına yaz.
3. `DURDUR.bat`, `mt5-bridge/STOP_MASTER` ve motor STOP dosyalarını yazar, süreçleri
   kapatır. Bu durum reboot sonrasında da kalır.
4. `BASLAT.bat`, `_otobaslat.bat` ve tüm watchdog döngüleri hiçbir `STOP*`
   dosyasını silmez. Yeniden başlatmak için yalnız `DEVAM.bat` kullanılır ve açık
   E/H onayı gerekir.
5. Merkez `borsakrali_account_brain.py` ve `config_brain.json` diğer emir
   motorlarından önce başlar. `central_brain_enabled`, `brain_required` ve
   `risk_fail_closed` varsayılan olarak açıktır; beyin yoksa paket fail-closed çıkar.
6. Canlı emir yetkisi bir LLM/API'ye verilmez. Anlık kararlar tekrarlanabilir,
   denetlenebilir kurallarla yerel merkez beyinde alınır; `llm_live_order_authority`
   true yapılırsa merkez beyin güvenli biçimde başlamayı reddeder.
7. İlk canlı geçişten önce merkez beyni `dry_run=true` ile çalıştırarak kalıcı hesap
   ve equity baseline'ını oluştur. Canlı mod eksik/bozuk baseline'ı sessizce yenilemez;
   yeni işlem açmayı durdurur ve insan incelemesi ister.
8. Broker açılışları ağ çağrısından önce yerel atomik outbox'a yazılır. Telegram veya
   backend kesintisinde olay saklanır ve tekrar denenir. Kapanış bildirimi, pozisyon
   tamamen kapandıktan sonra giriş+çıkış komisyonu, fee ve swap dahil tek net K/Z'dir.
9. Risk kaynaklı `STOP_MASTER`, JSON içinde `closeOnly=true` ve
   `emergencyFlatten=true` taşır. Reboot'ta yalnız merkez beyin ayağa kalkar; entry
   motorları kapalı kalır ve artık pozisyonlar broker sıfır diyene dek yeniden kapatılır.
   `DURDUR.bat` ile yazılan manuel düz-metin STOP ise hiçbir süreci başlatmaz.
10. MT5 açılış emirlerinde RETURN filling kullanılmaz; IOC/FOK kısmi dolum gerçek dolan
   hacimle kaydedilir. Kısmi kapanış, canlı position identifier kaybolmadan tam kapanış
   veya Telegram kapanışı sayılmaz.
11. Mevcut riskte mümkünse broker `order_calc_profit`, değilse
   `trade_tick_value_loss` kullanılır. Hesap para birimine dönüşüm verisi yoksa
   contract-size tahmini yapılmaz; yeni aday reddedilir, açık pozisyon riski sınırsız
   kabul edilerek merkez fren tetiklenir.

Balanced hesap politikası:

- Günlük kayıp: uyarı `%4.0`, flatten `%4.25`, hard-stop `%4.5`.
- Toplam drawdown: uyarı `%9.0`, flatten `%9.25`, hard-stop `%9.5`.
- Kâr hedefi `%10`; hedef toplam açık risk `%1.5`, hard tavan `%2.0`.
- Sembol+yön başına ve bot başına hard açık risk `%0.5`.
- `max_lot/account_tier_max_lot=1.0` işlem önerisi değil, hesap-tier mutlak
  tavanıdır. Gerçek lot merkez yüzde-risk hesabıyla daha düşük belirlenir.
- R:R politikası: her giriş en az `3R`; sinyal gücü `>=0.75` → `4R`,
  `>=0.90` → `5R`. Yakın feed TP'si merkez beyin tarafından gereken çokluğa
  uzatılır, uzak TP korunur; broker TP'si = Telegram TP'si. Beklenen kâr ve ilk
  hesaplanan risk en az `$15`; güvenli lot bu riskin altında kalırsa lot
  büyütülmez, sinyal reddedilir. Acil, ters-sinyal ve kâr-koruma çıkışları bu
  dolar eşiğinden muaftır.
- İz süren stop: `+3R` tepe sonrasında SL tepenin `1R` gerisinde broker
  tarafında kilitlenir ve yalnız lehte taşınır (`trail_start_r=3`,
  `trail_distance_r=1`); TP değişmez. Feed hedefi `1.5R` altındaysa giriş
  reddedilir (hedef uydurulmaz).
- Köprü configi ile beyin arasında `dry_run` uyuşmazlığı varsa yeni girişler
  fail-closed reddedilir; ancak o süre boyunca AÇIK canlı pozisyonlar beynin
  trail/erken-çıkış korumasından yararlanamaz (beyin yalnız [DRY] loglar).
  Uyuşmazlığı hemen giderin.
- Agresif profil otomatik değildir. Ayrı yerel configte hem
  `risk_profile=aggressive` hem `aggressive_opt_in=true` verilmelidir; hesap
  hard-limitleri yine değişmez. Referans dosyası
  `mt5-bridge/risk_profile.aggressive.opt-in.example.json` otomatik yüklenmez.

Flatten eşikleri mutlak tavanlardan önce devreye girer; yine de piyasa gap'i,
slippage, bağlantı/terminal veya broker kesintisi nedeniyle yazılım `%4.5` ve `%9.5`
seviyelerinde matematiksel kayıp garantisi veremez. Sistem bu nedenle `%4.25` ve
`%9.25` tamponlarında STOP+toplu kapatmayı başlatır ve her tur yeniden dener.

`DURDUR` açık pozisyonları otomatik kapatmaz. MT5'te broker tarafındaki SL/TP
seviyelerini kontrol et ve gerekiyorsa pozisyonları elle yönet.

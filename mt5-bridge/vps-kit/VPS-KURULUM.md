# 🖥️ VPS Kurulum Rehberi — Borsa Kralı Botları (7/24)

> **Güncel güvenlik kuralı:** `STOP_MASTER` kalıcı ana kill-switch'tir. Hiçbir
> startup/watchdog `STOP*` dosyası silmez. `vps-durdur.ps1` manuel durdurur;
> yalnız `vps-devam.ps1`, kullanıcının `DEVAM` onayından sonra STOP dosyalarını
> kaldırır. Manuel STOP reboot'ta hiçbir şeyi açmaz. Risk beyninin JSON close-only
> STOP'u varsa Zamanlanmış Görev yalnız merkez beyni açar; entry botları kapalı kalır
> ve artık pozisyonlar broker sıfır diyene dek kapatma yeniden denenir.

> **Güvenli varsayılan:** tüm örnek configler dry-run/paper + balanced profildir.
> Agresif profil ancak ayrı yerel configte `risk_profile=aggressive` ve
> `aggressive_opt_in=true` birlikte verilirse seçilebilir; hesap hard-limitleri
> yükselmez. Girişte beklenen kâr ve ilk güvenli risk en az `$15` olmalıdır; güvenli
> lot daha düşük risk üretiyorsa lot büyütülmez, sinyal reddedilir. Acil/ters/
> kâr-koruma çıkışları bu eşiğe tabi değildir. Merkez `borsakrali_account_brain.py`
> yoksa başlatıcı fail-closed çıkar. `max_lot/account_tier_max_lot=1.0` gerçek işlem
> lotu değil, yalnız mutlak tier tavanıdır; gerçek lot merkez yüzde-risk hesabıdır.

> **Token:** gerçek değer BAT, ZIP veya git içine gömülmez. Kullanıcı-seviyesi
> `BK_EXEC_TOKEN` env'i tercih edilir; `configure-secrets.ps1` bunu değeri
> göstermeden yerel/ignore edilen configlere aktarır.

Her VPS kurulumu `allowed_account` ve terminal yolu ile tek bir bağlı MT5 hesabına
kilitlenir. 10k/25k/50k/100k/200k hesap kademesi merkez beyin tarafından bakiyeden
seçilir; gerçek lot, seçilen kademe etiketiyle değil SL mesafesi ve yüzde-risk bütçesiyle
hesaplanır. Loglar `vps_tani.py` ile tek dosyada toplanabilir.

> ⚠️ **VPS'te İKİ MT5 hesabı/terminali açık.** Botlar **asla** yanlış hesaba
> işlem açmaz — üç bota da **hesap kilidi + terminal-yolu sabitleme** eklendi.
> Yanlış hesap görürse bot işlem açmadan durur.

---

## 🚀 HIZLI KURULUM (tek komut — önerilen)

Aşağıdaki manuel adımların **hepsini otomatik yapar**: paketleri kurar, FTMO
terminalini (1513908484) kendi bulur, config'leri yazar, oto-başlatı kurar,
botları başlatır ve doğrular.

1. İki klasörü VPS'e kopyala: `gold-structure-bot` + `site\borsasanati-clone\mt5-bridge`.
2. **FTMO hesabına (1513908484) bir MT5 terminalinde giriş yap + Algo Trading AÇ.**
   (Varsa diğer hesabın terminalinde Algo Trading'i KAPAT — bkz. aşağıdaki uyarı.)
3. PowerShell aç, `mt5-bridge\vps-kit` klasörüne gel ve çalıştır:
   ```powershell
   powershell -ExecutionPolicy Bypass -File vps-kur.ps1
   ```
4. Bitince açılan pencerelerde **`login=1513908484` + `Hesap kilidi AKTİF`** gör.

> Configler yoksa `vps-kur.ps1` güvenli örneklerden oluşturur. Token için
> `BK_EXEC_TOKEN` kullanıcı ortam değişkenini ayarla veya yalnız git-dışındaki yerel
> configleri doldur. Tokenlı config ya da tokenlı BAT/ZIP dağıtma.

Kurulum bitti. Aşağıdaki bölümler **manuel/ayrıntı** referansıdır (sorun çıkarsa).

---

## 1. VPS'e neyi kopyala

İki klasörü VPS'e taşı (RDP paylaşımlı sürücü / OneDrive / git clone):

| Klasör | Kaynak | Not |
|---|---|---|
| `gold-structure-bot` | `Masaüstü\gold-structure-bot` | `data\` klasörü DAHİL (öğrenilmiş ayarlar). `__pycache__` gerekmez. |
| `site\borsasanati-clone\mt5-bridge` | aynı yol | `config.json` + `config_scanner.json` DAHİL (exec_token'lı). |

Backend'i (Render) taşımana gerek yok — o zaten bulutta. VPS yalnız **botları**
çalıştırır ve Render API'sinden beslenir.

## 2. Gereksinimler (VPS'te bir kez)

```powershell
# Python 3.14 (python.org'dan) kur, sonra:
pip install MetaTrader5 requests
```

İki MT5 terminalini kur/aç, **FTMO hesabına** (`1513908484`) giriş yap, üstteki
**"Algo Trading"** düğmesini **yeşil** yap (kapalıysa canlı emir açılmaz).

## 3. ⚠️ HESAP KİLİDİNİ AYARLA (en kritik adım)

**Önce FTMO terminalinin tam yolunu bul.** MT5'te: `Dosya > Veri Klasörünü Aç`
değil — terminal64.exe yolu genelde şudur (FTMO ayrı kurulum yaptıysa "FTMO"
içerir):
```
C:\Program Files\FTMO MetaTrader 5\terminal64.exe
```
Emin değilsen Görev Yöneticisi > Ayrıntılar > `terminal64.exe` sağ tık > Dosya
konumunu aç.

Bu yolu **3 yere** yaz (hepsi aynı FTMO terminal64.exe):

**a) `mt5-bridge\config.json`** (forex köprüsü):
```json
"terminal_path": "C:\\Program Files\\FTMO MetaTrader 5\\terminal64.exe",
"allowed_account": 1513908484,
```
**b) `mt5-bridge\config_scanner.json`** (gün-içi köprüsü): aynı iki satır.

**c) Gold bot** — `vps-basla.ps1` içindeki `$FTMO_TERMINAL` değişkeni (başlatıcı
bunu `GSB_MT5_TERMINAL` env'ine geçirir). Hesap kilidi (`1513908484`) gold bot
koduna zaten gömülü.

> 🔒 `allowed_account` ayarlıyken bot **başka hesaba bağlıysa emir AÇMAZ** ve
> logda `HESAP KİLİDİ` yazar. `terminal_path` verildiğinde bot doğru terminali
> başlatıp ona bağlanmayı dener.

> ### ⚠️⚠️ İKİ TERMİNAL — EN ÖNEMLİ OPERASYONEL KURAL
> MetaTrader5'in Python modülü bir process'te **aynı anda tek terminale**
> bağlanır ve **iki terminal birden açık + ikisinde de API/Algo açıksa**,
> `terminal_path` hangisine bağlanacağını **garanti ETMEZ** (Python modülü
> erişebildiği ilk terminale kapılabilir). Hesap kilidi bunu yakalar (yanlış
> hesapta **işlem açılmaz**) ama botun ÇALIŞMASI için doğru terminale bağlanması
> gerekir. **Kesin çözüm — şu ikisinden birini yap:**
>
> 1. **YALNIZ FTMO terminalinde "Algo Trading"i AÇIK bırak; diğer hesabın
>    terminalinde KAPAT** (Araçlar > Seçenekler > Uzman Danışmanlar, veya üstteki
>    Algo Trading düğmesi kapalı). Python modülü API/algo açık olan FTMO
>    terminaline bağlanır. Diğer hesapta elle işlem yapmaya devam edebilirsin.
> 2. VEYA botları çalıştıracağın terminal DIŞINDAKİ terminali, botları
>    başlatırken kapalı tut; sadece FTMO açıkken botları başlat, sonra diğerini aç.
>
> Her koşulda: başlatınca her pencerede **`login=1513908484`** gör. Yanlış login
> görürsen yukarıdaki 1. maddeyi uygula.

## 4. Başlat

`vps-basla.ps1` içindeki 3 yolu (FTMO terminal, gold klasörü, köprü klasörü)
kendi VPS'ine göre düzenle, sonra:

```powershell
powershell -ExecutionPolicy Bypass -File vps-kit\vps-basla.ps1
```

Üç pencere açılır (gold + forex köprü + gün-içi köprü). **Her pencerede ilk
satırlarda şunu görmelisin:**
```
Bağlandı: login=1513908484 ... 🔒 Hesap kilidi AKTİF: yalnız 1513908484
MOD: ⚡ CANLI EMİR AKTİF
```
Farklı login veya `HESAP KİLİDİ` uyarısı görürsen → `terminal_path` yanlış,
düzelt. **İşlem açılmadığı için tehlike yok.**

## 5. Reboot'ta otomatik başlat (Görev Zamanlayıcı)

VPS yeniden başlarsa botlar kendiliğinden kalksın:

1. `Görev Zamanlayıcı > Görev Oluştur`
2. Tetikleyici: **Oturum açıldığında** (At log on).
3. Eylem: `powershell.exe`, argüman:
   `-ExecutionPolicy Bypass -File "C:\...\mt5-bridge\vps-kit\vps-basla.ps1"`
4. Koşullar: "AC gücü" onayını kaldır (VPS'te pil yok).
5. ⚠️ MT5 terminalleri de açılışta gelmeli: FTMO terminalinin **Başlangıç**
   (Startup) klasörüne kısayolunu koy VEYA MT5'in kendi otomatik-giriş ayarını
   kullan. Bot terminali yoksa `terminal_path` ile açar ama giriş kayıtlı olmalı.

## 6. 🔁 Log çekme döngüsü (asıl amaç)

Botlar veri toplar + kendini ayarlar. Bizim manuel bakmamız gereken şeyler için
**tek komut**:

```powershell
python vps-kit\vps_tani.py            # son 3 gün
python vps-kit\vps_tani.py --gunluk 7 # son 7 gün
```

Bu, üç kaynağı (gold kararları + köprü emir gerçekleri + backend öğrenme durumu)
tek dosyaya toplar: `vps-kit\tani_YYYYMMDD_HHMM.txt`. En sonda **⚠️ ANORMALLİKLER**
bölümü bizim bakmamız gerekenleri işaretler (reddedilen emirler, governor molası,
gölgeye düşen kombolar, hesap-kilidi ihlali, reconnect fırtınası).

**Sen:** bu `.txt` dosyasını RDP ile bize getir (kopyala-yapıştır veya paylaşımlı
klasör). **Biz:** okur, kök sorunu bulur, kodu güncelleriz → sen `git pull` +
botu yeniden başlatırsın. Kusursuz bot çıkana kadar bu döngü döner.

> Botların kendi otomatik öğrenmesi (devre-kesici + gölge + selftune) zaten
> çalışıyor; `vps_tani.py` **kod-seviyesi** iyileştirmeler için gözümüz.

## 6.5 💰 Gerçek kâr/zarar → Telegram

Gerçek lifecycle'ın tek sahibi merkez `borsakrali_account_brain.py` ve broker-fill
outbox'ıdır. Açılış yalnız broker dolumu sonrası; kapanış yalnız pozisyon tamamen bittikten
sonra bildirilir. Kapanış neti giriş+çıkış komisyonu, fee ve swap toplamıdır. Ticket,
`POSITION_IDENTIFIER`, hesap login'i ve broker server'ı birlikte eşleştirilir. İlk
bootstrap geçmişi spam üretmez; kalıcı cursor oluştuktan sonraki kapanışlar uzun bir
backend kesintisinden sonra bile `notificationRequired` ile tekrar bildirilir.

## 7. Durdurma / acil durum

| Ne | Nasıl |
|---|---|
| Tek bot, yeni emir dursun | O klasöre `STOP` (köprüde `STOP_SCANNER`) dosyası koy |
| Hepsini kalıcı durdur | `powershell -ExecutionPolicy Bypass -File vps-kit\vps-durdur.ps1` |
| Açık onayla devam et | `powershell -ExecutionPolicy Bypass -File vps-kit\vps-devam.ps1` |
| Reboot sonrası durum | Manuel STOP hiçbir şeyi açmaz; risk JSON STOP yalnız close-only beyni açar |
| Öğrenmeyi kapat (davranış eskiye) | Render env: `MT5_LEARNING_DISABLED=1`, `FOREX_LEARNING_DISABLED=1` |

Durdurma açık pozisyonları **kapatmaz**. Broker tarafındaki SL/TP emirleri kalır,
ancak trailing stop ve uygulama çıkışları artık yönetilemeyebilir. Durdurduktan sonra
MT5'te tüm açık pozisyonları ve SL/TP seviyelerini elle kontrol et.

---

### Magic numaraları
- **660066** gold trend · **660067** gold scalp · **550055** forex köprü · **550066** gün-içi köprü

### Sık sorun
- `retcode=10016 Invalid stops` → sembolün min-stop mesafesi; o sembol için
  SL/TP çok yakın. Tanı raporunda çıkarsa bize bildir.
- `retcode=10018 Market closed` / `10021 No prices` → FTMO gece-yarısı kripto
  molası; normal, bot 60 sn sonra yeniden dener.
- `HESAP KİLİDİ` → `terminal_path` yanlış hesabın terminaline gidiyor.

# 🖥️ VPS Kurulum Rehberi — Borsa Kralı Botları (7/24)

Üç bot, VPS'te **yalnız FTMO hesabı `1513857844`** üzerinde 7/24 işlem yapar,
veri toplar, kendini ayarlar ve log çıkarır. Bu logları `vps_tani.py` ile tek
dosyaya toplayıp bize getirirsin; biz manuel iyileştirmeleri yaparız.

> ⚠️ **VPS'te İKİ MT5 hesabı/terminali açık.** Botlar **asla** yanlış hesaba
> işlem açmaz — üç bota da **hesap kilidi + terminal-yolu sabitleme** eklendi.
> Ama bunu **config'te doğru ayarlaman şart** (aşağıda 3. adım). Yanlış hesap
> görürse bot işlem açmadan durur.

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

İki MT5 terminalini kur/aç, **FTMO hesabına** (`1513857844`) giriş yap, üstteki
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
"allowed_account": 1513857844,
```
**b) `mt5-bridge\config_scanner.json`** (gün-içi köprüsü): aynı iki satır.

**c) Gold bot** — `vps-basla.ps1` içindeki `$FTMO_TERMINAL` değişkeni (başlatıcı
bunu `GSB_MT5_TERMINAL` env'ine geçirir). Hesap kilidi (`1513857844`) gold bot
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
> Her koşulda: başlatınca her pencerede **`login=1513857844`** gör. Yanlış login
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
Bağlandı: login=1513857844 ... 🔒 Hesap kilidi AKTİF: yalnız 1513857844
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

## 7. Durdurma / acil durum

| Ne | Nasıl |
|---|---|
| Tek bot, yeni emir dursun | O klasöre `STOP` (köprüde `STOP_SCANNER`) dosyası koy |
| Hepsini durdur | `powershell -ExecutionPolicy Bypass -File vps-kit\vps-durdur.ps1` |
| Kalıcı durdur | Görev Zamanlayıcı görevini de kapat/sil |
| Öğrenmeyi kapat (davranış eskiye) | Render env: `MT5_LEARNING_DISABLED=1`, `FOREX_LEARNING_DISABLED=1` |

Durdurma açık pozisyonları **kapatmaz** — SL/TP broker tarafında durduğundan
yönetimsiz zarar riski yok.

---

### Magic numaraları (hesap tek: 1513857844, çakışma yok)
- **660066** gold trend · **660067** gold scalp · **550055** forex köprü · **550066** gün-içi köprü

### Sık sorun
- `retcode=10016 Invalid stops` → sembolün min-stop mesafesi; o sembol için
  SL/TP çok yakın. Tanı raporunda çıkarsa bize bildir.
- `retcode=10018 Market closed` / `10021 No prices` → FTMO gece-yarısı kripto
  molası; normal, bot 60 sn sonra yeniden dener.
- `HESAP KİLİDİ` → `terminal_path` yanlış hesabın terminaline gidiyor.

@echo off
chcp 65001 >nul
title BORSA KRALI - VPS BASLATICI
cd /d "%~dp0"

REM ---------- KAYIT (pencere aninda kapanirsa sebebi burada kalir) ----------
REM "acilir acilmaz kapaniyor" sikayetinde bu dosyaya bak: hangi adimda durdugu
REM son satirdan bellidir. Her calistirmada sifirdan yazilir.
set "BLOG=%~dp0baslat.log"
> "%BLOG%" echo [%date% %time%] BASLAT basladi
>> "%BLOG%" echo   klasor: %~dp0

REM ---------- KALICI ANA DURDURMA ANAHTARI ----------
REM BASLAT ve otomatik acilis STOP dosyalarini ASLA silmez. Yalniz DEVAM.bat,
REM kullanicinin acik eylemiyle STOP_MASTER ve alt STOP dosyalarini kaldirir.
if exist "mt5-bridge\STOP_MASTER" (
  powershell -NoProfile -Command "try{$s=Get-Content -LiteralPath 'mt5-bridge\STOP_MASTER' -Raw|ConvertFrom-Json;if($s -is [pscustomobject] -and $s.closeOnly -is [bool] -and $s.closeOnly -eq $true -and $s.emergencyFlatten -is [bool] -and $s.emergencyFlatten -eq $true){exit 0}}catch{};exit 1" >nul 2>nul
  if errorlevel 1 (
    >> "%BLOG%" echo [%time%] Manuel STOP_MASTER mevcut - baslatma reddedildi
    echo [DURDU] Kalici manuel mt5-bridge\STOP_MASTER mevcut.
    echo         Botlar baslatilmadi. Devam etmek icin DEVAM.bat calistir.
    pause
    exit /b 2
  )
  >> "%BLOG%" echo [%time%] Risk STOP mevcut - yalniz close-only beyin baslatiliyor
  echo [ACIL] Risk STOP mevcut. Entry botlari acilmadan merkez kapatma beyni baslatiliyor.
  call "%~dp0_otobaslat.bat"
  set "CLOSE_EXIT=%errorlevel%"
  pause
  exit /b %CLOSE_EXIT%
)

echo ============================================================
echo    BORSA KRALI - TUM BOTLAR VPS BASLATICI (oto-restart)
echo ============================================================
echo.

REM ---------- Python kontrol ----------
>> "%BLOG%" echo [%time%] python araniyor...
where python >nul 2>nul
if errorlevel 1 (
  >> "%BLOG%" echo [HATA] python PATH'te YOK
  echo [HATA] Python bulunamadi. Once Python 3.10+ kur: https://www.python.org/downloads/
  echo        Kurarken "Add Python to PATH" isaretle.
  echo.
  echo Bu pencere kapanmayacak - okuyup kapat.
  pause
  exit /b 1
)
for /f "delims=" %%P in ('where python 2^>nul') do >> "%BLOG%" echo   python: %%P
python -V >> "%BLOG%" 2>&1

REM ---------- Birlesik kopru config (ilk sefer) ----------
if not exist "mt5-bridge\config_all.json" (
  echo [KURULUM] config_all.json yok - ornekten olusturuluyor...
  copy "mt5-bridge\config_all.example.json" "mt5-bridge\config_all.json" >nul
  echo.
  echo   ^>^>^> Acilan dosyada MUTLAKA doldur:
  echo        exec_token       = yalniz yerel config; tercihen BK_EXEC_TOKEN env kullan
  echo        allowed_account  = FTMO hesap no  ^(HESAP-KONTROL.bat ile ogren^)
  echo        backend_url      = https://www.borsakrali.com  ^(www ONEMLI^)
  echo        dry_run          = true kalsin; canli gecis ayri ve bilincli bir adimdir
  echo.
  notepad "mt5-bridge\config_all.json"
  echo   Kaydedip kapatinca devam etmek icin bir tusa bas...
  pause
)

REM ---------- FOREX koprusu config (magic 550055) ----------
REM 2026-07-24: forex-signals botunun GERCEK emirlerini ARTIK SADECE bu kopru acar.
REM Bu config yoksa o bot HIC islem acmaz (birlesik kopru onu bilerek atliyor).
REM exec_token / allowed_account / terminal_path / backend_url CALISAN
REM config_all.json'dan OTOMATIK kopyalanir - elle token aramana gerek yok
REM (ucunun token'i AYNI: backend'deki tek FOREX_EXEC_TOKEN degeri).
if not exist "mt5-bridge\config.json" (
  echo.
  echo [KURULUM] config.json yok - FOREX koprusu icin olusturuluyor...
  copy "mt5-bridge\config.example.json" "mt5-bridge\config.json" >nul
  call :DEVRAL "mt5-bridge\config.json"
)

REM ---------- GUN-ICI TARAYICI config (magic 550066) ----------
REM Ayni sekilde mt5-scanner botunun TEK yurutme yolu + EOD 23:45 kapatmasi burada.
if not exist "mt5-bridge\config_scanner.json" (
  echo.
  echo [KURULUM] config_scanner.json yok - TARAYICI koprusu icin olusturuluyor...
  copy "mt5-bridge\config_scanner.example.json" "mt5-bridge\config_scanner.json" >nul
  call :DEVRAL "mt5-bridge\config_scanner.json"
)

REM ---------- MERKEZ HESAP BEYNI config ----------
if not exist "mt5-bridge\config_brain.json" (
  if not exist "mt5-bridge\config_brain.example.json" (
    echo [HATA] config_brain.example.json yok; merkez risk beyni olmadan baslatilmaz.
    pause
    exit /b 5
  )
  echo [KURULUM] config_brain.json guvenli ornekten olusturuluyor...
  copy "mt5-bridge\config_brain.example.json" "mt5-bridge\config_brain.json" >nul
  call :DEVRAL "mt5-bridge\config_brain.json"
)

goto :DEVAM

:DEVRAL
REM %1 = yeni olusturulan config. Ayarlari config_all.json'dan devral.
if not exist "mt5-bridge\config_all.json" (
  echo   [!] config_all.json yok - ayarlari ELLE doldurman gerekiyor.
  notepad "%~1"
  echo   Kaydedip kapatinca devam etmek icin bir tusa bas...
  pause
  goto :eof
)
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s=Get-Content 'mt5-bridge\config_all.json' -Raw|ConvertFrom-Json;" ^
  "$h=Get-Content '%~1' -Raw|ConvertFrom-Json;" ^
  "$h.exec_token=$s.exec_token; $h.allowed_account=$s.allowed_account; $h.account_server=$s.account_server;" ^
  "if($s.terminal_path){$h.terminal_path=$s.terminal_path};" ^
  "if($s.backend_url){$h.backend_url=$s.backend_url};" ^
  "$h.dry_run=$s.dry_run;" ^
  "[IO.File]::WriteAllText((Resolve-Path '%~1'), ($h|ConvertTo-Json -Depth 10));" ^
  "Write-Host ('   [OK] ayarlar config_all.json' + [char]39 + 'dan devralindi -> hesap=' + $s.allowed_account + '  dry_run=' + $s.dry_run)"
if errorlevel 1 (
  echo   [!] Otomatik devralma basarisiz - elle doldur.
  notepad "%~1"
  pause
)
goto :eof

:DEVAM

REM ---------- Bagimliliklar (ilk sefer) ----------
if not exist ".deps_ok" (
  echo [KURULUM] Python paketleri kuruluyor ^(ilk sefer, biraz surebilir^)...
  python -m pip install --quiet --upgrade pip >> "%BLOG%" 2>&1
  if errorlevel 1 (
    echo [HATA] pip guncellenemedi; .deps_ok yazilmadi. Ayrinti: baslat.log
    pause
    exit /b 6
  )
  python -m pip install --quiet MetaTrader5 requests pandas numpy fastapi uvicorn httpx >> "%BLOG%" 2>&1
  if errorlevel 1 (
    echo [HATA] Ana Python bagimliliklari kurulamadi; .deps_ok yazilmadi. Ayrinti: baslat.log
    pause
    exit /b 6
  )
  if exist "altin-botu\requirements.txt" (
    python -m pip install --quiet -r "altin-botu\requirements.txt" >> "%BLOG%" 2>&1
    if errorlevel 1 (
      echo [HATA] Altin botu bagimliliklari kurulamadi; .deps_ok yazilmadi. Ayrinti: baslat.log
      pause
      exit /b 6
    )
  )
  echo ok> .deps_ok
)

REM ---------- YARIS MODU DEVRI (her calistirmada) ----------
REM config_all.json'daki race_mode TUM configlere islenir; yeni ZIP config_all'i
REM guncelledigi icin mevcut VPS configleri de otomatik ayni moda gecer.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s=Get-Content 'mt5-bridge\config_all.json' -Raw|ConvertFrom-Json;" ^
  "if($null -ne $s.PSObject.Properties['race_mode']){" ^
  "foreach($n in 'config.json','config_scanner.json','config_brain.json'){" ^
  "$p=Join-Path 'mt5-bridge' $n; if(Test-Path $p){" ^
  "$h=Get-Content $p -Raw|ConvertFrom-Json;" ^
  "if($null -eq $h.PSObject.Properties['race_mode']){$h|Add-Member -NotePropertyName race_mode -NotePropertyValue $s.race_mode}else{$h.race_mode=$s.race_mode};" ^
  "[IO.File]::WriteAllText((Resolve-Path $p),($h|ConvertTo-Json -Depth 100));" ^
  "}}; Write-Host ('   [OK] race_mode='+$s.race_mode+' tum configlere islendi') }"

REM ---------- GUVENLI TOKEN AKTARIMI + SALT-OKUNUR CONFIG KONTROLU ----------
REM Token BAT/ZIP icine gomulmez ve komut satirinda tasinmaz. Kullanici-seviyesi
REM BK_EXEC_TOKEN (veya FOREX_EXEC_TOKEN) env varsa yalniz git-disindaki config'lere
REM aktarilir. Env yoksa mevcut yerel config tokeni kullanilir; degeri loglanmaz.
>> "%BLOG%" echo [%time%] guvenli token ve config kontrolu
echo [KONTROL] Yerel config / token kontrol ediliyor...
powershell -NoProfile -ExecutionPolicy Bypass -File "mt5-bridge\configure-secrets.ps1" -BridgeDir "mt5-bridge" -RequireToken >> "%BLOG%" 2>&1
if errorlevel 1 (
  echo [HATA] Token hazir degil. Gercek deger hicbir BAT veya ZIP dosyasina yazilmadi.
  echo        BK_EXEC_TOKEN kullanici env'ini ayarla ya da yerel config'i doldur.
  echo        Ayrinti: baslat.log
  pause
  exit /b 3
)
python -X utf8 "mt5-bridge\hesap_guncelle.py"
if errorlevel 1 (
  echo [HATA] MT5 hesap+server kilidi guncellenemedi; botlar baslatilmadi.
  pause
  exit /b 4
)
python -X utf8 "mt5-bridge\hesap_guncelle.py" --kontrol
if errorlevel 1 (
  echo [HATA] Config kontrolu basarisiz; botlar baslatilmadi.
  pause
  exit /b 4
)
echo.

REM ---------- Watchdog pencerelerini baslat (cift baslatma korumali) ----------
>> "%BLOG%" echo [%time%] configler hazir, _otobaslat cagriliyor
call "%~dp0_otobaslat.bat"
if errorlevel 1 (
  >> "%BLOG%" echo [%time%] _otobaslat HATA kod=%errorlevel%
  echo [HATA] Servisler guvenli sekilde baslatilamadi. Ayrinti: baslat.log
  pause
  exit /b 5
)
>> "%BLOG%" echo [%time%] _otobaslat dondu (pencereler acilmis olmali)

REM ---------- OTOMATIK CANLIYA GECIS ----------
REM Kullanici istegi (2026-07-29): gozlem + canliya gecis TEK BASLAT icinde.
REM Kapi gecildi (beyin saglikli); beyin hesap taban cizgisini yazinca
REM dry_run=false'a cevrilir ve motorlar canli configle yeniden baslatilir.
powershell -NoProfile -Command "$c=Get-Content 'mt5-bridge\config_all.json' -Raw|ConvertFrom-Json; if($c.dry_run -eq $true){exit 0}else{exit 1}" >nul 2>nul
if errorlevel 1 goto :CANLI_TAMAM
echo.
echo [CANLI] Gozlem modu saglikli. 15 sn icinde OTOMATIK canliya gecilecek.
choice /c EH /t 15 /d E /m "Canliya gecilsin mi (E=Evet, H=gozlemde kal)"
if errorlevel 2 (
  echo [CANLI] Gozlem modunda birakildi. Istedigin zaman CANLIYA-GEC.bat calistir.
  goto :CANLI_TAMAM
)
>> "%BLOG%" echo [%time%] otomatik canliya gecis: beyin taban cizgisi bekleniyor
set /a CANLI_BEKLE=0
:CANLI_BASELINE
if exist "mt5-bridge\account_brain_runtime.json" goto :CANLI_GEC
set /a CANLI_BEKLE+=1
if %CANLI_BEKLE% GTR 24 (
  echo [!] Beyin taban cizgisi 2 dakikada olusmadi; gozlemde kaldi.
  echo     Birkac dakika sonra CANLIYA-GEC.bat ile gecebilirsin.
  >> "%BLOG%" echo [%time%] taban cizgisi zaman asimi - gozlemde kaldi
  goto :CANLI_TAMAM
)
timeout /t 5 /nobreak >nul
goto :CANLI_BASELINE
:CANLI_GEC
powershell -NoProfile -ExecutionPolicy Bypass -Command "$enc=New-Object System.Text.UTF8Encoding($false); foreach($n in 'config_all.json','config.json','config_scanner.json','config_brain.json'){ $p=Join-Path 'mt5-bridge' $n; if(Test-Path $p){ $c=Get-Content $p -Raw -Encoding UTF8 | ConvertFrom-Json; if($null -eq $c.PSObject.Properties['dry_run']){ $c | Add-Member -NotePropertyName dry_run -NotePropertyValue $false } else { $c.dry_run=$false }; [System.IO.File]::WriteAllText($p,($c|ConvertTo-Json -Depth 100)+[System.Environment]::NewLine,$enc) } }"
>> "%BLOG%" echo [%time%] dry_run=false yazildi, motorlar canli configle yeniden baslatiliyor
echo [CANLI] Configler canliya cevrildi; motorlar yeniden baslatiliyor...
taskkill /f /im python.exe >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -File "mt5-bridge\brain-start-gate.ps1" -Mode Invalidate >nul 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -File "mt5-bridge\brain-start-gate.ps1" -Mode Wait -TimeoutSeconds 180
if errorlevel 1 (
  echo [!] Canli heartbeat henuz saglikli degil; motorlar guvenli beklemede.
  echo     Genelde birkac dakikada kendiliginden duzelir. Izlemek icin: TESHIS.bat
  >> "%BLOG%" echo [%time%] canli kapi zaman asimi - motorlar fail-closed beklemede
) else (
  echo [CANLI] GERCEK EMIR MODU AKTIF.
  >> "%BLOG%" echo [%time%] canli mod dogrulandi
)
:CANLI_TAMAM

echo.
echo ============================================================
echo  BASLATILDI - pencereler acildi (oto-restart AKTIF):
echo    - BIRLESIK KOPRU        (37 bot, magic 57xx)
echo    - FOREX KOPRUSU 550055  (forex-signals - iz-suren SL)
echo    - GUN-ICI TARAYICI 550066 (mt5-scanner - EOD 23:45 kapatma)
echo    - ALTIN BOTU
echo    - MERKEZ HESAP BEYNI     (hesap-geneli risk / STOP_MASTER)
echo    - Render uyanik tut (keep-alive)
echo  Bir bot cokerse 15 sn icinde KENDILIGINDEN yeniden baslar.
echo.
echo  HER PENCEREDE SUNU GORMELISIN:
echo     Baglandi: login=^<HESAP NO^> ... Hesap kilidi AKTIF
echo  "HESAP KILIDI: bagli hesap X != izinli Y" yazip kapaniyorsa:
echo     HESAP-KONTROL.bat calistir, config'lerdeki numarayi duzelt.
echo.
echo  ONEMLI:
echo   1) MT5 terminali ACIK + hesap GIRISI + "Algo Trading" YESIL
echo   2) VPS yeniden baslasa bile otomatik gelsin istiyorsan bir kez:
echo        OTOBASLAT-KUR.bat  calistir  (Yonetici olarak)
echo   3) Kalici durdurmak: DURDUR.bat
echo   4) Yeniden devam etmek: DEVAM.bat ^(STOP'lari sadece bu siler^)
echo ============================================================
echo.
echo Bu pencereyi kapatabilirsin; botlar kendi pencerelerinde calisir.
>> "%BLOG%" echo [%time%] BASLAT sorunsuz bitti
pause

@echo off
chcp 65001 >nul
title BORSA KRALI - VPS BASLATICI
cd /d "%~dp0"
echo ============================================================
echo    BORSA KRALI - TUM BOTLAR VPS BASLATICI (oto-restart)
echo ============================================================
echo.

REM ---------- Python kontrol ----------
where python >nul 2>nul
if errorlevel 1 (
  echo [HATA] Python bulunamadi. Once Python 3.10+ kur: https://www.python.org/downloads/
  echo        Kurarken "Add Python to PATH" isaretle.
  pause
  exit /b 1
)

REM ---------- Birlesik kopru config (ilk sefer) ----------
if not exist "mt5-bridge\config_all.json" (
  echo [KURULUM] config_all.json yok - ornekten olusturuluyor...
  copy "mt5-bridge\config_all.example.json" "mt5-bridge\config_all.json" >nul
  echo.
  echo   ^>^>^> Acilan dosyada MUTLAKA doldur:
  echo        exec_token       = borsakrali FOREX_EXEC_TOKEN degeri
  echo        allowed_account  = FTMO hesap no  ^(HESAP-KONTROL.bat ile ogren^)
  echo        backend_url      = https://www.borsakrali.com  ^(www ONEMLI^)
  echo        dry_run          = false ^(GERCEK islem^) / true ^(TEST^)
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
  "$h.exec_token=$s.exec_token; $h.allowed_account=$s.allowed_account;" ^
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
  python -m pip install --quiet --upgrade pip >nul 2>nul
  python -m pip install --quiet MetaTrader5 requests pandas numpy fastapi uvicorn httpx >nul 2>nul
  if exist "altin-botu\requirements.txt" python -m pip install --quiet -r "altin-botu\requirements.txt" >nul 2>nul
  echo ok> .deps_ok
)

REM ---------- Watchdog pencerelerini baslat (cift baslatma korumali) ----------
call "%~dp0_otobaslat.bat"

echo.
echo ============================================================
echo  BASLATILDI - pencereler acildi (oto-restart AKTIF):
echo    - BIRLESIK KOPRU        (37 bot, magic 57xx)
echo    - FOREX KOPRUSU 550055  (forex-signals - iz-suren SL)
echo    - GUN-ICI TARAYICI 550066 (mt5-scanner - EOD 23:45 kapatma)
echo    - ALTIN BOTU
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
echo   3) Durdurmak: DURDUR.bat
echo ============================================================
echo.
echo Bu pencereyi kapatabilirsin; botlar kendi pencerelerinde calisir.
pause

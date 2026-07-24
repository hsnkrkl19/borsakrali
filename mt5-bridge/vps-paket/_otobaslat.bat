@echo off
REM Etkilesimsiz baslatici — hem BASLAT.bat hem otomatik-acilis (Zamanlanmis Gorev) kullanir.
cd /d "%~dp0"
if exist "mt5-bridge\STOP_ALL" del /q "mt5-bridge\STOP_ALL"
if exist "mt5-bridge\STOP" del /q "mt5-bridge\STOP"
if exist "mt5-bridge\STOP_SCANNER" del /q "mt5-bridge\STOP_SCANNER"
if exist "altin-botu\STOP" del /q "altin-botu\STOP"

REM Zaten calisan watchdog pencerelerini tekrar acma (cift baslatmayi onle)
tasklist /v /fi "imagename eq cmd.exe" 2>nul | find /i "BIRLESIK KOPRU (oto-restart)" >nul
if errorlevel 1 start "" "%~dp0_kopru-dongu.bat"

REM FOREX KOPRUSU (magic 550055) — forex-signals botunun TEK yurutme yolu.
REM 2026-07-24'ten beri birlesik kopru bu botu ACMIYOR (cift pozisyon onlendi),
REM iz-suren SL + kapanis geri-bildirimi YALNIZ burada var. Calismazsa bot islem acmaz.
if exist "mt5-bridge\config.json" (
  tasklist /v /fi "imagename eq cmd.exe" 2>nul | find /i "FOREX KOPRUSU 550055" >nul
  if errorlevel 1 start "" "%~dp0_forex-dongu.bat"
)

REM GUN-ICI TARAYICI (magic 550066) — mt5-scanner botunun TEK yurutme yolu.
REM EOD 23:45 kapatma YALNIZ burada var (birlesik kopruda yok - pozisyon gecelerdi).
if exist "mt5-bridge\config_scanner.json" (
  tasklist /v /fi "imagename eq cmd.exe" 2>nul | find /i "GUN-ICI TARAYICI 550066" >nul
  if errorlevel 1 start "" "%~dp0_tarayici-dongu.bat"
)

tasklist /v /fi "imagename eq cmd.exe" 2>nul | find /i "ALTIN BOTU (oto-restart)" >nul
if errorlevel 1 start "" "%~dp0_altin-dongu.bat"

REM Render'i uyanik tut (kopru dususe bile feed hazir kalsin)
tasklist /v /fi "imagename eq cmd.exe" 2>nul | find /i "Render uyanik tut" >nul
if errorlevel 1 start "" "%~dp0_uyanik-tut.bat"

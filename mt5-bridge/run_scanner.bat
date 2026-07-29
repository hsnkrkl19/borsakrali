@echo off
REM Borsa Krali MT5 GUN-ICI tarayici koprusu baslatici (forex koprusunden AYRI, magic 550066)
cd /d "%~dp0"
if exist "STOP_MASTER" (
  echo [DURDU] STOP_MASTER mevcut. Devam icin explicit resume akisini kullan.
  pause
  exit /b 2
)
if exist "STOP" (
  echo [DURDU] STOP mevcut. Tarayici koprusu baslatilmadi.
  pause
  exit /b 2
)
if exist "STOP_SCANNER" (
  echo [DURDU] STOP_SCANNER mevcut. Tarayici koprusu baslatilmadi.
  pause
  exit /b 2
)
echo === Borsa Krali (GUN-ICI tarayici) -^> MT5 koprusu ===
echo config_scanner.json okunuyor... (dry_run=true iken emir ACMAZ)
python borsakrali_mt5_scanner.py
pause

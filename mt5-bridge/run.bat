@echo off
REM Borsa Krali MT5 koprusu baslatici
cd /d "%~dp0"
if exist "STOP_MASTER" (
  echo [DURDU] STOP_MASTER mevcut. Devam icin explicit resume akisini kullan.
  pause
  exit /b 2
)
if exist "STOP" (
  echo [DURDU] STOP mevcut. Forex koprusu baslatilmadi.
  pause
  exit /b 2
)
echo === Borsa Krali -> MT5 koprusu ===
echo config.json okunuyor... (dry_run=true iken emir ACMAZ)
python borsakrali_mt5.py
pause

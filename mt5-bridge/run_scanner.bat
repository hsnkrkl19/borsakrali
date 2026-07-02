@echo off
REM Borsa Krali MT5 GUN-ICI tarayici koprusu baslatici (forex koprusunden AYRI, magic 550066)
cd /d "%~dp0"
echo === Borsa Krali (GUN-ICI tarayici) -^> MT5 koprusu ===
echo config_scanner.json okunuyor... (dry_run=true iken emir ACMAZ)
python borsakrali_mt5_scanner.py
pause

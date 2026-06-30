@echo off
REM Borsa Krali MT5 koprusu baslatici
cd /d "%~dp0"
echo === Borsa Krali -> MT5 koprusu ===
echo config.json okunuyor... (dry_run=true iken emir ACMAZ)
python borsakrali_mt5.py
pause

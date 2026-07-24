@echo off
chcp 65001 >nul
title GUN-ICI TARAYICI 550066 (oto-restart)
cd /d "%~dp0mt5-bridge"
:loop
echo.
echo [%date% %time%] === Gun-ici tarayici koprusu (magic 550066) baslatiliyor ===
python borsakrali_mt5_scanner.py
echo [%date% %time%] Tarayici koprusu durdu (kod %errorlevel%). 15 sn sonra otomatik yeniden baslatilacak...
timeout /t 15 /nobreak >nul
goto loop

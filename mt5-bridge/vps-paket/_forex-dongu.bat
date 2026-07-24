@echo off
chcp 65001 >nul
title FOREX KOPRUSU 550055 (oto-restart)
cd /d "%~dp0mt5-bridge"
:loop
echo.
echo [%date% %time%] === Forex koprusu (magic 550055) baslatiliyor ===
python borsakrali_mt5.py
echo [%date% %time%] Forex koprusu durdu (kod %errorlevel%). 15 sn sonra otomatik yeniden baslatilacak...
timeout /t 15 /nobreak >nul
goto loop

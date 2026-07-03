@echo off
REM Borsa Krali GERCEK kar/zarar raporlayici (yalniz-okur; defter + Telegram P/L)
REM Cokerse 60 sn sonra yeniden dener. Durdur: STOP veya STOP_PNL dosyasi / pencereyi kapat.
cd /d "%~dp0"
title BK-Gercek-PL-Rapor
:loop
python -X utf8 mt5_hesap_rapor.py
echo.
echo [%date% %time%] rapor cikti - 60 sn sonra yeniden
timeout /t 60 /nobreak >nul
goto loop

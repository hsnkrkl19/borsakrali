@echo off
chcp 65001 >nul
title BORSA KRALI - DURDUR
cd /d "%~dp0"
echo Botlar durduruluyor...

REM STOP dosyalari (bir tur mid-run ise yeni emir acmaz)
echo stop> "mt5-bridge\STOP_ALL"
echo stop> "mt5-bridge\STOP"
echo stop> "mt5-bridge\STOP_SCANNER"
echo stop> "altin-botu\STOP"

REM Watchdog dongularini + python'lari kapat (oto-restart durur)
taskkill /FI "WINDOWTITLE eq BIRLESIK KOPRU*" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq FOREX KOPRUSU*" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq GUN-ICI TARAYICI*" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq ALTIN BOTU*" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq BORSA KRALI - Render*" /T /F >nul 2>nul

echo.
echo Durduruldu (oto-restart dongulari kapatildi).
echo Tekrar baslatmak: BASLAT.bat
echo   ^(BASLAT.bat STOP dosyalarini kendisi siler^)
echo NOT: Acik MT5 pozisyonlari otomatik kapanmaz - gerekirse MT5'ten elle
echo      veya borsakrali.com/bot panelinden ilgili botu disable et.
pause

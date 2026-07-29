@echo off
chcp 65001 >nul
title BORSA KRALI - KALICI DURDUR
cd /d "%~dp0"
echo Botlar kalici olarak durduruluyor...

REM STOP_MASTER ana kill-switch'tir. Startup/watchdog bunu veya alt STOP'lari
REM ASLA silmez; reboot sonrasinda da botlar kapali kalir.
> "mt5-bridge\STOP_MASTER" echo STOP_MASTER %date% %time%
> "mt5-bridge\STOP_ALL" echo STOP %date% %time%
> "mt5-bridge\STOP" echo STOP %date% %time%
> "mt5-bridge\STOP_SCANNER" echo STOP %date% %time%
> "mt5-bridge\STOP_PNL" echo STOP %date% %time%
if exist "altin-botu\" (
  > "altin-botu\STOP" echo STOP %date% %time%
)

REM Watchdog dongulerini ve cocuk proseslerini kapat; STOP_MASTER restart'i engeller.
taskkill /FI "WINDOWTITLE eq MERKEZ HESAP BEYNI*" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq BIRLESIK KOPRU*" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq FOREX KOPRUSU*" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq GUN-ICI TARAYICI*" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq ALTIN BOTU*" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq BORSA KRALI - Render*" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq BK-Gercek-PL-Rapor*" /T /F >nul 2>nul

echo.
echo DURDURULDU. STOP_MASTER kalicidir; BASLAT ve reboot bunu kaldirmaz.
echo Yeniden calistirmak icin yalniz DEVAM.bat kullan.
echo.
echo NOT: Acik MT5 pozisyonlari otomatik kapanmaz. Broker SL/TP seviyelerini
echo      MT5 uzerinden kontrol et; gerekirse pozisyonlari elle yonet.
pause

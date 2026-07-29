@echo off
chcp 65001 >nul
title BORSA KRALI - ACIK ONAYLA DEVAM
cd /d "%~dp0"

echo Bu islem kalici STOP_MASTER ve tum alt STOP dosyalarini kaldiracak.
echo Botlar once dry_run=true ile dogrulanmalidir.
choice /C EH /N /M "Devam anahtarini acmak istiyor musun? [E/H]: "
if errorlevel 2 exit /b 1

REM Yalniz bu explicit kullanici akisi STOP dosyalarini silebilir.
for %%F in (
  "mt5-bridge\STOP_MASTER"
  "mt5-bridge\STOP_ALL"
  "mt5-bridge\STOP"
  "mt5-bridge\STOP_SCANNER"
  "mt5-bridge\STOP_PNL"
  "altin-botu\STOP"
) do if exist "%%~F" del /q "%%~F"

echo STOP anahtarlari kaldirildi. Guvenli baslatma denetimleri calisiyor...
call "%~dp0BASLAT.bat"
exit /b %errorlevel%

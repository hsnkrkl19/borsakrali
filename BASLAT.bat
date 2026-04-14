@echo off
setlocal EnableDelayedExpansion
title BORSA KRALI - Baslatiliyor...
color 0A
chcp 65001 >/dev/null 2>&1

cd /d "%~dp0"

echo.
echo ===========================================================
echo        BORSA KRALI v5.0 - All-in-One Launcher
echo             Per.Tgm. Hasan KIRKIL
echo ===========================================================
echo.

:: Eski islemleri temizle
echo [1/5] Eski islemler kapatiliyor...
taskkill /f /im node.exe >/dev/null 2>&1
taskkill /f /im ngrok.exe >/dev/null 2>&1
timeout /t 2 /nobreak >/dev/null
echo        Temizlendi.

:: Node.js kontrol
echo [2/5] Node.js kontrol ediliyor...
node --version >/dev/null 2>&1
if errorlevel 1 (
    echo HATA: Node.js bulunamadi! https://nodejs.org adresinden indirin.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo        Node.js %NODE_VER% hazir.

:: Backend bagimliliklar
echo [3/5] Backend bagimliliklari kontrol ediliyor...
if not exist "backend\node_modules" (
    echo        Backend paketleri yukleniyor...
    cd backend && call npm install --silent >/dev/null 2>&1 && cd ..
)
echo        Backend paketleri hazir.

:: Frontend yeniden derle (tum degisiklikler dahil)
echo [4/5] Frontend derleniyor - tum degisiklikler aktif edilecek...
cd frontend
if not exist "node_modules" (
    echo        Frontend paketleri yukleniyor...
    call npm install --silent >/dev/null 2>&1
)
call npm run build
if errorlevel 1 (
    echo UYARI: Derleme basarisiz, onceki build kullaniliyor...
) else (
    echo        Derleme basarili - Kripto + Mali Tablolar guncel!
)
cd ..

:: Logs dizini
if not exist "logs" mkdir logs

:: Backend baslat
echo [5/5] Tum servisler baslatiliyor...
start "" /min cmd /c "cd /d "%~dp0backend" && node src/server-live.js"
timeout /t 4 /nobreak >/dev/null

:: Telegram Bot
start "" /min cmd /c "cd /d "%~dp0backend" && node telegram-bot.js" >/dev/null 2>&1

:: Ngrok baslat
set NGROK_CMD=ngrok.exe
if exist "%~dp0ngrok.exe" set NGROK_CMD="%~dp0ngrok.exe"
start "" /min cmd /c "!NGROK_CMD! http 5000"
timeout /t 6 /nobreak >/dev/null

:: Ngrok URL al
set NGROK_URL=
for /l %%i in (1,1,10) do (
    if "!NGROK_URL!"=="" (
        for /f "tokens=*" %%a in ('powershell -command "try { $j=(Invoke-WebRequest http://localhost:4040/api/tunnels -UseBasicParsing).Content | ConvertFrom-Json; $u=$j.tunnels | Where-Object { $_.proto -eq 'https' } | Select-Object -First 1 -ExpandProperty public_url; if ($u) { Write-Output $u } } catch { Write-Output '' }" 2^>nul') do set NGROK_URL=%%a
        if "!NGROK_URL!"=="" timeout /t 2 /nobreak >/dev/null
    )
)

:: URL kaydet
if not "!NGROK_URL!"=="" (
    (
        echo BORSA KRALI - Sunucu Bilgileri
        echo =====================================
        echo Internet URL: !NGROK_URL!
        echo Yerel URL: http://localhost:5000
        echo Tarih: %date% %time%
    ) > SUNUCU-URL.txt
)

:: Sonuc goster
cls
echo.
echo ===========================================================
echo        BORSA KRALI v5.0 - SISTEM HAZIR!
echo ===========================================================
echo.
echo   Yerel Erisim:    http://localhost:5000
echo   API:             http://localhost:5000/api
if "!NGROK_URL!"=="" (
    echo   Internet URL:    Ngrok baglaniyor... (4040 paneli)
) else (
    echo   Internet URL:    !NGROK_URL!
    echo   (Bu URL SUNUCU-URL.txt dosyasina kaydedildi)
)
echo.
echo   Aktif Ozellikler:
echo    + BIST Hisseleri (Tum analizler)
echo    + Kripto Para (BTC, ETH, BNB... 100+ coin)
echo    + Mali Tablolar (Gercek Yahoo Finance verisi)
echo    + TradingView Grafikler
echo    + AI Skor + Malaysian SNR
echo.
echo   Kapatmak icin bu pencereyi kapatin.
echo ===========================================================
echo.

start http://localhost:5000

:WAIT_LOOP
timeout /t 60 /nobreak >/dev/null
goto WAIT_LOOP

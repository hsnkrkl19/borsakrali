@echo off
chcp 65001 >nul
title BORSA KRALI - Production Build

echo.
echo ╔══════════════════════════════════════════════════════════════════════╗
echo ║                   BORSA KRALI - PRODUCTION BUILD                     ║
echo ║           Per.Tgm. Hasan KIRKIL - Tum Haklari Saklidir              ║
echo ╚══════════════════════════════════════════════════════════════════════╝
echo.

cd /d "%~dp0"

echo [1/3] Backend bagimliliklari kontrol ediliyor...
cd backend
call npm install --production
if errorlevel 1 (
    echo HATA: Backend bagimliliklari yuklenemedi!
    pause
    exit /b 1
)
cd ..

echo.
echo [2/3] Frontend build hazirlaniyor...
cd frontend
call npm install
if errorlevel 1 (
    echo HATA: Frontend bagimliliklari yuklenemedi!
    pause
    exit /b 1
)

call npm run build
if errorlevel 1 (
    echo HATA: Frontend build basarisiz!
    pause
    exit /b 1
)
cd ..

echo.
echo [3/3] Dosyalar hazirlaniyor...

:: Production klasoru olustur
if exist "production" rmdir /s /q "production"
mkdir production
mkdir production\backend
mkdir production\frontend

:: Backend kopyala
xcopy /e /i /y "backend\src" "production\backend\src"
xcopy /e /i /y "backend\node_modules" "production\backend\node_modules"
copy "backend\package.json" "production\backend\"
copy "backend\telegram-bot.js" "production\backend\"

:: Frontend dist kopyala
xcopy /e /i /y "frontend\dist" "production\frontend\dist"

:: .env ornek dosyasi
echo NODE_ENV=production > "production\backend\.env.example"
echo PORT=5000 >> "production\backend\.env.example"
echo CORS_ORIGIN=https://DOMAIN.COM >> "production\backend\.env.example"
echo TELEGRAM_BOT_TOKEN=BOT_TOKEN >> "production\backend\.env.example"
echo TELEGRAM_CHAT_ID=CHAT_ID >> "production\backend\.env.example"
echo JWT_SECRET=GUCLU_BIR_ANAHTAR >> "production\backend\.env.example"

echo.
echo ╔══════════════════════════════════════════════════════════════════════╗
echo ║                      BUILD TAMAMLANDI!                               ║
echo ╠══════════════════════════════════════════════════════════════════════╣
echo ║                                                                      ║
echo ║   Production dosyalari: production\ klasorunde                       ║
echo ║                                                                      ║
echo ║   Sunucuya yuklemek icin:                                            ║
echo ║   1. production\ klasorunu sunucuya kopyala                          ║
echo ║   2. .env.example dosyasini .env olarak duzenle                      ║
echo ║   3. DEPLOYMENT-REHBERI.md dosyasini oku                             ║
echo ║                                                                      ║
echo ╚══════════════════════════════════════════════════════════════════════╝
echo.

pause

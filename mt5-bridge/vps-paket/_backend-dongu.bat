@echo off
REM ── BORSA KRALI BACKEND (oto-restart) ────────────────────────────────────────
REM 2026-08-04: Render hesabi aylik kota nedeniyle askiya alindi. Site, panel,
REM defter ve Telegram bildirimleri artik BU BILGISAYARDA calisiyor.
REM
REM Koprulerin config'lerinde backend_url = http://localhost:5000 olmalidir.
REM Backend olurse kopruler fail-closed olur (yeni giris yok) ama beyin acik
REM pozisyonlari yonetmeye DEVAM eder - bu bilincli bir tasarimdir.
title BORSA KRALI BACKEND (oto-restart)

set "BK_BACKEND=C:\Users\hsnkr\Desktop\site\borsasanati-clone\backend"
if not exist "%BK_BACKEND%\src\server-live.js" (
  echo [HATA] Backend kaynagi bulunamadi: %BK_BACKEND%
  echo        Repo tasindiysa bu dosyadaki BK_BACKEND yolunu guncelle.
  pause
  exit /b 5
)
cd /d "%BK_BACKEND%"

:dongu
REM Ana durdurma anahtari backend'i de kapsar: STOP_MASTER varken sunucu
REM ayaga kalkmaz (panelden yanlislikla islem tetiklenmesin).
if exist "%~dp0mt5-bridge\STOP_MASTER" (
  echo [BACKEND] STOP_MASTER mevcut; 60 sn sonra tekrar bakilacak.
  timeout /t 60 /nobreak >nul
  goto dongu
)
echo [BACKEND] baslatiliyor: http://localhost:5000
node src\server-live.js
echo [BACKEND] cikti (kod=%errorlevel%); 15 sn sonra yeniden baslatiliyor.
timeout /t 15 /nobreak >nul
goto dongu

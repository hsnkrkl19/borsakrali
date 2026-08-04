@echo off
REM ── CLOUDFLARE TUNEL (oto-restart) ───────────────────────────────────────────
REM borsakrali.com -> bu bilgisayardaki backend (localhost:5000).
REM 2026-08-05: Render hesabi aylik kota nedeniyle askiya alindi.
REM
REM Tunel DISARI dogru baglanti kurar: modemde port acmaya, statik IP'ye veya ev
REM IP'sini ifsa etmeye gerek YOKTUR. Yapilandirma: %USERPROFILE%\.cloudflared\config.yml
REM   - /api/bridge/* INTERNETE KAPALI (404). Kopruler ayni makinede localhost
REM     kullanir; disariya acmaya gerek yok, saldiri yuzeyi kalkar.
REM
REM Tunel olurse SITE erisilemez olur ama BOTLAR calismaya devam eder
REM (kopruler localhost:5000 uzerinden gider). Bilincli ayrim.
title CLOUDFLARE TUNEL (oto-restart)

set "CF=C:\Users\hsnkr\Desktop\site\cloudflared.exe"
if not exist "%CF%" (
  echo [HATA] cloudflared.exe bulunamadi: %CF%
  pause
  exit /b 5
)

:dongu
"%CF%" tunnel run borsakrali
echo [TUNEL] cikti (kod=%errorlevel%); 15 sn sonra yeniden baslatiliyor.
timeout /t 15 /nobreak >nul
goto dongu

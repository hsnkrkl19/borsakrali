@echo off
chcp 65001 >nul
title BORSA KRALI - OTOMATIK ACILIS KUR
cd /d "%~dp0"
echo ============================================================
echo   OTOMATIK ACILIS KURULUMU
echo ============================================================
echo.
echo Cold boot'ta SYSTEM BootGuard yalniz STOP'u korur ve kayit tutar.
echo Python/MT5 kurtarma, bu Windows kullanicisinin ilk INTERAKTIF oturum
echo acilisinda baslar. Parola saklanmaz; STOP_MASTER asla silinmez.
echo.
choice /C EH /N /M "Reboot sonrasi bu kullanici oturum acacak (ve MT5 login hazir) mi? [E/H]: "
if errorlevel 2 (
  echo [IPTAL] Interaktif kullanici/MT5 oturumu olmadan broker pozisyonu kapatilamaz.
  echo Tam unattended kurtarma icin kurum tarafindan yonetilen auto-logon gerekir.
  pause
  exit /b 3
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0_otomatik-gorev-kur.ps1"
if errorlevel 1 (
  echo [HATA] Gorevler olusturulamadi. Dosyayi Yonetici olarak calistir.
) else (
  echo [OK] BootGuard + interaktif SessionRecovery kuruldu.
  echo      Kaldirmak: OTOBASLAT-KALDIR.bat
)
echo.
pause

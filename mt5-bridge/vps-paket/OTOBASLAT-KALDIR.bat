@echo off
chcp 65001 >nul
title BORSA KRALI - OTOMATIK ACILIS KALDIR
schtasks /delete /tn "BorsaKraliBotlar" /f >nul 2>nul
schtasks /delete /tn "BorsaKrali-BootGuard" /f >nul 2>nul
schtasks /delete /tn "BorsaKrali-SessionRecovery" /f >nul 2>nul
echo.
echo Otomatik acilis kaldirildi. Kalici STOP_MASTER durumuna dokunulmadi.
pause

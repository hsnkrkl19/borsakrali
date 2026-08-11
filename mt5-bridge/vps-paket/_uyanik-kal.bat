@echo off
REM Sistem uyanik tutucu (oto-restart). Kapak kapaninca sistem/islemler acik kalir.
title SISTEM UYANIK (kapak kapali - away mode)
:dongu
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0_uyanik-kal.ps1"
timeout /t 10 /nobreak >nul
goto dongu

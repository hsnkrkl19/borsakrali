@echo off
chcp 65001 >nul
title BORSA KRALI - Render uyanik tut (keep-alive)
cd /d "%~dp0"

:loop
if exist "mt5-bridge\STOP_MASTER" goto :stopped
powershell -NoProfile -Command "try{ Invoke-WebRequest -UseBasicParsing -TimeoutSec 25 'https://borsakrali.onrender.com/health' ^| Out-Null; Write-Host ('[' + (Get-Date -Format HH:mm:ss) + '] ping OK') }catch{ Write-Host ('[' + (Get-Date -Format HH:mm:ss) + '] ping hata') }"
for /l %%S in (1,1,240) do (
  if exist "mt5-bridge\STOP_MASTER" goto :stopped
  timeout /t 1 /nobreak >nul
)
goto :loop

:stopped
echo [%date% %time%] STOP_MASTER bulundu; keep-alive yeniden baslatilmayacak.
exit /b 0

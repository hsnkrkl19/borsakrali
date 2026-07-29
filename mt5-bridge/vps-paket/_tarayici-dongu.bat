@echo off
chcp 65001 >nul
title GUN-ICI TARAYICI 550066 (oto-restart)
cd /d "%~dp0mt5-bridge"

:loop
if exist "STOP_MASTER" goto :stopped
if exist "STOP" goto :stopped
if exist "STOP_SCANNER" goto :stopped
echo.
echo [%date% %time%] === Gun-ici tarayici koprusu (magic 550066) baslatiliyor ===
python -X utf8 borsakrali_mt5_scanner.py
set "BOT_EXIT=%errorlevel%"
if exist "STOP_MASTER" goto :stopped
if exist "STOP" goto :stopped
if exist "STOP_SCANNER" goto :stopped
echo [%date% %time%] Tarayici koprusu durdu (kod %BOT_EXIT%). 15 sn sonra yeniden denenecek...
call :wait_or_stop
if errorlevel 1 goto :stopped
goto :loop

:wait_or_stop
for /l %%S in (1,1,15) do (
  if exist "STOP_MASTER" exit /b 1
  if exist "STOP" exit /b 1
  if exist "STOP_SCANNER" exit /b 1
  timeout /t 1 /nobreak >nul
)
exit /b 0

:stopped
echo [%date% %time%] STOP bulundu; tarayici koprusu yeniden baslatilmayacak.
exit /b 0

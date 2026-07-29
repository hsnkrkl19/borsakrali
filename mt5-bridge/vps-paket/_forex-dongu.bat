@echo off
chcp 65001 >nul
title FOREX KOPRUSU 550055 (oto-restart)
cd /d "%~dp0mt5-bridge"

:loop
if exist "STOP_MASTER" goto :stopped
if exist "STOP" goto :stopped
echo.
echo [%date% %time%] === Forex koprusu (magic 550055) baslatiliyor ===
python -X utf8 borsakrali_mt5.py
set "BOT_EXIT=%errorlevel%"
if exist "STOP_MASTER" goto :stopped
if exist "STOP" goto :stopped
echo [%date% %time%] Forex koprusu durdu (kod %BOT_EXIT%). 15 sn sonra yeniden denenecek...
call :wait_or_stop
if errorlevel 1 goto :stopped
goto :loop

:wait_or_stop
for /l %%S in (1,1,15) do (
  if exist "STOP_MASTER" exit /b 1
  if exist "STOP" exit /b 1
  timeout /t 1 /nobreak >nul
)
exit /b 0

:stopped
echo [%date% %time%] STOP bulundu; forex koprusu yeniden baslatilmayacak.
exit /b 0

@echo off
chcp 65001 >nul
title ALTIN BOTU (oto-restart)
cd /d "%~dp0altin-botu"

:loop
if exist "..\mt5-bridge\STOP_MASTER" goto :stopped
if exist "STOP" goto :stopped
echo.
echo [%date% %time%] === Altin botu baslatiliyor ===
python -X utf8 main.py
set "BOT_EXIT=%errorlevel%"
if exist "..\mt5-bridge\STOP_MASTER" goto :stopped
if exist "STOP" goto :stopped
echo [%date% %time%] Altin botu durdu (kod %BOT_EXIT%). 15 sn sonra yeniden denenecek...
call :wait_or_stop
if errorlevel 1 goto :stopped
goto :loop

:wait_or_stop
for /l %%S in (1,1,15) do (
  if exist "..\mt5-bridge\STOP_MASTER" exit /b 1
  if exist "STOP" exit /b 1
  timeout /t 1 /nobreak >nul
)
exit /b 0

:stopped
echo [%date% %time%] STOP bulundu; altin botu yeniden baslatilmayacak.
exit /b 0

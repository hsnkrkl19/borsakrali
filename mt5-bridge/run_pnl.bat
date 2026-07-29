@echo off
REM Gercek kar/zarar raporlayici (yalniz-okur; defter + Telegram P/L).
REM STOP_MASTER, STOP veya STOP_PNL gorulurse kalici olarak cikar; restart etmez.
cd /d "%~dp0"
title BK-Gercek-PL-Rapor

:loop
if exist "STOP_MASTER" goto :stopped
if exist "STOP" goto :stopped
if exist "STOP_PNL" goto :stopped
python -X utf8 mt5_hesap_rapor.py
set "BOT_EXIT=%errorlevel%"
if exist "STOP_MASTER" goto :stopped
if exist "STOP" goto :stopped
if exist "STOP_PNL" goto :stopped
echo.
echo [%date% %time%] rapor cikti (kod %BOT_EXIT%) - 60 sn sonra yeniden
for /l %%S in (1,1,60) do (
  if exist "STOP_MASTER" goto :stopped
  if exist "STOP" goto :stopped
  if exist "STOP_PNL" goto :stopped
  timeout /t 1 /nobreak >nul
)
goto :loop

:stopped
echo [%date% %time%] STOP bulundu; P/L raporlayici yeniden baslatilmayacak.
exit /b 0

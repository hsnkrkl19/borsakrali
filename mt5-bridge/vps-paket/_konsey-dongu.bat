@echo off
REM AI KONSEYI (oto-restart) - Ollama + istege bagli Gemini danisma katmani.
REM Coker ya da kapanirsa 30 sn sonra yeniden baslar. Konsey OLSE BILE sistem
REM calisir: beyin bayat tavsiyeyi NOTR sayar (yalniz temkin onerisi kaybolur).
title AI KONSEYI (oto-restart)
cd /d "%~dp0mt5-bridge"
:dongu
if exist "STOP_MASTER" (
  echo [KONSEY] STOP_MASTER mevcut; 60 sn sonra tekrar bakilacak.
  timeout /t 60 /nobreak >nul
  goto dongu
)
python ai_council.py
echo [KONSEY] cikti (kod=%errorlevel%); 30 sn sonra yeniden baslatiliyor.
timeout /t 30 /nobreak >nul
goto dongu

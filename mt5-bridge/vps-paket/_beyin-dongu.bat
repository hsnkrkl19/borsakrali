@echo off
chcp 65001 >nul
title MERKEZ HESAP BEYNI (oto-restart)
cd /d "%~dp0mt5-bridge"

:loop
if exist "STOP_MASTER" (
  call :is_risk_stop
  if errorlevel 1 goto :stopped
  echo [%date% %time%] Risk STOP aktif; merkez beyin close-only yeniden baslatiliyor.
)
echo.
echo [%date% %time%] === Merkez hesap beyni baslatiliyor ===
powershell -NoProfile -ExecutionPolicy Bypass -File "brain-start-gate.ps1" -Mode Invalidate >nul 2>nul
python -X utf8 borsakrali_account_brain.py
set "BOT_EXIT=%errorlevel%"
powershell -NoProfile -ExecutionPolicy Bypass -File "brain-start-gate.ps1" -Mode Invalidate >nul 2>nul
if exist "STOP_MASTER" (
  call :is_risk_stop
  if errorlevel 1 goto :stopped
)
echo [%date% %time%] Merkez hesap beyni durdu (kod %BOT_EXIT%). 15 sn sonra yeniden denenecek...
call :wait_or_stop
if errorlevel 1 goto :stopped
goto :loop

:wait_or_stop
for /l %%S in (1,1,15) do (
  if exist "STOP_MASTER" (
    call :is_risk_stop
    if errorlevel 1 exit /b 1
  )
  timeout /t 1 /nobreak >nul
)
exit /b 0

:is_risk_stop
powershell -NoProfile -Command "try{$s=Get-Content -LiteralPath 'STOP_MASTER' -Raw|ConvertFrom-Json;if($s -is [pscustomobject] -and $s.closeOnly -is [bool] -and $s.closeOnly -eq $true -and $s.emergencyFlatten -is [bool] -and $s.emergencyFlatten -eq $true){exit 0}}catch{};exit 1" >nul 2>nul
exit /b %errorlevel%

:stopped
echo [%date% %time%] Manuel STOP_MASTER bulundu; merkez hesap beyni yeniden baslatilmayacak.
exit /b 0

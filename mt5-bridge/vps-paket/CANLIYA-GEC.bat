@echo off
chcp 65001 >nul
title BORSA KRALI - CANLIYA GEC
cd /d "%~dp0"
echo ============================================================
echo   CANLIYA GECIS - dry_run kapatilir, GERCEK EMIR ACILIR
echo ============================================================
if not exist "mt5-bridgeccount_brain_runtime.json" (
  echo [!] Beyin hesap taban cizgisi henuz yok.
  echo     Once BASLAT.bat ile 1-2 dakika calistir, sonra bunu tekrar ac.
  pause
  exit /b 1
)
set /p ONAY=GERCEK EMIRLER ACILACAK. Devam edilsin mi? (E/H):
if /i not "%ONAY%"=="E" (
  echo Iptal edildi.
  pause
  exit /b 0
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$enc=New-Object System.Text.UTF8Encoding($false); foreach($n in 'config_all.json','config.json','config_scanner.json','config_brain.json'){ $p=Join-Path 'mt5-bridge' $n; if(Test-Path $p){ $c=Get-Content $p -Raw -Encoding UTF8 | ConvertFrom-Json; if($null -eq $c.PSObject.Properties['dry_run']){ $c | Add-Member -NotePropertyName dry_run -NotePropertyValue $false } else { $c.dry_run=$false }; [System.IO.File]::WriteAllText($p,($c|ConvertTo-Json -Depth 100)+[System.Environment]::NewLine,$enc); Write-Host ('[OK] '+$n+' dry_run=false') } }"
echo.
echo Motorlar canli config ile yeniden baslatiliyor...
taskkill /f /im python.exe >nul 2>&1
echo TAMAM - watchdog donguleri birkac saniye icinde CANLI modda acacak.
echo Durdurmak icin: DURDUR.bat
pause

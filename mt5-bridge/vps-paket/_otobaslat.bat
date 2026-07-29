@echo off
REM Etkilesimsiz baslatici - BASLAT.bat ve Zamanlanmis Gorev kullanir.
REM HICBIR STOP* dosyasini silmez. Kalici durdurmayi yalniz DEVAM.bat acar.
cd /d "%~dp0"

set "CLOSE_ONLY=0"
if exist "mt5-bridge\STOP_MASTER" (
  powershell -NoProfile -Command "try{$s=Get-Content -LiteralPath 'mt5-bridge\STOP_MASTER' -Raw|ConvertFrom-Json;if($s -is [pscustomobject] -and $s.closeOnly -is [bool] -and $s.closeOnly -eq $true -and $s.emergencyFlatten -is [bool] -and $s.emergencyFlatten -eq $true){exit 0}}catch{};exit 1" >nul 2>nul
  if errorlevel 1 (
    echo [DURDU] Manuel STOP_MASTER mevcut; hicbir servis baslatilmadi.
    exit /b 2
  )
  set "CLOSE_ONLY=1"
  echo [ACIL] Risk STOP mevcut; yalniz merkez beyin close-only baslatilacak.
)

REM Merkez hesap beyni diger emir motorlarindan once ayaga kalkmalidir.
if not exist "mt5-bridge\borsakrali_account_brain.py" (
  echo [HATA] mt5-bridge\borsakrali_account_brain.py yok; guvenli baslatma reddedildi.
  exit /b 5
)
if not exist "mt5-bridge\config_brain.json" (
  echo [HATA] mt5-bridge\config_brain.json yok; guvenli baslatma reddedildi.
  exit /b 5
)
powershell -NoProfile -ExecutionPolicy Bypass -File "mt5-bridge\brain-start-gate.ps1" -Mode Invalidate >nul 2>nul
set "GATE_PREP=%errorlevel%"
tasklist /v /fi "imagename eq cmd.exe" 2>nul | find /i "MERKEZ HESAP BEYNI (oto-restart)" >nul
if errorlevel 1 start "" "%~dp0_beyin-dongu.bat"
if not "%GATE_PREP%"=="0" (
  echo [HATA] Merkez beyin config/startup kapisi gecersiz; entry servisleri acilmadi.
  exit /b 6
)
if "%CLOSE_ONLY%"=="1" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "mt5-bridge\brain-start-gate.ps1" -Mode Wait -CloseOnly -TimeoutSeconds 45
  if errorlevel 1 exit /b 7
  exit /b 0
)
powershell -NoProfile -ExecutionPolicy Bypass -File "mt5-bridge\brain-start-gate.ps1" -Mode Wait -TimeoutSeconds 45
if errorlevel 1 (
  echo [HATA] Merkez beyin yeni ve saglikli heartbeat uretmedi; entry servisleri acilmadi.
  exit /b 7
)
if exist "mt5-bridge\STOP_MASTER" exit /b 2

REM Zaten calisan watchdog pencerelerini tekrar acma (cift baslatmayi onle).
if not exist "mt5-bridge\STOP_ALL" (
  tasklist /v /fi "imagename eq cmd.exe" 2>nul | find /i "BIRLESIK KOPRU (oto-restart)" >nul
  if errorlevel 1 start "" "%~dp0_kopru-dongu.bat"
)

REM FOREX KOPRUSU (magic 550055) - forex-signals botunun tek yurutme yolu.
if exist "mt5-bridge\config.json" if not exist "mt5-bridge\STOP" (
  tasklist /v /fi "imagename eq cmd.exe" 2>nul | find /i "FOREX KOPRUSU 550055" >nul
  if errorlevel 1 start "" "%~dp0_forex-dongu.bat"
)

REM GUN-ICI TARAYICI (magic 550066).
if exist "mt5-bridge\config_scanner.json" if not exist "mt5-bridge\STOP" if not exist "mt5-bridge\STOP_SCANNER" (
  tasklist /v /fi "imagename eq cmd.exe" 2>nul | find /i "GUN-ICI TARAYICI 550066" >nul
  if errorlevel 1 start "" "%~dp0_tarayici-dongu.bat"
)

if exist "altin-botu\main.py" if not exist "altin-botu\STOP" (
  tasklist /v /fi "imagename eq cmd.exe" 2>nul | find /i "ALTIN BOTU (oto-restart)" >nul
  if errorlevel 1 start "" "%~dp0_altin-dongu.bat"
)

REM Render'i uyanik tut (emir acmaz, ama master STOP'ta o da kapanir).
tasklist /v /fi "imagename eq cmd.exe" 2>nul | find /i "Render uyanik tut" >nul
if errorlevel 1 start "" "%~dp0_uyanik-tut.bat"

exit /b 0

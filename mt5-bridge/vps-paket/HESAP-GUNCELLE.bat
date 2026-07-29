@echo off
chcp 65001 >nul
title BORSA KRALI - CONFIG DUZELT (hesap + terminal + token)
cd /d "%~dp0"
echo ============================================================
echo    CONFIG DUZELT
echo ============================================================
echo  Uc seyi birden duzeltir:
echo    1) allowed_account  - hesap degistiyse kopru "HESAP KILIDI" deyip kapanir
echo    2) terminal_path    - yol yanlissa "IPC initialize failed" verir
echo    3) exec_token       - bossa feed'de "401 Unauthorized" alir
echo ============================================================
echo.

python -X utf8 "mt5-bridge\hesap_guncelle.py"
if errorlevel 3 goto :TOKENSOR
if errorlevel 1 goto :HESAPSOR
goto :BITTI

:HESAPSOR
echo.
echo ============================================================
echo   MT5'ten hesap okunamadi - numarayi ELLE gir.
echo   (MT5 terminali acik + giris yapilmis olmali)
echo ============================================================
echo.
set "HESAP="
set /p HESAP="Hesap numarasi (yalniz rakam): "
if "%HESAP%"=="" goto :BITTI
python -X utf8 "mt5-bridge\hesap_guncelle.py" %HESAP%
if errorlevel 3 goto :TOKENSOR
goto :BITTI

:TOKENSOR
echo.
echo ============================================================
echo   TOKEN EKSIK
echo ------------------------------------------------------------
echo   Gercek token BAT/ZIP/komut satirina yazilmaz.
echo   BK_EXEC_TOKEN kullanici ortam degiskenini ayarla, yeni pencere ac,
echo   sonra bu araci yeniden calistir. Alternatif: yalniz git-disindaki
echo   mt5-bridge\config*.json dosyalarina elle yaz.
echo ============================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "mt5-bridge\configure-secrets.ps1" -BridgeDir "mt5-bridge" -RequireToken
if errorlevel 1 echo Token hazir degil; guvenli sekilde fail-closed kaldi.

:BITTI
echo.
REM hesap_guncelle.py kopru configlerini gunceller; merkez beyin kilidini de
REM config_all.json'dan senkronla (token ve risk alanlarina dokunma).
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$sp='mt5-bridge\config_all.json';$tp='mt5-bridge\config_brain.json';" ^
  "if((Test-Path -LiteralPath $sp) -and (Test-Path -LiteralPath $tp)){" ^
  "$s=Get-Content -LiteralPath $sp -Raw|ConvertFrom-Json;$t=Get-Content -LiteralPath $tp -Raw|ConvertFrom-Json;" ^
  "foreach($p in @('allowed_account','terminal_path','backend_url')){if($t.PSObject.Properties[$p]){$t.$p=$s.$p}else{$t|Add-Member -NotePropertyName $p -NotePropertyValue $s.$p}};" ^
  "[IO.File]::WriteAllText((Resolve-Path $tp),(($t|ConvertTo-Json -Depth 100)+[Environment]::NewLine),(New-Object Text.UTF8Encoding($false))) }"
echo.
echo ------------------------------------------------------------
echo Son durum:
python -X utf8 "mt5-bridge\hesap_guncelle.py" --kontrol
echo ------------------------------------------------------------
echo Her sey VAR/dogru ise: DURDUR.bat, ardindan explicit DEVAM.bat
echo ------------------------------------------------------------
pause

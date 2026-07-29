@echo off
chcp 65001 >nul
title BORSA KRALI - TESHIS
cd /d "%~dp0"
set "RAPOR=%~dp0teshis.txt"
echo ============================================================
echo    TESHIS - neden calismiyor?
echo ============================================================
echo Rapor yaziliyor: %RAPOR%
echo.

> "%RAPOR%" echo ===== BORSA KRALI TESHIS =====
>> "%RAPOR%" echo Tarih: %date% %time%
>> "%RAPOR%" echo.

>> "%RAPOR%" echo --- PYTHON ---
where python >> "%RAPOR%" 2>&1
python -V >> "%RAPOR%" 2>&1
>> "%RAPOR%" echo.

>> "%RAPOR%" echo --- MetaTrader5 paketi ---
python -c "import MetaTrader5; print('MetaTrader5 paketi KURULU')" >> "%RAPOR%" 2>&1
>> "%RAPOR%" echo.

>> "%RAPOR%" echo --- DOSYALAR ---
for %%F in (borsakrali_account_brain.py borsakrali_mt5_all.py borsakrali_mt5.py borsakrali_mt5_scanner.py trade_guard.py config_brain.json config_all.json config.json config_scanner.json) do (
  if exist "mt5-bridge\%%F" (>> "%RAPOR%" echo   [VAR] %%F) else (>> "%RAPOR%" echo   [YOK] %%F)
)
if exist "mt5-bridge\STOP_MASTER"  >> "%RAPOR%" echo   [!!] STOP_MASTER VAR - TUM SERVISLER KALICI DURDU
if exist "mt5-bridge\STOP_ALL"     >> "%RAPOR%" echo   [!!] STOP_ALL VAR - birlesik kopru yeni emir ACMAZ
if exist "mt5-bridge\STOP"         >> "%RAPOR%" echo   [!!] STOP VAR - forex koprusu yeni emir ACMAZ
if exist "mt5-bridge\STOP_SCANNER" >> "%RAPOR%" echo   [!!] STOP_SCANNER VAR - tarayici yeni emir ACMAZ
>> "%RAPOR%" echo.

>> "%RAPOR%" echo --- HESAP / CONFIG DURUMU ---
python -X utf8 "mt5-bridge\hesap_guncelle.py" --kontrol >> "%RAPOR%" 2>&1
>> "%RAPOR%" echo.

>> "%RAPOR%" echo --- CALISAN PENCERELER ---
tasklist /v /fi "imagename eq cmd.exe" /fo table >> "%RAPOR%" 2>&1
>> "%RAPOR%" echo.
>> "%RAPOR%" echo --- CALISAN PYTHON ---
REM Komut satirlari token/secret icerebilir; rapora yalniz PID ve proses adi yazilir.
powershell -NoProfile -Command "Get-Process -Name python -ErrorAction SilentlyContinue ^| Select-Object Id,ProcessName ^| Format-Table -AutoSize" >> "%RAPOR%" 2>&1
>> "%RAPOR%" echo.

>> "%RAPOR%" echo --- LOG SON SATIRLARI ---
for %%L in (bridge_all.log bridge.log scanner_bridge.log) do (
  >> "%RAPOR%" echo.
  >> "%RAPOR%" echo === %%L ===
  if exist "mt5-bridge\%%L" (
    powershell -NoProfile -Command "Get-Content 'mt5-bridge\%%L' -Tail 25" >> "%RAPOR%" 2>&1
  ) else (
    >> "%RAPOR%" echo   ^(log yok - kopru hic calismamis olabilir^)
  )
)

echo.
echo ============================================================
echo  BITTI. Rapor: teshis.txt
echo  Bu dosyayi acip icerigini bize gonder.
echo ============================================================
echo.
notepad "%RAPOR%"

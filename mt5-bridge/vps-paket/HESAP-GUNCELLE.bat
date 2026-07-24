@echo off
chcp 65001 >nul
title BORSA KRALI - HESAP NUMARASI GUNCELLE
cd /d "%~dp0"
echo ============================================================
echo    HESAP NUMARASI GUNCELLE
echo ============================================================
echo.
echo Hesabin degistiyse kopruler eski numaraya kilitli kalir ve
echo acilista "HESAP KILIDI" deyip KAPANIR - hicbir islem acmazlar.
echo Bu arac 3 config'in de hesap numarasini duzeltir.
echo.
echo Once MT5'ten OTOMATIK okumayi denerim...
echo.

python -X utf8 "mt5-bridge\hesap_guncelle.py"
if not errorlevel 1 goto :BITTI

echo.
echo ============================================================
echo   MT5'ten okunamadi - numarayi ELLE gir.
echo   (MT5 terminalinde sag ust / Hesaplar bolumunde yazar)
echo ============================================================
echo.
set "HESAP="
set /p HESAP="Yeni hesap numarasi (yalniz rakam): "
if "%HESAP%"=="" (
  echo Numara girilmedi - islem iptal.
  goto :BITTI
)
echo.
python -X utf8 "mt5-bridge\hesap_guncelle.py" %HESAP%

:BITTI
echo.
echo ------------------------------------------------------------
echo Bittiyse:  DURDUR.bat  sonra  BASLAT.bat
echo ------------------------------------------------------------
pause

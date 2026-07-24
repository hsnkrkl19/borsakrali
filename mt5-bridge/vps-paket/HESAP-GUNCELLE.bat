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
echo   Token = borsakrali backend'indeki  FOREX_EXEC_TOKEN  degeri.
echo   Nereden bulursun:
echo     - Render panel ^> borsakrali servisi ^> Environment
echo     - VEYA kendi bilgisayarinda:
echo       Desktop\site\borsasanati-clone\mt5-bridge\config.json
echo       dosyasini Not Defteri ile ac, "exec_token" satirindaki
echo       tirnak icindeki degeri kopyala.
echo   RDP penceresine yapistirmak: sag tik veya Ctrl+V
echo ============================================================
echo.
set "TOKEN="
set /p TOKEN="exec_token: "
if "%TOKEN%"=="" (
  echo Token girilmedi - config'ler token'siz kaldi, kopruler 401 alacak.
  goto :BITTI
)
python -X utf8 "mt5-bridge\hesap_guncelle.py" --token=%TOKEN%

:BITTI
echo.
echo ------------------------------------------------------------
echo Son durum:
python -X utf8 "mt5-bridge\hesap_guncelle.py" --kontrol
echo ------------------------------------------------------------
echo Her sey VAR/dogru ise:  DURDUR.bat  sonra  BASLAT.bat
echo ------------------------------------------------------------
pause

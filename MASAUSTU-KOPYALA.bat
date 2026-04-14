@echo off
:: BORSA KRALI - Masaustu Kisayol Olusturucu
:: Bu dosyayı bir kez çalıştırın, masaüstüne kısayol oluşturur.

setlocal
set "PROJECT_DIR=%~dp0"
set "BAT_FILE=%~dp0BASLAT.bat"

:: Masaüstü yolunu bul
for /f "tokens=*" %%a in ('powershell -command "[Environment]::GetFolderPath(\"Desktop\")"') do set "DESKTOP=%%a"

echo.
echo Masaustu kisayolu olusturuluyor...

:: PowerShell ile kısayol oluştur
powershell -command ^
  "$WshShell = New-Object -comObject WScript.Shell;" ^
  "$Shortcut = $WshShell.CreateShortcut('%DESKTOP%\Borsa Krali.lnk');" ^
  "$Shortcut.TargetPath = '%BAT_FILE%';" ^
  "$Shortcut.WorkingDirectory = '%PROJECT_DIR%';" ^
  "$Shortcut.WindowStyle = 1;" ^
  "$Shortcut.Description = 'Borsa Krali - All-in-One Launcher';" ^
  "$Shortcut.Save();"

echo.
echo Masaustu'nde "Borsa Krali" kisayolu olusturuldu!
echo Artik her seferinde bu dosyaya cift tiklayin.
echo.
pause

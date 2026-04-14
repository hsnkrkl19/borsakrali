# BORSA KRALI — EXE Derleyici
# Bu script'i çalıştırın: PowerShell'de sağ tık → "PowerShell ile Çalıştır"
# launcher.js'yi Windows EXE'ye dönüştürür ve masaüstüne kopyalar

$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$LauncherJs = Join-Path $ProjectDir "launcher.js"
$DesktopPath = [Environment]::GetFolderPath("Desktop")
$ExeName = "BorsaKrali.exe"
$ExePath = Join-Path $DesktopPath $ExeName

Write-Host ""
Write-Host "==========================================" -ForegroundColor Yellow
Write-Host "  BORSA KRALI — EXE Olusturucu" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Yellow
Write-Host ""

# Execution Policy kontrolü
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process -Force -ErrorAction SilentlyContinue

# Node.js kontrol
$nodeVersion = & node --version 2>$null
if (-not $nodeVersion) {
    Write-Host "HATA: Node.js bulunamadi!" -ForegroundColor Red
    Write-Host "Lutfen https://nodejs.org adresinden indirin." -ForegroundColor Red
    Read-Host "Cikis icin Enter"
    exit 1
}
Write-Host "Node.js: $nodeVersion" -ForegroundColor Cyan

# pkg yuklu mu kontrol
$pkgPath = & where.exe pkg 2>$null
if (-not $pkgPath) {
    Write-Host "pkg aracı bulunamadı, yükleniyor..." -ForegroundColor Yellow
    & npm install -g pkg 2>$null
    $pkgPath = & where.exe pkg 2>$null
}

if ($pkgPath) {
    Write-Host "pkg bulundu, EXE derleniyor..." -ForegroundColor Green
    Write-Host "Bu işlem 2-5 dakika sürebilir..." -ForegroundColor Yellow

    # package.json'a pkg config ekle
    $pkgJson = @{
        name = "borsakrali-launcher"
        version = "4.0.0"
        bin = "launcher.js"
        pkg = @{
            targets = @("node18-win-x64")
            outputPath = "dist"
        }
    } | ConvertTo-Json -Depth 5

    $tempPkg = Join-Path $ProjectDir "launcher-pkg.json"
    $pkgJson | Out-File -FilePath $tempPkg -Encoding utf8

    # Derle
    & pkg $LauncherJs --target node18-win-x64 --output $ExePath

    Remove-Item $tempPkg -ErrorAction SilentlyContinue

    if (Test-Path $ExePath) {
        Write-Host ""
        Write-Host "EXE basarıyla olusturuldu!" -ForegroundColor Green
        Write-Host "Konum: $ExePath" -ForegroundColor Cyan
    } else {
        Write-Host "EXE olusturulamadi, alternatif yontem deneniyor..." -ForegroundColor Yellow
        # Alternatif: .bat'tan EXE yap
        Create-BatchExe $ProjectDir $DesktopPath
    }
} else {
    Write-Host "pkg yuklenemedi, .bat launcher masaustu'ne kopyalaniyor..." -ForegroundColor Yellow
    # BAT dosyasını masaüstüne kopyala
    $BatSource = Join-Path $ProjectDir "BASLAT.bat"
    $BatDest = Join-Path $DesktopPath "BorsaKrali-Baslat.bat"
    Copy-Item $BatSource $BatDest -Force

    # Masaüstüne kısayol oluştur
    $WshShell = New-Object -comObject WScript.Shell
    $Shortcut = $WshShell.CreateShortcut((Join-Path $DesktopPath "Borsa Krali.lnk"))
    $Shortcut.TargetPath = $BatDest
    $Shortcut.WorkingDirectory = $ProjectDir
    $Shortcut.Description = "Borsa Krali - Tum Servisler"
    $Shortcut.Save()

    Write-Host ""
    Write-Host "Masaustu'ne kisayol olusturuldu!" -ForegroundColor Green
    Write-Host "BASLAT.bat masaustu'ne kopyalandi." -ForegroundColor Cyan
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Yellow
Write-Host "  TAMAMLANDI!" -ForegroundColor Green
Write-Host "  Masaustu'ndeki Borsa Krali'ye cift tiklayin." -ForegroundColor White
Write-Host "==========================================" -ForegroundColor Yellow
Write-Host ""
Read-Host "Devam etmek icin Enter'a basin"

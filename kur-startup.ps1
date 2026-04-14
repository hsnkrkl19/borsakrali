$ProjectRoot = $PSScriptRoot
$StartupFolder = [Environment]::GetFolderPath('Startup')
$AutostartScript = Join-Path $ProjectRoot 'scripts\autostart-background.ps1'
$VbsPath = Join-Path $StartupFolder 'BorsaKrali-Autostart.vbs'
$LegacyVbsPath = Join-Path $StartupFolder 'BorsaKrali-Backend.vbs'

if (-not (Test-Path $AutostartScript)) {
    Write-Host "HATA: Autostart script bulunamadi: $AutostartScript" -ForegroundColor Red
    exit 1
}

$escapedScript = $AutostartScript.Replace('"', '""')
$vbsContent = @"
Dim shell
Set shell = CreateObject("WScript.Shell")
shell.Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""$escapedScript""", 0, False
Set shell = Nothing
"@

Remove-Item $LegacyVbsPath -Force -ErrorAction SilentlyContinue
$vbsContent | Out-File -FilePath $VbsPath -Encoding ASCII -Force

Write-Host "BASARILI: Startup kaydi olusturuldu." -ForegroundColor Green
Write-Host "Dosya: $VbsPath" -ForegroundColor Green
Write-Host "Borsa Krali artik Windows oturumu acildiginda arka planda otomatik baslayacak." -ForegroundColor Green
Write-Host ""
Write-Host "Script hemen bir kez de calistiriliyor..." -ForegroundColor Yellow

powershell -NoProfile -ExecutionPolicy Bypass -File $AutostartScript

Write-Host "Tamamlandi." -ForegroundColor Green

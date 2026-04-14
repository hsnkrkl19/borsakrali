# Borsa Krali Backend - Otomatik Baslama Kurulumu
# Bu scripti yonetici olarak calistirin

$TaskName = "BorsaKrali-Backend"
$BackendPath = "$PSScriptRoot\backend\start-backend.bat"
$NodePath = (Get-Command node -ErrorAction SilentlyContinue).Source

if (-not $NodePath) {
    Write-Host "HATA: Node.js bulunamadi!" -ForegroundColor Red
    exit 1
}

Write-Host "Backend yolu: $BackendPath"
Write-Host "Node yolu: $NodePath"

# Varsa eski gorevi sil
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

# Gorevi olustur
$Action = New-ScheduledTaskAction `
    -Execute $NodePath `
    -Argument "src/server-live.js" `
    -WorkingDirectory "$PSScriptRoot\backend"

$Trigger = New-ScheduledTaskTrigger -AtLogOn

$Settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit 0 `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -StartWhenAvailable

$Principal = New-ScheduledTaskPrincipal `
    -UserId $env:USERNAME `
    -RunLevel Highest

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Principal $Principal `
    -Force

Write-Host ""
Write-Host "BASARILI! '$TaskName' gorevi olusturuldu." -ForegroundColor Green
Write-Host "Backend artik Windows baslarken otomatik calisacak." -ForegroundColor Green
Write-Host ""
Write-Host "Simdi baslat:" -ForegroundColor Yellow
Start-ScheduledTask -TaskName $TaskName
Write-Host "Backend baslatildi (port 5000)" -ForegroundColor Green

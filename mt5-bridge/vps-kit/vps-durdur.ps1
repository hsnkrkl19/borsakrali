# BORSA KRALI - VPS kalici durdurucu.
# STOP_MASTER reboot ve zamanlanmis gorev sonrasinda da kapali kalir.
$ErrorActionPreference = "Stop"
$KIT_DIR = $PSScriptRoot
$BRIDGE_DIR = Split-Path $KIT_DIR -Parent
$goldCandidates = @(
    "$env:USERPROFILE\Desktop\gold-structure-bot",
    "C:\gold-structure-bot",
    (Join-Path (Split-Path (Split-Path $BRIDGE_DIR -Parent) -Parent) "gold-structure-bot")
)
$GOLD_DIR = $goldCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Container } | Select-Object -First 1

Write-Host "=== BORSA KRALI VPS KALICI DURDURUCU ===" -ForegroundColor Cyan
$stamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ss"
foreach ($name in @("STOP_MASTER", "STOP_ALL", "STOP", "STOP_SCANNER", "STOP_PNL")) {
    $path = Join-Path $BRIDGE_DIR $name
    [System.IO.File]::WriteAllText($path, "$name $stamp`r`n", [System.Text.Encoding]::ASCII)
}
if ($GOLD_DIR) {
    $goldStop = Join-Path $GOLD_DIR "STOP"
    [System.IO.File]::WriteAllText($goldStop, "STOP $stamp`r`n", [System.Text.Encoding]::ASCII)
}
Write-Host "STOP_MASTER ve alt STOP dosyalari yazildi." -ForegroundColor Yellow
Start-Sleep -Seconds 2

$bridgePrefix = [regex]::Escape($BRIDGE_DIR)
$bridgePattern = $bridgePrefix + '.*(watchdog_brain|watchdog_all|watchdog_forex|watchdog_scanner|watchdog_gold|run_pnl)'
$uniqueScriptPattern = '(?i)(borsakrali_account_brain|borsakrali_mt5_all|borsakrali_mt5_scanner|borsakrali_mt5|mt5_hesap_rapor)\.py'
$procs = Get-CimInstance Win32_Process -Filter "Name='python.exe' or Name='powershell.exe' or Name='cmd.exe'" -ErrorAction SilentlyContinue |
         Where-Object { $_.CommandLine -match $bridgePattern -or $_.CommandLine -match $uniqueScriptPattern }
foreach ($process in $procs) {
    Write-Host "kapatiliyor PID $($process.ProcessId): $($process.Name)" -ForegroundColor DarkGray
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}

# Gold watchdog STOP'u gorup yalniz kendi takip ettigi cocuk Python prosesini kapatir.

Write-Host "=== Kalici olarak durduruldu. Startup STOP dosyalarini silmez. ===" -ForegroundColor Cyan
Write-Host "Yeniden baslatmak icin yalniz vps-devam.ps1 kullan." -ForegroundColor Yellow
Write-Host "Acik MT5 pozisyonlari kapanmaz; broker SL/TP seviyelerini kontrol et." -ForegroundColor Gray
exit 0

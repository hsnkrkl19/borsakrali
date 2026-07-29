# Borsa Krali gun-ici tarayici koprusu bekcisi.
# STOP_MASTER, STOP veya STOP_SCANNER gorulurse kalici olarak cikar.
$host.UI.RawUI.WindowTitle = "BK-Bekci-GunIci (550066)"
Set-Location $PSScriptRoot

$logPath = Join-Path $PSScriptRoot "watchdog_scanner.log"
$stopFiles = @(
    (Join-Path $PSScriptRoot "STOP_MASTER"),
    (Join-Path $PSScriptRoot "STOP"),
    (Join-Path $PSScriptRoot "STOP_SCANNER")
)

function Test-StopRequested {
    foreach ($path in $stopFiles) {
        if (Test-Path -LiteralPath $path -PathType Leaf) { return $true }
    }
    return $false
}

function Wait-OrStop([int]$Seconds) {
    for ($i = 0; $i -lt $Seconds; $i++) {
        if (Test-StopRequested) { return $true }
        Start-Sleep -Seconds 1
    }
    return $false
}

if (Test-StopRequested) {
    Add-Content $logPath "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') STOP bulundu - bekci baslatilmadi"
    exit 0
}

$zaten = Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
         Where-Object { $_.CommandLine -match 'borsakrali_mt5_scanner\.py' }
if ($zaten) {
    Add-Content $logPath "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') zaten calisiyor - bekci cikti"
    exit 0
}

$MT5_EXE = "C:\Program Files\MetaTrader 5\terminal64.exe"
while (-not (Test-StopRequested)) {
    if (-not (Get-Process terminal64 -ErrorAction SilentlyContinue) -and (Test-Path -LiteralPath $MT5_EXE)) {
        Add-Content $logPath "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') MT5 terminali kapali - baslatiliyor"
        Start-Process -FilePath $MT5_EXE
        if (Wait-OrStop 30) { break }
    }

    if (Test-StopRequested) { break }
    Add-Content $logPath "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') bot baslatiliyor"
    & python -X utf8 borsakrali_mt5_scanner.py
    $botExit = $LASTEXITCODE
    if (Test-StopRequested) { break }
    Add-Content $logPath "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') bot cikti (exit=$botExit) - 60 sn sonra yeniden"
    if (Wait-OrStop 60) { break }
}

Add-Content $logPath "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') STOP bulundu - yeniden baslatma kapali"
exit 0

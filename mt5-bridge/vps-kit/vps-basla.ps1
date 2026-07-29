# BORSA KRALI - VPS guvenli baslatici.
# STOP_MASTER kalicidir; bu script hicbir STOP dosyasini silmez.
$ErrorActionPreference = "Stop"
$KIT_DIR = $PSScriptRoot
$BRIDGE_DIR = Split-Path $KIT_DIR -Parent
$STOP_MASTER = Join-Path $BRIDGE_DIR "STOP_MASTER"
$closeOnly = $false

Write-Host "=== BORSA KRALI VPS GUVENLI BASLATICI ===" -ForegroundColor Cyan

if (Test-Path -LiteralPath $STOP_MASTER -PathType Leaf) {
    try {
        $stopState = Get-Content -LiteralPath $STOP_MASTER -Raw | ConvertFrom-Json
        $closeOnly = ($stopState -is [pscustomobject] -and
            $stopState.closeOnly -is [bool] -and $stopState.closeOnly -eq $true -and
            $stopState.emergencyFlatten -is [bool] -and $stopState.emergencyFlatten -eq $true)
    } catch { $closeOnly = $false }
    if (-not $closeOnly) {
        Write-Host "[DURDU] Manuel STOP_MASTER mevcut. Hicbir bot baslatilmadi." -ForegroundColor Yellow
        Write-Host "Devam etmek icin vps-devam.ps1 kullan; vps-basla.ps1 STOP dosyasi silmez." -ForegroundColor Yellow
        exit 2
    }
    Write-Host "[ACIL] Risk STOP mevcut; yalniz close-only merkez beyin baslatilacak." -ForegroundColor Red
}

# Token BAT/komut satirina girmez. Env varsa git-disindaki yerel config'lere
# aktarilir; yoksa mevcut yerel config tokeni, degeri gosterilmeden kullanilir.
$secretHelper = Join-Path $BRIDGE_DIR "configure-secrets.ps1"
if (-not $closeOnly -and -not (Test-Path -LiteralPath $secretHelper -PathType Leaf)) {
    Write-Host "[HATA] configure-secrets.ps1 yok; guvenli baslatma reddedildi." -ForegroundColor Red
    exit 3
}
if (-not $closeOnly) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $secretHelper -BridgeDir $BRIDGE_DIR -RequireToken
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$brainScript = Join-Path $BRIDGE_DIR "borsakrali_account_brain.py"
$brainConfig = Join-Path $BRIDGE_DIR "config_brain.json"
$brainWatchdog = Join-Path $BRIDGE_DIR "watchdog_brain.ps1"
foreach ($required in @($brainScript, $brainConfig, $brainWatchdog)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
        Write-Host "[HATA] Merkez hesap beyni bileseni eksik: $required" -ForegroundColor Red
        Write-Host "Risk beyni olmadan emir motorlari baslatilmadi." -ForegroundColor Red
        exit 5
    }
}

$goldCands = @(
    "$env:USERPROFILE\Desktop\gold-structure-bot",
    "C:\gold-structure-bot",
    (Join-Path (Split-Path (Split-Path $BRIDGE_DIR -Parent) -Parent) "gold-structure-bot")
)
$GOLD_DIR = $goldCands | Where-Object {
    (Test-Path -LiteralPath (Join-Path $_ "main.py") -PathType Leaf) -or
    (Test-Path -LiteralPath (Join-Path $_ "live.py") -PathType Leaf)
} | Select-Object -First 1

$detFile = Join-Path $KIT_DIR "detected_terminal.txt"
if (Test-Path -LiteralPath $detFile -PathType Leaf) {
    $FTMO_TERMINAL = (Get-Content -LiteralPath $detFile -Raw).Trim()
} elseif ($env:GSB_MT5_TERMINAL) {
    $FTMO_TERMINAL = $env:GSB_MT5_TERMINAL
} else {
    $FTMO_TERMINAL = "C:\Program Files\FTMO MetaTrader 5\terminal64.exe"
}

if (-not (Test-Path -LiteralPath $FTMO_TERMINAL -PathType Leaf)) {
    Write-Host "[HATA] MT5 terminali bulunamadi: $FTMO_TERMINAL" -ForegroundColor Red
    Write-Host "Once vps-kur.ps1 calistir veya GSB_MT5_TERMINAL yolunu duzelt." -ForegroundColor Yellow
    exit 4
}
$env:GSB_MT5_TERMINAL = $FTMO_TERMINAL

# Merkez hesap beyni her zaman emir motorlarindan once baslar.
Write-Host "-> Merkez hesap beyni baslatiliyor" -ForegroundColor Green
$brainArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$brainWatchdog`""
Start-Process -FilePath "powershell.exe" -ArgumentList $brainArgs -WindowStyle Normal
Start-Sleep -Seconds 3
if ($closeOnly) {
    Write-Host "[ACIL] Entry botlari baslatilmadi; merkez beyin residual pozisyonlari izliyor." -ForegroundColor Red
    exit 0
}
if (Test-Path -LiteralPath $STOP_MASTER -PathType Leaf) { exit 2 }

$allStop = Join-Path $BRIDGE_DIR "STOP_ALL"
$allWatchdog = Join-Path $BRIDGE_DIR "watchdog_all.ps1"
if (Test-Path -LiteralPath $allStop -PathType Leaf) {
    Write-Host "[ATLA] STOP_ALL mevcut; birlesik kopru baslatilmadi." -ForegroundColor Yellow
} elseif (Test-Path -LiteralPath $allWatchdog -PathType Leaf) {
    Write-Host "-> Birlesik MT5 koprusu baslatiliyor" -ForegroundColor Green
    $allArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$allWatchdog`""
    Start-Process -FilePath "powershell.exe" -ArgumentList $allArgs -WindowStyle Normal
}

if ($GOLD_DIR) {
    $goldStop = Join-Path $GOLD_DIR "STOP"
    $goldWatchdog = Join-Path $BRIDGE_DIR "watchdog_gold.ps1"
    if (Test-Path -LiteralPath $goldStop -PathType Leaf) {
        Write-Host "[ATLA] Gold STOP mevcut." -ForegroundColor Yellow
    } elseif (Test-Path -LiteralPath $goldWatchdog -PathType Leaf) {
        Write-Host "-> Gold bot guvenli watchdog ile baslatiliyor" -ForegroundColor Green
        $goldArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$goldWatchdog`" -GoldDir `"$GOLD_DIR`""
        Start-Process -FilePath "powershell.exe" -ArgumentList $goldArgs -WindowStyle Normal
    }
}

$bridgeStop = Join-Path $BRIDGE_DIR "STOP"
$scannerStop = Join-Path $BRIDGE_DIR "STOP_SCANNER"
$pnlStop = Join-Path $BRIDGE_DIR "STOP_PNL"

if (Test-Path -LiteralPath $bridgeStop -PathType Leaf) {
    Write-Host "[ATLA] Kopru STOP mevcut; forex ve tarayici baslatilmadi." -ForegroundColor Yellow
} else {
    $forexWatchdog = Join-Path $BRIDGE_DIR "watchdog_forex.ps1"
    if (Test-Path -LiteralPath $forexWatchdog -PathType Leaf) {
        Write-Host "-> Forex koprusu (550055) baslatiliyor" -ForegroundColor Green
        $forexArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$forexWatchdog`""
        Start-Process -FilePath "powershell.exe" -ArgumentList $forexArgs -WindowStyle Normal
    }

    $scannerWatchdog = Join-Path $BRIDGE_DIR "watchdog_scanner.ps1"
    if (Test-Path -LiteralPath $scannerStop -PathType Leaf) {
        Write-Host "[ATLA] STOP_SCANNER mevcut." -ForegroundColor Yellow
    } elseif (Test-Path -LiteralPath $scannerWatchdog -PathType Leaf) {
        Write-Host "-> Gun-ici koprusu (550066) baslatiliyor" -ForegroundColor Green
        $scannerArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$scannerWatchdog`""
        Start-Process -FilePath "powershell.exe" -ArgumentList $scannerArgs -WindowStyle Normal
    }
}

$runPnl = Join-Path $BRIDGE_DIR "run_pnl.bat"
if (-not (Test-Path -LiteralPath $bridgeStop -PathType Leaf) -and
    -not (Test-Path -LiteralPath $pnlStop -PathType Leaf) -and
    (Test-Path -LiteralPath $runPnl -PathType Leaf)) {
    Write-Host "-> Gercek P/L raporlayici baslatiliyor" -ForegroundColor Green
    Start-Process -FilePath $runPnl -WorkingDirectory $BRIDGE_DIR -WindowStyle Normal
}

Write-Host "=== Guvenli servisler baslatildi; STOP_MASTER kalici kill-switch'tir. ===" -ForegroundColor Cyan
Write-Host "Durdur: vps-durdur.ps1 | Devam: vps-devam.ps1" -ForegroundColor Yellow
exit 0

# Borsa Krali merkez hesap beyni bekcisi.
# Manuel STOP_MASTER'da cikar. Risk JSON STOP'ta yalniz kapatma beynini
# yeniden baslatir; STOP dosyasini asla silmez.
$host.UI.RawUI.WindowTitle = "BK-Bekci-Merkez-Hesap-Beyni"
Set-Location $PSScriptRoot

$logPath = Join-Path $PSScriptRoot "watchdog_brain.log"
$stopMaster = Join-Path $PSScriptRoot "STOP_MASTER"
$brainScript = Join-Path $PSScriptRoot "borsakrali_account_brain.py"
$brainConfig = Join-Path $PSScriptRoot "config_brain.json"
$startGate = Join-Path $PSScriptRoot "brain-start-gate.ps1"

function Get-StopMode {
    if (-not (Test-Path -LiteralPath $stopMaster -PathType Leaf)) { return "none" }
    try {
        $state = Get-Content -LiteralPath $stopMaster -Raw | ConvertFrom-Json
        if ($state -is [pscustomobject] -and
            $state.closeOnly -is [bool] -and $state.closeOnly -eq $true -and
            $state.emergencyFlatten -is [bool] -and $state.emergencyFlatten -eq $true) {
            return "close-only"
        }
    } catch { }
    return "manual"
}

if ((Get-StopMode) -eq "manual") {
    Add-Content $logPath "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') manuel STOP_MASTER bulundu - bekci baslatilmadi"
    exit 0
}
if (-not (Test-Path -LiteralPath $brainScript -PathType Leaf) -or
    -not (Test-Path -LiteralPath $brainConfig -PathType Leaf)) {
    Add-Content $logPath "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') beyin script/config eksik - guvenli cikis"
    exit 5
}

$zaten = Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
         Where-Object { $_.CommandLine -match 'borsakrali_account_brain\.py' }
if ($zaten) {
    Add-Content $logPath "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') zaten calisiyor - bekci cikti"
    exit 0
}

while ((Get-StopMode) -ne "manual") {
    $mode = Get-StopMode
    if ($mode -eq "close-only") {
        Add-Content $logPath "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') risk STOP - close-only beyin baslatiliyor"
    }
    Add-Content $logPath "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') merkez hesap beyni baslatiliyor"
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $startGate -Mode Invalidate *> $null
    & python -X utf8 borsakrali_account_brain.py
    $botExit = $LASTEXITCODE
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $startGate -Mode Invalidate *> $null
    if ((Get-StopMode) -eq "manual") { break }
    Add-Content $logPath "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') beyin cikti (exit=$botExit) - 15 sn sonra yeniden"
    for ($i = 0; $i -lt 15; $i++) {
        if ((Get-StopMode) -eq "manual") { break }
        Start-Sleep -Seconds 1
    }
}

Add-Content $logPath "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') manuel STOP_MASTER bulundu - yeniden baslatma kapali"
exit 0

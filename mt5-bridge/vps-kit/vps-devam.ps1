[CmdletBinding()]
param([switch]$Force)

# Bu, STOP dosyalarini silebilen tek PowerShell akisidir ve acik kullanici onayi ister.
$ErrorActionPreference = "Stop"
$KIT_DIR = $PSScriptRoot
$BRIDGE_DIR = Split-Path $KIT_DIR -Parent
$goldCandidates = @(
    "$env:USERPROFILE\Desktop\gold-structure-bot",
    "C:\gold-structure-bot",
    (Join-Path (Split-Path (Split-Path $BRIDGE_DIR -Parent) -Parent) "gold-structure-bot")
)
$GOLD_DIR = $goldCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Container } | Select-Object -First 1

if (-not $Force) {
    $answer = Read-Host "STOP_MASTER kaldirilip botlar baslatilsin mi? Devam icin DEVAM yaz"
    if ($answer -cne "DEVAM") {
        Write-Host "Iptal edildi; STOP_MASTER korundu." -ForegroundColor Yellow
        exit 1
    }
}

$targets = @("STOP_MASTER", "STOP_ALL", "STOP", "STOP_SCANNER", "STOP_PNL") |
           ForEach-Object { Join-Path $BRIDGE_DIR $_ }
if ($GOLD_DIR) { $targets += (Join-Path $GOLD_DIR "STOP") }

foreach ($target in $targets) {
    if (Test-Path -LiteralPath $target -PathType Leaf) {
        Remove-Item -LiteralPath $target -Force
        Write-Host "Kaldirildi: $target" -ForegroundColor DarkGray
    }
}

$startScript = Join-Path $KIT_DIR "vps-basla.ps1"
& powershell -NoProfile -ExecutionPolicy Bypass -File $startScript
exit $LASTEXITCODE

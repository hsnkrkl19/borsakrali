# Borsa Krali birlesik MT5 koprusu bekcisi.
# STOP_MASTER veya STOP_ALL gorulurse kalici olarak cikar.
$host.UI.RawUI.WindowTitle = "BK-Bekci-Birlesik-Kopru"
Set-Location $PSScriptRoot

$logPath = Join-Path $PSScriptRoot "watchdog_all.log"
$stopFiles = @(
    (Join-Path $PSScriptRoot "STOP_MASTER"),
    (Join-Path $PSScriptRoot "STOP_ALL")
)

function Test-StopRequested {
    foreach ($path in $stopFiles) {
        if (Test-Path -LiteralPath $path -PathType Leaf) { return $true }
    }
    return $false
}

if (Test-StopRequested) {
    Add-Content $logPath "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') STOP bulundu - bekci baslatilmadi"
    exit 0
}

$zaten = Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
         Where-Object { $_.CommandLine -match 'borsakrali_mt5_all\.py' }
if ($zaten) {
    Add-Content $logPath "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') zaten calisiyor - bekci cikti"
    exit 0
}

while (-not (Test-StopRequested)) {
    Add-Content $logPath "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') birlesik kopru baslatiliyor"
    & python -X utf8 borsakrali_mt5_all.py
    $botExit = $LASTEXITCODE
    if (Test-StopRequested) { break }
    Add-Content $logPath "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') kopru cikti (exit=$botExit) - 15 sn sonra yeniden"
    for ($i = 0; $i -lt 15; $i++) {
        if (Test-StopRequested) { break }
        Start-Sleep -Seconds 1
    }
}

Add-Content $logPath "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') STOP bulundu - yeniden baslatma kapali"
exit 0

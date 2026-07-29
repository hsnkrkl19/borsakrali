[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$GoldDir)

# Gold motoru bekcisi. STOP_MASTER veya GoldDir\STOP gorulurse cocuk Python'i
# sonlandirir ve yeniden baslatmaz. Hicbir STOP dosyasini silmez.
$ErrorActionPreference = "Stop"
$host.UI.RawUI.WindowTitle = "BK-Bekci-Altin"
$bridgeDir = $PSScriptRoot
$stopMaster = Join-Path $bridgeDir "STOP_MASTER"
$goldStop = Join-Path $GoldDir "STOP"
$logPath = Join-Path $bridgeDir "watchdog_gold.log"

if (-not (Test-Path -LiteralPath $GoldDir -PathType Container)) { exit 5 }
$entry = @("main.py", "live.py") |
         ForEach-Object { Join-Path $GoldDir $_ } |
         Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
         Select-Object -First 1
if (-not $entry) {
    Add-Content $logPath "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') main.py/live.py yok - guvenli cikis"
    exit 5
}

$entryPattern = [regex]::Escape($entry)
$alreadyRunning = Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
                  Where-Object { $_.CommandLine -match $entryPattern }
if ($alreadyRunning) {
    Add-Content $logPath "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') gold motoru zaten calisiyor - bekci cikti"
    exit 0
}

function Test-StopRequested {
    return (Test-Path -LiteralPath $stopMaster -PathType Leaf) -or
           (Test-Path -LiteralPath $goldStop -PathType Leaf)
}

while (-not (Test-StopRequested)) {
    Add-Content $logPath "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') gold motoru baslatiliyor"
    $pythonArgs = "-X utf8 `"$entry`""
    $child = Start-Process -FilePath "python.exe" -ArgumentList $pythonArgs -WorkingDirectory $GoldDir -PassThru

    while (-not $child.HasExited) {
        if (Test-StopRequested) {
            Stop-Process -Id $child.Id -Force -ErrorAction SilentlyContinue
            $child.WaitForExit()
            break
        }
        Start-Sleep -Seconds 1
        $child.Refresh()
    }

    if (Test-StopRequested) { break }
    Add-Content $logPath "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') gold motoru cikti (exit=$($child.ExitCode)) - 15 sn sonra yeniden"
    for ($i = 0; $i -lt 15; $i++) {
        if (Test-StopRequested) { break }
        Start-Sleep -Seconds 1
    }
}

Add-Content $logPath "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') STOP bulundu - yeniden baslatma kapali"
exit 0

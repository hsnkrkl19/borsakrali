$ErrorActionPreference = 'SilentlyContinue'
$root = $PSScriptRoot
$stopPath = Join-Path $root 'mt5-bridge\STOP_MASTER'
$logPath = Join-Path $root 'boot-guard.log'
$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$message = 'cold boot: interaktif MT5 oturumu bekleniyor; hicbir entry motoru baslatilmadi'

if (Test-Path -LiteralPath $stopPath -PathType Leaf) {
    try {
        $state = Get-Content -LiteralPath $stopPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $riskStop = ($state -is [pscustomobject]) -and
            ($state.closeOnly -is [bool]) -and ($state.closeOnly -eq $true) -and
            ($state.emergencyFlatten -is [bool]) -and ($state.emergencyFlatten -eq $true)
        if ($riskStop) {
            $message = 'risk STOP korunuyor; close-only kurtarma ilk interaktif MT5 oturumunda baslayacak'
        } else {
            $message = 'manuel STOP korunuyor; reboot hicbir botu baslatmayacak'
        }
    } catch {
        $message = 'manuel/okunamayan STOP korunuyor; reboot hicbir botu baslatmayacak'
    }
}
Add-Content -LiteralPath $logPath -Encoding UTF8 -Value "[$stamp] $message"
exit 0

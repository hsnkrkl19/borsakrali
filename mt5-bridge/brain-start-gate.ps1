param(
    [ValidateSet('Invalidate', 'Wait')]
    [string]$Mode = 'Wait',
    [switch]$CloseOnly,
    [int]$TimeoutSeconds = 45
)

$ErrorActionPreference = 'Stop'
$bridgeDir = $PSScriptRoot
$heartbeatPath = Join-Path $bridgeDir 'account_brain_heartbeat.json'
$gatePath = Join-Path $bridgeDir 'account_brain_start_gate.json'
$configPath = Join-Path $bridgeDir 'config_brain.json'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Write-AtomicJson([string]$Path, $Value) {
    $tmp = "$Path.$PID.tmp"
    [IO.File]::WriteAllText($tmp, (($Value | ConvertTo-Json -Depth 20) + [Environment]::NewLine), $utf8NoBom)
    Move-Item -LiteralPath $tmp -Destination $Path -Force
}

function Is-LiteralBoolean($Value) { return $Value -is [bool] }
function Is-Integer($Value) {
    return ($Value -is [int]) -or ($Value -is [long]) -or
           ($Value -is [uint32]) -or ($Value -is [uint64])
}

if ($Mode -eq 'Invalidate') {
    $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $expectedDryRun = $null
    $expectedAccount = 0
    $expectedServer = ''
    $configValid = $false
    try {
        $cfg = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if (-not ($cfg -is [pscustomobject])) { throw 'config object degil' }
        if (-not (Is-LiteralBoolean $cfg.dry_run)) { throw 'dry_run literal boolean degil' }
        if (-not (Is-Integer $cfg.allowed_account) -or [long]$cfg.allowed_account -lt 0) {
            throw 'allowed_account integer degil'
        }
        $expectedDryRun = [bool]$cfg.dry_run
        $expectedAccount = [long]$cfg.allowed_account
        $expectedServer = [string]$cfg.account_server
        if (-not $expectedDryRun -and ($expectedAccount -le 0 -or [string]::IsNullOrWhiteSpace($expectedServer))) {
            throw 'canli hesap+server kilidi eksik'
        }
        $configValid = $true
    } catch {
        $configValid = $false
    }
    $gate = [ordered]@{
        version = 1
        preparedSec = $now
        nonce = [guid]::NewGuid().ToString('N')
        expectedDryRun = $expectedDryRun
        expectedAccount = $expectedAccount
        expectedServer = $expectedServer
        configValid = $configValid
    }
    Write-AtomicJson $gatePath $gate
    Write-AtomicJson $heartbeatPath ([ordered]@{
        version = 'startup-gate'
        timeSec = $now
        ok = $false
        dryRun = $expectedDryRun
        reason = if ($configValid) { 'central-brain-starting' } else { 'invalid-brain-config-startup' }
        startNonce = $gate.nonce
    })
    if ($configValid) { exit 0 }
    exit 6
}

try {
    $gate = Get-Content -LiteralPath $gatePath -Raw -Encoding UTF8 | ConvertFrom-Json
    if (-not ($gate -is [pscustomobject]) -or -not (Is-Integer $gate.preparedSec)) {
        throw 'startup gate bozuk'
    }
} catch {
    exit 7
}

$deadline = [DateTimeOffset]::UtcNow.AddSeconds([Math]::Max(5, $TimeoutSeconds))
while ([DateTimeOffset]::UtcNow -lt $deadline) {
    try {
        $hb = Get-Content -LiteralPath $heartbeatPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $freshGeneration = ($hb -is [pscustomobject]) -and (Is-Integer $hb.timeSec) -and
                           ([long]$hb.timeSec -ge [long]$gate.preparedSec)
        $dryMatches = (Is-LiteralBoolean $hb.dryRun) -and
                      (Is-LiteralBoolean $gate.expectedDryRun) -and
                      ([bool]$hb.dryRun -eq [bool]$gate.expectedDryRun)
        $loginMatches = (Is-Integer $hb.login) -and ([long]$hb.login -gt 0) -and
                        (([long]$gate.expectedAccount -eq 0) -or
                         ([long]$hb.login -eq [long]$gate.expectedAccount))
        $server = [string]$hb.server
        $serverMatches = -not [string]::IsNullOrWhiteSpace($server)
        if (-not [string]::IsNullOrWhiteSpace([string]$gate.expectedServer)) {
            $serverMatches = $serverMatches -and
                ($server.Trim().ToLowerInvariant() -eq ([string]$gate.expectedServer).Trim().ToLowerInvariant())
        }
        if ($freshGeneration -and $dryMatches -and $loginMatches -and $serverMatches) {
            if ($CloseOnly) {
                if ((Is-LiteralBoolean $hb.stopMaster) -and $hb.stopMaster -eq $true) { exit 0 }
            } else {
                $healthy = (Is-LiteralBoolean $hb.ok) -and $hb.ok -eq $true
                $notStopped = -not ((Is-LiteralBoolean $hb.stopMaster) -and $hb.stopMaster -eq $true)
                $reportReady = $true
                if ($hb.dryRun -eq $false) {
                    $reportReady = (Is-Integer $hb.lastReportSuccessSec) -and
                        ([long]$hb.lastReportSuccessSec -ge [long]$gate.preparedSec)
                }
                if ($healthy -and $notStopped -and $reportReady) { exit 0 }
            }
        }
    } catch {
        # The daemon writes atomically; a transient read miss remains closed.
    }
    Start-Sleep -Milliseconds 250
}

try {
    Write-AtomicJson $heartbeatPath ([ordered]@{
        version = 'startup-gate'
        timeSec = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
        ok = $false
        dryRun = $gate.expectedDryRun
        reason = 'central-brain-start-timeout'
        startNonce = $gate.nonce
    })
} catch {}
exit 7

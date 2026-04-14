$ErrorActionPreference = 'SilentlyContinue'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BackendRoot = Join-Path $ProjectRoot 'backend'
$LogDir = Join-Path $ProjectRoot 'logs'
$UrlFile = Join-Path $ProjectRoot 'SUNUCU-URL.txt'
$ServerPidFile = Join-Path $LogDir 'server-live.pid'
$TunnelPidFile = Join-Path $LogDir 'cloudflared.pid'
$BackendOutLog = Join-Path $LogDir 'server-live.out.log'
$BackendErrLog = Join-Path $LogDir 'server-live.err.log'
$TunnelOutLog = Join-Path $LogDir 'cloudflared-named.out.log'
$TunnelErrLog = Join-Path $LogDir 'cloudflared-named.err.log'
$CloudflaredPath = 'C:\Users\hsnkr\Desktop\site\cloudflared.exe'
$PublicUrl = 'https://www.borsakrali.com'
$AltUrl = 'https://borsakrali.com'

function Test-BackendHealth {
    try {
        $response = Invoke-RestMethod 'http://127.0.0.1:5000/health' -TimeoutSec 2
        return $response.status -eq 'OK'
    } catch {
        return $false
    }
}

function Stop-ProcessFromPidFile {
    param([string]$PidFile)

    if (-not (Test-Path $PidFile)) {
        return
    }

    $pidValue = (Get-Content $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1).Trim()
    if ($pidValue -match '^\d+$') {
        Stop-Process -Id ([int]$pidValue) -Force -ErrorAction SilentlyContinue
    }

    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
}

function Get-PidFromFile {
    param([string]$PidFile)

    if (-not (Test-Path $PidFile)) {
        return $null
    }

    $pidValue = (Get-Content $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1).Trim()
    if ($pidValue -match '^\d+$') {
        return [int]$pidValue
    }

    return $null
}

function Test-RunningProcess {
    param([int]$ProcessId)

    if (-not $ProcessId) {
        return $false
    }

    return $null -ne (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)
}

function Ensure-Backend {
    if (Test-BackendHealth) {
        $listenerPid = Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -First 1
        if ($listenerPid) {
            Set-Content -Path $ServerPidFile -Value $listenerPid -Encoding ascii
        }
        return $true
    }

    $listeners = @(Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
    foreach ($listenerPid in $listeners) {
        if ($listenerPid) {
            Stop-Process -Id $listenerPid -Force -ErrorAction SilentlyContinue
        }
    }

    Stop-ProcessFromPidFile -PidFile $ServerPidFile
    Remove-Item $BackendOutLog, $BackendErrLog -Force -ErrorAction SilentlyContinue

    $nodePath = (Get-Command node -ErrorAction Stop).Source
    $backendProcess = Start-Process `
        -FilePath $nodePath `
        -ArgumentList 'src/server-live.js' `
        -WorkingDirectory $BackendRoot `
        -RedirectStandardOutput $BackendOutLog `
        -RedirectStandardError $BackendErrLog `
        -WindowStyle Hidden `
        -PassThru

    Set-Content -Path $ServerPidFile -Value $backendProcess.Id -Encoding ascii

    for ($i = 0; $i -lt 40; $i++) {
        if (Test-BackendHealth) {
            return $true
        }
        Start-Sleep -Seconds 1
    }

    return $false
}

function Ensure-Tunnel {
    if (-not (Test-Path $CloudflaredPath)) {
        return $false
    }

    $existingPid = Get-PidFromFile -PidFile $TunnelPidFile
    if ($existingPid -and (Test-RunningProcess -ProcessId $existingPid)) {
        return $true
    }

    Remove-Item $TunnelPidFile -Force -ErrorAction SilentlyContinue
    Remove-Item $TunnelOutLog, $TunnelErrLog -Force -ErrorAction SilentlyContinue

    $tunnelProcess = Start-Process `
        -FilePath $CloudflaredPath `
        -ArgumentList @('tunnel', 'run', 'borsakrali') `
        -WorkingDirectory $ProjectRoot `
        -RedirectStandardOutput $TunnelOutLog `
        -RedirectStandardError $TunnelErrLog `
        -WindowStyle Hidden `
        -PassThru

    Start-Sleep -Seconds 2

    if ($tunnelProcess -and $tunnelProcess.Id) {
        Set-Content -Path $TunnelPidFile -Value $tunnelProcess.Id -Encoding ascii
        return $true
    }

    return $false
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$backendReady = Ensure-Backend
$tunnelReady = $false

if ($backendReady) {
    $tunnelReady = Ensure-Tunnel
}

$status = @(
    'BORSA KRALI - Otomatik Baslatma'
    '====================================='
    "Yerel URL: http://127.0.0.1:5000"
    "Internet URL: $PublicUrl"
    "Alternatif URL: $AltUrl"
    "Health URL: $PublicUrl/health"
    "Backend Hazir: $backendReady"
    "Tunnel Baslatildi: $tunnelReady"
    "Tarih: $(Get-Date -Format 'dd.MM.yyyy HH:mm:ss')"
)

Set-Content -Path $UrlFile -Value $status -Encoding UTF8

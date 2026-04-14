$ErrorActionPreference = 'Stop'

$repoRoot = 'C:\Users\hsnkr\Desktop\site\borsasanati-clone'
$backendDir = Join-Path $repoRoot 'backend'
$logsDir = Join-Path $repoRoot 'logs'
$stateFile = Join-Path $logsDir 'live-services-state.json'
$cloudflaredExe = 'C:\Users\hsnkr\Desktop\site\cloudflared.exe'
$cloudflaredConfig = 'C:\Users\hsnkr\.cloudflared\config.yml'
$nodeExe = (Get-Command node -ErrorAction Stop).Source

$backendOut = Join-Path $logsDir 'backend-live.out.log'
$backendErr = Join-Path $logsDir 'backend-live.err.log'
$tunnelOut = Join-Path $logsDir 'cloudflared-live.out.log'
$tunnelErr = Join-Path $logsDir 'cloudflared-live.err.log'

New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

function Get-MatchingProcesses([string]$needle) {
  Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -and $_.CommandLine -like "*$needle*"
  }
}

function Stop-MatchingProcesses([string]$needle) {
  $matches = Get-MatchingProcesses $needle
  foreach ($match in $matches) {
    try {
      Stop-Process -Id $match.ProcessId -Force -ErrorAction Stop
    } catch {
      Write-Host "Uyari: $needle sureci durdurulamadi -> PID $($match.ProcessId)" -ForegroundColor Yellow
    }
  }
}

function Wait-ForUrl([string]$url, [int]$attempts = 20, [int]$delaySeconds = 1) {
  for ($i = 0; $i -lt $attempts; $i++) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing $url -TimeoutSec 10
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
        return $response.Content
      }
    } catch {
      Start-Sleep -Seconds $delaySeconds
    }
  }

  throw "Ulasilamadi: $url"
}

function Assert-Path([string]$path, [string]$label) {
  if (-not (Test-Path $path)) {
    throw "$label bulunamadi: $path"
  }
}

Assert-Path $backendDir 'Backend klasoru'
Assert-Path $cloudflaredExe 'cloudflared.exe'
Assert-Path $cloudflaredConfig 'cloudflared config'

Write-Host ''
Write-Host 'Borsa Krali canli servisleri hazirlaniyor...' -ForegroundColor Cyan

Stop-MatchingProcesses 'src/server-live.js'
Stop-MatchingProcesses 'cloudflared.exe tunnel'
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

$listen5000 = Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue
if ($listen5000) {
  $owner = Get-CimInstance Win32_Process -Filter "ProcessId = $($listen5000[0].OwningProcess)"
  if (-not $owner.CommandLine -or $owner.CommandLine -notlike '*src/server-live.js*') {
    throw "5000 portu baska bir surec tarafindan kullaniliyor: PID $($owner.ProcessId)"
  }
}

'' | Set-Content $backendOut
'' | Set-Content $backendErr
'' | Set-Content $tunnelOut
'' | Set-Content $tunnelErr

$backendProcess = Start-Process `
  -FilePath $nodeExe `
  -ArgumentList 'src/server-live.js' `
  -WorkingDirectory $backendDir `
  -RedirectStandardOutput $backendOut `
  -RedirectStandardError $backendErr `
  -WindowStyle Hidden `
  -PassThru

$localHealth = Wait-ForUrl 'http://127.0.0.1:5000/health'

$tunnelProcess = Start-Process `
  -FilePath $cloudflaredExe `
  -ArgumentList 'tunnel', '--config', $cloudflaredConfig, 'run' `
  -RedirectStandardOutput $tunnelOut `
  -RedirectStandardError $tunnelErr `
  -WindowStyle Hidden `
  -PassThru

$publicHealth = Wait-ForUrl 'https://borsakrali.com/health'
$marketSample = Wait-ForUrl 'https://borsakrali.com/api/market/bist100'

@{
  startedAt = (Get-Date).ToString('s')
  backendPid = $backendProcess.Id
  tunnelPid = $tunnelProcess.Id
  backendOut = $backendOut
  backendErr = $backendErr
  tunnelOut = $tunnelOut
  tunnelErr = $tunnelErr
} | ConvertTo-Json | Set-Content $stateFile

Write-Host ''
Write-Host 'Servisler baslatildi.' -ForegroundColor Green
Write-Host "Backend PID   : $($backendProcess.Id)"
Write-Host "Tunnel PID    : $($tunnelProcess.Id)"
Write-Host ''
Write-Host 'Kontroller:' -ForegroundColor Cyan
Write-Host "Lokal Health  : $localHealth"
Write-Host "Public Health : $publicHealth"
Write-Host "Market Ornek  : $marketSample"
Write-Host ''
Write-Host "Backend log   : $backendOut"
Write-Host "Backend hata  : $backendErr"
Write-Host "Tunnel log    : $tunnelOut"
Write-Host "Tunnel hata   : $tunnelErr"
Write-Host ''
Write-Host 'Bu pencereyi kapatsan da backend ve tunnel arka planda calismaya devam eder.' -ForegroundColor Yellow
Write-Host 'Durdurmak icin masaustundeki BorsaKrali-Canli-Durdur.cmd dosyasini kullan.' -ForegroundColor Yellow

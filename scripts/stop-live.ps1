$ErrorActionPreference = 'Stop'

$repoRoot = 'C:\Users\hsnkr\Desktop\site\borsasanati-clone'
$logsDir = Join-Path $repoRoot 'logs'
$stateFile = Join-Path $logsDir 'live-services-state.json'

function Get-MatchingProcesses([string]$needle) {
  Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -and $_.CommandLine -like "*$needle*"
  }
}

function Stop-IfRunning([int]$pid) {
  try {
    $process = Get-Process -Id $pid -ErrorAction Stop
    Stop-Process -Id $process.Id -Force -ErrorAction Stop
    Write-Host "Durduruldu: PID $pid"
  } catch {
    Write-Host "Zaten kapali: PID $pid" -ForegroundColor Yellow
  }
}

if (Test-Path $stateFile) {
  $state = Get-Content $stateFile | ConvertFrom-Json
  if ($state.backendPid) { Stop-IfRunning ([int]$state.backendPid) }
  if ($state.tunnelPid) { Stop-IfRunning ([int]$state.tunnelPid) }
  Remove-Item $stateFile -Force -ErrorAction SilentlyContinue
}

Get-MatchingProcesses 'src/server-live.js' | ForEach-Object {
  Stop-IfRunning ([int]$_.ProcessId)
}

Get-MatchingProcesses 'cloudflared.exe tunnel' | ForEach-Object {
  Stop-IfRunning ([int]$_.ProcessId)
}

Get-Process cloudflared -ErrorAction SilentlyContinue | ForEach-Object {
  Stop-IfRunning ([int]$_.Id)
}

Write-Host ''
Write-Host 'Borsa Krali canli servisleri durduruldu.' -ForegroundColor Green

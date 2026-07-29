[CmdletBinding()]
param(
    [string]$BridgeDir = $PSScriptRoot,
    [switch]$RequireToken
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0

function Test-UsableToken([string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) { return $false }
    return $Value -notmatch '(?i)BURAYA|ILE_AYNI|ENV_VEYA|PLACEHOLDER|CHANGE_ME'
}

$token = [Environment]::GetEnvironmentVariable("BK_EXEC_TOKEN", "Process")
if (-not (Test-UsableToken $token)) {
    $token = [Environment]::GetEnvironmentVariable("FOREX_EXEC_TOKEN", "Process")
}
if (-not (Test-UsableToken $token)) {
    $token = [Environment]::GetEnvironmentVariable("BK_EXEC_TOKEN", "User")
}
if (-not (Test-UsableToken $token)) {
    $token = [Environment]::GetEnvironmentVariable("FOREX_EXEC_TOKEN", "User")
}
$envTokenAvailable = Test-UsableToken $token
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$missing = New-Object System.Collections.Generic.List[string]

foreach ($name in @("config_all.json", "config.json", "config_scanner.json", "config_brain.json")) {
    $path = Join-Path $BridgeDir $name
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { continue }

    try {
        $cfg = Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch {
        Write-Host "[HATA] Gecersiz JSON: $name" -ForegroundColor Red
        throw
    }

    $current = if ($null -ne $cfg.PSObject.Properties["exec_token"]) { [string]$cfg.exec_token } else { "" }
    if ($envTokenAvailable) {
        if ($null -ne $cfg.PSObject.Properties["exec_token"]) {
            $cfg.exec_token = $token
        } else {
            $cfg | Add-Member -NotePropertyName "exec_token" -NotePropertyValue $token
        }
        $json = $cfg | ConvertTo-Json -Depth 100
        [System.IO.File]::WriteAllText($path, $json + [Environment]::NewLine, $utf8NoBom)
        Write-Host "[OK] $name tokeni guvenli ortam degiskeninden yerel config'e aktarildi." -ForegroundColor Green
    } elseif (-not (Test-UsableToken $current)) {
        $missing.Add($name)
    } else {
        Write-Host "[OK] $name yerel tokeni mevcut (deger gosterilmedi)." -ForegroundColor Green
    }
}

$token = $null
if ($missing.Count -gt 0) {
    Write-Host "[HATA] Token eksik: $($missing -join ', ')" -ForegroundColor Red
    Write-Host "BK_EXEC_TOKEN kullanici ortam degiskenini ayarla veya tokeni yalniz git-disindaki config dosyalarina yaz." -ForegroundColor Yellow
    if ($RequireToken) { exit 3 }
}

exit 0

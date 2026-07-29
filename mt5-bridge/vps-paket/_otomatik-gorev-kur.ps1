$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
if ([string]::IsNullOrWhiteSpace($currentUser)) { throw 'Windows kullanicisi belirlenemedi' }

$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew

$bootAction = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument ("-NoProfile -ExecutionPolicy Bypass -File `"{0}`"" -f (Join-Path $root '_boot-guard.ps1')) `
    -WorkingDirectory $root
$bootTrigger = New-ScheduledTaskTrigger -AtStartup
$bootPrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName 'BorsaKrali-BootGuard' -Action $bootAction `
    -Trigger $bootTrigger -Principal $bootPrincipal -Settings $settings -Force | Out-Null

$sessionAction = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\cmd.exe" `
    -Argument ("/d /c `"`"{0}`"`"" -f (Join-Path $root '_otobaslat.bat')) `
    -WorkingDirectory $root
$sessionTrigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$sessionPrincipal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Highest
Register-ScheduledTask -TaskName 'BorsaKrali-SessionRecovery' -Action $sessionAction `
    -Trigger $sessionTrigger -Principal $sessionPrincipal -Settings $settings -Force | Out-Null

# Remove the superseded single-task installer name after both replacements exist.
Unregister-ScheduledTask -TaskName 'BorsaKraliBotlar' -Confirm:$false -ErrorAction SilentlyContinue
Write-Host "[OK] BootGuard + SessionRecovery kuruldu: $currentUser" -ForegroundColor Green

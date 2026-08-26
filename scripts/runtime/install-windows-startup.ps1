$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$BackendScript = Join-Path $ProjectRoot "scripts\runtime\start-backend.ps1"
$TunnelScript = Join-Path $ProjectRoot "scripts\runtime\start-tunnel.ps1"
$BackupScript = Join-Path $ProjectRoot "scripts\runtime\backup-now.ps1"

function Test-IsAdmin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Register-PaktiTask {
  param(
    [Parameter(Mandatory = $true)]
    [string] $TaskName,
    [Parameter(Mandatory = $true)]
    [string] $ScriptPath,
    [Parameter(Mandatory = $true)]
    [string] $Description
  )

  if (-not (Test-Path -LiteralPath $ScriptPath)) {
    throw "Script tidak ditemukan: $ScriptPath"
  }

  $action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$ScriptPath`""

  $triggers = @(
    New-ScheduledTaskTrigger -AtStartup
    New-ScheduledTaskTrigger -AtLogOn
  )
  $settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  }

  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $triggers `
    -Settings $settings `
    -Description $Description `
    -RunLevel Highest | Out-Null

  Write-Host "Registered task: $TaskName"
}

function Register-PaktiDailyBackupTask {
  param(
    [Parameter(Mandatory = $true)]
    [string] $TaskName,
    [Parameter(Mandatory = $true)]
    [string] $ScriptPath
  )

  if (-not (Test-Path -LiteralPath $ScriptPath)) {
    throw "Script tidak ditemukan: $ScriptPath"
  }

  $action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$ScriptPath`""

  $triggers = @(
    New-ScheduledTaskTrigger -Daily -At 2am
  )
  $settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 3) `
    -MultipleInstances IgnoreNew `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 5)

  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  }

  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $triggers `
    -Settings $settings `
    -Description "Backup Pakti database and video files every day." `
    -RunLevel Highest | Out-Null

  Write-Host "Registered task: $TaskName"
}

if (-not (Test-IsAdmin)) {
  throw "Jalankan script ini dari PowerShell Run as Administrator."
}

Register-PaktiTask `
  -TaskName "Pakti Backend" `
  -ScriptPath $BackendScript `
  -Description "Start Pakti backend API on Windows startup."

Register-PaktiTask `
  -TaskName "Pakti Cloudflare Tunnel" `
  -ScriptPath $TunnelScript `
  -Description "Start Pakti Cloudflare Tunnel on Windows startup."

Register-PaktiDailyBackupTask `
  -TaskName "Pakti Daily Backup" `
  -ScriptPath $BackupScript

Write-Host ""
Write-Host "Startup tasks installed."
Write-Host "Run manual test:"
Write-Host "  Start-ScheduledTask -TaskName `"Pakti Backend`""
Write-Host "  Start-ScheduledTask -TaskName `"Pakti Cloudflare Tunnel`""
Write-Host "  Start-ScheduledTask -TaskName `"Pakti Daily Backup`""

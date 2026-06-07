$ErrorActionPreference = "Stop"

$ProjectRoot = "D:\dev\apps\ngepak\packcam"
$BackendScript = Join-Path $ProjectRoot "scripts\runtime\start-backend.ps1"
$TunnelScript = Join-Path $ProjectRoot "scripts\runtime\start-tunnel.ps1"

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

Write-Host ""
Write-Host "Startup tasks installed."
Write-Host "Run manual test:"
Write-Host "  Start-ScheduledTask -TaskName `"Pakti Backend`""
Write-Host "  Start-ScheduledTask -TaskName `"Pakti Cloudflare Tunnel`""

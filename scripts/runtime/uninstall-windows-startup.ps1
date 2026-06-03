$ErrorActionPreference = "Stop"

function Test-IsAdmin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdmin)) {
  throw "Jalankan script ini dari PowerShell Run as Administrator."
}

foreach ($taskName in @("Pakti Backend", "Pakti Cloudflare Tunnel")) {
  if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Removed task: $taskName"
  } else {
    Write-Host "Task not found: $taskName"
  }
}

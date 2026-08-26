$ErrorActionPreference = "Continue"

Write-Host "Scheduled tasks:"
Get-ScheduledTask -TaskName "Pakti Backend", "Pakti Cloudflare Tunnel" -ErrorAction SilentlyContinue |
  Select-Object TaskName, State |
  Format-Table -AutoSize

Write-Host ""
Write-Host "Runtime processes:"
$backendConnection = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -ne $backendConnection) {
  $backendProcess = Get-Process -Id $backendConnection.OwningProcess -ErrorAction SilentlyContinue
  "Backend PID $($backendConnection.OwningProcess): $($backendProcess.ProcessName)"
} else {
  "Backend: not listening on port 3001"
}

$tunnelProcess = Get-CimInstance Win32_Process -Filter "name = 'cloudflared.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like "*tunnel*run*" } |
  Select-Object -First 1
if ($null -ne $tunnelProcess) {
  "Cloudflare Tunnel PID $($tunnelProcess.ProcessId)"
} else {
  "Cloudflare Tunnel: not found"
}

Write-Host ""
Write-Host "Logs: .cache\runtime-logs"

Write-Host ""
Write-Host "Port 3001:"
netstat -ano | Select-String ":3001"

Write-Host ""
Write-Host "Local API health:"
try {
  Invoke-WebRequest -Uri "http://localhost:3001/api/health" -UseBasicParsing -TimeoutSec 10 |
    Select-Object StatusCode
} catch {
  $_.Exception.Message
}

Write-Host ""
Write-Host "Tunnel API health:"
try {
  Invoke-WebRequest -Uri "https://api-pakti.zakado.id/api/health" -UseBasicParsing -TimeoutSec 20 |
    Select-Object StatusCode
} catch {
  $_.Exception.Message
}

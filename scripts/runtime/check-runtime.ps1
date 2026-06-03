$ErrorActionPreference = "Continue"

Write-Host "Scheduled tasks:"
Get-ScheduledTask -TaskName "Pakti Backend", "Pakti Cloudflare Tunnel" -ErrorAction SilentlyContinue |
  Select-Object TaskName, State |
  Format-Table -AutoSize

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

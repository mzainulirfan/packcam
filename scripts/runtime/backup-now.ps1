$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$LogDir = Join-Path $ProjectRoot ".cache\runtime-logs"
$LogFile = Join-Path $LogDir "backup.log"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Set-Location $ProjectRoot

"[$(Get-Date -Format o)] Starting Pakti backup..." | Tee-Object -FilePath $LogFile -Append
npm run backup *>&1 | Tee-Object -FilePath $LogFile -Append
"[$(Get-Date -Format o)] Pakti backup finished." | Tee-Object -FilePath $LogFile -Append

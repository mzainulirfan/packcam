$ErrorActionPreference = "Stop"

$ProjectRoot = "D:\dev\apps\ngepak\packcam"
$LogDir = Join-Path $ProjectRoot ".cache\runtime-logs"
$LogFile = Join-Path $LogDir "backend.log"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Set-Location $ProjectRoot

$env:CORS_ORIGINS = "https://pakti.vercel.app,https://pakti.zakado.id"
$env:COOKIE_SAMESITE = "none"
$env:COOKIE_SECURE = "true"

"[$(Get-Date -Format o)] Starting Pakti backend..." | Tee-Object -FilePath $LogFile -Append
npm run api:start *>&1 | Tee-Object -FilePath $LogFile -Append

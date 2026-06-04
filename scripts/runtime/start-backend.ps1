$ErrorActionPreference = "Stop"

$ProjectRoot = "D:\dev\apps\ngepak\packcam"
$LogDir = Join-Path $ProjectRoot ".cache\runtime-logs"
$LogFile = Join-Path $LogDir "backend.log"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Set-Location $ProjectRoot

$env:CORS_ORIGINS = "https://pakti.vercel.app,https://pakti.zakado.id,https://mpakti.zakado.id"
$env:COOKIE_SAMESITE = "none"
$env:COOKIE_SECURE = "true"
$env:SESSION_TTL_HOURS = "12"
$env:LOGIN_RATE_LIMIT_WINDOW_MS = "900000"
$env:LOGIN_RATE_LIMIT_MAX_ATTEMPTS = "10"

"[$(Get-Date -Format o)] Starting Pakti backend..." | Tee-Object -FilePath $LogFile -Append
npm run api:start *>&1 | Tee-Object -FilePath $LogFile -Append

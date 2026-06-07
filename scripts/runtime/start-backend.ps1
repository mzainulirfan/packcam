$ErrorActionPreference = "Stop"

$ProjectRoot = "D:\dev\apps\ngepak\packcam"
$LogDir = Join-Path $ProjectRoot ".cache\runtime-logs"
$LogFile = Join-Path $LogDir "backend.log"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Set-Location $ProjectRoot

$ExistingBackend = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -ne $ExistingBackend) {
  $Message = "[$(Get-Date -Format o)] Pakti backend sudah berjalan di http://localhost:3001 (PID $($ExistingBackend.OwningProcess))."
  Write-Host $Message
  try {
    Add-Content -LiteralPath $LogFile -Value $Message -ErrorAction Stop
  } catch {
    Write-Host "Log sedang dipakai proses lain, lanjut tanpa menulis log."
  }
  exit 0
}

$env:CORS_ORIGINS = "https://pakti.vercel.app,https://pakti.zakado.id,https://mpakti.zakado.id"
$env:COOKIE_SAMESITE = "none"
$env:COOKIE_SECURE = "true"
$env:SESSION_TTL_HOURS = "12"
$env:LOGIN_RATE_LIMIT_WINDOW_MS = "900000"
$env:LOGIN_RATE_LIMIT_MAX_ATTEMPTS = "10"

"[$(Get-Date -Format o)] Starting Pakti backend..." | Tee-Object -FilePath $LogFile -Append
npm run api:start *>&1 | Tee-Object -FilePath $LogFile -Append

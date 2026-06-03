$ErrorActionPreference = "Stop"

$ProjectRoot = "D:\dev\apps\ngepak\packcam"
$LogDir = Join-Path $ProjectRoot ".cache\runtime-logs"
$LogFile = Join-Path $LogDir "tunnel.log"
$CloudflaredPath = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
$TunnelConfigPath = Join-Path $env:USERPROFILE ".cloudflared\config.yml"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

if (-not (Test-Path -LiteralPath $CloudflaredPath)) {
  throw "cloudflared tidak ditemukan di $CloudflaredPath"
}

if (-not (Test-Path -LiteralPath $TunnelConfigPath)) {
  throw "Config tunnel tidak ditemukan di $TunnelConfigPath"
}

"[$(Get-Date -Format o)] Starting Pakti Cloudflare Tunnel..." | Tee-Object -FilePath $LogFile -Append
& $CloudflaredPath tunnel --config $TunnelConfigPath run --logfile $LogFile --loglevel info

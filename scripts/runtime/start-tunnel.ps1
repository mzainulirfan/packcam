$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$LogDir = Join-Path $ProjectRoot ".cache\runtime-logs"
$LogFile = Join-Path $LogDir "tunnel.log"
$StdOutLog = Join-Path $LogDir "tunnel.out.log"
$StdErrLog = Join-Path $LogDir "tunnel.err.log"
$TunnelConfigPath = Join-Path $env:USERPROFILE ".cloudflared\config.yml"

function Resolve-CloudflaredPath {
  $Command = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($null -ne $Command) {
    return $Command.Source
  }

  $Candidates = @(
    "C:\Program Files\cloudflared\cloudflared.exe",
    "C:\Program Files (x86)\cloudflared\cloudflared.exe",
    (Join-Path $env:USERPROFILE "cloudflared.exe"),
    (Join-Path $env:LOCALAPPDATA "cloudflared\cloudflared.exe")
  )

  foreach ($Candidate in $Candidates) {
    if (Test-Path -LiteralPath $Candidate) {
      return $Candidate
    }
  }

  return $null
}

function Write-RuntimeLog {
  param([string] $Message)

  try {
    Add-Content -LiteralPath $LogFile -Value $Message -ErrorAction Stop
  } catch {
    Write-Host $Message
  }
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$CloudflaredPath = Resolve-CloudflaredPath
if (-not $CloudflaredPath) {
  throw "cloudflared tidak ditemukan. Install cloudflared atau tambahkan cloudflared.exe ke PATH."
}

if (-not (Test-Path -LiteralPath $TunnelConfigPath)) {
  throw "Config tunnel tidak ditemukan di $TunnelConfigPath"
}

$ExistingTunnel = Get-CimInstance Win32_Process -Filter "name = 'cloudflared.exe'" |
  Where-Object { $_.CommandLine -like "*tunnel*--config*$TunnelConfigPath*" } |
  Select-Object -First 1
if ($null -ne $ExistingTunnel) {
  Write-RuntimeLog "[$(Get-Date -Format o)] Pakti Cloudflare Tunnel sudah berjalan (PID $($ExistingTunnel.ProcessId))."
  exit 0
}

Write-RuntimeLog "[$(Get-Date -Format o)] Starting Pakti Cloudflare Tunnel..."
$TunnelArgs = "tunnel --config `"$TunnelConfigPath`" --logfile `"$LogFile`" --loglevel info run"
$Process = Start-Process `
  -FilePath $CloudflaredPath `
  -ArgumentList $TunnelArgs `
  -WorkingDirectory $ProjectRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $StdOutLog `
  -RedirectStandardError $StdErrLog `
  -PassThru

Write-RuntimeLog "[$(Get-Date -Format o)] Pakti Cloudflare Tunnel started in background (PID $($Process.Id)). Logs: $LogFile, $StdOutLog, $StdErrLog"

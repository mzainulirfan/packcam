$ErrorActionPreference = "Continue"

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ApiBaseUrl = if ($env:VITE_API_BASE_URL) { $env:VITE_API_BASE_URL } else { "https://api-pakti.zakado.id" }

Set-Location $ProjectRoot
$env:VITE_API_BASE_URL = $ApiBaseUrl

npm run build:mobile:vercel

$DeployConfig = '{"rewrites":[{"source":"/(.*)","destination":"/index.html"}]}'
$DeployConfig | Set-Content -Path (Join-Path $ProjectRoot "dist-mobile\vercel.json") -Encoding ascii

$DeployOutput = npx vercel deploy dist-mobile --prod --yes --project pakti-mobile 2>&1
$DeployOutput | ForEach-Object { Write-Host $_ }

$DeploymentUrl = $DeployOutput |
  Select-String -Pattern "https://pakti-mobile-[^\s]+\.vercel\.app" |
  ForEach-Object { $_.Matches.Value } |
  Select-Object -Last 1

if (-not $DeploymentUrl) {
  throw "Could not find the mobile deployment URL in Vercel output."
}

npx vercel alias set $DeploymentUrl mpakti.zakado.id

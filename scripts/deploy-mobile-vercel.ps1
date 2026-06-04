$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ApiBaseUrl = if ($env:VITE_API_BASE_URL) { $env:VITE_API_BASE_URL } else { "https://api-pakti.zakado.id" }

Set-Location $ProjectRoot
$env:VITE_API_BASE_URL = $ApiBaseUrl

npm run build:mobile:vercel

$DeployConfig = '{"rewrites":[{"source":"/(.*)","destination":"/index.html"}]}'
$DeployConfig | Set-Content -Path (Join-Path $ProjectRoot "dist-mobile\vercel.json") -Encoding ascii

npx vercel deploy dist-mobile --prod --yes --project pakti-mobile

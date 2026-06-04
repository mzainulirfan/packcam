$ErrorActionPreference = "Stop"

if (-not $env:CLOUDFLARE_API_TOKEN) {
  throw "CLOUDFLARE_API_TOKEN belum diset. Jalankan: `$env:CLOUDFLARE_API_TOKEN=`"TOKEN_CLOUDFLARE`""
}

$Headers = @{
  Authorization = "Bearer $env:CLOUDFLARE_API_TOKEN"
  "Content-Type" = "application/json"
}

function Invoke-CloudflareApi {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Method,
    [Parameter(Mandatory = $true)]
    [string] $Uri,
    [string] $Body
  )

  try {
    if ($Body) {
      return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $Headers -Body $Body
    }

    return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $Headers
  } catch {
    $response = $_.Exception.Response
    if ($response) {
      $reader = [System.IO.StreamReader]::new($response.GetResponseStream())
      $details = $reader.ReadToEnd()
      throw "Cloudflare API error: $details"
    }

    throw
  }
}

Write-Host "Mencari zone zakado.id..."
$Zone = Invoke-CloudflareApi `
  -Method "Get" `
  -Uri "https://api.cloudflare.com/client/v4/zones?name=zakado.id"

if (-not $Zone.success -or $Zone.result.Count -lt 1) {
  throw "Zone zakado.id tidak ditemukan. Pastikan token punya Zone:Read untuk zakado.id."
}

$ZoneId = $Zone.result[0].id

Write-Host "Mencari record lama pakti.zakado.id..."
$Records = Invoke-CloudflareApi `
  -Method "Get" `
  -Uri "https://api.cloudflare.com/client/v4/zones/$ZoneId/dns_records?name=pakti.zakado.id"

foreach ($Record in $Records.result) {
  Write-Host "Menghapus record lama: $($Record.type) $($Record.name) -> $($Record.content) proxied=$($Record.proxied)"
  Invoke-CloudflareApi `
    -Method "Delete" `
    -Uri "https://api.cloudflare.com/client/v4/zones/$ZoneId/dns_records/$($Record.id)" | Out-Null
}

$Body = @{
  type = "A"
  name = "pakti"
  content = "76.76.21.21"
  ttl = 1
  proxied = $false
} | ConvertTo-Json

Write-Host "Membuat record baru: A pakti -> 76.76.21.21 DNS only..."
Invoke-CloudflareApi `
  -Method "Post" `
  -Uri "https://api.cloudflare.com/client/v4/zones/$ZoneId/dns_records" `
  -Body $Body | Out-Null

Write-Host "Selesai. Tunggu 1-3 menit, lalu cek:"
Write-Host "  Resolve-DnsName pakti.zakado.id -Type A"

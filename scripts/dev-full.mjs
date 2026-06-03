import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import { BarcodeFormat, QRCodeWriter } from '@zxing/library'

const npmCmd = 'npm'
const useShell = true
const lanIp = detectLanIp()
const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const devHttpsBundle = ensureDevHttpsCertificate(lanIp)
const mobilePort = await findAvailablePort(4173)
const webPort = await findAvailablePort(4175)

function detectLanIp() {
  const interfaces = os.networkInterfaces()

  for (const addresses of Object.values(interfaces)) {
    if (!addresses) {
      continue
    }

    for (const address of addresses) {
      if (address.family === 'IPv4' && !address.internal) {
        return address.address
      }
    }
  }

  return null
}

if (lanIp) {
  const mobileUrl = devHttpsBundle ? `https://${lanIp}:${mobilePort}` : `http://${lanIp}:${mobilePort}`
  const webUrl = devHttpsBundle ? `https://${lanIp}:${webPort}` : `http://${lanIp}:${webPort}`
  console.log(formatDevHeader('Pakti dev URLs'))
  console.log(formatUrlLine('Mobile', mobileUrl))
  console.log(formatUrlLine('Web', webUrl))
  console.log(formatUrlLine('Backend', `http://${lanIp}:3001`))

  if (devHttpsBundle) {
    console.log(formatUrlLine('Root CA', devHttpsBundle.rootCertPath))
    console.log(formatQrBlock(mobileUrl))
    console.log('Install the root CA on the phone once, then reopen the HTTPS URL from the same WiFi.')
  }
} else {
  console.log('[dev:full] LAN IP not detected. Use ipconfig / ifconfig and open the device IP manually.')
}

function formatDevHeader(title) {
  const line = '='.repeat(Math.max(title.length + 4, 20))
  return `${line}\n  ${title}\n${line}`
}

function formatUrlLine(label, value) {
  return `${label.padEnd(8)} ${value}`
}

function formatQrBlock(value) {
  const writer = new QRCodeWriter()
  const matrix = writer.encode(value, BarcodeFormat.QR_CODE, 29, 29, new Map())
  const body = matrix.toString('██', '  ')
  return `\n${body}\n`
}

function ensureDevHttpsCertificate(ip) {
  if (!ip) {
    return null
  }

  const certDir = path.join(repoRoot, '.cache', 'dev-certs')
  fs.mkdirSync(certDir, { recursive: true })

  const rootCertPath = path.join(certDir, 'pakti-dev-root.cer')
  const pfxPath = path.join(certDir, `mobile-${ip}.pfx`)
  const password = 'pakti-dev'
  const rootSubject = 'CN=Pakti Dev Root'
  const leafSubject = `CN=pakti-dev-${ip}`

  const psScript = `
$ErrorActionPreference = 'Stop'
$rootSubject = '${escapePowerShellSingleQuote(rootSubject)}'
$leafSubject = '${escapePowerShellSingleQuote(leafSubject)}'
$rootCertPath = '${escapePowerShellSingleQuote(rootCertPath)}'
$pfxPath = '${escapePowerShellSingleQuote(pfxPath)}'
$password = '${escapePowerShellSingleQuote(password)}'
$ipAddress = '${escapePowerShellSingleQuote(ip)}'
$rootStore = 'Cert:\\CurrentUser\\Root'
$myStore = 'Cert:\\CurrentUser\\My'
$existingRoot = Get-ChildItem -Path $myStore | Where-Object { $_.Subject -eq $rootSubject -and $_.HasPrivateKey } | Select-Object -First 1

if ($null -eq $existingRoot) {
  $existingRoot = New-SelfSignedCertificate -Type Custom -Subject $rootSubject -CertStoreLocation $myStore -KeyExportPolicy Exportable -KeyLength 4096 -HashAlgorithm sha256 -NotAfter (Get-Date).AddYears(10) -KeyUsage CertSign, CRLSign, DigitalSignature -TextExtension @('2.5.29.19={text}CA=true&pathlength=1')
}

Export-Certificate -Cert $existingRoot -FilePath $rootCertPath | Out-Null

$trustedRoot = Get-ChildItem -Path $rootStore | Where-Object { $_.Thumbprint -eq $existingRoot.Thumbprint } | Select-Object -First 1
if ($null -eq $trustedRoot) {
  Import-Certificate -FilePath $rootCertPath -CertStoreLocation $rootStore | Out-Null
}

$leafExtensions = @(
  '2.5.29.19={text}CA=false',
  "2.5.29.17={text}DNS=localhost&DNS=127.0.0.1&IPAddress=$ipAddress"
)

$leafCert = New-SelfSignedCertificate -Type Custom -Subject $leafSubject -Signer $existingRoot -CertStoreLocation $myStore -KeyExportPolicy Exportable -KeyLength 2048 -HashAlgorithm sha256 -NotAfter (Get-Date).AddYears(2) -KeyUsage DigitalSignature, KeyEncipherment -TextExtension $leafExtensions
$securePassword = ConvertTo-SecureString -String $password -AsPlainText -Force
Export-PfxCertificate -Cert $leafCert -FilePath $pfxPath -Password $securePassword | Out-Null
`

  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], {
    stdio: 'inherit',
    shell: false,
  })

  if (result.status !== 0) {
    console.warn('[dev:full] Failed to generate HTTPS certificate bundle for mobile dev server.')
    return null
  }

  return {
    pfxPath,
    password,
    rootCertPath,
  }
}

function escapePowerShellSingleQuote(value) {
  return String(value).replace(/'/g, "''")
}

async function findAvailablePort(startPort, host = '0.0.0.0') {
  for (let port = startPort; port < startPort + 10; port += 1) {
    if (await isPortAvailable(port, host)) {
      return port
    }
  }

  return startPort
}

function isPortAvailable(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.unref()

    server.once('error', () => {
      resolve(false)
    })

    server.listen({ port, host }, () => {
      server.close(() => resolve(true))
    })
  })
}

const children = [
  spawn(npmCmd, ['run', 'api:dev'], {
    stdio: 'inherit',
    shell: useShell,
    env: {
      ...process.env,
      LAN_IP: lanIp ?? '',
    },
  }),
  spawn(npmCmd, ['run', 'dev', '-w', '@pakti/mobile', '--', '--host', '--port', String(mobilePort)], {
    stdio: 'inherit',
    shell: useShell,
    env: {
      ...process.env,
      LAN_IP: lanIp ?? '',
      VITE_DEV_HTTPS_PFX: devHttpsBundle?.pfxPath ?? '',
      VITE_DEV_HTTPS_PFX_PASSWORD: devHttpsBundle?.password ?? '',
    },
  }),
  spawn(npmCmd, ['run', 'dev', '-w', '@pakti/web', '--', '--host', '0.0.0.0', '--port', String(webPort)], {
    stdio: 'inherit',
    shell: useShell,
    env: {
      ...process.env,
      LAN_IP: lanIp ?? '',
      VITE_DEV_HTTPS_PFX: devHttpsBundle?.pfxPath ?? '',
      VITE_DEV_HTTPS_PFX_PASSWORD: devHttpsBundle?.password ?? '',
    },
  }),
]

let shuttingDown = false

function shutdown(code = 0) {
  if (shuttingDown) {
    return
  }

  shuttingDown = true

  for (const child of children) {
    if (!child.killed) {
      child.kill()
    }
  }

  process.exit(code)
}

for (const child of children) {
  child.on('exit', (code, signal) => {
    if (shuttingDown) {
      return
    }

    if (signal) {
      shutdown(1)
      return
    }

    if (typeof code === 'number' && code !== 0) {
      shutdown(code)
    }
  })
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

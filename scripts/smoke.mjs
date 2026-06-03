import fs from 'node:fs'
import path from 'node:path'

const ROOT_DIR = process.cwd()
const failures = []

function assertExists(targetPath, label) {
  if (!fs.existsSync(targetPath)) {
    failures.push(`${label} tidak ditemukan: ${targetPath}`)
  }
}

async function checkBackend() {
  const backendUrl = process.env.SMOKE_BACKEND_URL
  if (!backendUrl) {
    return
  }

  const response = await fetch(new URL('/api/health', backendUrl))
  if (!response.ok) {
    failures.push(`Backend health gagal: ${response.status} ${response.statusText}`)
    return
  }

  const payload = await response.json()
  if (!payload || payload.ok !== true || !payload.data || payload.data.status !== 'ok') {
    failures.push('Backend health respons tidak valid.')
  }
}

assertExists(path.join(ROOT_DIR, 'dist', 'apps', 'web', 'index.html'), 'Build web')
assertExists(path.join(ROOT_DIR, 'apps', 'mobile', 'dist', 'index.html'), 'Build mobile')

await checkBackend()

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure)
  }

  process.exit(1)
}

console.log('Smoke check passed.')

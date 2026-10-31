import { createHmac, timingSafeEqual } from 'node:crypto'

const FILE_ACCESS_TOKEN_TTL_MS = 6 * 60 * 60 * 1000

function getFileAccessSecret() {
  return (process.env.FILE_ACCESS_TOKEN_SECRET ?? process.env.SHOPEE_EXTENSION_API_KEY ?? '').trim()
}

export function normalizeFileAccessPath(value: string) {
  let decoded = value
  try {
    decoded = decodeURIComponent(value)
  } catch {
    // Biarkan path apa adanya kalau encoding tidak valid.
  }

  return decoded.replace(/\\/g, '/').replace(/^\/+/, '')
}

function signFileAccessPath(filePath: string, expiresAt: number) {
  return createHmac('sha256', getFileAccessSecret()).update(`${filePath}\n${expiresAt}`).digest('base64url')
}

export function createFileAccessToken(filePath: string, now = Date.now()) {
  if (!getFileAccessSecret()) return null

  const expiresAt = now + FILE_ACCESS_TOKEN_TTL_MS
  return `${expiresAt}.${signFileAccessPath(normalizeFileAccessPath(filePath), expiresAt)}`
}

export function appendFileAccessToken(fileUrl: string, filePath: string) {
  const token = createFileAccessToken(filePath)
  if (!token) return fileUrl

  const separator = fileUrl.includes('?') ? '&' : '?'
  return `${fileUrl}${separator}token=${encodeURIComponent(token)}`
}

export function hasValidFileAccessToken(filePath: string, token: string | null | undefined, now = Date.now()) {
  if (!getFileAccessSecret() || !token) return false

  const separatorIndex = token.indexOf('.')
  if (separatorIndex <= 0) return false

  const expiresAt = Number(token.slice(0, separatorIndex))
  if (!Number.isFinite(expiresAt) || expiresAt < now) return false

  const provided = Buffer.from(token.slice(separatorIndex + 1))
  const expected = Buffer.from(signFileAccessPath(normalizeFileAccessPath(filePath), expiresAt))

  return provided.length === expected.length && timingSafeEqual(provided, expected)
}

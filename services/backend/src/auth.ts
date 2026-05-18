import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const PASSWORD_KEY_LENGTH = 64

export type PasswordDigest = {
  salt: string
  hash: string
}

export function createPasswordDigest(password: string): PasswordDigest {
  const salt = randomBytes(16).toString('hex')
  return {
    salt,
    hash: hashPassword(password, salt),
  }
}

export function verifyPassword(password: string, salt: string, expectedHash: string) {
  const actualHash = expectedHash.length <= 64 ? hashPasswordLegacy(password, salt) : hashPassword(password, salt)
  return safeEqualHex(actualHash, expectedHash)
}

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, PASSWORD_KEY_LENGTH).toString('hex')
}

function hashPasswordLegacy(password: string, salt: string) {
  return createHash('sha256').update(`${salt}:${password}`).digest('hex')
}

function safeEqualHex(left: string, right: string) {
  const leftBuffer = Buffer.from(left, 'hex')
  const rightBuffer = Buffer.from(right, 'hex')

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return timingSafeEqual(leftBuffer, rightBuffer)
}

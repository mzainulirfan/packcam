import { useSyncExternalStore } from 'react'
import { readCollection, removeCollection, writeCollection } from '../data/storage'
import type { OperatorProfile, OperatorRole, OperatorSession } from '../data/types'

type Listener = () => void

const OPERATOR_SESSION_KEY = 'operatorSession'
const OPERATOR_PROFILES_KEY = 'operatorProfiles'
const DEFAULT_ADMIN_PASSWORD_SALT = 'packcam-admin-salt'
const DEFAULT_ADMIN_PASSWORD_HASH = 'a87f70ea73243b073a69205817ed9d14df563133165cca13c4b505e2d2684d0c'
const DEFAULT_ADMIN_PROFILE: OperatorProfile = {
  fullName: 'Administrator',
  operatorName: 'admin',
  operatorCode: '001',
  role: 'admin',
  lastUsedAt: '1970-01-01T00:00:00.000Z',
  passwordSalt: DEFAULT_ADMIN_PASSWORD_SALT,
  passwordHash: DEFAULT_ADMIN_PASSWORD_HASH,
}

let currentSession: OperatorSession | null = readStoredSession()
let currentProfiles: OperatorProfile[] = readStoredProfiles()
const listeners = new Set<Listener>()

function readStoredSession() {
  const stored = readCollection<unknown>(OPERATOR_SESSION_KEY, null)
  return isOperatorSession(stored) ? stored : null
}

function readStoredProfiles() {
  const stored = readCollection<unknown>(OPERATOR_PROFILES_KEY, [])

  const profiles = Array.isArray(stored)
    ? (stored.map(sanitizeOperatorProfile).filter(Boolean) as OperatorProfile[])
    : []

  return ensureDefaultAdminProfile(dedupeProfiles(sortProfiles(profiles)))
}

function emitChange() {
  for (const listener of listeners) {
    listener()
  }
}

function setStoredSession(nextSession: OperatorSession | null) {
  currentSession = nextSession

  if (nextSession) {
    writeCollection(OPERATOR_SESSION_KEY, nextSession)
    touchOperatorProfile(nextSession.operatorName, nextSession.operatorCode, nextSession.role)
  } else {
    removeCollection(OPERATOR_SESSION_KEY)
  }

  emitChange()
}

function touchOperatorProfile(operatorName: string, operatorCode: string, role: OperatorRole) {
  const normalizedName = operatorName.trim()
  const normalizedCode = operatorCode.trim()
  const normalizedRole = role ?? 'operator'

  currentProfiles = currentProfiles.map((profile) => {
    if (!isSameIdentity(profile, normalizedName, normalizedCode, normalizedRole)) {
      return profile
    }

    return {
      ...profile,
      lastUsedAt: new Date().toISOString(),
    }
  })

  currentProfiles = dedupeProfiles(sortProfiles(currentProfiles))
  writeCollection(OPERATOR_PROFILES_KEY, currentProfiles)
}

function sortProfiles(profiles: OperatorProfile[]) {
  return [...profiles].sort((left, right) => right.lastUsedAt.localeCompare(left.lastUsedAt))
}

function dedupeProfiles(profiles: OperatorProfile[]) {
  const seenNames = new Set<string>()
  const seenCodes = new Set<string>()

  return profiles.filter((profile) => {
    const nameKey = normalizeKey(profile.operatorName)
    const codeKey = normalizeKey(profile.operatorCode)

    if (seenNames.has(nameKey) || seenCodes.has(codeKey)) {
      return false
    }

    seenNames.add(nameKey)
    seenCodes.add(codeKey)
    return true
  })
}

function ensureDefaultAdminProfile(profiles: OperatorProfile[]) {
  const hasDefaultAdmin = profiles.some((profile) =>
    isSameIdentity(profile, DEFAULT_ADMIN_PROFILE.operatorName, DEFAULT_ADMIN_PROFILE.operatorCode, DEFAULT_ADMIN_PROFILE.role),
  )

  if (hasDefaultAdmin) {
    return profiles
  }

  return sortProfiles([DEFAULT_ADMIN_PROFILE, ...profiles])
}

function isOperatorSession(value: unknown): value is OperatorSession {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as OperatorSession).operatorName === 'string' &&
      typeof (value as OperatorSession).operatorCode === 'string' &&
      ((value as OperatorSession).role === 'admin' || (value as OperatorSession).role === 'operator') &&
      typeof (value as OperatorSession).loggedInAt === 'string',
  )
}

function sanitizeOperatorProfile(value: unknown): OperatorProfile | null {
  if (
    !value ||
    typeof value !== 'object' ||
    typeof (value as OperatorProfile).operatorName !== 'string' ||
    typeof (value as OperatorProfile).operatorCode !== 'string' ||
    typeof (value as OperatorProfile).lastUsedAt !== 'string'
  ) {
    return null
  }

  return {
    fullName:
      'fullName' in value && typeof (value as OperatorProfile).fullName === 'string'
        ? (value as OperatorProfile).fullName
        : null,
    operatorName: (value as OperatorProfile).operatorName,
    operatorCode: (value as OperatorProfile).operatorCode,
    role: (value as OperatorProfile).role === 'admin' ? 'admin' : 'operator',
    lastUsedAt: (value as OperatorProfile).lastUsedAt,
    passwordSalt:
      'passwordSalt' in value && typeof (value as OperatorProfile).passwordSalt === 'string'
        ? (value as OperatorProfile).passwordSalt
        : null,
    passwordHash:
      'passwordHash' in value && typeof (value as OperatorProfile).passwordHash === 'string'
        ? (value as OperatorProfile).passwordHash
        : null,
  }
}

export async function loginOperator(
  operatorName: string,
  password: string,
) {
  return authOperatorByUsername(operatorName, password)
}

export async function upsertOperatorProfile(
  operatorName: string,
  operatorCode: string,
  password?: string,
  fullName: string | null = null,
  role: OperatorRole = 'operator',
  previousIdentity?: {
    operatorName: string
    operatorCode: string
    role: OperatorRole
  } | null,
) {
  const nextIdentity = {
    operatorName: operatorName.trim(),
    operatorCode: operatorCode.trim(),
    role: role ?? 'operator',
  }
  const previous = normalizeIdentity(previousIdentity)
  const normalizedPassword = password?.trim() ?? ''

  if (!nextIdentity.operatorName || !nextIdentity.operatorCode) {
    throw new Error('Nama operator dan kode user wajib diisi.')
  }

  const targetProfile = findProfileByIdentity(nextIdentity) ?? (previous ? findProfileByIdentity(previous) : null)

  if (!targetProfile && !normalizedPassword) {
    throw new Error('Kata sandi wajib diisi untuk operator baru.')
  }

  const duplicateName = findProfileByName(nextIdentity.operatorName)
  if (duplicateName && !isSameIdentityByName(duplicateName, previous)) {
    throw new Error('Nama operator sudah digunakan. Gunakan nama yang berbeda.')
  }

  const duplicateCode = findProfileByCode(nextIdentity.operatorCode)
  if (duplicateCode && !isSameIdentityByCode(duplicateCode, previous)) {
    throw new Error('Kode user sudah digunakan. Gunakan kode yang berbeda.')
  }

  const passwordSalt = normalizedPassword
    ? makeSalt()
    : targetProfile?.passwordSalt ?? null
  const passwordHash = normalizedPassword
    ? await hashPassword(normalizedPassword, passwordSalt ?? makeSalt())
    : targetProfile?.passwordHash ?? null

  currentProfiles = currentProfiles.filter((profile) => {
    const currentIdentity = identityFromProfile(profile)

    if (isSameIdentityValues(currentIdentity, nextIdentity)) {
      return false
    }

    if (previous && isSameIdentityValues(currentIdentity, previous)) {
      return false
    }

    return true
  })

  const nextProfile: OperatorProfile = {
    fullName: fullName?.trim() || null,
    operatorName: nextIdentity.operatorName,
    operatorCode: nextIdentity.operatorCode,
    role: nextIdentity.role,
    lastUsedAt: new Date().toISOString(),
    passwordSalt,
    passwordHash,
  }

  currentProfiles = dedupeProfiles(sortProfiles([nextProfile, ...currentProfiles])).slice(0, 12)
  writeCollection(OPERATOR_PROFILES_KEY, currentProfiles)
  emitChange()

  return nextProfile
}

export async function authOperator(
  operatorName: string,
  operatorCode: string,
  password: string,
  role: OperatorRole = 'operator',
) {
  const normalizedName = operatorName.trim()
  const normalizedCode = operatorCode.trim()
  const normalizedPassword = password.trim()
  const normalizedRole = role ?? 'operator'

  if (!normalizedName || !normalizedCode || !normalizedPassword) {
    throw new Error('Nama operator, kode user, dan kata sandi wajib diisi.')
  }

  const existingProfile = currentProfiles.find((profile) =>
    isSameIdentity(profile, normalizedName, normalizedCode, normalizedRole),
  )

  if (!existingProfile) {
    throw new Error('Akun tidak ditemukan. Silakan minta admin membuat akun terlebih dahulu.')
  }

  if (existingProfile.passwordHash && existingProfile.passwordSalt) {
    const valid = await verifyPassword(
      normalizedPassword,
      existingProfile.passwordSalt,
      existingProfile.passwordHash,
    )

    if (!valid) {
      throw new Error('Kata sandi salah.')
    }

    updateOperatorProfileSecret(
      normalizedName,
      normalizedCode,
      normalizedRole,
      existingProfile.passwordSalt,
      existingProfile.passwordHash,
    )
  } else {
    const salt = makeSalt()
    const hash = await hashPassword(normalizedPassword, salt)

    updateOperatorProfileSecret(normalizedName, normalizedCode, normalizedRole, salt, hash)
  }

  const nextSession: OperatorSession = {
    operatorName: normalizedName,
    operatorCode: normalizedCode,
    role: normalizedRole,
    loggedInAt: new Date().toISOString(),
  }

  setStoredSession(nextSession)
  return nextSession
}

export async function authOperatorByUsername(operatorName: string, password: string) {
  const normalizedName = operatorName.trim()
  const normalizedPassword = password.trim()

  if (!normalizedName || !normalizedPassword) {
    throw new Error('Username dan kata sandi wajib diisi.')
  }

  const existingProfile = findProfileByName(normalizedName)

  if (!existingProfile) {
    throw new Error('Akun tidak ditemukan. Silakan minta admin membuat akun terlebih dahulu.')
  }

  if (!existingProfile.passwordHash || !existingProfile.passwordSalt) {
    throw new Error('Akun belum memiliki kata sandi. Silakan minta admin mengatur ulang akun.')
  }

  const valid = await verifyPassword(
    normalizedPassword,
    existingProfile.passwordSalt,
    existingProfile.passwordHash,
  )

  if (!valid) {
    throw new Error('Kata sandi salah.')
  }

  const nextSession: OperatorSession = {
    operatorName: existingProfile.operatorName,
    operatorCode: existingProfile.operatorCode,
    role: existingProfile.role,
    loggedInAt: new Date().toISOString(),
  }

  setStoredSession(nextSession)
  return nextSession
}

export function logoutOperator() {
  setStoredSession(null)
}

export function getOperatorProfiles() {
  return currentProfiles
}

export function removeOperatorProfile(
  operatorName: string,
  operatorCode: string,
  role: OperatorRole = 'operator',
) {
  const normalizedName = operatorName.trim()
  const normalizedCode = operatorCode.trim()
  const normalizedRole = role ?? 'operator'

  if (
    isSameIdentity(
      DEFAULT_ADMIN_PROFILE,
      normalizedName,
      normalizedCode,
      normalizedRole,
    )
  ) {
    return
  }

  currentProfiles = currentProfiles.filter((profile) => !isSameIdentity(profile, normalizedName, normalizedCode, normalizedRole))

  if (!currentProfiles.length) {
    currentProfiles = [DEFAULT_ADMIN_PROFILE]
  }

  currentProfiles = sortProfiles(currentProfiles)
  writeCollection(OPERATOR_PROFILES_KEY, currentProfiles)
  if (
    currentSession &&
    isSameIdentity(currentSession, normalizedName, normalizedCode, normalizedRole)
  ) {
    removeCollection(OPERATOR_SESSION_KEY)
    currentSession = null
  }
  emitChange()
}

export async function resetOperatorPassword(
  operatorName: string,
  operatorCode: string,
  password: string,
  role: OperatorRole = 'operator',
) {
  return updateOperatorPassword(operatorName, operatorCode, password, role)
}

export async function updateOperatorPassword(
  operatorName: string,
  operatorCode: string,
  password: string,
  role: OperatorRole = 'operator',
) {
  const normalizedName = operatorName.trim()
  const normalizedCode = operatorCode.trim()
  const normalizedPassword = password.trim()
  const normalizedRole = role ?? 'operator'

  if (!normalizedName || !normalizedCode || !normalizedPassword) {
    throw new Error('Nama operator, kode user, dan kata sandi wajib diisi.')
  }

  const targetProfile = findProfileByIdentity({
    operatorName: normalizedName,
    operatorCode: normalizedCode,
    role: normalizedRole,
  })

  if (!targetProfile) {
    throw new Error('Akun tidak ditemukan.')
  }

  const salt = makeSalt()
  const hash = await hashPassword(normalizedPassword, salt)

  currentProfiles = currentProfiles.map((profile) => {
    if (!isSameIdentity(profile, normalizedName, normalizedCode, normalizedRole)) {
      return profile
    }

    return {
      ...profile,
      passwordSalt: salt,
      passwordHash: hash,
      lastUsedAt: new Date().toISOString(),
    }
  })

  writeCollection(OPERATOR_PROFILES_KEY, currentProfiles)
  emitChange()

  return {
    ...targetProfile,
    passwordSalt: salt,
    passwordHash: hash,
  }
}

function updateOperatorProfileSecret(
  operatorName: string,
  operatorCode: string,
  role: OperatorRole,
  passwordSalt: string,
  passwordHash: string,
) {
  const normalizedName = operatorName.trim()
  const normalizedCode = operatorCode.trim()
  const normalizedRole = role ?? 'operator'

  currentProfiles = currentProfiles.map((profile) => {
    if (!isSameIdentity(profile, normalizedName, normalizedCode, normalizedRole)) {
      return profile
    }

    return {
      ...profile,
      passwordSalt,
      passwordHash,
      lastUsedAt: new Date().toISOString(),
    }
  })

  writeCollection(OPERATOR_PROFILES_KEY, currentProfiles)
  emitChange()
}

function isSameIdentity(
  value: {
    operatorName: string
    operatorCode: string
    role?: OperatorRole
  },
  operatorName: string,
  operatorCode: string,
  role: OperatorRole,
) {
  return (
    value.operatorName.trim() === operatorName.trim() &&
    value.operatorCode.trim() === operatorCode.trim() &&
    (value.role ?? 'operator') === (role ?? 'operator')
  )
}

function isSameIdentityValues(
  left: {
    operatorName: string
    operatorCode: string
    role: OperatorRole
  } | null,
  right: {
    operatorName: string
    operatorCode: string
    role: OperatorRole
  } | null,
) {
  if (!left || !right) {
    return false
  }

  return (
    left.operatorName === right.operatorName &&
    left.operatorCode === right.operatorCode &&
    left.role === right.role
  )
}

function identityFromProfile(profile: {
  operatorName: string
  operatorCode: string
  role?: OperatorRole
}) {
  return {
    operatorName: profile.operatorName,
    operatorCode: profile.operatorCode,
    role: profile.role ?? 'operator',
  }
}

function findProfileByIdentity(
  identity: {
    operatorName: string
    operatorCode: string
    role: OperatorRole
  } | null,
) {
  if (!identity) {
    return null
  }

  return (
    currentProfiles.find((profile) =>
      isSameIdentity(profile, identity.operatorName, identity.operatorCode, identity.role),
    ) ?? null
  )
}

function findProfileByName(operatorName: string) {
  const normalizedName = normalizeKey(operatorName)

  return currentProfiles.find((profile) => normalizeKey(profile.operatorName) === normalizedName) ?? null
}

function findProfileByCode(operatorCode: string) {
  const normalizedCode = normalizeKey(operatorCode)

  return currentProfiles.find((profile) => normalizeKey(profile.operatorCode) === normalizedCode) ?? null
}

function normalizeIdentity(
  value: {
    operatorName: string
    operatorCode: string
    role: OperatorRole
  } | null | undefined,
) {
  if (!value) {
    return null
  }

  return {
    operatorName: value.operatorName.trim(),
    operatorCode: value.operatorCode.trim(),
    role: value.role ?? 'operator',
  }
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase()
}

function isSameIdentityByName(
  profile: {
    operatorName: string
    operatorCode: string
    role?: OperatorRole
  },
  previous: {
    operatorName: string
    operatorCode: string
    role: OperatorRole
  } | null,
) {
  if (!previous) {
    return false
  }

  return normalizeKey(profile.operatorName) === normalizeKey(previous.operatorName)
}

function isSameIdentityByCode(
  profile: {
    operatorName: string
    operatorCode: string
    role?: OperatorRole
  },
  previous: {
    operatorName: string
    operatorCode: string
    role: OperatorRole
  } | null,
) {
  if (!previous) {
    return false
  }

  return normalizeKey(profile.operatorCode) === normalizeKey(previous.operatorCode)
}

function makeSalt() {
  return globalThis.crypto?.randomUUID?.() ?? `salt_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

async function hashPassword(password: string, salt: string) {
  const encoded = new TextEncoder().encode(`${salt}:${password}`)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return bytesToHex(new Uint8Array(digest))
}

async function verifyPassword(password: string, salt: string, expectedHash: string) {
  return (await hashPassword(password, salt)) === expectedHash
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function useOperatorProfiles() {
  return useSyncExternalStore(subscribe, getProfilesSnapshot, getServerProfilesSnapshot)
}

export function useOperatorSession() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export function getOperatorSession() {
  return currentSession
}

function getSnapshot() {
  return currentSession
}

function getServerSnapshot(): OperatorSession | null {
  return null
}

function getProfilesSnapshot() {
  return currentProfiles
}

function getServerProfilesSnapshot() {
  return []
}

function subscribe(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

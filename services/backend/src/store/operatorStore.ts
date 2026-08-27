import type { OperatorProfile, OperatorRole, WorkTask } from '@pakti/types'

import { createPasswordDigest } from '../auth'
import { getDb, ensureServerStorage } from '../db'
import { broadcastBackendEvent } from '../realtime'

type OperatorProfileRow = {
  operator_name: string
  operator_code: string
  role: OperatorRole
  task_type: WorkTask
  full_name: string | null
  last_used_at: string
  password_salt: string | null
  password_hash: string | null
}

function db() {
  ensureServerStorage()
  return getDb()
}

function nowIso() {
  return new Date().toISOString()
}

function normalizeTaskType(value: WorkTask | string | undefined | null): WorkTask {
  return value === 'packing' ? 'packing' : 'qc'
}

function normalizeOperatorName(value: string) {
  return value.trim()
}

function normalizeOperatorCode(value: string) {
  return value.trim()
}

function normalizeRole(value: OperatorRole | string | undefined | null): OperatorRole {
  return value === 'admin' ? 'admin' : 'operator'
}

function mapOperatorProfile(row: OperatorProfileRow): OperatorProfile {
  return {
    fullName: row.full_name,
    operatorName: row.operator_name,
    operatorCode: row.operator_code,
    role: row.role,
    taskType: row.task_type,
    lastUsedAt: row.last_used_at,
    passwordSalt: row.password_salt,
    passwordHash: row.password_hash,
  }
}

function isSameIdentity(row: OperatorProfileRow, operatorName: string, operatorCode: string, role: OperatorRole) {
  return (
    row.operator_name.trim().toLowerCase() === operatorName.trim().toLowerCase() &&
    row.operator_code.trim().toLowerCase() === operatorCode.trim().toLowerCase() &&
    row.role === role
  )
}

export function getBootstrapStatus() {
  const operatorCount = db()
    .prepare(`SELECT COUNT(*) AS count FROM operator_profiles`)
    .get() as { count: number }
  const adminCount = db()
    .prepare(`SELECT COUNT(*) AS count FROM operator_profiles WHERE role = 'admin'`)
    .get() as { count: number }

  return {
    needsSetup: (operatorCount.count ?? 0) === 0,
    adminCount: adminCount.count ?? 0,
    operatorCount: operatorCount.count ?? 0,
  }
}

export function listOperatorProfiles() {
  const rows = db()
    .prepare(
      `SELECT operator_name, operator_code, role, task_type, full_name, last_used_at, password_salt, password_hash
       FROM operator_profiles
       ORDER BY last_used_at DESC`,
    )
    .all() as OperatorProfileRow[]

  return rows.map(mapOperatorProfile)
}

export function findOperatorProfile(operatorName: string, operatorCode: string, role: OperatorRole) {
  const row = db()
    .prepare(
      `SELECT operator_name, operator_code, role, task_type, full_name, last_used_at, password_salt, password_hash
       FROM operator_profiles
       WHERE LOWER(operator_name) = LOWER(?)
         AND LOWER(operator_code) = LOWER(?)
         AND role = ?
       LIMIT 1`,
    )
    .get(normalizeOperatorName(operatorName), normalizeOperatorCode(operatorCode), role) as OperatorProfileRow | undefined

  return row ? mapOperatorProfile(row) : null
}

export function findProfileByName(operatorName: string) {
  const row = db()
    .prepare(
      `SELECT operator_name, operator_code, role, task_type, full_name, last_used_at, password_salt, password_hash
       FROM operator_profiles
       WHERE LOWER(operator_name) = LOWER(?)
       LIMIT 1`,
    )
    .get(normalizeOperatorName(operatorName)) as OperatorProfileRow | undefined

  return row ? mapOperatorProfile(row) : null
}

export function upsertOperatorProfile(input: {
  operatorName: string
  operatorCode: string
  role?: OperatorRole | null
  taskType?: WorkTask | null
  fullName?: string | null
  password?: string | null
}) {
  const operatorName = normalizeOperatorName(input.operatorName)
  const operatorCode = normalizeOperatorCode(input.operatorCode)
  const role = normalizeRole(input.role)
  const taskType = normalizeTaskType(input.taskType)

  if (!operatorName || !operatorCode) {
    throw new Error('Nama operator dan kode user wajib diisi.')
  }

  const existing = findOperatorProfile(operatorName, operatorCode, role)
  const passwordValue = input.password?.trim() ?? ''
  const digest = passwordValue ? createPasswordDigest(passwordValue) : null
  const passwordSalt = digest?.salt ?? existing?.passwordSalt ?? null
  const passwordHash = digest?.hash ?? existing?.passwordHash ?? null

  if (!passwordHash || !passwordSalt) {
    throw new Error('Kata sandi wajib diisi untuk akun baru.')
  }

  const duplicateName = db()
    .prepare(
      `SELECT operator_name, operator_code, role, task_type, full_name, last_used_at, password_salt, password_hash
       FROM operator_profiles
       WHERE LOWER(operator_name) = LOWER(?)
       LIMIT 1`,
    )
    .get(operatorName) as OperatorProfileRow | undefined

  if (duplicateName && !isSameIdentity(duplicateName, operatorName, operatorCode, role)) {
    throw new Error('Nama operator sudah digunakan.')
  }

  const duplicateCode = db()
    .prepare(
      `SELECT operator_name, operator_code, role, task_type, full_name, last_used_at, password_salt, password_hash
       FROM operator_profiles
       WHERE LOWER(operator_code) = LOWER(?)
       LIMIT 1`,
    )
    .get(operatorCode) as OperatorProfileRow | undefined

  if (duplicateCode && !isSameIdentity(duplicateCode, operatorName, operatorCode, role)) {
    throw new Error('Kode user sudah digunakan.')
  }

  const timestamp = nowIso()
  db().prepare(
    `INSERT INTO operator_profiles (
      operator_name,
      operator_code,
      role,
      task_type,
      full_name,
      last_used_at,
      password_salt,
      password_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(operator_name, operator_code, role) DO UPDATE SET
      task_type = excluded.task_type,
      full_name = excluded.full_name,
      last_used_at = excluded.last_used_at,
      password_salt = excluded.password_salt,
      password_hash = excluded.password_hash`,
  ).run(operatorName, operatorCode, role, taskType, input.fullName?.trim() || null, timestamp, passwordSalt, passwordHash)

  db().prepare(
    `UPDATE operator_sessions
     SET task_type = ?, updated_at = ?
     WHERE LOWER(operator_name) = LOWER(?)
       AND LOWER(operator_code) = LOWER(?)
       AND role = ?`,
  ).run(taskType, timestamp, operatorName, operatorCode, role)

  broadcastBackendEvent('operators-updated', { operatorName, operatorCode, role, taskType, updatedAt: timestamp })
  broadcastBackendEvent('sessions-updated', { operatorName, operatorCode, role, taskType, updatedAt: timestamp })
  return findOperatorProfile(operatorName, operatorCode, role)
}

export function deleteOperatorProfile(operatorName: string, operatorCode: string, role: OperatorRole) {
  const profile = findOperatorProfile(operatorName, operatorCode, role)

  if (!profile) {
    return false
  }

  const adminCount = db()
    .prepare(`SELECT COUNT(*) AS count FROM operator_profiles WHERE role = 'admin'`)
    .get() as { count: number }

  if (role === 'admin' && (adminCount.count ?? 0) <= 1) {
    throw new Error('Minimal satu akun admin harus tetap ada.')
  }

  db()
    .prepare(
      `DELETE FROM operator_profiles
       WHERE LOWER(operator_name) = LOWER(?)
         AND LOWER(operator_code) = LOWER(?)
         AND role = ?`,
    )
    .run(normalizeOperatorName(operatorName), normalizeOperatorCode(operatorCode), role)

  db()
    .prepare(
      `DELETE FROM operator_sessions
       WHERE LOWER(operator_name) = LOWER(?)
         AND LOWER(operator_code) = LOWER(?)
         AND role = ?`,
    )
    .run(normalizeOperatorName(operatorName), normalizeOperatorCode(operatorCode), role)

  broadcastBackendEvent('operators-updated', { operatorName, operatorCode, role, deleted: true })
  broadcastBackendEvent('sessions-updated', { operatorName, operatorCode, role, deleted: true })
  return true
}

export function resetOperatorPassword(
  operatorName: string,
  operatorCode: string,
  role: OperatorRole,
  password: string,
) {
  const profile = findOperatorProfile(operatorName, operatorCode, role)
  if (!profile) {
    throw new Error('Akun tidak ditemukan.')
  }

  const digest = createPasswordDigest(password)
  db()
    .prepare(
      `UPDATE operator_profiles
       SET password_salt = ?, password_hash = ?, last_used_at = ?
       WHERE LOWER(operator_name) = LOWER(?)
         AND LOWER(operator_code) = LOWER(?)
         AND role = ?`,
    )
    .run(digest.salt, digest.hash, nowIso(), normalizeOperatorName(operatorName), normalizeOperatorCode(operatorCode), role)

  broadcastBackendEvent('operators-updated', { operatorName, operatorCode, role, passwordReset: true })
  return findOperatorProfile(operatorName, operatorCode, role)
}

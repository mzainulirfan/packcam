import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

import { DEFAULT_APP_SETTINGS, DEFAULT_SYSTEM_CONFIG } from '@pakti/shared/defaults'
import type { AppSettings, OperatorProfile, OperatorRole, RecordingStatus, SystemConfig, WorkTask } from '@pakti/types'
import ffmpegStatic from 'ffmpeg-static'

import { getDb, getDbPath, getPendingRecordingsDir, getUploadsDir, ensureServerStorage } from './db'
import { createPasswordDigest, verifyPassword } from './auth'
import type { HttpSession } from './http'
import { broadcastBackendEvent } from './realtime'

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

type SessionRow = {
  session_id: string
  operator_name: string
  operator_code: string
  role: OperatorRole
  task_type: WorkTask
  created_at: string
  updated_at: string
}

type RecordingRow = {
  id: string
  resi_number: string
  task_type: WorkTask
  operator_name: string | null
  operator_code: string | null
  file_name: string
  file_path: string
  file_size_bytes: number | null
  record_date: string
  start_time: string
  end_time: string | null
  duration_seconds: number | null
  status: RecordingStatus
  note: string | null
  created_at: string
  updated_at: string
  share_file_name?: string
  share_file_path?: string
  share_file_mime_type?: string
  share_file_ready?: boolean
}

type RecordingShareFileInfo = {
  fileName: string
  filePath: string
  mimeType: string
  outputPath: string
  isReady: boolean
}

type ScanLogRow = {
  id: string
  resi_number: string
  task_type: WorkTask
  operator_name: string | null
  operator_code: string | null
  scan_time: string
  action: 'start' | 'stop' | 'duplicate' | 'invalid'
  message: string | null
}

type LastErrorRow = {
  message: string
  createdAt: string
}

type RecordingDraftInput = {
  id?: string
  resiNumber: string
  taskType: WorkTask
  operatorName: string
  operatorCode: string
  startedAt?: string
  fileName?: string
  filePath?: string
  fileSizeBytes?: number | null
  status?: RecordingStatus
  note?: string | null
}

const JSON_STATE_KEY = 'current'
const MAX_SCAN_LOGS = 500
const LEGACY_SYSTEM_TAGLINE = 'Aplikasi yang membantu UMKM merekam proses QC dan packing paket secara lebih rapi.'
const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS ?? 12)
const SESSION_TTL_MS = Math.max(1, SESSION_TTL_HOURS) * 60 * 60 * 1000
const WATERMARK_TIME_ZONE = process.env.PAKTI_TIME_ZONE || 'Asia/Jakarta'
const SHOPEE_VIDEO_LIMIT_BYTES = 25 * 1024 * 1024
const SHARE_VIDEO_TARGET_BYTES = 24 * 1024 * 1024
const SHARE_MAX_VIDEO_BITRATE = 1_200_000
const SHARE_MIN_VIDEO_BITRATE = 80_000
let watermarkQueue = Promise.resolve()

function nowIso() {
  return new Date().toISOString()
}

function makeId(prefix: string) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function normalizeTaskType(value: WorkTask | string | undefined | null): WorkTask {
  return value === 'packing' ? 'packing' : 'qc'
}

function canStartPackingForResi(resiNumber: string) {
  const row = db()
    .prepare(
      `SELECT COUNT(*) AS count
       FROM recordings
       WHERE resi_number = ?
         AND task_type = 'qc'
         AND status = 'completed'`,
    )
    .get(resiNumber.trim()) as { count: number }

  return (row.count ?? 0) > 0
}

function assertValidVideoRootPath(value: string) {
  const normalized = value.trim().replace(/\\/g, '/')

  if (!normalized) {
    throw new Error('Folder video wajib diisi.')
  }

  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
    throw new Error('Folder video harus menggunakan path relatif, bukan path absolut.')
  }

  if (normalized.split('/').some((segment) => segment === '..')) {
    throw new Error('Folder video tidak boleh mengandung "..".')
  }

  if (/[<>:"|?*\0]/.test(normalized)) {
    throw new Error('Folder video mengandung karakter yang tidak valid.')
  }

  return normalized.replace(/\/+/g, '/').replace(/^\.\/+/, '')
}

function normalizeVideoRootPath(value: string | null | undefined, fallback = DEFAULT_APP_SETTINGS.videoRootPath) {
  try {
    return assertValidVideoRootPath(value ?? fallback)
  } catch {
    return fallback
  }
}

function sanitizeFileSegment(value: string) {
  return value.trim().replace(/[^\w-]+/g, '_') || 'recording'
}

function sanitizeFileName(value: string) {
  const parsed = path.posix.parse(value.trim().replace(/\\/g, '/'))
  const extension = parsed.ext.toLowerCase() === '.mp4' ? '.mp4' : '.webm'
  return `${sanitizeFileSegment(parsed.name)}${extension}`
}

function assertSafeRelativeFilePath(value: string) {
  const normalized = value.trim().replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.\/+/, '')

  if (!normalized) {
    throw new Error('Path file recording wajib diisi.')
  }

  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
    throw new Error('Path file recording harus relatif.')
  }

  if (normalized.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('Path file recording mengandung segment tidak valid.')
  }

  if (/[<>:"|?*\0]/.test(normalized)) {
    throw new Error('Path file recording mengandung karakter tidak valid.')
  }

  return normalized
}

function formatRecordingTimestamp(startedAt: Date) {
  const year = startedAt.getFullYear()
  const month = `${startedAt.getMonth() + 1}`.padStart(2, '0')
  const day = `${startedAt.getDate()}`.padStart(2, '0')
  const hours = `${startedAt.getHours()}`.padStart(2, '0')
  const minutes = `${startedAt.getMinutes()}`.padStart(2, '0')
  const seconds = `${startedAt.getSeconds()}`.padStart(2, '0')
  const milliseconds = `${startedAt.getMilliseconds()}`.padStart(3, '0')

  return `${year}${month}${day}_${hours}${minutes}${seconds}_${milliseconds}`
}

function buildRecordingFileName(resiNumber: string, format: string, taskType: WorkTask, startedAt: Date) {
  const prefix = normalizeTaskType(taskType)
  const extension = format.trim() === 'mp4' ? 'mp4' : 'webm'
  const timestamp = formatRecordingTimestamp(startedAt)
  return `${prefix}_${sanitizeFileSegment(resiNumber)}_${timestamp}.${extension}`
}

function db() {
  ensureServerStorage()
  return getDb()
}

function readJsonRowMeta<T>(table: string, fallback: T) {
  const row = db()
    .prepare(`SELECT value, updated_at FROM ${table} WHERE key = ? LIMIT 1`)
    .get(JSON_STATE_KEY) as { value?: string; updated_at?: string } | undefined

  if (!row?.value) {
    return {
      value: fallback,
      updatedAt: null as string | null,
    }
  }

  try {
    return {
      value: JSON.parse(row.value) as T,
      updatedAt: row.updated_at ?? null,
    }
  } catch {
    return {
      value: fallback,
      updatedAt: row.updated_at ?? null,
    }
  }
}

function writeJsonRow(table: string, value: unknown) {
  const timestamp = nowIso()
  db().prepare(
    `INSERT INTO ${table} (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(JSON_STATE_KEY, JSON.stringify(value), timestamp)

  return timestamp
}

function removeJsonRow(table: string) {
  db().prepare(`DELETE FROM ${table} WHERE key = ?`).run(JSON_STATE_KEY)
}

function sanitizeSystemConfig(value: Partial<SystemConfig> | null | undefined): SystemConfig {
  const next = value ?? {}
  const tagline = next.tagline?.trim()
  return {
    appName: next.appName?.trim() || DEFAULT_SYSTEM_CONFIG.appName,
    tagline: tagline && tagline !== LEGACY_SYSTEM_TAGLINE ? tagline : DEFAULT_SYSTEM_CONFIG.tagline,
    brandMark: next.brandMark?.trim() || DEFAULT_SYSTEM_CONFIG.brandMark,
  }
}

function sanitizeSettings(value: Partial<AppSettings> | null | undefined): AppSettings {
  const next = value ?? {}
  return {
    videoRootPath: normalizeVideoRootPath(next.videoRootPath),
    videoFormat: next.videoFormat === 'mp4' ? 'mp4' : 'webm',
    videoResolution: next.videoResolution?.trim() || DEFAULT_APP_SETTINGS.videoResolution,
    videoBitrate: next.videoBitrate?.trim() || DEFAULT_APP_SETTINGS.videoBitrate,
    cameraDeviceId: next.cameraDeviceId?.trim() || DEFAULT_APP_SETTINGS.cameraDeviceId,
    autoOpenFolder: Boolean(next.autoOpenFolder),
  }
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

function mapSession(row: SessionRow): HttpSession {
  return {
    sessionId: row.session_id,
    operatorName: row.operator_name,
    operatorCode: row.operator_code,
    role: row.role,
    taskType: row.task_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
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

function isSameIdentity(row: OperatorProfileRow | SessionRow, operatorName: string, operatorCode: string, role: OperatorRole) {
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

export function getHealthSnapshot() {
  const database = db()

  const counts = {
    operatorProfiles: database.prepare('SELECT COUNT(*) AS count FROM operator_profiles').get() as { count: number },
    sessions: database.prepare('SELECT COUNT(*) AS count FROM operator_sessions').get() as { count: number },
    recordings: database.prepare('SELECT COUNT(*) AS count FROM recordings').get() as { count: number },
    scanLogs: database.prepare('SELECT COUNT(*) AS count FROM scan_logs').get() as { count: number },
  }

  return {
    dbPath: getDbPath(),
    uploadDir: getUploadsDir(),
    setupRequired: getBootstrapStatus().needsSetup,
    counts: {
      operatorProfiles: counts.operatorProfiles.count ?? 0,
      sessions: counts.sessions.count ?? 0,
      recordings: counts.recordings.count ?? 0,
      scanLogs: counts.scanLogs.count ?? 0,
    },
  }
}

export function readSystemConfig() {
  const { value: raw, updatedAt } = readJsonRowMeta<Partial<SystemConfig> | null>('system_config', null)
  const normalized = sanitizeSystemConfig(raw)

  if (raw && JSON.stringify(raw) !== JSON.stringify(normalized)) {
    writeJsonRow('system_config', normalized)
  }

  return {
    ...normalized,
    updatedAt,
  }
}

export function saveSystemConfig(nextConfig: SystemConfig) {
  const normalized = sanitizeSystemConfig(nextConfig)
  const updatedAt = writeJsonRow('system_config', normalized)
  broadcastBackendEvent('system-config-updated', { updatedAt })
  return {
    ...normalized,
    updatedAt,
  }
}

export function readSettings() {
  const { value: raw, updatedAt } = readJsonRowMeta<Partial<AppSettings> | null>('app_settings', null)
  return {
    ...sanitizeSettings(raw),
    updatedAt,
  }
}

export function saveSettings(nextSettings: AppSettings) {
  const normalized = {
    ...sanitizeSettings(nextSettings),
    videoRootPath: assertValidVideoRootPath(nextSettings.videoRootPath),
  }
  const updatedAt = writeJsonRow('app_settings', normalized)
  broadcastBackendEvent('settings-updated', { updatedAt })
  return {
    ...normalized,
    updatedAt,
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

export function createSession(operatorName: string, operatorCode: string, role: OperatorRole, taskType: WorkTask) {
  const sessionId = makeId('session')
  const timestamp = nowIso()
  db().prepare(
    `INSERT INTO operator_sessions (session_id, operator_name, operator_code, role, task_type, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(sessionId, operatorName, operatorCode, role, taskType, timestamp, timestamp)

  const session = getSessionById(sessionId)
  if (!session) {
    throw new Error('Gagal membuat sesi login.')
  }

  broadcastBackendEvent('sessions-updated', { sessionId, operatorName, operatorCode, role, taskType, createdAt: timestamp })
  return session
}

export function updateSessionTaskType(sessionId: string, taskType: WorkTask) {
  const timestamp = nowIso()
  const updated = db().prepare(
    `UPDATE operator_sessions
     SET task_type = ?, updated_at = ?
     WHERE session_id = ?`,
  ).run(taskType, timestamp, sessionId)

  if ((updated.changes ?? 0) === 0) {
    return null
  }

  broadcastBackendEvent('sessions-updated', { sessionId, taskType, updatedAt: timestamp })
  return getSessionById(sessionId)
}

export function getSessionById(sessionId: string) {
  const row = db()
    .prepare(
      `SELECT session_id, operator_name, operator_code, role, task_type, created_at, updated_at
       FROM operator_sessions
       WHERE session_id = ?
       LIMIT 1`,
    )
    .get(sessionId) as SessionRow | undefined

  return row ? mapSession(row) : null
}

export function deleteSessionById(sessionId: string) {
  db().prepare(`DELETE FROM operator_sessions WHERE session_id = ?`).run(sessionId)
  broadcastBackendEvent('sessions-updated', { sessionId, deleted: true })
}

export function findSessionByIdentity(operatorName: string, operatorCode: string, role: OperatorRole) {
  const row = db()
    .prepare(
      `SELECT session_id, operator_name, operator_code, role, task_type, created_at, updated_at
       FROM operator_sessions
       WHERE LOWER(operator_name) = LOWER(?)
         AND LOWER(operator_code) = LOWER(?)
         AND role = ?
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
    .get(normalizeOperatorName(operatorName), normalizeOperatorCode(operatorCode), role) as SessionRow | undefined

  return row ? mapSession(row) : null
}

export function authenticateOperator(input: {
  operatorName: string
  operatorCode?: string | null
  password: string
  role?: OperatorRole | null
}) {
  const role = normalizeRole(input.role)
  const operatorName = normalizeOperatorName(input.operatorName)
  const operatorCode = input.operatorCode?.trim() || ''

  const profile = operatorCode
    ? findOperatorProfile(operatorName, operatorCode, role)
    : findProfileByName(operatorName)

  if (!profile) {
    throw new Error('Username atau password salah.')
  }

  if (!profile.passwordSalt || !profile.passwordHash) {
    throw new Error('Akun ini belum punya password. Hubungi admin.')
  }

  if (!verifyPassword(input.password, profile.passwordSalt, profile.passwordHash)) {
    throw new Error('Username atau password salah.')
  }

  const session = createSession(profile.operatorName, profile.operatorCode, profile.role, profile.taskType)
  return {
    session,
    profile,
  }
}

export function resolveSession(sessionId: string | null | undefined) {
  if (!sessionId) {
    return null
  }

  const session = getSessionById(sessionId)
  if (!session) {
    return null
  }

  if (Date.now() - new Date(session.updatedAt).getTime() > SESSION_TTL_MS) {
    deleteSessionById(session.sessionId)
    return null
  }

  db()
    .prepare(`UPDATE operator_sessions SET updated_at = ? WHERE session_id = ?`)
    .run(nowIso(), session.sessionId)

  return getSessionById(session.sessionId)
}

export function listRecordings() {
  const rows = db()
    .prepare(
      `SELECT id, resi_number, task_type, operator_name, operator_code, file_name, file_path, file_size_bytes,
              record_date, start_time, end_time, duration_seconds, status, note, created_at, updated_at
       FROM recordings
       ORDER BY start_time DESC`,
    )
    .all() as RecordingRow[]

  return rows.map(withRecordingShareFileInfo)
}

export function getRecordingById(id: string) {
  const row = db()
    .prepare(
      `SELECT id, resi_number, task_type, operator_name, operator_code, file_name, file_path, file_size_bytes,
              record_date, start_time, end_time, duration_seconds, status, note, created_at, updated_at
       FROM recordings
       WHERE id = ?
       LIMIT 1`,
    )
    .get(id) as RecordingRow | undefined

  return row ? withRecordingShareFileInfo(row) : null
}

export function listRecordingsByResi(resiNumber: string) {
  const normalizedResi = resiNumber.trim()
  if (!normalizedResi) {
    return []
  }

  const rows = db()
    .prepare(
      `SELECT id, resi_number, task_type, operator_name, operator_code, file_name, file_path, file_size_bytes,
              record_date, start_time, end_time, duration_seconds, status, note, created_at, updated_at
       FROM recordings
       WHERE resi_number = ?
         AND task_type IN ('qc', 'packing')
       ORDER BY start_time DESC`,
    )
    .all(normalizedResi) as RecordingRow[]

  return rows.map(withRecordingShareFileInfo)
}

export function createRecordingDraft(input: RecordingDraftInput) {
  const id = input.id ?? makeId('recording')
  const startedAt = input.startedAt ? new Date(input.startedAt) : new Date()
  const startTime = startedAt.toISOString()
  const recordDate = startTime.slice(0, 10)
  const taskType = normalizeTaskType(input.taskType)
  if (taskType === 'packing' && !canStartPackingForResi(input.resiNumber)) {
    throw new Error('Packing hanya bisa dimulai setelah QC selesai untuk resi ini.')
  }
  const fileName = input.fileName
    ? sanitizeFileName(input.fileName)
    : buildRecordingFileName(input.resiNumber, DEFAULT_APP_SETTINGS.videoFormat, taskType, startedAt)
  const filePath = assertSafeRelativeFilePath(input.filePath ?? path.posix.join(DEFAULT_APP_SETTINGS.videoRootPath, fileName))
  const timestamp = nowIso()

  db().prepare(
      `INSERT INTO recordings (
      id,
      resi_number,
      task_type,
      operator_name,
      operator_code,
      file_name,
      file_path,
      file_size_bytes,
      record_date,
      start_time,
      end_time,
      duration_seconds,
      status,
      note,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      resi_number = excluded.resi_number,
      task_type = excluded.task_type,
      operator_name = excluded.operator_name,
      operator_code = excluded.operator_code,
      file_name = excluded.file_name,
      file_path = excluded.file_path,
      file_size_bytes = excluded.file_size_bytes,
      record_date = excluded.record_date,
      start_time = excluded.start_time,
      status = excluded.status,
      note = excluded.note,
      updated_at = excluded.updated_at`,
  ).run(
    id,
    input.resiNumber.trim(),
    taskType,
    input.operatorName.trim() || null,
    input.operatorCode.trim() || null,
    fileName,
    filePath,
    input.fileSizeBytes ?? null,
    recordDate,
    startTime,
    null,
    null,
    input.status ?? 'recording',
    input.note ?? null,
    timestamp,
    timestamp,
  )

  broadcastBackendEvent('recordings-updated', { recordingId: id, action: 'draft-created', resiNumber: input.resiNumber.trim() })
  return getRecordingById(id)
}

export function finalizeRecording(
  id: string,
  payload: { fileSizeBytes?: number | null; endTime?: string; note?: string | null },
) {
  const recording = getRecordingById(id)
  if (!recording) {
    throw new Error('Recording tidak ditemukan.')
  }

  const pendingPath = getPendingRecordingPath(id)
  if (fs.existsSync(pendingPath)) {
    return finalizePendingRecording(recording, {
      endTime: payload.endTime,
      note: payload.note ?? null,
    })
  }

  const endTime = payload.endTime ?? nowIso()
  const durationSeconds = Math.max(1, Math.round((new Date(endTime).getTime() - new Date(recording.start_time).getTime()) / 1000))

  db().prepare(
    `UPDATE recordings
     SET end_time = ?, duration_seconds = ?, file_size_bytes = COALESCE(?, file_size_bytes), status = 'completed', note = COALESCE(?, note), updated_at = ?
     WHERE id = ?`,
  ).run(endTime, durationSeconds, payload.fileSizeBytes ?? null, payload.note ?? null, nowIso(), id)

  broadcastBackendEvent('recordings-updated', { recordingId: id, action: 'finalized', resiNumber: recording.resi_number })
  const finalized = getRecordingById(id)
  scheduleRecordingWatermark(finalized)
  return finalized
}

export function appendRecordingChunk(id: string, chunk: Buffer) {
  const recording = getRecordingById(id)
  if (!recording) {
    throw new Error('Recording tidak ditemukan.')
  }

  if (recording.status !== 'recording') {
    throw new Error('Recording sudah tidak aktif.')
  }

  return appendBufferToPendingRecording(id, chunk)
}

export function recoverRecordingDraft(id: string) {
  const recording = getRecordingById(id)
  if (!recording) {
    throw new Error('Recording tidak ditemukan.')
  }

  if (recording.status !== 'recording') {
    return recording
  }

  const finalized = finalizePendingRecording(recording, {
    endTime: nowIso(),
    note: 'Rekaman dipulihkan dari chunk sementara server.',
  })

  return finalized
}

async function runFfmpegShareMp4Transcode(recording: RecordingRow, inputPath: string, outputPath: string) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  const { videoBitrate, audioBitrate } = getShareEncodingProfile(recording)

  await runFfmpeg([
    '-y',
    '-i',
    inputPath,
    '-map',
    '0:v:0',
    '-map',
    '0:a?',
    '-vf',
    'scale=720:720:force_original_aspect_ratio=decrease:force_divisible_by=2,fps=15',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-b:v',
    String(videoBitrate),
    '-maxrate',
    String(videoBitrate),
    '-bufsize',
    String(videoBitrate * 2),
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    String(audioBitrate),
    '-movflags',
    '+faststart',
    outputPath,
  ], 'ffmpeg share video gagal')

  const outputSize = fs.statSync(outputPath).size
  if (outputSize > SHOPEE_VIDEO_LIMIT_BYTES) {
    throw new Error(`File share masih lebih dari 25MB (${Math.ceil(outputSize / 1024 / 1024)}MB). Rekaman terlalu panjang untuk batas Shopee.`)
  }
}

function getRecordingShareFileInfo(recording: RecordingRow): RecordingShareFileInfo {
  const fileName = `${sanitizeFileSegment(recording.task_type)}_${sanitizeFileSegment(recording.resi_number)}_${sanitizeFileSegment(recording.id)}.mp4`
  const filePath = path.posix.join('share', fileName)
  const outputPath = path.join(getUploadsDir(), filePath)
  const inputPath = getUploadedFilePath(recording)

  let isReady = false
  if (recording.status === 'completed' && fs.existsSync(inputPath) && fs.existsSync(outputPath)) {
    const sourceStats = fs.statSync(inputPath)
    const outputStats = fs.statSync(outputPath)
    isReady = outputStats.mtimeMs >= sourceStats.mtimeMs && outputStats.size <= SHOPEE_VIDEO_LIMIT_BYTES
  }

  return {
    fileName,
    filePath,
    mimeType: 'video/mp4',
    outputPath,
    isReady,
  }
}

function withRecordingShareFileInfo(recording: RecordingRow): RecordingRow {
  const shareFile = getRecordingShareFileInfo(recording)

  return {
    ...recording,
    share_file_name: shareFile.fileName,
    share_file_path: shareFile.filePath,
    share_file_mime_type: shareFile.mimeType,
    share_file_ready: shareFile.isReady,
  }
}

export async function prepareRecordingShareFile(id: string) {
  const recording = getRecordingById(id)
  if (!recording) {
    throw new Error('Recording tidak ditemukan.')
  }

  if (recording.status !== 'completed') {
    throw new Error('Recording belum selesai.')
  }

  const inputPath = getUploadedFilePath(recording)
  if (!fs.existsSync(inputPath)) {
    throw new Error('File recording tidak ditemukan.')
  }

  const shareFile = getRecordingShareFileInfo(recording)

  if (!shareFile.isReady) {
    await runFfmpegShareMp4Transcode(recording, inputPath, shareFile.outputPath)
    broadcastBackendEvent('recordings-updated', { recordingId: recording.id, action: 'share-file-ready', resiNumber: recording.resi_number })
  }

  return {
    fileName: shareFile.fileName,
    filePath: shareFile.filePath,
    mimeType: shareFile.mimeType,
  }
}

export function invalidateCompletedRecordingsForResi(resiNumber: string) {
  const normalizedResi = resiNumber.trim()
  if (!normalizedResi) {
    throw new Error('Resi tidak boleh kosong.')
  }

  const timestamp = nowIso()
  const note = 'QC diulang. Rekaman sebelumnya tidak valid dan packing harus diulang.'
  const updatedRows = db()
    .prepare(
      `UPDATE recordings
       SET status = 'error',
           note = ?,
           updated_at = ?
       WHERE resi_number = ?
         AND status = 'completed'
         AND task_type IN ('qc', 'packing')`,
    )
    .run(note, timestamp, normalizedResi)

  if ((updatedRows.changes ?? 0) === 0) {
    throw new Error('Tidak ada QC atau packing selesai yang bisa diulang.')
  }

  broadcastBackendEvent('recordings-updated', { resiNumber: normalizedResi, action: 'repeat-qc' })
  const rows = db()
    .prepare(
      `SELECT id, resi_number, task_type, operator_name, operator_code, file_name, file_path, file_size_bytes,
              record_date, start_time, end_time, duration_seconds, status, note, created_at, updated_at
       FROM recordings
       WHERE resi_number = ?
         AND task_type IN ('qc', 'packing')
       ORDER BY start_time DESC`,
    )
    .all(normalizedResi) as RecordingRow[]

  return rows.map(withRecordingShareFileInfo)
}

export function markRecordingError(id: string, message: string) {
  const recording = getRecordingById(id)
  if (!recording) {
    return null
  }

  db().prepare(
    `UPDATE recordings
     SET status = 'error', note = ?, updated_at = ?
     WHERE id = ?`,
  ).run(message, nowIso(), id)

  broadcastBackendEvent('recordings-updated', { recordingId: id, action: 'error', message })
  return getRecordingById(id)
}

export function deleteRecording(id: string) {
  const recording = getRecordingById(id)
  if (!recording) {
    return false
  }

  db().prepare(`DELETE FROM recordings WHERE id = ?`).run(id)
  const absolutePath = getUploadedFilePath(recording)
  if (fs.existsSync(absolutePath)) {
    fs.rmSync(absolutePath, { force: true })
  }
  removePendingRecordingArtifact(id)

  broadcastBackendEvent('recordings-updated', { recordingId: id, action: 'deleted', resiNumber: recording.resi_number })
  return true
}

function getPendingRecordingPath(recordingId: string) {
  return path.join(getPendingRecordingsDir(), `${recordingId}.part`)
}

function ensurePendingRecordingDir() {
  fs.mkdirSync(getPendingRecordingsDir(), { recursive: true })
}

function removePendingRecordingArtifact(recordingId: string) {
  const pendingPath = getPendingRecordingPath(recordingId)
  if (fs.existsSync(pendingPath)) {
    fs.rmSync(pendingPath, { force: true })
  }
}

function appendBufferToPendingRecording(recordingId: string, buffer: Buffer) {
  const pendingPath = getPendingRecordingPath(recordingId)
  ensurePendingRecordingDir()
  fs.appendFileSync(pendingPath, buffer)
  return pendingPath
}

function getFfmpegPath() {
  return process.env.FFMPEG_PATH || ffmpegStatic || 'ffmpeg'
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getShareEncodingProfile(recording: RecordingRow) {
  const durationSeconds = Math.max(1, Math.ceil(recording.duration_seconds ?? 60))
  const totalBitrate = Math.floor((SHARE_VIDEO_TARGET_BYTES * 8 * 0.92) / durationSeconds)
  const audioBitrate = totalBitrate < 260_000 ? 32_000 : 48_000
  const videoBitrate = clampNumber(totalBitrate - audioBitrate, SHARE_MIN_VIDEO_BITRATE, SHARE_MAX_VIDEO_BITRATE)

  return { videoBitrate, audioBitrate }
}

function getWatermarkFontPath() {
  const candidates = [
    process.env.PAKTI_WATERMARK_FONT,
    'C:\\Windows\\Fonts\\arial.ttf',
    'C:\\Windows\\Fonts\\segoeui.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf',
  ].filter(Boolean) as string[]

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null
}

function escapeDrawTextValue(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%')
    .replace(/,/g, '\\,')
}

function escapeFilterPath(value: string) {
  return value.replace(/\\/g, '/').replace(/:/g, '\\:')
}

function formatWatermarkDate(value: string | null) {
  const date = value ? new Date(value) : new Date()
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: WATERMARK_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function buildDrawTextFilter(recording: RecordingRow, placement: 'top-center' | 'top-left' = 'top-center') {
  const operator = [recording.operator_name, recording.operator_code]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' / ') || '-'
  const fontPath = getWatermarkFontPath()
  const fontOption = fontPath ? `:fontfile='${escapeFilterPath(fontPath)}'` : ''
  const line1 = escapeDrawTextValue(`RESI ${recording.resi_number}`)
  const line2 = escapeDrawTextValue(`Petugas: ${operator}`)
  const line3 = escapeDrawTextValue(formatWatermarkDate(recording.start_time))

  if (placement === 'top-left') {
    return [
      'drawbox=x=16:y=24:w=448:h=96:color=black@0.42:t=fill',
      `drawtext=text='${line1}'${fontOption}:x=32:y=38:fontsize=24:fontcolor=white`,
      `drawtext=text='${line2}'${fontOption}:x=32:y=70:fontsize=17:fontcolor=white@0.92`,
      `drawtext=text='${line3}'${fontOption}:x=32:y=96:fontsize=15:fontcolor=white@0.78`,
    ].join(',')
  }

  return [
    'drawbox=x=max(16\\,(iw-min(560\\,iw-32))/2):y=24:w=min(560\\,iw-32):h=96:color=black@0.42:t=fill',
    `drawtext=text='${line1}'${fontOption}:x=(w-text_w)/2:y=38:fontsize=24:fontcolor=white`,
    `drawtext=text='${line2}'${fontOption}:x=(w-text_w)/2:y=70:fontsize=17:fontcolor=white@0.92`,
    `drawtext=text='${line3}'${fontOption}:x=(w-text_w)/2:y=96:fontsize=15:fontcolor=white@0.78`,
  ].join(',')
}

async function runFfmpeg(args: string[], errorLabel = 'ffmpeg watermark gagal') {
  const ffmpegPath = getFfmpegPath()

  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { windowsHide: true })
    let stderr = ''

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
      if (stderr.length > 4000) {
        stderr = stderr.slice(-4000)
      }
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${errorLabel} (${code ?? 'unknown'}): ${stderr.trim()}`))
      }
    })
  })
}

function isMp4Recording(recording: RecordingRow) {
  return path.posix.extname(recording.file_path).toLowerCase() === '.mp4' ||
    path.extname(recording.file_name).toLowerCase() === '.mp4'
}

async function runFfmpegMp4Transcode(recording: RecordingRow, inputPath: string) {
  if (!fs.existsSync(inputPath)) {
    return
  }

  const outputPath = `${inputPath}.whatsapp.mp4`
  const buildArgs = (filter: string) => [
    '-y',
    '-i',
    inputPath,
    '-map',
    '0:v:0',
    '-map',
    '0:a?',
    '-vf',
    filter,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '28',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    outputPath,
  ]

  try {
    await runFfmpeg(buildArgs(buildDrawTextFilter(recording, 'top-center')))
  } catch {
    if (fs.existsSync(outputPath)) {
      fs.rmSync(outputPath, { force: true })
    }

    await runFfmpeg(buildArgs(buildDrawTextFilter(recording, 'top-left')))
  }

  fs.copyFileSync(outputPath, inputPath)
  fs.rmSync(outputPath, { force: true })
  const fileStats = fs.statSync(inputPath)
  db()
    .prepare(`UPDATE recordings SET file_size_bytes = ?, note = COALESCE(note, ?), updated_at = ? WHERE id = ?`)
    .run(fileStats.size, 'Video MP4 sudah dikonversi untuk WhatsApp.', nowIso(), recording.id)
  broadcastBackendEvent('recordings-updated', { recordingId: recording.id, action: 'mp4-transcoded', resiNumber: recording.resi_number })
}

async function runFfmpegWatermark(recording: RecordingRow, inputPath: string) {
  if (process.env.PAKTI_DISABLE_VIDEO_WATERMARK === '1') {
    return
  }

  if (isMp4Recording(recording)) {
    return
  }

  if (!fs.existsSync(inputPath)) {
    return
  }

  const outputPath = `${inputPath}.watermarked.webm`
  const buildArgs = (filter: string) => [
    '-y',
    '-i',
    inputPath,
    '-vf',
    filter,
    '-c:v',
    'libvpx-vp9',
    '-deadline',
    'realtime',
    '-cpu-used',
    '6',
    '-row-mt',
    '1',
    '-b:v',
    '0',
    '-crf',
    '36',
    '-c:a',
    'copy',
    outputPath,
  ]

  try {
    await runFfmpeg(buildArgs(buildDrawTextFilter(recording, 'top-center')))
  } catch {
    if (fs.existsSync(outputPath)) {
      fs.rmSync(outputPath, { force: true })
    }

    await runFfmpeg(buildArgs(buildDrawTextFilter(recording, 'top-left')))
  }

  fs.copyFileSync(outputPath, inputPath)
  fs.rmSync(outputPath, { force: true })
  const fileStats = fs.statSync(inputPath)
  db()
    .prepare(`UPDATE recordings SET file_size_bytes = ?, note = COALESCE(note, ?), updated_at = ? WHERE id = ?`)
    .run(fileStats.size, 'Video sudah diberi watermark.', nowIso(), recording.id)
  broadcastBackendEvent('recordings-updated', { recordingId: recording.id, action: 'watermarked', resiNumber: recording.resi_number })
}

function scheduleRecordingWatermark(recording: RecordingRow | null) {
  if (!recording || recording.status !== 'completed') {
    return
  }

  const completedRecording = recording

  async function prepareShareFile() {
    try {
      await prepareRecordingShareFile(completedRecording.id)
      return true
    } catch (error) {
      reportLastError(error instanceof Error ? error.message : 'Gagal menyiapkan file share recording.')
      return false
    }
  }

  if (isMp4Recording(completedRecording)) {
    const inputPath = getUploadedFilePath(completedRecording)
    watermarkQueue = watermarkQueue.then(async () => {
      let transcodeError: unknown = null
      try {
        await runFfmpegMp4Transcode(completedRecording, inputPath)
      } catch (error) {
        transcodeError = error
        if (fs.existsSync(`${inputPath}.whatsapp.mp4`)) {
          fs.rmSync(`${inputPath}.whatsapp.mp4`, { force: true })
        }
      }

      const sharePrepared = await prepareShareFile()
      if (!sharePrepared && transcodeError) {
        reportLastError(transcodeError instanceof Error ? transcodeError.message : 'Gagal mengonversi MP4 recording.')
      }
    })
    return
  }

  const inputPath = getUploadedFilePath(completedRecording)
  watermarkQueue = watermarkQueue.then(async () => {
    let watermarkError: unknown = null
    try {
      await runFfmpegWatermark(completedRecording, inputPath)
    } catch (error) {
      watermarkError = error
      if (fs.existsSync(`${inputPath}.watermarked.webm`)) {
        fs.rmSync(`${inputPath}.watermarked.webm`, { force: true })
      }
    }

    const sharePrepared = await prepareShareFile()
    if (!sharePrepared && watermarkError) {
      reportLastError(watermarkError instanceof Error ? watermarkError.message : 'Gagal memberi watermark video.')
    }
  })
}

function finalizePendingRecording(
  recording: RecordingRow,
  payload: { endTime?: string; note?: string | null },
) {
  const pendingPath = getPendingRecordingPath(recording.id)
  const finalPath = getUploadedFilePath(recording)

  if (!fs.existsSync(pendingPath)) {
    if (!fs.existsSync(finalPath)) {
      throw new Error('Chunk sementara recording tidak ditemukan.')
    }

    const fileStats = fs.statSync(finalPath)
    const endTime = payload.endTime ?? nowIso()
    const durationSeconds = Math.max(1, Math.round((new Date(endTime).getTime() - new Date(recording.start_time).getTime()) / 1000))

    db().prepare(
      `UPDATE recordings
       SET end_time = ?, duration_seconds = ?, file_size_bytes = COALESCE(?, file_size_bytes), status = 'completed', note = COALESCE(?, note), updated_at = ?
       WHERE id = ?`,
    ).run(endTime, durationSeconds, fileStats.size, payload.note ?? null, nowIso(), recording.id)

    const finalized = getRecordingById(recording.id)
    scheduleRecordingWatermark(finalized)
    return finalized
  }

  fs.mkdirSync(path.dirname(finalPath), { recursive: true })
  fs.renameSync(pendingPath, finalPath)
  const fileStats = fs.statSync(finalPath)
  const endTime = payload.endTime ?? nowIso()
  const durationSeconds = Math.max(1, Math.round((new Date(endTime).getTime() - new Date(recording.start_time).getTime()) / 1000))

  db().prepare(
    `UPDATE recordings
     SET end_time = ?, duration_seconds = ?, file_size_bytes = COALESCE(?, file_size_bytes), status = 'completed', note = COALESCE(?, note), updated_at = ?
     WHERE id = ?`,
  ).run(endTime, durationSeconds, fileStats.size, payload.note ?? null, nowIso(), recording.id)

  broadcastBackendEvent('recordings-updated', { recordingId: recording.id, action: 'finalized', resiNumber: recording.resi_number })
  const finalized = getRecordingById(recording.id)
  scheduleRecordingWatermark(finalized)
  return finalized
}

function clearUploadArtifacts() {
  for (const dir of [getUploadsDir(), getPendingRecordingsDir()]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
      continue
    }

    for (const entry of fs.readdirSync(dir)) {
      fs.rmSync(path.join(dir, entry), { recursive: true, force: true })
    }

    fs.mkdirSync(dir, { recursive: true })
  }
}

export function listScanLogs() {
  const rows = db()
    .prepare(
      `SELECT id, resi_number, task_type, operator_name, operator_code, scan_time, action, message
       FROM scan_logs
       ORDER BY scan_time DESC
       LIMIT ${MAX_SCAN_LOGS}`,
    )
    .all() as ScanLogRow[]

  return rows
}

export function createScanLog(input: {
  resiNumber: string
  taskType: WorkTask
  action: ScanLogRow['action']
  message?: string | null
  operatorName?: string | null
  operatorCode?: string | null
}) {
  const row: ScanLogRow = {
    id: makeId('scanlog'),
    resi_number: input.resiNumber.trim(),
    task_type: normalizeTaskType(input.taskType),
    operator_name: input.operatorName?.trim() || null,
    operator_code: input.operatorCode?.trim() || null,
    scan_time: nowIso(),
    action: input.action,
    message: input.message?.trim() || null,
  }

  db().prepare(
      `INSERT INTO scan_logs (id, resi_number, task_type, operator_name, operator_code, scan_time, action, message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(row.id, row.resi_number, row.task_type, row.operator_name, row.operator_code, row.scan_time, row.action, row.message)

  const totalRows = db().prepare(`SELECT COUNT(*) AS count FROM scan_logs`).get() as { count: number }
  const extra = Math.max(0, (totalRows.count ?? 0) - MAX_SCAN_LOGS)
  if (extra > 0) {
    db().prepare(
      `DELETE FROM scan_logs
       WHERE id IN (
         SELECT id FROM scan_logs
         ORDER BY scan_time ASC
         LIMIT ?
      )`,
    ).run(extra)
  }

  broadcastBackendEvent('scan-logs-updated', { scanLogId: row.id, resiNumber: row.resi_number, action: row.action })
  return row
}

export function readLastError() {
  const row = db()
    .prepare(`SELECT value FROM last_error WHERE key = ? LIMIT 1`)
    .get(JSON_STATE_KEY) as { value?: string } | undefined

  if (!row?.value) {
    return null
  }

  try {
    return JSON.parse(row.value) as LastErrorRow
  } catch {
    return null
  }
}

export function reportLastError(message: string) {
  const payload: LastErrorRow = {
    message,
    createdAt: nowIso(),
  }

  writeJsonRow('last_error', payload)
  broadcastBackendEvent('last-error-updated', payload)
  return payload
}

export function clearLastError() {
  removeJsonRow('last_error')
  broadcastBackendEvent('last-error-updated', { cleared: true })
}

export function clearScanData() {
  db().prepare(`DELETE FROM recordings`).run()
  db().prepare(`DELETE FROM scan_logs`).run()
  db().prepare(`DELETE FROM last_error`).run()
  clearUploadArtifacts()
  broadcastBackendEvent('recordings-updated', { cleared: true })
  broadcastBackendEvent('scan-logs-updated', { cleared: true })
  broadcastBackendEvent('last-error-updated', { cleared: true })
}

export function clearAllData() {
  db().prepare(`DELETE FROM operator_sessions`).run()
  db().prepare(`DELETE FROM operator_profiles`).run()
  db().prepare(`DELETE FROM recordings`).run()
  db().prepare(`DELETE FROM scan_logs`).run()
  db().prepare(`DELETE FROM system_config`).run()
  db().prepare(`DELETE FROM app_settings`).run()
  db().prepare(`DELETE FROM bootstrap_state`).run()
  db().prepare(`DELETE FROM last_error`).run()
  clearUploadArtifacts()
  broadcastBackendEvent('sessions-updated', { cleared: true })
  broadcastBackendEvent('operators-updated', { cleared: true })
  broadcastBackendEvent('recordings-updated', { cleared: true })
  broadcastBackendEvent('scan-logs-updated', { cleared: true })
  broadcastBackendEvent('system-config-updated', { cleared: true })
  broadcastBackendEvent('settings-updated', { cleared: true })
  broadcastBackendEvent('last-error-updated', { cleared: true })
}

export function getUploadedFilePath(recording: RecordingRow) {
  const uploadsRoot = path.resolve(getUploadsDir())
  const targetPath = path.resolve(uploadsRoot, assertSafeRelativeFilePath(recording.file_path))

  if (targetPath !== uploadsRoot && !targetPath.startsWith(`${uploadsRoot}${path.sep}`)) {
    throw new Error('Path file recording berada di luar folder upload.')
  }

  return targetPath
}

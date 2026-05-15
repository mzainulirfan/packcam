import type { StorageCollectionKey } from '../data/backends/types'
import {
  SQLITE_SCHEMA_MIGRATIONS,
  SQLITE_SCHEMA_STATEMENTS,
  SQLITE_SCHEMA_TABLES,
  SQLITE_SCHEMA_VERSION,
} from '../data/sqliteSchema'
import type { OperatorProfile, RecordingRow, ScanLogRow } from '../data/types'

export const TAURI_SQLITE_DB_PATH = 'sqlite:packcam.db'

type TauriSqlDatabase = {
  execute(statement: string, values?: unknown[]): Promise<{ rowsAffected: number; lastInsertId?: number }>
  select<T>(statement: string, values?: unknown[]): Promise<T[]>
}

type TauriSqlApi = {
  Database: {
    get(path: string): TauriSqlDatabase
    load(path: string): Promise<TauriSqlDatabase>
  }
}

type TauriFsApi = {
  writeFile(path: string, contents: Uint8Array): Promise<void>
  readFile(path: string): Promise<Uint8Array>
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>
  remove(path: string, options?: { recursive?: boolean }): Promise<void>
}

type TauriDialogApi = {
  open(options: { directory?: boolean; multiple?: boolean }): Promise<string | string[] | null>
}

type TauriGlobal = {
  dialog?: TauriDialogApi
  fs?: TauriFsApi
  sql?: TauriSqlApi
}

type TauriInternalBridge = {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>
}

type TauriWindow = Window & {
  __TAURI__?: TauriGlobal
  __TAURI_INTERNALS__?: TauriInternalBridge
}

type StateCollection = 'operatorSession' | 'settings' | 'systemConfig' | 'lastError'

type DesktopCollectionValueMap = Partial<Record<StorageCollectionKey, unknown>>

const OPERATOR_PROFILES_TABLE = 'packcam_operator_profiles'
const RECORDINGS_TABLE = 'packcam_recordings'
const SCAN_LOGS_TABLE = 'packcam_scan_logs'

let sqliteDatabasePromise: Promise<TauriSqlDatabase | null> | null = null

export function getTauriGlobal() {
  if (typeof window === 'undefined') {
    return null
  }

  return (window as TauriWindow).__TAURI__ ?? null
}

function getTauriInternalBridge() {
  if (typeof window === 'undefined') {
    return null
  }

  return (window as TauriWindow).__TAURI_INTERNALS__ ?? null
}

export function hasTauriSql() {
  return Boolean(getTauriGlobal()?.sql?.Database)
}

export function hasTauriFs() {
  return Boolean(getTauriGlobal()?.fs)
}

export function hasTauriDialog() {
  return Boolean(getTauriGlobal()?.dialog)
}

export async function openNativeDirectoryPicker() {
  const dialog = getTauriGlobal()?.dialog

  if (!dialog) {
    return null
  }

  const result = await dialog.open({
    directory: true,
    multiple: false,
  })

  if (Array.isArray(result)) {
    return result[0] ?? null
  }

  return typeof result === 'string' && result.trim() ? result : null
}

async function getTauriSqliteDatabase() {
  if (!hasTauriSql()) {
    return null
  }

  if (!sqliteDatabasePromise) {
    sqliteDatabasePromise = (async () => {
      const sql = getTauriGlobal()?.sql

      if (!sql?.Database) {
        return null
      }

      try {
        const db = sql.Database.get(TAURI_SQLITE_DB_PATH)
        await ensureTauriSchema(db)
        return db
      } catch {
        try {
          const db = await sql.Database.load(TAURI_SQLITE_DB_PATH)
          await ensureTauriSchema(db)
          return db
        } catch {
          return null
        }
      }
    })()
  }

  return sqliteDatabasePromise
}

async function ensureTauriSchema(db: TauriSqlDatabase) {
  for (const statement of SQLITE_SCHEMA_STATEMENTS) {
    await db.execute(statement)
  }

  const appliedRows = await db.select<{ version: number | string }>(
    `SELECT version FROM ${SQLITE_SCHEMA_TABLES.schemaMigrations} ORDER BY version ASC`,
  )
  const appliedVersions = new Set(appliedRows.map((row) => Number(row.version)))

  for (const migration of SQLITE_SCHEMA_MIGRATIONS) {
    if (appliedVersions.has(migration.version)) {
      continue
    }

    for (const statement of migration.statements) {
      await db.execute(statement)
    }

    await db.execute(
      `INSERT INTO ${SQLITE_SCHEMA_TABLES.schemaMigrations} (version, name, applied_at)
       VALUES ($1, $2, $3)
       ON CONFLICT(version) DO UPDATE SET name = excluded.name, applied_at = excluded.applied_at`,
      [migration.version, migration.name, new Date().toISOString()],
    )
  }

  await db.execute(
    `INSERT INTO ${SQLITE_SCHEMA_TABLES.schemaMeta} (key, value, updated_at)
     VALUES ($1, $2, $3)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ['schema_version', String(SQLITE_SCHEMA_VERSION), new Date().toISOString()],
  )
}

export async function readTauriSqliteCollection<T>(key: StorageCollectionKey, fallback: T) {
  const db = await getTauriSqliteDatabase()
  if (!db) {
    return fallback
  }

  try {
    const value = await readDesktopCollection(db, key)
    return (value ?? fallback) as T
  } catch {
    return fallback
  }
}

export async function writeTauriSqliteCollection<T>(key: StorageCollectionKey, value: T) {
  const db = await getTauriSqliteDatabase()
  if (!db) {
    return
  }

  try {
    await writeDesktopCollection(db, key, value)
  } catch {
    return
  }
}

export async function removeTauriSqliteCollection(key: StorageCollectionKey) {
  const db = await getTauriSqliteDatabase()
  if (!db) {
    return
  }

  try {
    await removeDesktopCollection(db, key)
  } catch {
    return
  }
}

export async function bootstrapDesktopCollections(keys: StorageCollectionKey[]) {
  const db = await getTauriSqliteDatabase()
  const result: DesktopCollectionValueMap = {}

  if (!db) {
    return result
  }

  for (const key of keys) {
    try {
      const value = await readDesktopCollection(db, key)

      if (value !== null) {
        result[key] = value
        continue
      }

      if (typeof window === 'undefined' || !hasLocalStorage()) {
        continue
      }

      const localRaw = window.localStorage.getItem(getLocalStorageKey(key))
      if (!localRaw) {
        continue
      }

      const parsed = JSON.parse(localRaw) as unknown
      result[key] = parsed
      await writeDesktopCollection(db, key, parsed)
    } catch {
      continue
    }
  }

  return result
}

export async function removeDesktopCollections(keys: StorageCollectionKey[]) {
  const db = await getTauriSqliteDatabase()
  if (!db) {
    return
  }

  for (const key of keys) {
    await removeDesktopCollection(db, key)
  }
}

export async function writeDesktopFile(path: string, contents: Blob | Uint8Array) {
  const normalizedPath = path.trim()
  if (!normalizedPath) {
    return false
  }

  try {
    const native = getTauriInternalBridge()
    const bytes = contents instanceof Blob ? new Uint8Array(await contents.arrayBuffer()) : contents

    if (native) {
      await native.invoke('write_packcam_file', {
        path: normalizedPath,
        bytes: Array.from(bytes),
      })
      return true
    }

    const fs = getTauriGlobal()?.fs
    if (!fs) {
      return false
    }

    const parent = getParentDirectory(normalizedPath)
    if (parent) {
      await fs.mkdir(parent, { recursive: true })
    }

    await fs.writeFile(normalizedPath, bytes)
    return true
  } catch {
    return false
  }
}

export async function readDesktopFile(path: string) {
  const normalizedPath = path.trim()
  if (!normalizedPath) {
    return null
  }

  try {
    const native = getTauriInternalBridge()
    if (native) {
      const bytes = await native.invoke<number[]>('read_packcam_file', {
        path: normalizedPath,
      })
      return new Blob([new Uint8Array(bytes)])
    }

    const fs = getTauriGlobal()?.fs
    if (!fs) {
      return null
    }

    const bytes = await fs.readFile(normalizedPath)
    return new Blob([new Uint8Array(bytes)])
  } catch {
    return null
  }
}

export async function removeDesktopPath(path: string) {
  const normalizedPath = path.trim()
  if (!normalizedPath) {
    return false
  }

  try {
    const native = getTauriInternalBridge()
    if (native) {
      await native.invoke('remove_packcam_path', {
        path: normalizedPath,
      })
      return true
    }

    const fs = getTauriGlobal()?.fs
    if (!fs) {
      return false
    }

    await fs.remove(normalizedPath, { recursive: true })
    return true
  } catch {
    return false
  }
}

async function readDesktopCollection(db: TauriSqlDatabase, key: StorageCollectionKey) {
  if (isStateCollection(key)) {
    const rows = await db.select<{ value: string }>(
      `SELECT value FROM ${SQLITE_SCHEMA_TABLES.state} WHERE key = $1 LIMIT 1`,
      [key],
    )
    const raw = rows[0]?.value ?? null
    return raw ? (JSON.parse(raw) as unknown) : null
  }

  if (key === 'operatorProfiles') {
    const rows = await db.select<OperatorProfileSqlRow>(
      `SELECT operator_name, operator_code, role, full_name, last_used_at, password_salt, password_hash
       FROM ${SQLITE_SCHEMA_TABLES.operatorProfiles}
       ORDER BY last_used_at DESC`,
    )

    return rows.map(mapOperatorProfileRowToProfile)
  }

  if (key === 'recordings') {
    const rows = await db.select<RecordingSqlRow>(
      `SELECT id, resi_number, operator_name, operator_code, file_name, file_path, file_size_bytes, record_date,
              start_time, end_time, duration_seconds, status, note, created_at, updated_at, blob_key, mime_type
       FROM ${SQLITE_SCHEMA_TABLES.recordings}
       ORDER BY start_time DESC`,
    )

    return rows.map(mapRecordingRow)
  }

  if (key === 'scanLogs') {
    const rows = await db.select<ScanLogSqlRow>(
      `SELECT id, resi_number, operator_name, operator_code, scan_time, action, message
       FROM ${SQLITE_SCHEMA_TABLES.scanLogs}
       ORDER BY scan_time DESC`,
    )

    return rows.map(mapScanLogRow)
  }

  return null
}

async function writeDesktopCollection(db: TauriSqlDatabase, key: StorageCollectionKey, value: unknown) {
  if (isStateCollection(key)) {
    await db.execute(
      `INSERT INTO ${SQLITE_SCHEMA_TABLES.state} (key, value, updated_at)
       VALUES ($1, $2, $3)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, JSON.stringify(value), new Date().toISOString()],
    )
    return
  }

  if (key === 'operatorProfiles') {
    const profiles = Array.isArray(value) ? (value as OperatorProfile[]) : []
    await db.execute(`DELETE FROM ${SQLITE_SCHEMA_TABLES.operatorProfiles}`)

    for (const profile of profiles) {
      await db.execute(
        `INSERT INTO ${OPERATOR_PROFILES_TABLE} (
          operator_name, operator_code, role, full_name, last_used_at, password_salt, password_hash
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          profile.operatorName,
          profile.operatorCode,
          profile.role,
          profile.fullName,
          profile.lastUsedAt,
          profile.passwordSalt,
          profile.passwordHash,
        ],
      )
    }

    return
  }

  if (key === 'recordings') {
    const recordings = Array.isArray(value) ? (value as RecordingRow[]) : []
    await db.execute(`DELETE FROM ${SQLITE_SCHEMA_TABLES.recordings}`)

    for (const record of recordings) {
      await db.execute(
        `INSERT INTO ${RECORDINGS_TABLE} (
          id, resi_number, operator_name, operator_code, file_name, file_path, file_size_bytes, record_date,
          start_time, end_time, duration_seconds, status, note, created_at, updated_at, blob_key, mime_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
          record.id,
          record.resiNumber,
          record.operatorName,
          record.operatorCode,
          record.fileName,
          record.filePath,
          record.fileSizeBytes,
          record.recordDate,
          record.startTime,
          record.endTime,
          record.durationSeconds,
          record.status,
          record.note,
          record.createdAt,
          record.updatedAt,
          record.blobKey ?? null,
          record.mimeType ?? null,
        ],
      )
    }

    return
  }

  if (key === 'scanLogs') {
    const scanLogs = Array.isArray(value) ? (value as ScanLogRow[]) : []
    await db.execute(`DELETE FROM ${SQLITE_SCHEMA_TABLES.scanLogs}`)

    for (const log of scanLogs) {
      await db.execute(
        `INSERT INTO ${SCAN_LOGS_TABLE} (
          id, resi_number, operator_name, operator_code, scan_time, action, message
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          log.id,
          log.resiNumber,
          log.operatorName,
          log.operatorCode,
          log.scanTime,
          log.action,
          log.message,
        ],
      )
    }
  }
}

async function removeDesktopCollection(db: TauriSqlDatabase, key: StorageCollectionKey) {
  if (isStateCollection(key)) {
    await db.execute(`DELETE FROM ${SQLITE_SCHEMA_TABLES.state} WHERE key = $1`, [key])
    return
  }

  if (key === 'operatorProfiles') {
    await db.execute(`DELETE FROM ${SQLITE_SCHEMA_TABLES.operatorProfiles}`)
    return
  }

  if (key === 'recordings') {
    await db.execute(`DELETE FROM ${SQLITE_SCHEMA_TABLES.recordings}`)
    return
  }

  if (key === 'scanLogs') {
    await db.execute(`DELETE FROM ${SQLITE_SCHEMA_TABLES.scanLogs}`)
  }
}

function mapOperatorProfileRowToProfile(row: OperatorProfileSqlRow): OperatorProfile {
  return {
    fullName: row.full_name ?? null,
    operatorName: row.operator_name,
    operatorCode: row.operator_code,
    role: row.role === 'admin' ? 'admin' : 'operator',
    lastUsedAt: row.last_used_at,
    passwordSalt: row.password_salt ?? null,
    passwordHash: row.password_hash ?? null,
  }
}

function mapRecordingRow(row: RecordingSqlRow): RecordingRow {
  return {
    id: row.id,
    resiNumber: row.resi_number,
    operatorName: row.operator_name,
    operatorCode: row.operator_code,
    fileName: row.file_name,
    filePath: row.file_path,
    fileSizeBytes: row.file_size_bytes,
    recordDate: row.record_date,
    startTime: row.start_time,
    endTime: row.end_time,
    durationSeconds: row.duration_seconds,
    status: row.status === 'completed' || row.status === 'error' ? row.status : 'recording',
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    blobKey: row.blob_key ?? null,
    mimeType: row.mime_type ?? null,
  }
}

function mapScanLogRow(row: ScanLogSqlRow): ScanLogRow {
  return {
    id: row.id,
    resiNumber: row.resi_number,
    operatorName: row.operator_name,
    operatorCode: row.operator_code,
    scanTime: row.scan_time,
    action: row.action,
    message: row.message,
  }
}

function isStateCollection(key: StorageCollectionKey): key is StateCollection {
  return key === 'operatorSession' || key === 'settings' || key === 'systemConfig' || key === 'lastError'
}

function getLocalStorageKey(collection: StorageCollectionKey) {
  const prefix = 'packcam'
  const keys: Record<StorageCollectionKey, string> = {
    operatorSession: `${prefix}:operator_session`,
    operatorProfiles: `${prefix}:operator_profiles`,
    settings: `${prefix}:app_settings`,
    systemConfig: `${prefix}:system_config`,
    recordings: `${prefix}:recordings`,
    scanLogs: `${prefix}:scan_logs`,
    lastError: `${prefix}:last_error`,
  }

  return keys[collection]
}

function hasLocalStorage() {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    return typeof window.localStorage !== 'undefined'
  } catch {
    return false
  }
}

function getParentDirectory(path: string) {
  const normalized = path.replace(/\\/g, '/')
  const lastSlash = normalized.lastIndexOf('/')
  if (lastSlash <= 0) {
    return ''
  }

  return normalized.slice(0, lastSlash)
}

type OperatorProfileSqlRow = {
  operator_name: string
  operator_code: string
  role: string
  full_name: string | null
  last_used_at: string
  password_salt: string | null
  password_hash: string | null
}

type RecordingSqlRow = {
  id: string
  resi_number: string
  operator_name: string | null
  operator_code: string | null
  file_name: string
  file_path: string
  file_size_bytes: number | null
  record_date: string
  start_time: string
  end_time: string | null
  duration_seconds: number | null
  status: string
  note: string | null
  created_at: string
  updated_at: string
  blob_key: string | null
  mime_type: string | null
}

type ScanLogSqlRow = {
  id: string
  resi_number: string
  operator_name: string | null
  operator_code: string | null
  scan_time: string
  action: ScanLogRow['action']
  message: string | null
}

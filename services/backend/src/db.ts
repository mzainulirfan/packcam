import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { SCHEMA_SQL } from './schema'

type SQLiteDatabase = InstanceType<typeof Database>

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(MODULE_DIR, '..')
const BACKEND_DATA_DIR = path.join(ROOT_DIR, 'server-data')
const BACKEND_DB_PATH = path.join(BACKEND_DATA_DIR, 'pakti.sqlite')
const LEGACY_DATA_DIR = path.resolve(ROOT_DIR, '..', '..', 'server-data')
const LEGACY_DB_PATH = path.join(LEGACY_DATA_DIR, 'pakti.sqlite')
const STORAGE_TABLES = ['operator_profiles', 'operator_sessions', 'recordings', 'scan_logs', 'system_config'] as const

let db: SQLiteDatabase | null = null

function ensureDataDir(dataDir: string) {
  fs.mkdirSync(dataDir, { recursive: true })
}

function countStoredRows(databasePath: string) {
  if (!fs.existsSync(databasePath)) {
    return 0
  }

  try {
    const database = new Database(databasePath, { readonly: true })
    const total = STORAGE_TABLES.reduce((sum, table) => {
      try {
        const result = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count?: number }
        return sum + (result.count ?? 0)
      } catch {
        return sum
      }
    }, 0)
    database.close()
    return total
  } catch {
    return 0
  }
}

function removeStorageSidecars(databasePath: string) {
  for (const suffix of ['', '-wal', '-shm']) {
    const targetPath = `${databasePath}${suffix}`

    if (fs.existsSync(targetPath)) {
      fs.rmSync(targetPath, { force: true })
    }
  }
}

function copyStorageTree(sourceDir: string, targetDir: string) {
  if (!fs.existsSync(sourceDir)) {
    return
  }

  fs.rmSync(targetDir, { recursive: true, force: true })
  fs.cpSync(sourceDir, targetDir, { recursive: true, force: true })
}

function migrateLegacyStorageIfNeeded() {
  const legacyRows = countStoredRows(LEGACY_DB_PATH)
  const backendRows = countStoredRows(BACKEND_DB_PATH)

  if (legacyRows <= backendRows) {
    return
  }

  ensureDataDir(BACKEND_DATA_DIR)
  removeStorageSidecars(BACKEND_DB_PATH)

  if (fs.existsSync(LEGACY_DB_PATH)) {
    fs.copyFileSync(LEGACY_DB_PATH, BACKEND_DB_PATH)
  }

  const legacyWalPath = `${LEGACY_DB_PATH}-wal`
  const legacyShmPath = `${LEGACY_DB_PATH}-shm`

  if (fs.existsSync(legacyWalPath)) {
    fs.copyFileSync(legacyWalPath, `${BACKEND_DB_PATH}-wal`)
  }

  if (fs.existsSync(legacyShmPath)) {
    fs.copyFileSync(legacyShmPath, `${BACKEND_DB_PATH}-shm`)
  }

  copyStorageTree(path.join(LEGACY_DATA_DIR, 'uploads'), path.join(BACKEND_DATA_DIR, 'uploads'))
  copyStorageTree(path.join(LEGACY_DATA_DIR, 'pending-recordings'), path.join(BACKEND_DATA_DIR, 'pending-recordings'))
}

function selectDatabasePath() {
  migrateLegacyStorageIfNeeded()
  return fs.existsSync(BACKEND_DB_PATH) ? BACKEND_DB_PATH : LEGACY_DB_PATH
}

const DB_PATH = selectDatabasePath()
const DATA_DIR = path.dirname(DB_PATH)
const PENDING_RECORDINGS_DIR = path.join(DATA_DIR, 'pending-recordings')

function applySchema(database: SQLiteDatabase) {
  for (const statement of SCHEMA_SQL) {
    database.exec(statement)
  }
}

function columnExists(database: SQLiteDatabase, table: string, column: string) {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return columns.some((entry) => entry.name === column)
}

function ensureColumn(database: SQLiteDatabase, table: string, column: string, definition: string) {
  if (columnExists(database, table, column)) {
    return
  }

  database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}

function ensureTaskColumns(database: SQLiteDatabase) {
  ensureColumn(database, 'operator_profiles', 'task_type', "TEXT NOT NULL DEFAULT 'packing'")
  ensureColumn(database, 'operator_sessions', 'task_type', "TEXT NOT NULL DEFAULT 'packing'")
  ensureColumn(database, 'recordings', 'task_type', "TEXT NOT NULL DEFAULT 'packing'")
  ensureColumn(database, 'scan_logs', 'task_type', "TEXT NOT NULL DEFAULT 'packing'")

  database.exec(`UPDATE operator_profiles SET task_type = 'packing' WHERE task_type IS NULL OR task_type = ''`)
  database.exec(`UPDATE operator_sessions SET task_type = 'packing' WHERE task_type IS NULL OR task_type = ''`)
  database.exec(`UPDATE recordings SET task_type = 'packing' WHERE task_type IS NULL OR task_type = ''`)
  database.exec(`UPDATE scan_logs SET task_type = 'packing' WHERE task_type IS NULL OR task_type = ''`)

  database.exec(`DROP INDEX IF EXISTS uq_recordings_resi_completed`)
  database.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_recordings_resi_task_completed
     ON recordings (resi_number, task_type)
     WHERE status = 'completed'`,
  )
}

export function getDb() {
  if (db) {
    return db
  }

  ensureDataDir(DATA_DIR)
  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  applySchema(db)
  ensureTaskColumns(db)
  return db
}

export function getDbPath() {
  return DB_PATH
}

export function getUploadsDir() {
  return path.join(DATA_DIR, 'uploads')
}

export function getPendingRecordingsDir() {
  return PENDING_RECORDINGS_DIR
}

export function ensureServerStorage() {
  ensureDataDir(DATA_DIR)
  fs.mkdirSync(getUploadsDir(), { recursive: true })
  fs.mkdirSync(getPendingRecordingsDir(), { recursive: true })
}

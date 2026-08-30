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

let db: SQLiteDatabase | null = null

function ensureDataDir(dataDir: string) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const DB_PATH = process.env.PAKTI_DB_PATH || BACKEND_DB_PATH
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

function ensureOrderColumns(database: SQLiteDatabase) {
  ensureColumn(database, 'orders', 'shipping_channel', 'TEXT')
}

function ensurePackingColumns(database: SQLiteDatabase) {
  ensureColumn(database, 'recordings', 'media_type', "TEXT NOT NULL DEFAULT 'video'")
  ensureColumn(database, 'recordings', 'mime_type', 'TEXT')
  ensureColumn(database, 'recordings', 'packing_session_id', 'TEXT')
  ensureColumn(database, 'recordings', 'packer_operator_name', 'TEXT')
  ensureColumn(database, 'recordings', 'packer_operator_code', 'TEXT')
  ensureColumn(database, 'recordings', 'order_number', 'TEXT')
  ensureColumn(database, 'recordings', 'shipping_channel', 'TEXT')
  ensureColumn(database, 'recordings', 'order_snapshot', 'TEXT')
  ensureColumn(database, 'recordings', 'packing_pay_amount', 'INTEGER')
  ensureColumn(database, 'recordings', 'packing_pay_status', 'TEXT')
  ensureColumn(database, 'recordings', 'packing_pay_breakdown', 'TEXT')
  ensureColumn(database, 'recordings', 'packing_pay_rule_id', 'TEXT')
  ensureColumn(database, 'packing_work_sessions', 'payment_id', 'TEXT')
  ensureColumn(database, 'packing_work_sessions', 'paid_at', 'TEXT')
  ensureColumn(database, 'packing_work_sessions', 'paid_amount', 'INTEGER')
  ensureColumn(database, 'packing_work_sessions', 'paid_by_operator_name', 'TEXT')
  ensureColumn(database, 'packing_work_sessions', 'paid_by_operator_code', 'TEXT')

  database.exec(`UPDATE recordings SET media_type = 'video' WHERE media_type IS NULL OR media_type = ''`)
}

function ensurePackingPaymentTable(database: SQLiteDatabase) {
  database.exec(
    `CREATE TABLE IF NOT EXISTS packing_payments (
      id TEXT PRIMARY KEY NOT NULL,
      payment_no TEXT NOT NULL,
      packer_operator_name TEXT NOT NULL,
      packer_operator_code TEXT NOT NULL,
      packer_name_snapshot TEXT NOT NULL,
      packer_code_snapshot TEXT NOT NULL,
      total_sessions INTEGER NOT NULL,
      total_packages INTEGER NOT NULL,
      total_amount INTEGER NOT NULL,
      payment_method TEXT NOT NULL,
      paid_at TEXT NOT NULL,
      paid_by_operator_name TEXT NOT NULL,
      paid_by_operator_code TEXT NOT NULL,
      paid_by_session_id TEXT,
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  )
  database.exec(`CREATE INDEX IF NOT EXISTS idx_packing_payments_paid_at ON packing_payments (paid_at DESC)`)
  database.exec(`CREATE INDEX IF NOT EXISTS idx_packing_payments_packer ON packing_payments (packer_operator_code)`)
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
  ensureOrderColumns(db)
  ensurePackingColumns(db)
  ensurePackingPaymentTable(db)
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

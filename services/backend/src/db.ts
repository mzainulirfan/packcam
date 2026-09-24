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

function ensureSessionColumns(database: SQLiteDatabase) {
  ensureColumn(database, 'operator_sessions', 'persistent', 'INTEGER NOT NULL DEFAULT 0')
  database.exec(`UPDATE operator_sessions SET persistent = 0 WHERE persistent IS NULL`)
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
  ensureColumn(database, 'packing_work_sessions', 'created_by_operator_name', 'TEXT')
  ensureColumn(database, 'packing_work_sessions', 'created_by_operator_code', 'TEXT')
  ensureColumn(database, 'recording_chat_sends', 'attachment_file_paths', 'TEXT')

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
      subtotal_amount INTEGER NOT NULL DEFAULT 0,
      adjustment_total INTEGER NOT NULL DEFAULT 0,
      adjustment_items TEXT NOT NULL DEFAULT '[]',
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
  ensureColumn(database, 'packing_payments', 'subtotal_amount', 'INTEGER NOT NULL DEFAULT 0')
  ensureColumn(database, 'packing_payments', 'adjustment_total', 'INTEGER NOT NULL DEFAULT 0')
  ensureColumn(database, 'packing_payments', 'adjustment_items', "TEXT NOT NULL DEFAULT '[]'")
  database.exec(`UPDATE packing_payments SET subtotal_amount = total_amount WHERE subtotal_amount IS NULL OR subtotal_amount = 0`)
  database.exec(`UPDATE packing_payments SET adjustment_items = '[]' WHERE adjustment_items IS NULL OR adjustment_items = ''`)
}

function ensurePackerAdjustmentTable(database: SQLiteDatabase) {
  database.exec(
    `CREATE TABLE IF NOT EXISTS packer_adjustments (
      id TEXT PRIMARY KEY NOT NULL,
      packer_operator_name TEXT NOT NULL,
      packer_operator_code TEXT NOT NULL,
      packer_name_snapshot TEXT NOT NULL,
      packer_code_snapshot TEXT NOT NULL,
      label TEXT NOT NULL,
      kind TEXT NOT NULL,
      amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      applied_payment_id TEXT,
      note TEXT,
      created_by_operator_name TEXT,
      created_by_operator_code TEXT,
      created_by_session_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  )
  database.exec(`CREATE INDEX IF NOT EXISTS idx_packer_adjustments_packer ON packer_adjustments (packer_operator_code)`)
  database.exec(`CREATE INDEX IF NOT EXISTS idx_packer_adjustments_status ON packer_adjustments (status)`)
}

function ensurePackingPaymentDraftTables(database: SQLiteDatabase) {
  database.exec(
    `CREATE TABLE IF NOT EXISTS packing_payment_drafts (
      id TEXT PRIMARY KEY NOT NULL,
      draft_no TEXT NOT NULL,
      packer_operator_name TEXT NOT NULL,
      packer_operator_code TEXT NOT NULL,
      packer_name_snapshot TEXT NOT NULL,
      packer_code_snapshot TEXT NOT NULL,
      total_sessions INTEGER NOT NULL,
      total_packages INTEGER NOT NULL,
      subtotal_snapshot INTEGER NOT NULL,
      adjustment_total_snapshot INTEGER NOT NULL,
      estimated_total INTEGER NOT NULL,
      adjustments_snapshot TEXT NOT NULL DEFAULT '[]',
      ledger_adjustment_ids TEXT NOT NULL DEFAULT '[]',
      ledger_snapshot TEXT NOT NULL DEFAULT '[]',
      payment_method TEXT NOT NULL,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      confirmed_payment_id TEXT,
      created_by_operator_name TEXT,
      created_by_operator_code TEXT,
      created_by_session_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  )
  database.exec(`CREATE INDEX IF NOT EXISTS idx_packing_payment_drafts_status ON packing_payment_drafts (status)`)
  database.exec(`CREATE INDEX IF NOT EXISTS idx_packing_payment_drafts_packer ON packing_payment_drafts (packer_operator_code)`)
  database.exec(
    `CREATE TABLE IF NOT EXISTS packing_payment_draft_sessions (
      draft_id TEXT NOT NULL,
      packing_session_id TEXT NOT NULL,
      PRIMARY KEY (draft_id, packing_session_id),
      FOREIGN KEY(draft_id) REFERENCES packing_payment_drafts(id) ON DELETE CASCADE,
      FOREIGN KEY(packing_session_id) REFERENCES packing_work_sessions(id) ON DELETE CASCADE
    )`,
  )
  database.exec(`CREATE INDEX IF NOT EXISTS idx_packing_payment_draft_sessions_session ON packing_payment_draft_sessions (packing_session_id)`)
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
  ensureSessionColumns(db)
  ensureOrderColumns(db)
  ensurePackingColumns(db)
  ensurePackingPaymentTable(db)
  ensurePackerAdjustmentTable(db)
  ensurePackingPaymentDraftTables(db)
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

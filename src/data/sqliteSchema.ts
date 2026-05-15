export type SqliteSchemaMigration = {
  version: number
  name: string
  statements: readonly string[]
}

const INITIAL_SCHEMA: SqliteSchemaMigration = {
  version: 1,
  name: 'initial_schema',
  statements: [
    `CREATE TABLE IF NOT EXISTS packcam_state (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS packcam_operator_profiles (
      operator_name TEXT NOT NULL,
      operator_code TEXT NOT NULL,
      role TEXT NOT NULL,
      full_name TEXT,
      last_used_at TEXT NOT NULL,
      password_salt TEXT,
      password_hash TEXT,
      PRIMARY KEY (operator_name, operator_code, role)
    )`,
    `CREATE TABLE IF NOT EXISTS packcam_recordings (
      id TEXT PRIMARY KEY NOT NULL,
      resi_number TEXT NOT NULL,
      operator_name TEXT,
      operator_code TEXT,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size_bytes INTEGER,
      record_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT,
      duration_seconds INTEGER,
      status TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      blob_key TEXT,
      mime_type TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_packcam_recordings_resi_number ON packcam_recordings (resi_number)`,
    `CREATE INDEX IF NOT EXISTS idx_packcam_recordings_status ON packcam_recordings (status)`,
    `CREATE INDEX IF NOT EXISTS idx_packcam_recordings_start_time ON packcam_recordings (start_time DESC)`,
    `CREATE TABLE IF NOT EXISTS packcam_scan_logs (
      id TEXT PRIMARY KEY NOT NULL,
      resi_number TEXT NOT NULL,
      operator_name TEXT,
      operator_code TEXT,
      scan_time TEXT NOT NULL,
      action TEXT NOT NULL,
      message TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_packcam_scan_logs_scan_time ON packcam_scan_logs (scan_time DESC)`,
  ],
}

export const SQLITE_SCHEMA_MIGRATIONS: readonly SqliteSchemaMigration[] = [INITIAL_SCHEMA]

export const SQLITE_SCHEMA_VERSION = SQLITE_SCHEMA_MIGRATIONS[SQLITE_SCHEMA_MIGRATIONS.length - 1]?.version ?? 0

export const SQLITE_SCHEMA_TABLES = {
  schemaMeta: 'packcam_schema_meta',
  schemaMigrations: 'packcam_schema_migrations',
  state: 'packcam_state',
  operatorProfiles: 'packcam_operator_profiles',
  recordings: 'packcam_recordings',
  scanLogs: 'packcam_scan_logs',
} as const

export const SQLITE_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS packcam_schema_meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS packcam_schema_migrations (
    version INTEGER PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`,
  ...INITIAL_SCHEMA.statements,
] as const

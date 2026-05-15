export const RECORDINGS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS recordings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  status TEXT NOT NULL DEFAULT 'recording',
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);`

export const RECORDINGS_INDEXES_SQL = [
  `CREATE INDEX IF NOT EXISTS idx_recordings_resi ON recordings(resi_number);`,
  `CREATE INDEX IF NOT EXISTS idx_recordings_date ON recordings(record_date);`,
  `CREATE INDEX IF NOT EXISTS idx_recordings_status ON recordings(status);`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_recordings_resi_completed
   ON recordings(resi_number)
   WHERE status = 'completed';`,
]

export const APP_SETTINGS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);`

export const SCAN_LOGS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS scan_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resi_number TEXT NOT NULL,
  operator_name TEXT,
  operator_code TEXT,
  scan_time TEXT NOT NULL DEFAULT (datetime('now')),
  action TEXT NOT NULL,
  message TEXT
);`

export const INITIAL_SCHEMA_SQL = [
  RECORDINGS_TABLE_SQL,
  ...RECORDINGS_INDEXES_SQL,
  APP_SETTINGS_TABLE_SQL,
  SCAN_LOGS_TABLE_SQL,
]

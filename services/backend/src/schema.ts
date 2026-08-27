export const SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS operator_profiles (
    operator_name TEXT NOT NULL,
    operator_code TEXT NOT NULL,
    role TEXT NOT NULL,
    task_type TEXT NOT NULL DEFAULT 'packing',
    full_name TEXT,
    last_used_at TEXT NOT NULL,
    password_salt TEXT,
    password_hash TEXT,
    PRIMARY KEY (operator_name, operator_code, role)
  )`,
  `CREATE TABLE IF NOT EXISTS operator_sessions (
    session_id TEXT PRIMARY KEY NOT NULL,
    operator_name TEXT NOT NULL,
    operator_code TEXT NOT NULL,
    role TEXT NOT NULL,
    task_type TEXT NOT NULL DEFAULT 'packing',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS recordings (
    id TEXT PRIMARY KEY NOT NULL,
    resi_number TEXT NOT NULL,
    task_type TEXT NOT NULL DEFAULT 'packing',
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
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_recordings_resi_number ON recordings (resi_number)`,
  `CREATE INDEX IF NOT EXISTS idx_recordings_status ON recordings (status)`,
  `CREATE INDEX IF NOT EXISTS idx_recordings_start_time ON recordings (start_time DESC)`,
  `CREATE TABLE IF NOT EXISTS scan_logs (
    id TEXT PRIMARY KEY NOT NULL,
    resi_number TEXT NOT NULL,
    task_type TEXT NOT NULL DEFAULT 'packing',
    operator_name TEXT,
    operator_code TEXT,
    scan_time TEXT NOT NULL,
    action TEXT NOT NULL,
    message TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_scan_logs_scan_time ON scan_logs (scan_time DESC)`,
  `CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS bootstrap_state (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS last_error (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY NOT NULL,
    source TEXT NOT NULL,
    order_number TEXT NOT NULL,
    tracking_number TEXT,
    buyer_username TEXT,
    shipping_channel TEXT,
    order_status TEXT,
    raw_payload TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(source, order_number)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_orders_tracking_number ON orders (tracking_number)`,
  `CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY NOT NULL,
    order_id TEXT NOT NULL,
    sku TEXT,
    product_name TEXT NOT NULL,
    variation_name TEXT,
    quantity INTEGER NOT NULL,
    image_url TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items (order_id)`,
] as const

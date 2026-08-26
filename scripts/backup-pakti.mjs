import Database from 'better-sqlite3'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..')
const SERVER_DATA_DIR = path.join(PROJECT_ROOT, 'services', 'backend', 'server-data')
const DB_PATH = path.join(SERVER_DATA_DIR, 'pakti.sqlite')
const UPLOADS_DIR = path.join(SERVER_DATA_DIR, 'uploads')
const PENDING_DIR = path.join(SERVER_DATA_DIR, 'pending-recordings')
const DEFAULT_BACKUP_ROOT = path.join(os.homedir(), 'Documents', 'Pakti', 'backups')
const BACKUP_ROOT = path.resolve(process.env.PAKTI_BACKUP_DIR || DEFAULT_BACKUP_ROOT)
const DB_BACKUP_DIR = path.join(BACKUP_ROOT, 'database')
const UPLOADS_BACKUP_DIR = path.join(BACKUP_ROOT, 'uploads')
const PENDING_BACKUP_DIR = path.join(BACKUP_ROOT, 'pending-recordings')
const RETENTION_DAYS = Math.max(1, Number(process.env.PAKTI_BACKUP_RETENTION_DAYS || 14))

function timestamp() {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function copyIfChanged(source, target) {
  const sourceStat = fs.statSync(source)

  if (sourceStat.isDirectory()) {
    ensureDir(target)
    for (const entry of fs.readdirSync(source)) {
      copyIfChanged(path.join(source, entry), path.join(target, entry))
    }
    return
  }

  if (!sourceStat.isFile()) {
    return
  }

  let targetStat = null
  try {
    targetStat = fs.statSync(target)
  } catch {
    targetStat = null
  }

  if (
    targetStat &&
    targetStat.isFile() &&
    targetStat.size === sourceStat.size &&
    Math.trunc(targetStat.mtimeMs) >= Math.trunc(sourceStat.mtimeMs)
  ) {
    return
  }

  ensureDir(path.dirname(target))
  fs.copyFileSync(source, target)
  fs.utimesSync(target, sourceStat.atime, sourceStat.mtime)
}

async function backupDatabase(stamp) {
  if (!fs.existsSync(DB_PATH)) {
    return { status: 'skipped', reason: 'database file not found' }
  }

  ensureDir(DB_BACKUP_DIR)
  const target = path.join(DB_BACKUP_DIR, `pakti_${stamp}.sqlite`)
  const database = new Database(DB_PATH, { readonly: true, fileMustExist: true })

  try {
    await database.backup(target)
    return { status: 'ok', path: target }
  } finally {
    database.close()
  }
}

function backupDirectory(source, target) {
  if (!fs.existsSync(source)) {
    return { status: 'skipped', reason: 'source directory not found' }
  }

  copyIfChanged(source, target)
  return { status: 'ok', path: target }
}

function cleanupOldDatabaseBackups() {
  if (!fs.existsSync(DB_BACKUP_DIR)) {
    return []
  }

  const cutoffMs = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
  const deleted = []

  for (const entry of fs.readdirSync(DB_BACKUP_DIR)) {
    if (!/^pakti_\d{8}_\d{6}\.sqlite$/.test(entry)) {
      continue
    }

    const filePath = path.join(DB_BACKUP_DIR, entry)
    const stat = fs.statSync(filePath)

    if (stat.mtimeMs < cutoffMs) {
      fs.rmSync(filePath, { force: true })
      deleted.push(filePath)
    }
  }

  return deleted
}

async function main() {
  const stamp = timestamp()
  ensureDir(BACKUP_ROOT)

  const result = {
    createdAt: new Date().toISOString(),
    backupRoot: BACKUP_ROOT,
    retentionDays: RETENTION_DAYS,
    database: await backupDatabase(stamp),
    uploads: backupDirectory(UPLOADS_DIR, UPLOADS_BACKUP_DIR),
    pendingRecordings: backupDirectory(PENDING_DIR, PENDING_BACKUP_DIR),
    deletedOldDatabaseBackups: cleanupOldDatabaseBackups(),
  }

  const manifestPath = path.join(BACKUP_ROOT, 'last-backup.json')
  fs.writeFileSync(manifestPath, `${JSON.stringify(result, null, 2)}\n`)
  console.log(JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

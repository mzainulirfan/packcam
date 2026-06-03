import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import Database from 'better-sqlite3'

const ROOT_DIR = process.cwd()
const STORAGE_DIR = path.join(ROOT_DIR, 'services', 'backend', 'server-data')
const DB_PATH = path.join(STORAGE_DIR, 'pakti.sqlite')
const UPLOADS_DIR = path.join(STORAGE_DIR, 'uploads')
const APPLY = process.argv.includes('--apply')

function sanitizeSegment(segment) {
  return segment.trim().replace(/[\\/:*?"<>|]+/g, '_')
}

function normalizeTaskType(value) {
  return value === 'packing' ? 'packing' : 'qc'
}

function formatTimestamp(startedAt) {
  const year = startedAt.getFullYear()
  const month = `${startedAt.getMonth() + 1}`.padStart(2, '0')
  const day = `${startedAt.getDate()}`.padStart(2, '0')
  const hours = `${startedAt.getHours()}`.padStart(2, '0')
  const minutes = `${startedAt.getMinutes()}`.padStart(2, '0')
  const seconds = `${startedAt.getSeconds()}`.padStart(2, '0')
  const milliseconds = `${startedAt.getMilliseconds()}`.padStart(3, '0')

  return `${year}${month}${day}_${hours}${minutes}${seconds}_${milliseconds}`
}

function buildFileName(record) {
  const startedAt = new Date(record.start_time)
  const taskPrefix = normalizeTaskType(record.task_type)
  const safeResi = sanitizeSegment(record.resi_number)
  const extension = path.extname(record.file_name || record.file_path || '').replace('.', '') || 'webm'
  return `${taskPrefix}_${safeResi}_${formatTimestamp(startedAt)}.${extension}`
}

function toPosixPath(value) {
  return value.replaceAll('\\', '/')
}

function deriveRootPath(filePath) {
  const normalized = toPosixPath(filePath).replace(/^\/+/, '')
  const segments = normalized.split('/').filter(Boolean)

  if (segments.length >= 4) {
    const [year, month, day] = segments.slice(-4, -1)
    if (/^\d{4}$/.test(year) && /^\d{2}$/.test(month) && /^\d{2}$/.test(day)) {
      return segments.slice(0, -4).join('/')
    }
  }

  return segments.slice(0, -1).join('/')
}

function getRelativeFilePath(record) {
  const currentPath = toPosixPath(record.file_path || record.file_name || '')
  const rootPath = deriveRootPath(currentPath)
  const fileName = buildFileName(record)
  return rootPath ? `${rootPath}/${fileName}` : fileName
}

function getAbsolutePath(relativePath) {
  return path.join(UPLOADS_DIR, ...toPosixPath(relativePath).split('/').filter(Boolean))
}

if (!fs.existsSync(DB_PATH)) {
  console.error(`Database tidak ditemukan: ${DB_PATH}`)
  process.exit(1)
}

const db = new Database(DB_PATH)
const rows = db
  .prepare(
    `SELECT id, resi_number, task_type, file_name, file_path, start_time
     FROM recordings
     ORDER BY start_time ASC`,
  )
  .all()

let moved = 0
let updated = 0
let skipped = 0
let missing = 0
let conflicted = 0

const updateStatement = db.prepare(
  `UPDATE recordings
   SET file_name = ?, file_path = ?, updated_at = ?
   WHERE id = ?`,
)

const groups = new Map()

for (const record of rows) {
  const sourceRelativePath = toPosixPath(record.file_path)
  const current = groups.get(sourceRelativePath) ?? []
  current.push(record)
  groups.set(sourceRelativePath, current)
}

for (const [sourceRelativePath, groupRows] of groups) {
  groupRows.sort((left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime())
  const owner = groupRows[groupRows.length - 1]
  const nextFilePath = getRelativeFilePath(owner)
  const nextFileName = path.posix.basename(nextFilePath)
  const sourcePath = getAbsolutePath(sourceRelativePath)
  const targetPath = getAbsolutePath(nextFilePath)

  if (groupRows.length > 1) {
    conflicted += groupRows.length - 1
    console.warn(`Sumber file sama dipakai ${groupRows.length} baris, hanya baris terbaru yang dimigrasi: ${sourceRelativePath}`)
  }

  if (sourceRelativePath === nextFilePath) {
    skipped += 1
    continue
  }

  if (!fs.existsSync(sourcePath)) {
    if (fs.existsSync(targetPath)) {
      updateStatement.run(nextFileName, nextFilePath, new Date().toISOString(), owner.id)
      updated += 1
      continue
    }

    missing += 1
    console.warn(`File hilang, dilewati: ${owner.id} -> ${sourceRelativePath}`)
    continue
  }

  if (fs.existsSync(targetPath)) {
    skipped += 1
    console.warn(`Target sudah ada, dilewati: ${owner.id} -> ${nextFilePath}`)
    continue
  }

  if (!APPLY) {
    console.log(`[dry-run] ${sourceRelativePath} -> ${nextFilePath}`)
    moved += 1
    continue
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.renameSync(sourcePath, targetPath)
  updateStatement.run(nextFileName, nextFilePath, new Date().toISOString(), owner.id)
  moved += 1
}

db.close()

const mode = APPLY ? 'apply' : 'dry-run'
console.log(`Selesai (${mode}). moved=${moved}, updated=${updated}, skipped=${skipped}, missing=${missing}, conflicted=${conflicted}`)

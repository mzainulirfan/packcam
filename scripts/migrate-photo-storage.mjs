import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import Database from 'better-sqlite3'

const ROOT_DIR = process.cwd()
const STORAGE_DIR = path.join(ROOT_DIR, 'services', 'backend', 'server-data')
const DB_PATH = process.env.PAKTI_DB_PATH || path.join(STORAGE_DIR, 'pakti.sqlite')
const DATA_DIR = path.dirname(DB_PATH)
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads')
const DEFAULT_PHOTO_ROOT_PATH = 'Documents/Pakti/photos'
const APPLY = process.argv.includes('--apply')

function toPosixPath(value) {
  return String(value ?? '').replaceAll('\\', '/').replace(/^\/+/, '')
}

function isPhotoPath(value) {
  return /\.(jpe?g|png|webp)(?:\?|#|$)/i.test(String(value ?? ''))
}

function getAbsolutePath(relativePath) {
  return path.join(UPLOADS_DIR, ...toPosixPath(relativePath).split('/').filter(Boolean))
}

function getTargetRelativePath(record) {
  const sourcePath = toPosixPath(record.file_path || record.file_name)
  const fileName = path.posix.basename(sourcePath || record.file_name)
  return `${DEFAULT_PHOTO_ROOT_PATH}/${fileName}`
}

if (!fs.existsSync(DB_PATH)) {
  console.error(`Database tidak ditemukan: ${DB_PATH}`)
  process.exit(1)
}

const db = new Database(DB_PATH)
const rows = db
  .prepare(
    `SELECT id, file_name, file_path, media_type
     FROM recordings
     WHERE media_type = 'photo'
        OR lower(file_name) GLOB '*.jpg'
        OR lower(file_name) GLOB '*.jpeg'
        OR lower(file_name) GLOB '*.png'
        OR lower(file_name) GLOB '*.webp'
        OR lower(file_path) GLOB '*.jpg'
        OR lower(file_path) GLOB '*.jpeg'
        OR lower(file_path) GLOB '*.png'
        OR lower(file_path) GLOB '*.webp'
     ORDER BY start_time ASC`,
  )
  .all()

const updateStatement = db.prepare(
  `UPDATE recordings
   SET file_name = ?, file_path = ?, media_type = 'photo', mime_type = COALESCE(mime_type, 'image/jpeg'), updated_at = ?
   WHERE id = ?`,
)

let moved = 0
let updated = 0
let skipped = 0
let missing = 0
let conflicted = 0

for (const record of rows) {
  if (!isPhotoPath(record.file_path) && !isPhotoPath(record.file_name)) {
    skipped += 1
    continue
  }

  const sourceRelativePath = toPosixPath(record.file_path || record.file_name)
  const targetRelativePath = getTargetRelativePath(record)
  const targetFileName = path.posix.basename(targetRelativePath)

  if (sourceRelativePath === targetRelativePath) {
    skipped += 1
    continue
  }

  const sourcePath = getAbsolutePath(sourceRelativePath)
  const targetPath = getAbsolutePath(targetRelativePath)

  if (!fs.existsSync(sourcePath)) {
    if (fs.existsSync(targetPath)) {
      if (APPLY) updateStatement.run(targetFileName, targetRelativePath, new Date().toISOString(), record.id)
      updated += 1
      continue
    }

    missing += 1
    console.warn(`File foto hilang, dilewati: ${record.id} -> ${sourceRelativePath}`)
    continue
  }

  if (fs.existsSync(targetPath)) {
    conflicted += 1
    console.warn(`Target sudah ada, dilewati: ${record.id} -> ${targetRelativePath}`)
    continue
  }

  if (!APPLY) {
    console.log(`[dry-run] ${sourceRelativePath} -> ${targetRelativePath}`)
    moved += 1
    continue
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.renameSync(sourcePath, targetPath)
  updateStatement.run(targetFileName, targetRelativePath, new Date().toISOString(), record.id)
  moved += 1
}

db.close()

const mode = APPLY ? 'apply' : 'dry-run'
console.log(`Selesai (${mode}). moved=${moved}, updated=${updated}, skipped=${skipped}, missing=${missing}, conflicted=${conflicted}`)

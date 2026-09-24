import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import Database from 'better-sqlite3'
import ffmpegPath from 'ffmpeg-static'

const ROOT_DIR = process.cwd()
const STORAGE_DIR = path.join(ROOT_DIR, 'services', 'backend', 'server-data')
const DB_PATH = process.env.PAKTI_DB_PATH || path.join(STORAGE_DIR, 'pakti.sqlite')
const DATA_DIR = path.dirname(DB_PATH)
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads')
const APPLY = process.argv.includes('--apply')

function toPosixPath(value) {
  return String(value ?? '').replaceAll('\\', '/').replace(/^\/+/, '')
}

function getAbsolutePath(relativePath) {
  return path.join(UPLOADS_DIR, ...toPosixPath(relativePath).split('/').filter(Boolean))
}

function getMagic(filePath) {
  if (!fs.existsSync(filePath)) return 'missing'
  const buffer = fs.readFileSync(filePath).subarray(0, 4)
  return Array.from(buffer).map((byte) => byte.toString(16).padStart(2, '0')).join(' ')
}

function isJpegMagic(magic) {
  return magic.startsWith('ff d8 ff')
}

function isWebmMagic(magic) {
  return magic === '1a 45 df a3'
}

if (!ffmpegPath) {
  console.error('ffmpeg-static tidak tersedia.')
  process.exit(1)
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
        OR lower(file_path) GLOB '*.jpg'
     ORDER BY start_time ASC`,
  )
  .all()

const updateStatement = db.prepare(
  `UPDATE recordings
   SET media_type = 'photo', mime_type = 'image/jpeg', file_size_bytes = ?, updated_at = ?
   WHERE id = ?`,
)

let repaired = 0
let valid = 0
let missing = 0
let skipped = 0
let failed = 0

for (const record of rows) {
  const absolutePath = getAbsolutePath(record.file_path || record.file_name)
  const magic = getMagic(absolutePath)

  if (magic === 'missing') {
    missing += 1
    console.warn(`File hilang: ${record.id} -> ${record.file_path}`)
    continue
  }

  if (isJpegMagic(magic)) {
    valid += 1
    continue
  }

  if (!isWebmMagic(magic)) {
    skipped += 1
    console.warn(`Format tidak dikenal, dilewati: ${record.id} -> ${record.file_path} (${magic})`)
    continue
  }

  if (!APPLY) {
    console.log(`[dry-run] extract first frame: ${record.file_path}`)
    repaired += 1
    continue
  }

  const temporaryPath = `${absolutePath}.repair.jpg`
  const result = spawnSync(ffmpegPath, ['-y', '-i', absolutePath, '-frames:v', '1', '-q:v', '2', temporaryPath], {
    stdio: 'pipe',
    encoding: 'utf8',
  })

  if (result.status !== 0 || !fs.existsSync(temporaryPath)) {
    failed += 1
    console.warn(`Gagal repair: ${record.id} -> ${record.file_path}`)
    if (result.stderr) console.warn(result.stderr.split('\n').slice(-4).join('\n'))
    continue
  }

  const backupPath = `${absolutePath}.webm.backup`
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(absolutePath, backupPath)
  }
  fs.renameSync(temporaryPath, absolutePath)
  const size = fs.statSync(absolutePath).size
  updateStatement.run(size, new Date().toISOString(), record.id)
  repaired += 1
}

db.close()

const mode = APPLY ? 'apply' : 'dry-run'
console.log(`Selesai (${mode}). repaired=${repaired}, valid=${valid}, missing=${missing}, skipped=${skipped}, failed=${failed}`)

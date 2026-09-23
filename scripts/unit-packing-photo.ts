import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const TEST_DB_PATH = path.resolve(MODULE_DIR, '../server-data/pakti-test-packing-photo.sqlite')

for (const suffix of ['', '-wal', '-shm', '-journal']) {
  const extra = `${TEST_DB_PATH}${suffix}`
  if (fs.existsSync(extra)) fs.unlinkSync(extra)
}

process.env.PAKTI_DB_PATH = TEST_DB_PATH

const { getDb, getUploadsDir } = await import('../services/backend/src/db.ts')
const { upsertOperatorProfile } = await import('../services/backend/src/store/operatorStore.ts')
const { createPackingSession } = await import('../services/backend/src/store/packingSessionStore.ts')
const { getRecordingById, savePackingPhotoRecord } = await import('../services/backend/src/store/recordingStore.ts')

const database = getDb()

function resetDb() {
  for (const table of ['recordings', 'packing_work_sessions', 'operator_sessions', 'operator_profiles']) {
    database.prepare(`DELETE FROM ${table}`).run()
  }
}

function seedAll() {
  upsertOperatorProfile({ operatorName: 'sani', operatorCode: 'PK01', role: 'operator', taskType: 'packing', fullName: 'Sani', password: 'secret123' })
}

function seedQcCompleted(resi: string) {
  const now = new Date().toISOString()
  database.prepare(`INSERT INTO recordings (id, resi_number, task_type, operator_name, operator_code, file_name, file_path, media_type, file_size_bytes, record_date, start_time, end_time, duration_seconds, status, created_at, updated_at) VALUES (?, ?, 'qc', 'sani', 'PK01', 'qc_test.mp4', 'qc_test.mp4', 'video', 100, ?, ?, ?, 5, 'completed', ?, ?)`)
    .run(`rec_qc_${Math.random().toString(36).slice(2, 10)}`, resi, now.slice(0, 10), now, now, now, now)
}

function fakeJpeg() {
  // Minimal valid JPEG: SOI + JFIF header + EOI (cukup untuk Buffer, bukan untuk dilihat).
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9])
}

test('savePackingPhotoRecord menyimpan sekali tembak dengan upah', async () => {
  resetDb()
  seedAll()
  const resi = `RESI-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
  seedQcCompleted(resi)
  const packingSession = createPackingSession({ packerOperatorName: 'sani', packerOperatorCode: 'PK01', createdBySessionId: 'dev-1' })

  const saved = savePackingPhotoRecord({
    resiNumber: resi,
    operatorName: 'sani',
    operatorCode: 'PK01',
    packingSessionId: packingSession.id,
    photo: fakeJpeg(),
  })

  assert.equal(saved?.status, 'completed')
  assert.equal(saved?.task_type, 'packing')
  assert.equal(saved?.media_type, 'photo')
  assert.ok((saved?.packing_pay_amount ?? 0) > 0)
  assert.equal(saved?.packing_session_id, packingSession.id)

  const fetched = getRecordingById(saved!.id)
  assert.equal(fetched?.status, 'completed')
})

test('savePackingPhotoRecord menolak bila QC belum selesai', async () => {
  resetDb()
  seedAll()
  const resi = `RESI-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
  const packingSession = createPackingSession({ packerOperatorName: 'sani', packerOperatorCode: 'PK01', createdBySessionId: 'dev-1' })

  assert.throws(() => savePackingPhotoRecord({
    resiNumber: resi,
    operatorName: 'sani',
    operatorCode: 'PK01',
    packingSessionId: packingSession.id,
    photo: fakeJpeg(),
  }), /QC selesai/)
})

test('savePackingPhotoRecord menolak duplikat packing', async () => {
  resetDb()
  seedAll()
  const resi = `RESI-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
  seedQcCompleted(resi)
  const packingSession = createPackingSession({ packerOperatorName: 'sani', packerOperatorCode: 'PK01', createdBySessionId: 'dev-1' })
  const input = {
    resiNumber: resi,
    operatorName: 'sani',
    operatorCode: 'PK01',
    packingSessionId: packingSession.id,
    photo: fakeJpeg(),
  }
  savePackingPhotoRecord(input)
  assert.throws(() => savePackingPhotoRecord(input), /sudah tersimpan/)
})

test('savePackingPhotoRecord menolak sesi packing tidak valid dan file kosong', async () => {
  resetDb()
  seedAll()
  const resi = `RESI-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
  seedQcCompleted(resi)

  assert.throws(() => savePackingPhotoRecord({
    resiNumber: resi,
    operatorName: 'sani',
    operatorCode: 'PK01',
    packingSessionId: 'tidak-ada',
    photo: fakeJpeg(),
  }), /Sesi packing aktif/)

  const packingSession = createPackingSession({ packerOperatorName: 'sani', packerOperatorCode: 'PK01', createdBySessionId: 'dev-1' })
  assert.throws(() => savePackingPhotoRecord({
    resiNumber: resi,
    operatorName: 'sani',
    operatorCode: 'PK01',
    packingSessionId: packingSession.id,
    photo: Buffer.alloc(0),
  }), /wajib diisi/)
})

test('file foto tertulis di folder uploads', async () => {
  resetDb()
  seedAll()
  const resi = `RESI-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
  seedQcCompleted(resi)
  const packingSession = createPackingSession({ packerOperatorName: 'sani', packerOperatorCode: 'PK01', createdBySessionId: 'dev-1' })
  const saved = savePackingPhotoRecord({
    resiNumber: resi,
    operatorName: 'sani',
    operatorCode: 'PK01',
    packingSessionId: packingSession.id,
    photo: fakeJpeg(),
  })
  const uploadsRoot = getUploadsDir()
  const expected = path.join(uploadsRoot, saved!.file_path)
  assert.ok(fs.existsSync(expected), `file harus ada di ${expected}`)
  assert.ok((fs.statSync(expected).size ?? 0) > 0)
})

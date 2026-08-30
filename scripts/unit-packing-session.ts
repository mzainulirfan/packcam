import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const TEST_DB_PATH = path.resolve(MODULE_DIR, '../server-data/pakti-test-packing-session.sqlite')

if (fs.existsSync(TEST_DB_PATH)) {
  fs.unlinkSync(TEST_DB_PATH)
}

process.env.PAKTI_DB_PATH = TEST_DB_PATH

const { getDb } = await import('../services/backend/src/db.ts')
const { upsertOperatorProfile } = await import('../services/backend/src/store/operatorStore.ts')
const {
  closePackingSession,
  createPackingSession,
  deletePackingSession,
  getPackingSessionById,
  reopenPackingSession,
} = await import('../services/backend/src/store/packingSessionStore.ts')

const database = getDb()

function resetDb() {
  database.prepare('DELETE FROM recordings').run()
  database.prepare('DELETE FROM packing_work_sessions').run()
  database.prepare('DELETE FROM operator_profiles').run()
}

function seedPackingOperator(operatorName: string, operatorCode: string, fullName = operatorName) {
  return upsertOperatorProfile({
    operatorName,
    operatorCode,
    role: 'operator',
    taskType: 'packing',
    fullName,
    password: 'secret123',
  })
}

test('reopenPackingSession melanjutkan sesi active yang belum diakhiri dan melepas sesi aktif lain', () => {
  resetDb()
  seedPackingOperator('sani', 'PK01', 'Sani')
  seedPackingOperator('wildan', 'PK02', 'Wildan')

  const saniSession = createPackingSession({
    packerOperatorName: 'sani',
    packerOperatorCode: 'PK01',
    createdBySessionId: 'device-session-1',
  })
  assert.ok(saniSession)

  const wildanSession = createPackingSession({
    packerOperatorName: 'wildan',
    packerOperatorCode: 'PK02',
    createdBySessionId: 'device-session-1',
    releaseActive: true,
  })
  assert.ok(wildanSession)
  assert.equal(getPackingSessionById(saniSession.id)?.status, 'active')
  assert.equal(getPackingSessionById(saniSession.id)?.createdBySessionId, null)

  const reopened = reopenPackingSession({
    id: saniSession.id,
    currentSession: {
      sessionId: 'device-session-1',
      operatorName: 'admin',
      operatorCode: 'ADM',
      role: 'admin',
      taskType: 'packing',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    releaseActive: true,
  })

  assert.equal(reopened?.id, saniSession.id)
  assert.equal(reopened?.status, 'active')
  assert.equal(reopened?.endedAt, null)
  assert.equal(reopened?.createdBySessionId, 'device-session-1')
  assert.equal(getPackingSessionById(wildanSession.id)?.status, 'active')
  assert.equal(getPackingSessionById(wildanSession.id)?.createdBySessionId, null)
})

test('createPackingSession otomatis melepas sesi aktif lama di device yang sama', () => {
  resetDb()
  seedPackingOperator('sani', 'PK01', 'Sani')
  seedPackingOperator('wildan', 'PK02', 'Wildan')

  const saniSession = createPackingSession({
    packerOperatorName: 'sani',
    packerOperatorCode: 'PK01',
    createdBySessionId: 'device-session-1',
  })

  const wildanSession = createPackingSession({
    packerOperatorName: 'wildan',
    packerOperatorCode: 'PK02',
    createdBySessionId: 'device-session-1',
  })

  assert.equal(wildanSession?.status, 'active')
  assert.equal(wildanSession?.createdBySessionId, 'device-session-1')
  assert.equal(getPackingSessionById(saniSession?.id ?? '')?.status, 'active')
  assert.equal(getPackingSessionById(saniSession?.id ?? '')?.createdBySessionId, null)
})

test('reopenPackingSession menolak sesi yang sudah diakhiri', () => {
  resetDb()
  seedPackingOperator('sani', 'PK01', 'Sani')

  const saniSession = createPackingSession({
    packerOperatorName: 'sani',
    packerOperatorCode: 'PK01',
    createdBySessionId: 'device-session-1',
  })
  assert.ok(saniSession)
  // seed 1 paket agar bisa ditutup (guard 0 paket)
  const now = new Date().toISOString()
  const resi = `RESI-${Math.random().toString(36).slice(2,6).toUpperCase()}`
  database.prepare(`INSERT INTO recordings (id, resi_number, task_type, operator_name, operator_code, file_name, file_path, media_type, file_size_bytes, record_date, start_time, end_time, duration_seconds, status, packing_session_id, packer_operator_name, packer_operator_code, packing_pay_amount, packing_pay_status, created_at, updated_at) VALUES (?, ?, 'qc', 'sani', 'PK01', 'qc.mp4', 'qc.mp4', 'video', 100, ?, ?, ?, 5, 'completed', null, 'sani', 'PK01', 1500, 'calculated', ?, ?)`).run(`qc-${Date.now()}`, resi, now.slice(0,10), now, now, now, now)
  database.prepare(`INSERT INTO recordings (id, resi_number, task_type, operator_name, operator_code, file_name, file_path, media_type, file_size_bytes, record_date, start_time, end_time, duration_seconds, status, packing_session_id, packer_operator_name, packer_operator_code, packing_pay_amount, packing_pay_status, created_at, updated_at) VALUES (?, ?, 'packing', 'sani', 'PK01', 'pack.mp4', 'pack.mp4', 'video', 100, ?, ?, ?, 5, 'completed', ?, 'sani', 'PK01', 1500, 'calculated', ?, ?)`).run(`pack-${Date.now()}`, resi, now.slice(0,10), now, now, saniSession.id, now, now)
  closePackingSession(saniSession.id)

  assert.throws(() => reopenPackingSession({
    id: saniSession.id,
    currentSession: {
      sessionId: 'device-session-1',
      operatorName: 'admin',
      operatorCode: 'ADM',
      role: 'admin',
      taskType: 'packing',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  }), /belum diakhiri/)
})

test('reopenPackingSession bisa mengambil alih sesi active dari session login lama', () => {
  resetDb()
  seedPackingOperator('sani', 'PK01', 'Sani')

  const saniSession = createPackingSession({
    packerOperatorName: 'sani',
    packerOperatorCode: 'PK01',
    createdBySessionId: 'old-login-session',
  })
  assert.ok(saniSession)

  const resumed = reopenPackingSession({
    id: saniSession.id,
    currentSession: {
      sessionId: 'current-login-session',
      operatorName: 'admin',
      operatorCode: 'ADM',
      role: 'admin',
      taskType: 'packing',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    releaseActive: true,
  })

  assert.equal(resumed?.id, saniSession.id)
  assert.equal(resumed?.status, 'active')
  assert.equal(resumed?.createdBySessionId, 'current-login-session')
})

test('operator packing hanya bisa buat dan lanjutkan sesi miliknya sendiri', () => {
  resetDb()
  seedPackingOperator('sani', 'PK01', 'Sani')
  seedPackingOperator('wildan', 'PK02', 'Wildan')

  const saniAsSani = createPackingSession({
    packerOperatorName: 'sani',
    packerOperatorCode: 'PK01',
    createdBySessionId: 'sess-sani',
    currentSession: {
      sessionId: 'sess-sani',
      operatorName: 'sani',
      operatorCode: 'PK01',
      role: 'operator',
      taskType: 'packing',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  })
  assert.ok(saniAsSani)
  assert.equal(saniAsSani.createdByOperatorName, 'sani')
  assert.throws(() => createPackingSession({
    packerOperatorName: 'wildan',
    packerOperatorCode: 'PK02',
    createdBySessionId: 'sess-sani',
    currentSession: {
      sessionId: 'sess-sani',
      operatorName: 'sani',
      operatorCode: 'PK01',
      role: 'operator',
      taskType: 'packing',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  }), /hanya bisa mengelola sesi miliknya sendiri/)

  const wildanSession = createPackingSession({
    packerOperatorName: 'wildan',
    packerOperatorCode: 'PK02',
    createdBySessionId: 'sess-wildan',
    currentSession: {
      sessionId: 'sess-wildan',
      operatorName: 'wildan',
      operatorCode: 'PK02',
      role: 'operator',
      taskType: 'packing',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  })
  assert.throws(() => reopenPackingSession({
    id: wildanSession.id,
    currentSession: {
      sessionId: 'sess-sani',
      operatorName: 'sani',
      operatorCode: 'PK01',
      role: 'operator',
      taskType: 'packing',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    releaseActive: true,
  }), /hanya bisa melanjutkan sesi miliknya sendiri/)
})

test('admin atas nama menyimpan createdByOperator', () => {
  resetDb()
  seedPackingOperator('sani', 'PK01', 'Sani')
  const adminSess = {
    sessionId: 'sess-admin',
    operatorName: 'admin',
    operatorCode: 'ADM',
    role: 'admin' as const,
    taskType: 'packing' as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  const sani = createPackingSession({
    packerOperatorName: 'sani',
    packerOperatorCode: 'PK01',
    createdBySessionId: adminSess.sessionId,
    currentSession: adminSess,
  })
  assert.equal(sani.createdByOperatorName, 'admin')
  assert.equal(sani.createdByOperatorCode, 'ADM')
})

test('deletePackingSession hanya menghapus sesi closed kosong', () => {
  resetDb()
  seedPackingOperator('sani', 'PK01', 'Sani')

  const now = new Date().toISOString()
  database.prepare(`INSERT INTO packing_work_sessions (id, packer_operator_name, packer_operator_code, packer_name_snapshot, packer_code_snapshot, started_at, ended_at, status, note, created_by_session_id, created_at, updated_at) VALUES ('closed-empty', 'sani', 'PK01', 'Sani', 'PK01', ?, ?, 'closed', NULL, NULL, ?, ?)`).run(now, now, now, now)

  assert.equal(deletePackingSession('closed-empty'), true)
  assert.equal(getPackingSessionById('closed-empty'), null)
})

test('deletePackingSession menolak sesi closed yang berisi paket', () => {
  resetDb()
  seedPackingOperator('sani', 'PK01', 'Sani')

  const now = new Date().toISOString()
  database.prepare(`INSERT INTO packing_work_sessions (id, packer_operator_name, packer_operator_code, packer_name_snapshot, packer_code_snapshot, started_at, ended_at, status, note, created_by_session_id, created_at, updated_at) VALUES ('closed-filled', 'sani', 'PK01', 'Sani', 'PK01', ?, ?, 'closed', NULL, NULL, ?, ?)`).run(now, now, now, now)
  database.prepare(`INSERT INTO recordings (id, resi_number, task_type, operator_name, operator_code, file_name, file_path, media_type, file_size_bytes, record_date, start_time, end_time, duration_seconds, status, packing_session_id, packer_operator_name, packer_operator_code, packing_pay_amount, packing_pay_status, created_at, updated_at) VALUES ('pack-filled', 'RESI-FILLED', 'packing', 'sani', 'PK01', 'pack.mp4', 'pack.mp4', 'video', 100, ?, ?, ?, 5, 'completed', 'closed-filled', 'sani', 'PK01', 1500, 'calculated', ?, ?)`).run(now.slice(0,10), now, now, now, now)

  assert.throws(() => deletePackingSession('closed-filled'), /berisi paket/)
  assert.ok(getPackingSessionById('closed-filled'))
})

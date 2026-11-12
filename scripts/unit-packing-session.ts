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
const { createPackingPayRule } = await import('../services/backend/src/store/packingPayRuleStore.ts')
const { createRecordingDraft, updatePackingRecordingPayRule } = await import('../services/backend/src/store/recordingStore.ts')
const {
  closePackingSession,
  createPackingSession,
  deletePackingSession,
  getActivePackingSession,
  getPackingSessionById,
  listPackingSessionsForOperator,
  reopenPackingSession,
} = await import('../services/backend/src/store/packingSessionStore.ts')

const database = getDb()

function resetDb() {
  database.prepare('DELETE FROM recordings').run()
  database.prepare('DELETE FROM packing_work_sessions').run()
  database.prepare('DELETE FROM packing_pay_rules').run()
  database.prepare('DELETE FROM operator_sessions').run()
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

function seedAdmin(operatorName = 'admin', operatorCode = 'ADM', fullName = 'Admin') {
  return upsertOperatorProfile({
    operatorName,
    operatorCode,
    role: 'admin',
    taskType: 'qc',
    fullName,
    password: 'secret123',
  })
}

function makeSession(
  operatorName: string,
  operatorCode: string,
  sessionId: string,
  role: 'admin' | 'operator' = 'operator',
  taskType: 'packing' | 'qc' = 'packing',
) {
  const timestamp = new Date().toISOString()
  return {
    sessionId,
    operatorName,
    operatorCode,
    role,
    taskType,
    persistent: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

test('reopenPackingSession melanjutkan sesi milik akun yang sama dan melepas sesi aktif lain', () => {
  resetDb()
  seedPackingOperator('sani', 'PK01', 'Sani')
  const oldLogin = makeSession('sani', 'PK01', 'login-lama')
  const currentLogin = makeSession('sani', 'PK01', 'login-sekarang')

  const saniSession = createPackingSession({
    currentSession: oldLogin,
  })
  assert.ok(saniSession)

  const otherSaniSession = createPackingSession({
    currentSession: currentLogin,
  })
  assert.ok(otherSaniSession)

  const reopened = reopenPackingSession({
    id: saniSession.id,
    currentSession: currentLogin,
    releaseActive: true,
  })

  assert.equal(reopened?.id, saniSession.id)
  assert.equal(reopened?.status, 'active')
  assert.equal(reopened?.endedAt, null)
  assert.equal(reopened?.createdBySessionId, 'login-sekarang')
  assert.equal(getPackingSessionById(otherSaniSession.id)?.status, 'active')
  assert.equal(getPackingSessionById(otherSaniSession.id)?.createdBySessionId, null)
})

test('createPackingSession mengambil identitas login dan melepas sesi lama pada login yang sama', () => {
  resetDb()
  seedPackingOperator('sani', 'PK01', 'Sani')
  const login = makeSession('sani', 'PK01', 'device-session-1')

  const saniSession = createPackingSession({
    currentSession: login,
  })

  const nextSaniSession = createPackingSession({
    currentSession: login,
  })

  assert.equal(nextSaniSession?.status, 'active')
  assert.equal(nextSaniSession?.packerOperatorName, 'sani')
  assert.equal(nextSaniSession?.createdBySessionId, 'device-session-1')
  assert.equal(getPackingSessionById(saniSession?.id ?? '')?.status, 'active')
  assert.equal(getPackingSessionById(saniSession?.id ?? '')?.createdBySessionId, null)
})

test('reopenPackingSession menolak sesi yang sudah diakhiri', () => {
  resetDb()
  seedPackingOperator('sani', 'PK01', 'Sani')
  const login = makeSession('sani', 'PK01', 'device-session-1')

  const saniSession = createPackingSession({
    currentSession: login,
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
    currentSession: login,
  }), /belum diakhiri/)
})

test('reopenPackingSession bisa mengambil alih sesi active dari session login lama', () => {
  resetDb()
  seedPackingOperator('sani', 'PK01', 'Sani')
  const oldLogin = makeSession('sani', 'PK01', 'old-login-session')
  const currentLogin = makeSession('sani', 'PK01', 'current-login-session')

  const saniSession = createPackingSession({
    currentSession: oldLogin,
  })
  assert.ok(saniSession)

  const resumed = reopenPackingSession({
    id: saniSession.id,
    currentSession: currentLogin,
    releaseActive: true,
  })

  assert.equal(resumed?.id, saniSession.id)
  assert.equal(resumed?.status, 'active')
  assert.equal(resumed?.createdBySessionId, 'current-login-session')
})

test('reopenPackingSession menolak akun lain termasuk admin', () => {
  resetDb()
  seedPackingOperator('sani', 'PK01', 'Sani')
  seedPackingOperator('wildan', 'PK02', 'Wildan')
  seedAdmin()

  const saniLogin = makeSession('sani', 'PK01', 'sess-sani')
  const wildanLogin = makeSession('wildan', 'PK02', 'sess-wildan')
  const adminLogin = makeSession('admin', 'ADM', 'sess-admin', 'admin')

  const wildanSession = createPackingSession({
    currentSession: wildanLogin,
  })
  assert.throws(() => reopenPackingSession({
    id: wildanSession.id,
    currentSession: saniLogin,
    releaseActive: true,
  }), /akun pemiliknya/)
  assert.throws(() => reopenPackingSession({
    id: wildanSession.id,
    currentSession: adminLogin,
    releaseActive: true,
  }), /akun pemiliknya/)
})

test('admin membuat sesi packing sebagai akun admin sendiri', () => {
  resetDb()
  seedAdmin()
  const adminLogin = makeSession('admin', 'ADM', 'sess-admin', 'admin')
  const adminPackingSession = createPackingSession({
    currentSession: adminLogin,
  })
  assert.equal(adminPackingSession.packerOperatorName, 'admin')
  assert.equal(adminPackingSession.packerOperatorCode, 'ADM')
  assert.equal(adminPackingSession.createdByOperatorName, 'admin')
  assert.equal(adminPackingSession.createdByOperatorCode, 'ADM')
})

test('create dan reopen mewajibkan mode packing', () => {
  resetDb()
  seedPackingOperator('sani', 'PK01', 'Sani')
  const packingLogin = makeSession('sani', 'PK01', 'sess-packing')
  const qcLogin = makeSession('sani', 'PK01', 'sess-qc', 'operator', 'qc')
  const packingSession = createPackingSession({ currentSession: packingLogin })

  assert.throws(() => createPackingSession({ currentSession: qcLogin }), /Mode packing/)
  assert.throws(() => reopenPackingSession({ id: packingSession.id, currentSession: qcLogin, releaseActive: true }), /Mode packing/)
})

test('getActivePackingSession mengabaikan attachment historis yang bukan milik login', () => {
  resetDb()
  seedPackingOperator('sani', 'PK01', 'Sani')
  seedAdmin()
  const saniLogin = makeSession('sani', 'PK01', 'legacy-session')
  const adminLogin = makeSession('admin', 'ADM', 'legacy-session', 'admin')
  const packingSession = createPackingSession({ currentSession: saniLogin })

  assert.equal(getActivePackingSession(adminLogin), null)
  assert.equal(getActivePackingSession(saniLogin)?.id, packingSession.id)
})

test('daftar sesi saya memprioritaskan sesi active yang bisa dilanjutkan', () => {
  resetDb()
  seedPackingOperator('sani', 'PK01', 'Sani')
  const oldActive = createPackingSession({ currentSession: makeSession('sani', 'PK01', 'sess-old') })

  for (let index = 0; index < 3; index += 1) {
    const newer = createPackingSession({ currentSession: makeSession('sani', 'PK01', `sess-new-${index}`) })
    closePackingSession(newer.id)
  }

  const [first] = listPackingSessionsForOperator('sani', 'PK01', 1)
  assert.equal(first?.id, oldActive.id)
  assert.equal(first?.status, 'active')
})

test('operator tidak bisa menutup sesi akun lain setelah task login berubah', () => {
  resetDb()
  seedPackingOperator('sani', 'PK01', 'Sani')
  seedPackingOperator('wildan', 'PK02', 'Wildan')
  seedAdmin()
  const wildanSession = createPackingSession({ currentSession: makeSession('wildan', 'PK02', 'sess-wildan') })

  assert.throws(() => closePackingSession(
    wildanSession.id,
    null,
    makeSession('sani', 'PK01', 'sess-sani', 'operator', 'qc'),
  ), /miliknya sendiri/)

  const closed = closePackingSession(
    wildanSession.id,
    null,
    makeSession('admin', 'ADM', 'sess-admin', 'admin', 'qc'),
  )
  assert.equal(closed?.status, 'closed')
})

test('ID draft recording tidak dapat dipakai ulang untuk mengganti identitas', () => {
  resetDb()
  const id = 'recording-identitas-tetap'
  createRecordingDraft({
    id,
    resiNumber: 'QC-IDENTITAS-1',
    taskType: 'qc',
    operatorName: 'sani',
    operatorCode: 'PK01',
  })

  assert.throws(() => createRecordingDraft({
    id,
    resiNumber: 'QC-IDENTITAS-1',
    taskType: 'qc',
    operatorName: 'admin',
    operatorCode: 'ADM',
  }), /sudah dipakai oleh akun atau task lain/)
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

test('updatePackingRecordingPayRule mengubah upah recording dan menolak sesi sudah dibayar', () => {
  resetDb()
  seedPackingOperator('sani', 'PK01', 'Sani')

  const now = new Date().toISOString()
  const rule = createPackingPayRule({ name: 'Manual fragile', matchType: 'default', payType: 'per_package', amount: 2500, priority: 10 })
  database.prepare(`INSERT INTO packing_work_sessions (id, packer_operator_name, packer_operator_code, packer_name_snapshot, packer_code_snapshot, started_at, ended_at, status, note, created_by_session_id, created_at, updated_at) VALUES ('session-rule', 'sani', 'PK01', 'Sani', 'PK01', ?, ?, 'closed', NULL, NULL, ?, ?)`).run(now, now, now, now)
  database.prepare(`INSERT INTO recordings (id, resi_number, task_type, operator_name, operator_code, file_name, file_path, media_type, file_size_bytes, record_date, start_time, end_time, duration_seconds, status, packing_session_id, packer_operator_name, packer_operator_code, order_snapshot, packing_pay_amount, packing_pay_status, created_at, updated_at) VALUES ('pack-rule', 'RESI-RULE', 'packing', 'sani', 'PK01', 'pack.mp4', 'pack.mp4', 'video', 100, ?, ?, ?, 5, 'completed', 'session-rule', 'sani', 'PK01', ?, 1500, 'calculated', ?, ?)`).run(now.slice(0,10), now, now, JSON.stringify({ items: [{ productName: 'Produk', quantity: 1 }] }), now, now)

  const updated = updatePackingRecordingPayRule('pack-rule', rule.id)
  assert.equal(updated?.packing_pay_amount, 2500)
  assert.equal(updated?.packing_pay_rule_id, rule.id)

  database.prepare(`UPDATE packing_work_sessions SET payment_id = 'pay-1', paid_at = ? WHERE id = 'session-rule'`).run(now)
  assert.throws(() => updatePackingRecordingPayRule('pack-rule', rule.id), /sudah dibayar/)
})

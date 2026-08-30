import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const TEST_DB_PATH = path.resolve(MODULE_DIR, '../server-data/pakti-test-packing-payment.sqlite')

if (fs.existsSync(TEST_DB_PATH)) {
  fs.unlinkSync(TEST_DB_PATH)
}

process.env.PAKTI_DB_PATH = TEST_DB_PATH

const { getDb } = await import('../services/backend/src/db.ts')
const { upsertOperatorProfile } = await import('../services/backend/src/store/operatorStore.ts')
const { createSession } = await import('../services/backend/src/store/sessionStore.ts')
const { closePackingSession, createPackingSession, getPackingSessionById } = await import('../services/backend/src/store/packingSessionStore.ts')
const { createPackingPayment, getPackingPaymentById, listPackingPayments } = await import('../services/backend/src/store/packingPaymentStore.ts')
const { finalizeRecording, createRecordingDraft } = await import('../services/backend/src/store/recordingStore.ts')

const database = getDb()

function resetDb() {
  database.exec(`CREATE TABLE IF NOT EXISTS packing_payment_sessions (
    payment_id TEXT NOT NULL,
    packing_session_id TEXT NOT NULL,
    PRIMARY KEY (payment_id, packing_session_id)
  )`)
  database.prepare('DELETE FROM packing_payment_sessions').run()
  database.prepare('DELETE FROM packing_payments').run()
  database.prepare('DELETE FROM recordings').run()
  database.prepare('DELETE FROM packing_work_sessions').run()
  database.prepare('DELETE FROM operator_sessions').run()
  database.prepare('DELETE FROM operator_profiles').run()
}

function seedOperator(name: string, code: string, taskType: 'packing' | 'qc' = 'packing') {
  return upsertOperatorProfile({ operatorName: name, operatorCode: code, role: 'operator', taskType, fullName: name, password: 'secret123' })
}

function seedAdmin() {
  upsertOperatorProfile({ operatorName: 'admin', operatorCode: 'ADM', role: 'admin', taskType: 'packing', fullName: 'Admin', password: 'secret123' })
  return createSession('admin', 'ADM', 'admin', 'packing')
}

function makeResi() {
  return `RESI-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}
async function seedClosedSessionWithPay(packerName: string, packerCode: string, payAmount = 1500) {
  const session = createPackingSession({ packerOperatorName: packerName, packerOperatorCode: packerCode, createdBySessionId: `dev-${Date.now()}-${Math.random().toString(16).slice(2, 6)}` })
  const resi = makeResi()
  const now = new Date().toISOString()
  const qcId = `rec_qc_${Math.random().toString(36).slice(2, 10)}`
  const packId = `rec_pack_${Math.random().toString(36).slice(2, 10)}`
  // qc completed first (required for packing validation bypass via direct insert)
  database.prepare(`INSERT INTO recordings (id, resi_number, task_type, operator_name, operator_code, file_name, file_path, media_type, file_size_bytes, record_date, start_time, end_time, duration_seconds, status, note, packing_session_id, packer_operator_name, packer_operator_code, created_at, updated_at) VALUES (?, ?, 'qc', ?, ?, 'qc_test.mp4', 'qc_test.mp4', 'video', 100, ?, ?, ?, 5, 'completed', null, null, null, null, ?, ?)`)
    .run(qcId, resi, packerName, packerCode, now.slice(0, 10), now, now, now, now)
  database.prepare(`INSERT INTO recordings (id, resi_number, task_type, operator_name, operator_code, file_name, file_path, media_type, file_size_bytes, record_date, start_time, end_time, duration_seconds, status, note, packing_session_id, packer_operator_name, packer_operator_code, packing_pay_amount, packing_pay_status, created_at, updated_at) VALUES (?, ?, 'packing', ?, ?, 'pack_test.mp4', 'pack_test.mp4', 'video', 100, ?, ?, ?, 5, 'completed', null, ?, ?, ?, ?, ?, ?, ?)`)
    .run(packId, resi, packerName, packerCode, now.slice(0, 10), now, now, session.id, packerName, packerCode, payAmount, 'calculated', now, now)
  closePackingSession(session.id)
  return getPackingSessionById(session.id)!
}

test('createPackingPayment menghitung total dari beberapa sesi 1 petugas', async () => {
  resetDb()
  seedOperator('sani', 'PK01')
  const adminSession = seedAdmin()
  const s1 = await seedClosedSessionWithPay('sani', 'PK01', 1500)
  const s2 = await seedClosedSessionWithPay('sani', 'PK01', 2000)

  const payment = createPackingPayment({ sessionIds: [s1.id, s2.id], paymentMethod: 'cash', note: 'periode test', paidBySession: adminSession })

  assert.equal(payment.totalSessions, 2)
  assert.equal(payment.totalPackages, 2)
  assert.ok(payment.totalAmount >= 3500)
  assert.equal(payment.packerOperatorCode, 'PK01')
  assert.equal(payment.paymentMethod, 'cash')

  const fetched = getPackingPaymentById(payment.id)
  assert.ok(fetched)
  assert.equal(fetched?.sessionIds.length, 2)

  const updated1 = getPackingSessionById(s1.id)
  assert.ok(updated1?.paidAt)
  assert.equal(updated1?.paymentId, payment.id)

  const list = listPackingPayments(10)
  assert.ok(list.length >= 1)
})

test('createPackingPayment menolak sesi beda petugas', async () => {
  resetDb()
  seedOperator('sani', 'PK01')
  seedOperator('wildan', 'PK02')
  const adminSession = seedAdmin()
  const s1 = await seedClosedSessionWithPay('sani', 'PK01', 1500)
  const s2 = await seedClosedSessionWithPay('wildan', 'PK02', 1500)

  assert.throws(() => createPackingPayment({ sessionIds: [s1.id, s2.id], paymentMethod: 'cash', paidBySession: adminSession }), /petugas yang sama/)
})

test('createPackingPayment menolak sesi active atau sudah dibayar', async () => {
  resetDb()
  seedOperator('sani', 'PK01')
  const adminSession = seedAdmin()
  const active = createPackingSession({ packerOperatorName: 'sani', packerOperatorCode: 'PK01', createdBySessionId: 'dev-1' })
  assert.throws(() => createPackingPayment({ sessionIds: [active.id], paidBySession: adminSession }), /Hanya sesi closed/)

  const closed = await seedClosedSessionWithPay('sani', 'PK01', 1500)
  const p1 = createPackingPayment({ sessionIds: [closed.id], paidBySession: adminSession })
  assert.ok(p1)
  assert.throws(() => createPackingPayment({ sessionIds: [closed.id], paidBySession: adminSession }), /sudah dibayar/)
})

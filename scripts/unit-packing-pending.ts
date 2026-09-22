import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const TEST_DB_PATH = path.resolve(MODULE_DIR, '../server-data/pakti-test-packing-pending.sqlite')

if (fs.existsSync(TEST_DB_PATH)) {
  fs.unlinkSync(TEST_DB_PATH)
}
for (const suffix of ['-wal', '-shm', '-journal']) {
  const extra = `${TEST_DB_PATH}${suffix}`
  if (fs.existsSync(extra)) fs.unlinkSync(extra)
}

process.env.PAKTI_DB_PATH = TEST_DB_PATH

const { getDb } = await import('../services/backend/src/db.ts')
const { upsertOperatorProfile } = await import('../services/backend/src/store/operatorStore.ts')
const { createSession } = await import('../services/backend/src/store/sessionStore.ts')
const { closePackingSession, createPackingSession, getPackingSessionById } = await import('../services/backend/src/store/packingSessionStore.ts')
const { createPackingPayment } = await import('../services/backend/src/store/packingPaymentStore.ts')
const { cancelPackerAdjustment, createPackerAdjustment, listPendingPackerAdjustments } = await import('../services/backend/src/store/packerAdjustmentStore.ts')
const { cancelPackingPaymentDraft, confirmPackingPaymentDraft, createPackingPaymentDraft, listPackingPaymentDrafts } = await import('../services/backend/src/store/packingPaymentDraftStore.ts')

const database = getDb()

function resetDb() {
  database.exec(`CREATE TABLE IF NOT EXISTS packing_payment_sessions (
    payment_id TEXT NOT NULL,
    packing_session_id TEXT NOT NULL,
    PRIMARY KEY (payment_id, packing_session_id)
  )`)
  database.exec(`CREATE TABLE IF NOT EXISTS packing_payment_draft_sessions (
    draft_id TEXT NOT NULL,
    packing_session_id TEXT NOT NULL,
    PRIMARY KEY (draft_id, packing_session_id)
  )`)
  for (const table of ['packing_payment_draft_sessions', 'packing_payment_drafts', 'packer_adjustments', 'packing_payment_sessions', 'packing_payments', 'recordings', 'packing_work_sessions', 'operator_sessions', 'operator_profiles']) {
    database.prepare(`DELETE FROM ${table}`).run()
  }
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

async function seedClosedSession(packerName: string, packerCode: string, payAmount = 1500) {
  const session = createPackingSession({ packerOperatorName: packerName, packerOperatorCode: packerCode, createdBySessionId: `dev-${Date.now()}-${Math.random().toString(16).slice(2, 6)}` })
  const resi = makeResi()
  const now = new Date().toISOString()
  database.prepare(`INSERT INTO recordings (id, resi_number, task_type, operator_name, operator_code, file_name, file_path, media_type, file_size_bytes, record_date, start_time, end_time, duration_seconds, status, note, packing_session_id, packer_operator_name, packer_operator_code, packing_pay_amount, packing_pay_status, created_at, updated_at) VALUES (?, ?, 'packing', ?, ?, 'pack_test.mp4', 'pack_test.mp4', 'video', 100, ?, ?, ?, 5, 'completed', null, ?, ?, ?, ?, ?, ?, ?)`)
    .run(`rec_${Math.random().toString(36).slice(2, 10)}`, resi, packerName, packerCode, now.slice(0, 10), now, now, session.id, packerName, packerCode, payAmount, 'calculated', now, now)
  closePackingSession(session.id)
  return getPackingSessionById(session.id)!
}

test('ledger kasbon ikut terpakai saat bayar dan bertanda applied', async () => {
  resetDb()
  seedOperator('sani', 'PK01')
  const admin = seedAdmin()
  const s1 = await seedClosedSession('sani', 'PK01', 10000)

  const kasbon = createPackerAdjustment({ packerOperatorName: 'sani', packerOperatorCode: 'PK01', label: 'Kasbon 20 Jan', kind: 'deduct', amount: 3000, createdBySession: admin })
  assert.equal(kasbon.status, 'pending')
  assert.deepEqual(listPendingPackerAdjustments('sani', 'PK01').map((i) => i.id), [kasbon.id])

  const payment = createPackingPayment({ sessionIds: [s1.id], paymentMethod: 'cash', ledgerAdjustmentIds: [kasbon.id], paidBySession: admin })
  assert.equal(payment.subtotalAmount, 10000)
  assert.equal(payment.adjustmentTotal, -3000)
  assert.equal(payment.totalAmount, 7000)
  assert.equal(listPendingPackerAdjustments('sani', 'PK01').length, 0)
})

test('ledger yang sudah terpakai ditolak dipakai lagi', async () => {
  resetDb()
  seedOperator('sani', 'PK01')
  const admin = seedAdmin()
  const s1 = await seedClosedSession('sani', 'PK01', 10000)
  const s2 = await seedClosedSession('sani', 'PK01', 10000)
  const kasbon = createPackerAdjustment({ packerOperatorName: 'sani', packerOperatorCode: 'PK01', label: 'Kasbon', kind: 'deduct', amount: 1000, createdBySession: admin })
  createPackingPayment({ sessionIds: [s1.id], ledgerAdjustmentIds: [kasbon.id], paidBySession: admin })
  assert.throws(() => createPackingPayment({ sessionIds: [s2.id], ledgerAdjustmentIds: [kasbon.id], paidBySession: admin }), /sudah tidak pending/)
})

test('draft mengunci sesi: bayar langsung ditolak, konfirmasi berhasil', async () => {
  resetDb()
  seedOperator('sani', 'PK01')
  const admin = seedAdmin()
  const s1 = await seedClosedSession('sani', 'PK01', 5000)
  const bonus = createPackerAdjustment({ packerOperatorName: 'sani', packerOperatorCode: 'PK01', label: 'Bonus', kind: 'add', amount: 500, createdBySession: admin })

  const draft = createPackingPaymentDraft({ sessionIds: [s1.id], manualAdjustments: [{ label: 'Koreksi', kind: 'add', amount: 200 }], ledgerAdjustmentIds: [bonus.id], paymentMethod: 'cash', paidBySession: admin })
  assert.equal(draft.status, 'draft')
  assert.equal(draft.estimatedTotal, 5700)
  assert.deepEqual(listPackingPaymentDrafts('draft').map((d) => d.id), [draft.id])

  assert.throws(() => createPackingPayment({ sessionIds: [s1.id], paidBySession: admin }), /terkunci di draft pending/)

  const { payment } = confirmPackingPaymentDraft(draft.id, admin)
  assert.equal(payment.totalAmount, 5700)
  assert.equal(getPackingSessionById(s1.id)?.paidAt != null, true)
  assert.equal(listPendingPackerAdjustments('sani', 'PK01').length, 0)
})

test('batal draft membebaskan sesi, kasbon tetap pending', async () => {
  resetDb()
  seedOperator('sani', 'PK01')
  const admin = seedAdmin()
  const s1 = await seedClosedSession('sani', 'PK01', 5000)
  const kasbon = createPackerAdjustment({ packerOperatorName: 'sani', packerOperatorCode: 'PK01', label: 'Kasbon', kind: 'deduct', amount: 500, createdBySession: admin })
  const draft = createPackingPaymentDraft({ sessionIds: [s1.id], ledgerAdjustmentIds: [kasbon.id], paidBySession: admin })
  cancelPackingPaymentDraft(draft.id)
  const payment = createPackingPayment({ sessionIds: [s1.id], paidBySession: admin })
  assert.equal(payment.totalAmount, 5000)
  assert.equal(listPendingPackerAdjustments('sani', 'PK01').length, 1)
})

test('batal catatan ledger menghapusnya dari saran', async () => {
  resetDb()
  seedOperator('sani', 'PK01')
  const admin = seedAdmin()
  const kasbon = createPackerAdjustment({ packerOperatorName: 'sani', packerOperatorCode: 'PK01', label: 'Kasbon salah catat', kind: 'deduct', amount: 500, createdBySession: admin })
  cancelPackerAdjustment(kasbon.id)
  assert.equal(listPendingPackerAdjustments('sani', 'PK01').length, 0)
})

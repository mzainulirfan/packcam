import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const TEST_DB_PATH = path.resolve(MODULE_DIR, '../server-data/pakti-test-dashboard.sqlite')

for (const suffix of ['', '-wal', '-shm', '-journal']) {
  const extra = `${TEST_DB_PATH}${suffix}`
  if (fs.existsSync(extra)) fs.unlinkSync(extra)
}

process.env.PAKTI_DB_PATH = TEST_DB_PATH

const { getDb } = await import('../services/backend/src/db.ts')
const { getDashboardSummary } = await import('../services/backend/src/store/dashboardStore.ts')

const database = getDb()
const todayJakarta = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const now = new Date().toISOString()

function seedRecording(taskType: 'qc' | 'packing', resi: string, recordDate: string, payAmount: number | null = null, packerCode = 'PK01', channel: string | null = null) {
  const id = `rec_${taskType}_${Math.random().toString(36).slice(2, 10)}`
  database.prepare(`INSERT INTO recordings (id, resi_number, task_type, operator_name, operator_code, file_name, file_path, media_type, file_size_bytes, record_date, start_time, end_time, duration_seconds, status, note, packing_session_id, packer_operator_name, packer_operator_code, shipping_channel, packing_pay_amount, packing_pay_status, created_at, updated_at) VALUES (?, ?, ?, 'sani', ?, 't.mp4', 't.mp4', 'video', 100, ?, ?, ?, 5, 'completed', null, null, 'sani', ?, ?, ?, 'calculated', ?, ?)`)
    .run(id, resi, taskType, packerCode, recordDate, now, now, packerCode, channel, payAmount, now, now)
}

seedRecording('qc', 'RESI-A', todayJakarta)
seedRecording('packing', 'RESI-A', todayJakarta, 1500, 'PK01', 'SPX Standard')
seedRecording('packing', 'RESI-B', todayJakarta, 2000, 'PK02', 'SPX Hemat')
seedRecording('packing', 'RESI-C', todayJakarta, 500, 'PK01', 'SPX Standard')
seedRecording('packing', 'RESI-D', todayJakarta, 700, 'PK02')
seedRecording('packing', 'RESI-OLD', '2020-01-01', 9999)
database.prepare(`INSERT INTO operator_profiles (operator_name, operator_code, role, task_type, full_name, last_used_at) VALUES ('sani', 'PK01', 'operator', 'packing', 'Sani Pengepak', ?)`)
  .run(now)

test('getDashboardSummary menghitung ringkasan hari ini saja', async () => {
  const summary = getDashboardSummary(todayJakarta)
  assert.equal(summary.date, todayJakarta)
  assert.equal(summary.qcCompleted, 1)
  assert.equal(summary.packingCompleted, 4)
  assert.equal(summary.payTotal, 4700)
  assert.equal(summary.operators.length, 2)
  assert.equal(summary.operators[0]?.packingCount, 2)
})

test('getDashboardSummary menampilkan nama lengkap petugas bila ada', async () => {
  const summary = getDashboardSummary(todayJakarta)
  const withProfile = summary.operators.find((op) => op.operatorCode === 'PK01')
  assert.equal(withProfile?.displayName, 'Sani Pengepak')
  const withoutProfile = summary.operators.find((op) => op.operatorCode === 'PK02')
  assert.equal(withoutProfile?.displayName, withoutProfile?.operatorName)
})

test('getDashboardSummary default ke hari ini dan tanggal invalid ditolak aman', async () => {
  const summary = getDashboardSummary()
  assert.equal(summary.date, todayJakarta)
  assert.equal(summary.packingCompleted, 4)
  const invalid = getDashboardSummary('bukan-tanggal')
  assert.equal(invalid.date, todayJakarta)
})

test('getDashboardSummary mengelompokkan paket per jasa kirim', async () => {
  const summary = getDashboardSummary(todayJakarta)
  const byChannel = new Map(summary.byChannel.map((row) => [row.channel, row.count]))
  assert.equal(byChannel.get('SPX Standard'), 2)
  assert.equal(byChannel.get('SPX Hemat'), 1)
  assert.equal(byChannel.get('Tanpa data'), 1)
  assert.equal(summary.byChannel[0]?.channel, 'SPX Standard')
})

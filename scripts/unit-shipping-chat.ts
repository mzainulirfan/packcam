import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const TEST_DB_PATH = path.resolve(MODULE_DIR, '../server-data/pakti-test.sqlite')

// 1. Clean up old test db and set environment variable before importing db/store
if (fs.existsSync(TEST_DB_PATH)) {
  try {
    fs.unlinkSync(TEST_DB_PATH)
  } catch {}
}
process.env.PAKTI_DB_PATH = TEST_DB_PATH

// 2. Import database and store modules after env is set
import { getDb } from '../services/backend/src/db.ts'
import {
  prepareShippingChatSends,
  getNextPendingShippingChatSend,
  updateShippingChatSendStatus,
  retryShippingChatSend,
} from '../services/backend/src/store/shippingChatSendStore.ts'

// 3. Initialize DB schema
const database = getDb()

// Helper to seed a Shopee order
function seedOrder(orderNumber: string, buyerUsername: string | null, trackingNumber = 'RESI123') {
  const id = `order_${Math.random().toString(36).substring(2)}`
  const now = new Date().toISOString()
  database.prepare(
    `INSERT INTO orders (id, source, order_number, tracking_number, buyer_username, shipping_channel, order_status, raw_payload, created_at, updated_at)
     VALUES (?, 'shopee', ?, ?, ?, 'Shopee Express', 'shipping', '{}', ?, ?)`
  ).run(id, orderNumber, trackingNumber, buyerUsername, now, now)
}

function getLocalTodayDate() {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function seedRecording(resiNumber: string) {
  const id = `recording_${Math.random().toString(36).substring(2)}`
  const now = new Date().toISOString()
  const recordDate = getLocalTodayDate()
  database.prepare(
    `INSERT INTO recordings (
      id, resi_number, task_type, operator_name, operator_code, file_name, file_path, file_size_bytes,
      record_date, start_time, end_time, duration_seconds, status, note, created_at, updated_at
    ) VALUES (?, ?, 'packing', 'John Doe', 'OP01', 'video.mp4', 'uploads/video.mp4', 1000, ?, ?, ?, 10, 'completed', NULL, ?, ?)`
  ).run(id, resiNumber, recordDate, now, now, now, now)
}

function clearDb() {
  database.prepare('DELETE FROM shipping_chat_sends').run()
  database.prepare('DELETE FROM orders').run()
  database.prepare('DELETE FROM recordings').run()
}

test('Shopee Shipping Chat - prepareShippingChatSends and idempotency', () => {
  clearDb()
  // Seed some test orders and their completed recordings
  seedOrder('ORDER101', 'buyer_john', 'RESI101')
  seedRecording('RESI101')
  seedOrder('ORDER102', null, 'RESI102') // No buyer username
  seedRecording('RESI102')

  // Prepare chats for a batch
  const result = prepareShippingChatSends(['ORDER101', 'ORDER102', 'ORDER103'])

  // Check results
  assert.equal(result.created.length, 1)
  assert.equal(result.created[0].orderNumber, 'ORDER101')
  assert.equal(result.created[0].buyerUsername, 'buyer_john')
  assert.equal(result.created[0].status, 'pending')

  assert.equal(result.skipped.length, 2)
  const skipped102 = result.skipped.find(s => s.orderNumber === 'ORDER102')
  const skipped103 = result.skipped.find(s => s.orderNumber === 'ORDER103')
  assert.ok(skipped102)
  assert.equal(skipped102.reason, 'Order belum punya username pembeli.')
  assert.ok(skipped103)
  assert.equal(skipped103.reason, 'Order tidak ditemukan di Pakti.')

  // Idempotency: preparing same order again should skip
  const secondResult = prepareShippingChatSends(['ORDER101'])
  assert.equal(secondResult.created.length, 0)
  assert.equal(secondResult.skipped.length, 1)
  assert.equal(secondResult.skipped[0].reason, 'Shipping chat sudah pending.')
})

test('Shopee Shipping Chat - status updates and retry logic', () => {
  clearDb()
  seedOrder('ORDER201', 'buyer_alice', 'RESI201')
  seedRecording('RESI201')
  const prep = prepareShippingChatSends(['ORDER201'])
  const job = prep.created[0]
  assert.ok(job)

  // Get next pending job
  const nextJob = getNextPendingShippingChatSend()
  assert.ok(nextJob)
  assert.equal(nextJob.id, job.id)

  // Update status to prepared
  const preparedJob = updateShippingChatSendStatus(job.id, 'prepared')
  assert.equal(preparedJob.status, 'prepared')

  // Update status to sent
  const sentJob = updateShippingChatSendStatus(job.id, 'sent')
  assert.equal(sentJob.status, 'sent')

  // Trying to get next should return null now
  const noJob = getNextPendingShippingChatSend()
  assert.equal(noJob, null)

  // Test failed state and retry
  seedOrder('ORDER301', 'buyer_bob', 'RESI301')
  seedRecording('RESI301')
  const prep2 = prepareShippingChatSends(['ORDER301'])
  const job2 = prep2.created[0]
  assert.ok(job2)

  // Set status to failed
  const failedJob = updateShippingChatSendStatus(job2.id, 'failed', 'Network timeout')
  assert.equal(failedJob.status, 'failed')
  assert.equal(failedJob.attempts, 1)
  assert.equal(failedJob.errorMessage, 'Network timeout')

  // Retry the failed job
  const retriedJob = retryShippingChatSend(job2.id)
  assert.equal(retriedJob.status, 'pending')
  assert.equal(retriedJob.attempts, 0)
  assert.equal(retriedJob.errorMessage, null)

  // Verify it is available in next queue again
  const nextJobAfterRetry = getNextPendingShippingChatSend()
  assert.ok(nextJobAfterRetry)
  assert.equal(nextJobAfterRetry.id, job2.id)
})

// Clean up test db file on exit
test.after(() => {
  try {
    database.close()
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH)
    }
  } catch {}
})

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const TEST_DB_PATH = path.resolve(MODULE_DIR, '../server-data/pakti-chat-send-test.sqlite')

if (fs.existsSync(TEST_DB_PATH)) {
  try {
    fs.unlinkSync(TEST_DB_PATH)
  } catch (_e) {
    void _e
  }
}
process.env.PAKTI_DB_PATH = TEST_DB_PATH

const { getDb } = await import('../services/backend/src/db.ts')
const { listChatSendsByRecordingIds, prepareBundledRecordingChatSend, updateChatSendStatus } = await import('../services/backend/src/store/chatSendStore.ts')
const { getShopeeOrderByResi, importShopeeOrders } = await import('../services/backend/src/store/orderStore.ts')
const { autoQueueShopeeProofForResi } = await import('../services/backend/src/store/recordingStore.ts')

const database = getDb()

function clearDb() {
  database.prepare('DELETE FROM recording_chat_sends').run()
  database.prepare('DELETE FROM order_items').run()
  database.prepare('DELETE FROM orders').run()
  database.prepare('DELETE FROM recordings').run()
}

function nowParts() {
  const now = new Date().toISOString()
  return { now, recordDate: now.slice(0, 10) }
}

function seedOrder(resiNumber: string, orderNumber = `ORDER-${resiNumber}`, buyerUsername = `buyer_${resiNumber.toLowerCase()}`) {
  const { now } = nowParts()
  database.prepare(
    `INSERT INTO orders (id, source, order_number, tracking_number, buyer_username, shipping_channel, order_status, raw_payload, created_at, updated_at)
     VALUES (?, 'shopee', ?, ?, ?, 'SPX', 'shipping', '{}', ?, ?)`,
  ).run(`order_${resiNumber}`, orderNumber, resiNumber, buyerUsername, now, now)
}

function seedRecording(input: { id: string; resiNumber: string; taskType: 'qc' | 'packing'; mediaType: 'video' | 'photo'; fileName: string; mimeType: string }) {
  const { now, recordDate } = nowParts()
  database.prepare(
    `INSERT INTO recordings (
      id, resi_number, task_type, operator_name, operator_code, file_name, file_path, media_type, mime_type, file_size_bytes,
      record_date, start_time, end_time, duration_seconds, status, note, created_at, updated_at
    ) VALUES (?, ?, ?, 'sani', 'PK01', ?, ?, ?, ?, 1000, ?, ?, ?, 10, 'completed', NULL, ?, ?)`,
  ).run(input.id, input.resiNumber, input.taskType, input.fileName, `recordings/${input.fileName}`, input.mediaType, input.mimeType, recordDate, now, now, now, now)
}

async function prepareShareFile(recordingId: string) {
  if (recordingId.includes('photo')) {
    return { fileName: `${recordingId}.jpg`, filePath: `photos/${recordingId}.jpg`, mimeType: 'image/jpeg' }
  }

  return { fileName: `${recordingId}.mp4`, filePath: `share/${recordingId}.mp4`, mimeType: 'video/mp4' }
}

test('prepareBundledRecordingChatSend mengirim QC video saja jika foto packing belum ada', async () => {
  clearDb()
  seedOrder('RESI-QC-ONLY')
  seedRecording({ id: 'qc-video-only', resiNumber: 'RESI-QC-ONLY', taskType: 'qc', mediaType: 'video', fileName: 'qc-only.mp4', mimeType: 'video/mp4' })

  const job = await prepareBundledRecordingChatSend({ recordingId: 'qc-video-only', prepareShareFile })

  assert.equal(job.recordingId, 'qc-video-only')
  assert.equal(job.videoFilePath, 'share/qc-video-only.mp4')
  assert.equal(job.attachments?.length, 1)
  assert.equal(job.attachments?.[0]?.mimeType, 'video/mp4')
})

test('prepareBundledRecordingChatSend menambahkan foto packing jika ada', async () => {
  clearDb()
  seedOrder('RESI-BUNDLE')
  seedRecording({ id: 'qc-video-bundle', resiNumber: 'RESI-BUNDLE', taskType: 'qc', mediaType: 'video', fileName: 'qc-bundle.mp4', mimeType: 'video/mp4' })
  seedRecording({ id: 'packing-photo-bundle', resiNumber: 'RESI-BUNDLE', taskType: 'packing', mediaType: 'photo', fileName: 'pack-bundle.jpg', mimeType: 'image/jpeg' })

  const job = await prepareBundledRecordingChatSend({ recordingId: 'qc-video-bundle', prepareShareFile })

  assert.equal(job.recordingId, 'qc-video-bundle')
  assert.deepEqual(job.attachments?.map((attachment) => attachment.filePath), ['share/qc-video-bundle.mp4', 'photos/packing-photo-bundle.jpg'])
  assert.deepEqual(job.attachments?.map((attachment) => attachment.mimeType), ['video/mp4', 'image/jpeg'])
})

test('prepareBundledRecordingChatSend dari foto packing tetap memakai QC video sebagai primary', async () => {
  clearDb()
  seedOrder('RESI-PHOTO-TRIGGER')
  seedRecording({ id: 'qc-video-trigger', resiNumber: 'RESI-PHOTO-TRIGGER', taskType: 'qc', mediaType: 'video', fileName: 'qc-trigger.mp4', mimeType: 'video/mp4' })
  seedRecording({ id: 'packing-photo-trigger', resiNumber: 'RESI-PHOTO-TRIGGER', taskType: 'packing', mediaType: 'photo', fileName: 'pack-trigger.jpg', mimeType: 'image/jpeg' })

  const job = await prepareBundledRecordingChatSend({ recordingId: 'packing-photo-trigger', prepareShareFile })

  const sends = listChatSendsByRecordingIds(['packing-photo-trigger'])

  assert.equal(job.recordingId, 'qc-video-trigger')
  assert.equal(job.videoFilePath, 'share/qc-video-trigger.mp4')
  assert.equal(job.attachments?.length, 2)
  assert.equal(sends.length, 1)
  assert.equal(sends[0].recordingId, 'qc-video-trigger')
})

test('prepareBundledRecordingChatSend menolak foto packing tanpa QC video', async () => {
  clearDb()
  seedOrder('RESI-NO-QC')
  seedRecording({ id: 'packing-photo-no-qc', resiNumber: 'RESI-NO-QC', taskType: 'packing', mediaType: 'photo', fileName: 'pack-no-qc.jpg', mimeType: 'image/jpeg' })

  await assert.rejects(
    () => prepareBundledRecordingChatSend({ recordingId: 'packing-photo-no-qc', prepareShareFile }),
    /Video QC untuk resi ini belum ada/,
  )
})

test('prepareBundledRecordingChatSend bisa pakai username manual saat order belum tersinkron', async () => {
  clearDb()
  seedRecording({ id: 'qc-video-manual', resiNumber: 'RESI-MANUAL', taskType: 'qc', mediaType: 'video', fileName: 'qc-manual.mp4', mimeType: 'video/mp4' })
  seedRecording({ id: 'packing-photo-manual', resiNumber: 'RESI-MANUAL', taskType: 'packing', mediaType: 'photo', fileName: 'pack-manual.jpg', mimeType: 'image/jpeg' })

  await assert.rejects(
    () => prepareBundledRecordingChatSend({ recordingId: 'qc-video-manual', prepareShareFile }),
    /Isi username pembeli Shopee/,
  )

  const job = await prepareBundledRecordingChatSend({
    recordingId: 'qc-video-manual',
    fallbackBuyerUsername: 'buyer_manual',
    prepareShareFile,
  })

  assert.equal(job.buyerUsername, 'buyer_manual')
  assert.equal(job.orderNumber, null)
  assert.equal(job.attachments?.length, 2)
  assert.deepEqual(job.attachments?.map((attachment) => attachment.filePath), ['share/qc-video-manual.mp4', 'photos/packing-photo-manual.jpg'])
})

test('importShopeeOrders tidak menghapus buyer dan produk saat sync SPX parsial', () => {
  clearDb()

  const first = importShopeeOrders([
    {
      source: 'shopee',
      orderNumber: '250831SPXINSTAN01',
      trackingNumber: 'SPXID1234567890',
      buyerUsername: 'buyer_spx',
      shippingChannel: 'SPX Instan',
      orderStatus: 'shipping',
      rawPayload: {},
      items: [
        { sku: null, productName: 'Produk SPX Test', variationName: 'Hitam', quantity: 2, imageUrl: null },
      ],
    },
  ])
  const second = importShopeeOrders([
    {
      source: 'shopee',
      orderNumber: '250831SPXINSTAN01',
      trackingNumber: 'SPXID1234567890',
      buyerUsername: null,
      shippingChannel: 'SPX Instan',
      orderStatus: 'shipping',
      rawPayload: {},
      items: [],
    },
  ])

  const order = getShopeeOrderByResi('SPXID1234567890')
  assert.equal(first.imported, 1)
  assert.equal(second.updated, 1)
  assert.equal(order?.buyerUsername, 'buyer_spx')
  assert.equal(order?.items.length, 1)
  assert.equal(order?.items[0]?.productName, 'Produk SPX Test')
  assert.equal(order?.items[0]?.quantity, 2)
})

test('prepareBundledRecordingChatSend memakai buyer dari orderNumber fallback saat resi tidak cocok', async () => {
  clearDb()
  importShopeeOrders([
    {
      source: 'shopee',
      orderNumber: '250831SPXINSTAN02',
      trackingNumber: 'SPXID9999999999',
      buyerUsername: 'buyer_order_fallback',
      shippingChannel: 'SPX Instan',
      orderStatus: 'shipping',
      rawPayload: {},
      items: [
        { sku: null, productName: 'Produk Fallback Order', variationName: null, quantity: 1, imageUrl: null },
      ],
    },
  ])
  seedRecording({ id: 'qc-video-order-fallback', resiNumber: 'SPXID0000000000', taskType: 'qc', mediaType: 'video', fileName: 'qc-order-fallback.mp4', mimeType: 'video/mp4' })

  const job = await prepareBundledRecordingChatSend({
    recordingId: 'qc-video-order-fallback',
    fallbackOrderNumber: '250831SPXINSTAN02',
    prepareShareFile,
  })

  assert.equal(job.buyerUsername, 'buyer_order_fallback')
  assert.equal(job.orderNumber, '250831SPXINSTAN02')
})

test('auto-antre QC menjaga status prepared saat foto packing menyusul (keepStatus)', async () => {
  clearDb()
  seedOrder('RESI-KEEP-STATUS')
  seedRecording({ id: 'qc-video-keep', resiNumber: 'RESI-KEEP-STATUS', taskType: 'qc', mediaType: 'video', fileName: 'qc-keep.mp4', mimeType: 'video/mp4' })

  const first = await prepareBundledRecordingChatSend({ recordingId: 'qc-video-keep', prepareShareFile })
  assert.equal(first.status, 'pending')
  assert.equal(first.attachments?.length, 1)

  updateChatSendStatus(first.id, 'prepared')
  seedRecording({ id: 'packing-photo-keep', resiNumber: 'RESI-KEEP-STATUS', taskType: 'packing', mediaType: 'photo', fileName: 'pack-keep.jpg', mimeType: 'image/jpeg' })

  const refreshed = await prepareBundledRecordingChatSend({
    recordingId: 'qc-video-keep',
    keepStatus: true,
    prepareShareFile,
  })

  assert.equal(refreshed.status, 'prepared')
  assert.equal(refreshed.attachments?.length, 2)
  assert.deepEqual(refreshed.attachments?.map((attachment) => attachment.mimeType), ['video/mp4', 'image/jpeg'])
})

test('prepare ulang tanpa keepStatus mengembalikan job prepared ke pending', async () => {
  clearDb()
  seedOrder('RESI-RESET-STATUS')
  seedRecording({ id: 'qc-video-reset', resiNumber: 'RESI-RESET-STATUS', taskType: 'qc', mediaType: 'video', fileName: 'qc-reset.mp4', mimeType: 'video/mp4' })

  const first = await prepareBundledRecordingChatSend({ recordingId: 'qc-video-reset', prepareShareFile })
  updateChatSendStatus(first.id, 'prepared')
  seedRecording({ id: 'packing-photo-reset', resiNumber: 'RESI-RESET-STATUS', taskType: 'packing', mediaType: 'photo', fileName: 'pack-reset.jpg', mimeType: 'image/jpeg' })

  const refreshed = await prepareBundledRecordingChatSend({ recordingId: 'qc-video-reset', prepareShareFile })

  assert.equal(refreshed.status, 'pending')
  assert.equal(refreshed.attachments?.length, 2)
})

test('auto-antre tidak membuat job kalau order Shopee dan buyer belum ada', async () => {
  clearDb()
  seedRecording({ id: 'qc-video-no-order', resiNumber: 'RESI-NO-ORDER', taskType: 'qc', mediaType: 'video', fileName: 'qc-no-order.mp4', mimeType: 'video/mp4' })

  await autoQueueShopeeProofForResi('RESI-NO-ORDER', { prepareShareFile })

  assert.equal(listChatSendsByRecordingIds(['qc-video-no-order']).length, 0)
})

test('auto-antre membuat job pending dari video QC walau foto packing belum ada', async () => {
  clearDb()
  seedOrder('RESI-AUTO-QC')
  seedRecording({ id: 'qc-video-auto', resiNumber: 'RESI-AUTO-QC', taskType: 'qc', mediaType: 'video', fileName: 'qc-auto.mp4', mimeType: 'video/mp4' })

  await autoQueueShopeeProofForResi('RESI-AUTO-QC', { prepareShareFile })

  const sends = listChatSendsByRecordingIds(['qc-video-auto'])
  assert.equal(sends.length, 1)
  assert.equal(sends[0].status, 'pending')
  assert.equal(sends[0].recordingId, 'qc-video-auto')
  assert.equal(sends[0].attachments?.length, 1)
  assert.equal(sends[0].buyerUsername, 'buyer_resi-auto-qc')
})

test('auto-antre melengkapi lampiran packing tanpa menurunkan status prepared', async () => {
  clearDb()
  seedOrder('RESI-AUTO-REFRESH')
  seedRecording({ id: 'qc-video-refresh', resiNumber: 'RESI-AUTO-REFRESH', taskType: 'qc', mediaType: 'video', fileName: 'qc-refresh.mp4', mimeType: 'video/mp4' })

  await autoQueueShopeeProofForResi('RESI-AUTO-REFRESH', { prepareShareFile })
  const first = listChatSendsByRecordingIds(['qc-video-refresh'])[0]
  updateChatSendStatus(first.id, 'prepared')

  seedRecording({ id: 'packing-photo-refresh', resiNumber: 'RESI-AUTO-REFRESH', taskType: 'packing', mediaType: 'photo', fileName: 'pack-refresh.jpg', mimeType: 'image/jpeg' })
  await autoQueueShopeeProofForResi('RESI-AUTO-REFRESH', { prepareShareFile })

  const sends = listChatSendsByRecordingIds(['qc-video-refresh'])
  assert.equal(sends.length, 1)
  assert.equal(sends[0].status, 'prepared')
  assert.equal(sends[0].preparedAt === null, false)
  assert.deepEqual(sends[0].attachments?.map((attachment) => attachment.mimeType), ['video/mp4', 'image/jpeg'])
})

test('auto-antre tidak mengubah job yang sudah sent', async () => {
  clearDb()
  seedOrder('RESI-AUTO-SENT')
  seedRecording({ id: 'qc-video-sent', resiNumber: 'RESI-AUTO-SENT', taskType: 'qc', mediaType: 'video', fileName: 'qc-sent.mp4', mimeType: 'video/mp4' })

  await autoQueueShopeeProofForResi('RESI-AUTO-SENT', { prepareShareFile })
  const first = listChatSendsByRecordingIds(['qc-video-sent'])[0]
  updateChatSendStatus(first.id, 'sent')

  seedRecording({ id: 'packing-photo-sent', resiNumber: 'RESI-AUTO-SENT', taskType: 'packing', mediaType: 'photo', fileName: 'pack-sent.jpg', mimeType: 'image/jpeg' })
  await autoQueueShopeeProofForResi('RESI-AUTO-SENT', { prepareShareFile })

  const sends = listChatSendsByRecordingIds(['qc-video-sent'])
  assert.equal(sends.length, 1)
  assert.equal(sends[0].status, 'sent')
  assert.equal(sends[0].attachments?.length, 1)
})

test('auto-antre melewati resi yang job-nya memakai rekaman QC lain', async () => {
  clearDb()
  seedOrder('RESI-AUTO-DUP')
  seedRecording({ id: 'qc-video-lama', resiNumber: 'RESI-AUTO-DUP', taskType: 'qc', mediaType: 'video', fileName: 'qc-lama.mp4', mimeType: 'video/mp4' })
  await prepareBundledRecordingChatSend({ recordingId: 'qc-video-lama', prepareShareFile })

  // Simulasi QC diulang: rekaman lama ditandai error agar rekaman QC baru boleh completed.
  database.prepare(`UPDATE recordings SET status = 'error' WHERE id = 'qc-video-lama'`).run()
  seedRecording({ id: 'qc-video-baru', resiNumber: 'RESI-AUTO-DUP', taskType: 'qc', mediaType: 'video', fileName: 'qc-baru.mp4', mimeType: 'video/mp4' })
  await autoQueueShopeeProofForResi('RESI-AUTO-DUP', { prepareShareFile })

  assert.equal(listChatSendsByRecordingIds(['qc-video-lama']).length, 1)
  const jobBaru = database
    .prepare(`SELECT COUNT(*) AS total FROM recording_chat_sends WHERE recording_id = 'qc-video-baru'`)
    .get() as { total: number }
  assert.equal(jobBaru.total, 0)
})

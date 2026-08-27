import { randomUUID } from 'node:crypto'
import type { ChatSendStatus, ShippingChatSend } from '@pakti/types'

import { ensureServerStorage, getDb } from '../db'
import { broadcastBackendEvent } from '../realtime'

type ShippingChatSendRow = {
  id: string
  order_id: string
  order_number: string
  tracking_number: string | null
  buyer_username: string
  message: string
  status: ChatSendStatus
  attempts: number
  error_message: string | null
  prepared_at: string | null
  sent_at: string | null
  created_at: string
  updated_at: string
}

type OrderForShippingChat = {
  id: string
  order_number: string
  tracking_number: string | null
  buyer_username: string | null
}

/** Input dari extension — hanya orderNumber wajib, sisanya opsional */
export type ShippingChatOrderInput = {
  orderNumber: string
  trackingNumber?: string | null
  buyerUsername?: string | null
}

export type PrepareShippingChatResult = {
  created: ShippingChatSend[]
  skipped: Array<{ orderNumber: string; reason: string }>
}

const MAX_FAILED_ATTEMPTS = 3

function db() {
  ensureServerStorage()
  return getDb()
}

function nowIso() {
  return new Date().toISOString()
}

function makeId(prefix: string) {
  return `${prefix}_${randomUUID()}`
}

function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function mapShippingChatSend(row: ShippingChatSendRow): ShippingChatSend {
  return {
    id: row.id,
    orderId: row.order_id,
    orderNumber: row.order_number,
    trackingNumber: row.tracking_number,
    buyerUsername: row.buyer_username,
    message: row.message,
    status: row.status,
    attempts: row.attempts,
    errorMessage: row.error_message,
    preparedAt: row.prepared_at,
    sentAt: row.sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function buildShippingMessage(order: OrderForShippingChat) {
  return [
    `Halo kak ${order.buyer_username}, pesanan kakak ${order.order_number} dengan resi ${order.tracking_number || '-'} sudah masuk proses pengiriman.`,
    '',
    'Silakan pantau update pengiriman melalui aplikasi Shopee ya kak. Terima kasih sudah berbelanja.',
  ].join('\n')
}

function getOrderByOrderNumber(orderNumber: string) {
  return db()
    .prepare(
      `SELECT id, order_number, tracking_number, buyer_username
       FROM orders
       WHERE source = 'shopee'
         AND order_number = ?
       LIMIT 1`,
    )
    .get(orderNumber.trim()) as OrderForShippingChat | undefined
}

/**
 * Membuat atau memperbarui order minimal di tabel orders jika belum ada.
 * Dipanggil saat extension mengirim data order dari halaman Pesanan Dikirim
 * yang belum pernah di-sync via Extract & Sync.
 */
function upsertOrderFromInput(input: ShippingChatOrderInput, timestamp: string): OrderForShippingChat {
  const existing = getOrderByOrderNumber(input.orderNumber)
  if (existing) {
    // Perbarui tracking_number & buyer_username jika sekarang tersedia
    if (input.trackingNumber || input.buyerUsername) {
      db().prepare(
        `UPDATE orders
         SET tracking_number = COALESCE(?, tracking_number),
             buyer_username   = COALESCE(?, buyer_username),
             updated_at       = ?
         WHERE source = 'shopee' AND order_number = ?`,
      ).run(
        normalizeOptionalString(input.trackingNumber),
        normalizeOptionalString(input.buyerUsername),
        timestamp,
        input.orderNumber.trim(),
      )
    }
    return getOrderByOrderNumber(input.orderNumber)!
  }

  // Order belum ada — buat placeholder minimal
  const id = makeId('order')
  db().prepare(
    `INSERT INTO orders (id, source, order_number, tracking_number, buyer_username,
                         shipping_channel, order_status, raw_payload, created_at, updated_at)
     VALUES (?, 'shopee', ?, ?, ?, NULL, NULL, NULL, ?, ?)
     ON CONFLICT(source, order_number) DO UPDATE SET
       tracking_number = COALESCE(excluded.tracking_number, orders.tracking_number),
       buyer_username  = COALESCE(excluded.buyer_username,  orders.buyer_username),
       updated_at      = excluded.updated_at`,
  ).run(
    id,
    input.orderNumber.trim(),
    normalizeOptionalString(input.trackingNumber),
    normalizeOptionalString(input.buyerUsername),
    timestamp,
    timestamp,
  )

  return getOrderByOrderNumber(input.orderNumber)!
}

function getShippingChatSendRow(id: string) {
  return db()
    .prepare(
      `SELECT id, order_id, order_number, tracking_number, buyer_username, message,
              status, attempts, error_message, prepared_at, sent_at, created_at, updated_at
       FROM shipping_chat_sends
       WHERE id = ?
       LIMIT 1`,
    )
    .get(id.trim()) as ShippingChatSendRow | undefined
}

function getExistingShippingChatSend(orderNumber: string, buyerUsername: string) {
  return db()
    .prepare(
      `SELECT id, order_id, order_number, tracking_number, buyer_username, message,
              status, attempts, error_message, prepared_at, sent_at, created_at, updated_at
       FROM shipping_chat_sends
       WHERE order_number = ? AND buyer_username = ?
       LIMIT 1`,
    )
    .get(orderNumber.trim(), buyerUsername.trim()) as ShippingChatSendRow | undefined
}

function getLocalTodayRange() {
  const now = new Date()
  const startLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  const endLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const dateStr = `${year}-${month}-${day}`

  return {
    dateStr,
    startIso: startLocal.toISOString(),
    endIso: endLocal.toISOString(),
  }
}

function hasActivityToday(orderNumber: string, trackingNumber: string | null): boolean {
  const { dateStr, startIso, endIso } = getLocalTodayRange()
  const sn = orderNumber.trim()
  const tr = trackingNumber ? trackingNumber.trim() : ''

  // 1. Cek log scan (QC / Packing scan)
  const scanRow = db()
    .prepare(
      `SELECT 1 FROM scan_logs
       WHERE (resi_number = ? OR (? != '' AND resi_number = ?))
         AND scan_time >= ? AND scan_time <= ?
       LIMIT 1`,
    )
    .get(sn, tr, tr, startIso, endIso)

  if (scanRow) return true

  // 2. Cek rekaman video
  const recRow = db()
    .prepare(
      `SELECT 1 FROM recordings
       WHERE (resi_number = ? OR (? != '' AND resi_number = ?))
         AND (record_date = ? OR (created_at >= ? AND created_at <= ?))
       LIMIT 1`,
    )
    .get(sn, tr, tr, dateStr, startIso, endIso)

  return !!recRow
}

export function prepareShippingChatSends(inputs: Array<string | ShippingChatOrderInput>): PrepareShippingChatResult {
  // Deduplikasi berdasarkan orderNumber
  const seen = new Set<string>()
  const normalizedInputs = inputs
    .map((item) => {
      if (typeof item === 'string') {
        return {
          orderNumber: item.trim(),
          trackingNumber: null,
          buyerUsername: null,
        }
      }
      return {
        orderNumber: (item?.orderNumber ?? '').trim(),
        trackingNumber: normalizeOptionalString(item?.trackingNumber),
        buyerUsername: normalizeOptionalString(item?.buyerUsername),
      }
    })
    .filter((item) => {
      if (!item.orderNumber || seen.has(item.orderNumber)) return false
      seen.add(item.orderNumber)
      return true
    })

  const result: PrepareShippingChatResult = { created: [], skipped: [] }
  const timestamp = nowIso()

  for (const input of normalizedInputs) {
    const { orderNumber } = input
    let order = getOrderByOrderNumber(orderNumber)
    const trackingNumber = normalizeOptionalString(order?.tracking_number ?? input.trackingNumber)

    // 1. Cek apakah pesanan/resi ini memiliki aktivitas scan atau rekaman hari ini (WIB)
    const active = hasActivityToday(orderNumber, trackingNumber)
    if (!active) {
      if (!order) {
        result.skipped.push({
          orderNumber,
          reason: 'Order tidak ditemukan di Pakti.',
        })
      } else {
        result.skipped.push({
          orderNumber,
          reason: 'Order tidak memiliki rekaman packing hari ini.',
        })
      }
      continue
    }

    // 2. Ambil/buat data order di DB jika belum ada tetapi memiliki aktivitas hari ini
    if (!order) {
      order = upsertOrderFromInput(input, timestamp)
    } else if (input.buyerUsername && !order.buyer_username) {
      order = upsertOrderFromInput(input, timestamp)
    }

    const buyerUsername = normalizeOptionalString(order.buyer_username)
    if (!buyerUsername) {
      result.skipped.push({ orderNumber, reason: 'Order belum punya username pembeli.' })
      continue
    }

    const existing = getExistingShippingChatSend(order.order_number, buyerUsername)
    if (existing?.status === 'sent' || existing?.status === 'pending' || existing?.status === 'prepared' || existing?.status === 'failed') {
      result.skipped.push({ orderNumber, reason: `Shipping chat sudah ${existing.status}.` })
      continue
    }

    const id = existing?.id ?? makeId('shipchat')
    const message = buildShippingMessage({ ...order, buyer_username: buyerUsername })
    db().prepare(
      `INSERT INTO shipping_chat_sends (
         id, order_id, order_number, tracking_number, buyer_username, message,
         status, attempts, error_message, prepared_at, sent_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, NULL, NULL, NULL, ?, ?)
       ON CONFLICT(order_number, buyer_username) DO UPDATE SET
         order_id = excluded.order_id,
         tracking_number = excluded.tracking_number,
         message = excluded.message,
         status = 'pending',
         attempts = 0,
         error_message = NULL,
         prepared_at = NULL,
         sent_at = NULL,
         updated_at = excluded.updated_at`,
    ).run(
      id,
      order.id,
      order.order_number,
      order.tracking_number,
      buyerUsername,
      message,
      timestamp,
      timestamp,
    )

    const created = getExistingShippingChatSend(order.order_number, buyerUsername)
    if (created) {
      result.created.push(mapShippingChatSend(created))
    }
  }

  if (result.created.length > 0) {
    broadcastBackendEvent('shipping-chat-sends-updated', { created: result.created.length })
  }

  return result
}

export function getNextPendingShippingChatSend() {
  const row = db()
    .prepare(
      `SELECT id, order_id, order_number, tracking_number, buyer_username, message,
              status, attempts, error_message, prepared_at, sent_at, created_at, updated_at
       FROM shipping_chat_sends
       WHERE status IN ('pending', 'failed')
         AND attempts < ?
       ORDER BY updated_at ASC
       LIMIT 1`,
    )
    .get(MAX_FAILED_ATTEMPTS) as ShippingChatSendRow | undefined

  return row ? mapShippingChatSend(row) : null
}

export function listRecentShippingChatSends(limit = 20) {
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)))
  const rows = db()
    .prepare(
      `SELECT id, order_id, order_number, tracking_number, buyer_username, message,
              status, attempts, error_message, prepared_at, sent_at, created_at, updated_at
       FROM shipping_chat_sends
       ORDER BY updated_at DESC
       LIMIT ?`,
    )
    .all(safeLimit) as ShippingChatSendRow[]

  return rows.map(mapShippingChatSend)
}

export function updateShippingChatSendStatus(id: string, status: Exclude<ChatSendStatus, 'pending'>, errorMessage?: string | null) {
  const row = getShippingChatSendRow(id)
  if (!row) {
    throw new Error('Job shipping chat tidak ditemukan.')
  }

  const timestamp = nowIso()
  const nextAttempts = status === 'failed' ? row.attempts + 1 : row.attempts
  db().prepare(
    `UPDATE shipping_chat_sends
     SET status = ?,
         attempts = ?,
         error_message = ?,
         prepared_at = CASE WHEN ? = 'prepared' THEN ? ELSE prepared_at END,
         sent_at = CASE WHEN ? = 'sent' THEN ? ELSE sent_at END,
         updated_at = ?
     WHERE id = ?`,
  ).run(
    status,
    nextAttempts,
    status === 'failed' ? normalizeOptionalString(errorMessage) ?? 'Extension gagal mengirim shipping chat.' : null,
    status,
    timestamp,
    status,
    timestamp,
    timestamp,
    id,
  )

  const updated = getShippingChatSendRow(id)
  if (!updated) {
    throw new Error('Job shipping chat tidak ditemukan.')
  }

  broadcastBackendEvent('shipping-chat-sends-updated', { id: updated.id, status: updated.status })
  return mapShippingChatSend(updated)
}

export function retryShippingChatSend(id: string) {
  const row = getShippingChatSendRow(id)
  if (!row) {
    throw new Error('Job shipping chat tidak ditemukan.')
  }

  const timestamp = nowIso()
  db().prepare(
    `UPDATE shipping_chat_sends
     SET status = 'pending',
         attempts = 0,
         error_message = NULL,
         prepared_at = NULL,
         sent_at = NULL,
         updated_at = ?
     WHERE id = ?`,
  ).run(timestamp, id)

  const updated = getShippingChatSendRow(id)
  if (!updated) {
    throw new Error('Job shipping chat tidak ditemukan.')
  }

  broadcastBackendEvent('shipping-chat-sends-updated', { id: updated.id, status: updated.status })
  return mapShippingChatSend(updated)
}

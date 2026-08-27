import type { ShopeeOrder, ShopeeOrderItem } from '@pakti/types'
import { randomUUID } from 'node:crypto'

import { getDb, ensureServerStorage } from '../db'
import { broadcastBackendEvent } from '../realtime'

type OrderRow = {
  id: string
  source: 'shopee'
  order_number: string
  tracking_number: string | null
  buyer_username: string | null
  shipping_channel: string | null
  order_status: string | null
  raw_payload: string | null
  created_at: string
  updated_at: string
}

type OrderItemRow = {
  id: string
  order_id: string
  sku: string | null
  product_name: string
  variation_name: string | null
  quantity: number
  image_url: string | null
  created_at: string
  updated_at: string
}

export type ShopeeOrderImportResult = {
  imported: number
  updated: number
  skipped: number
}

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

function normalizeOrderItem(item: Partial<ShopeeOrderItem>): ShopeeOrderItem | null {
  const productName = normalizeOptionalString(item.productName)
  if (!productName) {
    return null
  }

  const quantity = Number(item.quantity)

  return {
    sku: normalizeOptionalString(item.sku),
    productName,
    variationName: normalizeOptionalString(item.variationName),
    quantity: Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1,
    imageUrl: normalizeOptionalString(item.imageUrl),
  }
}

function normalizeOrder(order: Partial<ShopeeOrder>): ShopeeOrder | null {
  const orderNumber = normalizeOptionalString(order.orderNumber)
  if (!orderNumber) {
    return null
  }

  const items = Array.isArray(order.items)
    ? order.items.map(normalizeOrderItem).filter((item): item is ShopeeOrderItem => Boolean(item))
    : []

  return {
    source: 'shopee',
    orderNumber,
    trackingNumber: normalizeOptionalString(order.trackingNumber),
    buyerUsername: normalizeOptionalString(order.buyerUsername),
    shippingChannel: normalizeOptionalString(order.shippingChannel),
    orderStatus: normalizeOptionalString(order.orderStatus),
    rawPayload: typeof order.rawPayload === 'undefined' ? null : order.rawPayload,
    items,
  }
}

function serializeRawPayload(value: unknown) {
  if (value === null || typeof value === 'undefined') {
    return null
  }

  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

function parseRawPayload(value: string | null) {
  if (!value) {
    return null
  }

  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

function mapOrder(row: OrderRow, itemRows: OrderItemRow[]): ShopeeOrder {
  return {
    id: row.id,
    source: row.source,
    orderNumber: row.order_number,
    trackingNumber: row.tracking_number,
    buyerUsername: row.buyer_username,
    shippingChannel: row.shipping_channel,
    orderStatus: row.order_status,
    rawPayload: parseRawPayload(row.raw_payload),
    items: itemRows.map((item) => ({
      id: item.id,
      sku: item.sku,
      productName: item.product_name,
      variationName: item.variation_name,
      quantity: item.quantity,
      imageUrl: item.image_url,
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function getOrderItems(orderId: string) {
  return db()
    .prepare(
      `SELECT id, order_id, sku, product_name, variation_name, quantity, image_url, created_at, updated_at
       FROM order_items
       WHERE order_id = ?
       ORDER BY created_at ASC`,
    )
    .all(orderId) as OrderItemRow[]
}

function getOrderByRow(row: OrderRow | undefined) {
  return row ? mapOrder(row, getOrderItems(row.id)) : null
}

export function importShopeeOrders(orders: Array<Partial<ShopeeOrder>>): ShopeeOrderImportResult {
  const result: ShopeeOrderImportResult = { imported: 0, updated: 0, skipped: 0 }
  const database = db()
  const timestamp = nowIso()

  database.exec('BEGIN')
  try {
    for (const inputOrder of orders) {
      const order = normalizeOrder(inputOrder)
      if (!order) {
        result.skipped += 1
        continue
      }

      const existing = database
        .prepare(`SELECT id FROM orders WHERE source = ? AND order_number = ? LIMIT 1`)
        .get(order.source, order.orderNumber) as { id: string } | undefined
      const orderId = existing?.id ?? makeId('order')

      database.prepare(
        `INSERT INTO orders (id, source, order_number, tracking_number, buyer_username, shipping_channel, order_status, raw_payload, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(source, order_number) DO UPDATE SET
           tracking_number = excluded.tracking_number,
           buyer_username = excluded.buyer_username,
           shipping_channel = excluded.shipping_channel,
           order_status = excluded.order_status,
           raw_payload = excluded.raw_payload,
           updated_at = excluded.updated_at`,
      ).run(
        orderId,
        order.source,
        order.orderNumber,
        order.trackingNumber,
        order.buyerUsername,
        order.shippingChannel,
        order.orderStatus,
        serializeRawPayload(order.rawPayload),
        timestamp,
        timestamp,
      )

      database.prepare(`DELETE FROM order_items WHERE order_id = ?`).run(orderId)
      for (const item of order.items) {
        database.prepare(
          `INSERT INTO order_items (id, order_id, sku, product_name, variation_name, quantity, image_url, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          makeId('orderitem'),
          orderId,
          item.sku,
          item.productName,
          item.variationName,
          item.quantity,
          item.imageUrl,
          timestamp,
          timestamp,
        )
      }

      if (existing) {
        result.updated += 1
      } else {
        result.imported += 1
      }
    }
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }

  if (result.imported > 0 || result.updated > 0) {
    broadcastBackendEvent('orders-updated', { ...result })
  }

  return result
}

export function getShopeeOrderByResi(resiNumber: string) {
  const normalizedResi = resiNumber.trim()
  if (!normalizedResi) {
    return null
  }

  const row = db()
    .prepare(
      `SELECT id, source, order_number, tracking_number, buyer_username, shipping_channel, order_status, raw_payload, created_at, updated_at
       FROM orders
       WHERE source = 'shopee'
         AND tracking_number = ?
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
    .get(normalizedResi) as OrderRow | undefined

  return getOrderByRow(row)
}

export function getShopeeOrderByOrderNumber(orderNumber: string) {
  const normalizedOrderNumber = orderNumber.trim()
  if (!normalizedOrderNumber) {
    return null
  }

  const row = db()
    .prepare(
      `SELECT id, source, order_number, tracking_number, buyer_username, shipping_channel, order_status, raw_payload, created_at, updated_at
       FROM orders
       WHERE source = 'shopee'
         AND order_number = ?
       LIMIT 1`,
    )
    .get(normalizedOrderNumber) as OrderRow | undefined

  return getOrderByRow(row)
}

export function listRecentShopeeOrders(limit = 50) {
  const safeLimit = Math.min(200, Math.max(1, Math.floor(limit)))
  const rows = db()
    .prepare(
      `SELECT id, source, order_number, tracking_number, buyer_username, shipping_channel, order_status, raw_payload, created_at, updated_at
       FROM orders
       WHERE source = 'shopee'
       ORDER BY updated_at DESC
       LIMIT ?`,
    )
    .all(safeLimit) as OrderRow[]

  return rows.map((row) => mapOrder(row, getOrderItems(row.id)))
}

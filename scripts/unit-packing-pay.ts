import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const TEST_DB_PATH = path.resolve(MODULE_DIR, '../server-data/pakti-test-packing-pay.sqlite')

if (fs.existsSync(TEST_DB_PATH)) {
  fs.unlinkSync(TEST_DB_PATH)
}

process.env.PAKTI_DB_PATH = TEST_DB_PATH

const { getDb } = await import('../services/backend/src/db.ts')
const { calculatePackingPayForOrder } = await import('../services/backend/src/store/packingPayRuleStore.ts')

const database = getDb()

function resetPayRules() {
  database.prepare('DELETE FROM packing_pay_rules').run()
}

function seedPayRule(input: {
  id: string
  name: string
  matchType: string
  matchValue: string | null
  payType: string
  amount: number
  priority: number
}) {
  const timestamp = new Date().toISOString()
  database.prepare(
    `INSERT INTO packing_pay_rules (id, name, match_type, match_value, pay_type, amount, priority, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run(input.id, input.name, input.matchType, input.matchValue, input.payType, input.amount, input.priority, timestamp, timestamp)
}

test('default per_qty menghitung total pcs item biasa dalam satu paket', () => {
  resetPayRules()
  seedPayRule({
    id: 'default-per-qty',
    name: 'Default per pcs',
    matchType: 'default',
    matchValue: null,
    payType: 'per_qty',
    amount: 1000,
    priority: 0,
  })

  const result = calculatePackingPayForOrder({
    shippingChannel: 'Shopee Express',
    items: [
      { productName: 'Produk biasa', variationName: 'Reguler', sku: null, quantity: 10 },
    ],
  })

  assert.equal(result.quantity, 10)
  assert.equal(result.amount, 10_000)
  assert.equal(result.breakdown.payType, 'per_qty')
})

test('rule hampers prioritas tinggi tetap bisa menghitung per paket', () => {
  resetPayRules()
  seedPayRule({
    id: 'default-per-qty',
    name: 'Default per pcs',
    matchType: 'default',
    matchValue: null,
    payType: 'per_qty',
    amount: 1000,
    priority: 0,
  })
  seedPayRule({
    id: 'hampers-per-package',
    name: 'Hampers',
    matchType: 'variation_contains',
    matchValue: 'hampers',
    payType: 'per_package',
    amount: 1800,
    priority: 10,
  })

  const result = calculatePackingPayForOrder({
    shippingChannel: 'Shopee Express',
    items: [
      { productName: 'Paket kado', variationName: 'Hampers Lebaran', sku: null, quantity: 10 },
    ],
  })

  assert.equal(result.quantity, 1)
  assert.equal(result.amount, 1800)
  assert.equal(result.rule.name, 'Hampers')
})

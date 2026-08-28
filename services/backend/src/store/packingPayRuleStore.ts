import type { PackingPayRule, PackingPayRuleMatchType, PackingPayType } from '@pakti/types'

import { ensureServerStorage, getDb } from '../db'

type PackingPayRuleRow = {
  id: string
  name: string
  match_type: string
  match_value: string | null
  pay_type: string
  amount: number
  priority: number
  active: number
  created_at: string
  updated_at: string
}

function db() {
  ensureServerStorage()
  return getDb()
}

function nowIso() {
  return new Date().toISOString()
}

function makeId(prefix: string) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function normalizeMatchType(value: unknown): PackingPayRuleMatchType {
  const normalized = String(value ?? '').trim()
  if (normalized === 'product_contains' || normalized === 'variation_contains' || normalized === 'sku_contains' || normalized === 'shipping_channel') return normalized
  return 'default'
}

function normalizePayType(value: unknown): PackingPayType {
  return String(value ?? '').trim() === 'per_qty' ? 'per_qty' : 'per_package'
}

function mapRow(row: PackingPayRuleRow): PackingPayRule {
  return {
    id: row.id,
    name: row.name,
    matchType: normalizeMatchType(row.match_type),
    matchValue: row.match_value,
    payType: normalizePayType(row.pay_type),
    amount: row.amount,
    priority: row.priority,
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function ensureDefaultRule() {
  const count = db().prepare('SELECT COUNT(*) AS count FROM packing_pay_rules').get() as { count: number }
  if ((count.count ?? 0) > 0) return
  const ts = nowIso()
  db().prepare(
    `INSERT INTO packing_pay_rules (id, name, match_type, match_value, pay_type, amount, priority, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(makeId('payrule'), 'Default packing', 'default', null, 'per_package', 1500, 0, 1, ts, ts)
}

export function listPackingPayRules() {
  ensureDefaultRule()
  const rows = db().prepare('SELECT * FROM packing_pay_rules ORDER BY priority DESC, created_at ASC').all() as PackingPayRuleRow[]
  return rows.map(mapRow)
}

export function getPackingPayRuleById(id: string) {
  const row = db().prepare('SELECT * FROM packing_pay_rules WHERE id = ? LIMIT 1').get(id) as PackingPayRuleRow | undefined
  return row ? mapRow(row) : null
}

export function createPackingPayRule(input: { name: string; matchType?: PackingPayRuleMatchType; matchValue?: string | null; payType?: PackingPayType; amount: number; priority?: number; active?: boolean }) {
  const name = String(input.name ?? '').trim()
  if (!name) throw new Error('Nama rule wajib diisi.')
  const amount = Math.floor(Number(input.amount))
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount harus > 0.')
  const matchType = normalizeMatchType(input.matchType)
  const matchValue = matchType === 'default' ? null : String(input.matchValue ?? '').trim() || null
  if (matchType !== 'default' && !matchValue) throw new Error('Match value wajib untuk rule non-default.')
  const payType = normalizePayType(input.payType)
  const priority = Number.isFinite(Number(input.priority)) ? Math.floor(Number(input.priority)) : 0
  const active = input.active === false ? 0 : 1
  const id = makeId('payrule')
  const ts = nowIso()
  db().prepare(
    `INSERT INTO packing_pay_rules (id, name, match_type, match_value, pay_type, amount, priority, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, name, matchType, matchValue, payType, amount, priority, active, ts, ts)
  return getPackingPayRuleById(id)!
}

export function updatePackingPayRule(id: string, patch: Partial<{ name: string; matchType: PackingPayRuleMatchType; matchValue: string | null; payType: PackingPayType; amount: number; priority: number; active: boolean }>) {
  const existing = getPackingPayRuleById(id)
  if (!existing) throw new Error('Rule tidak ditemukan.')
  const next = {
    name: patch.name !== undefined ? String(patch.name).trim() || existing.name : existing.name,
    matchType: patch.matchType !== undefined ? normalizeMatchType(patch.matchType) : existing.matchType,
    matchValue: patch.matchValue !== undefined ? patch.matchValue : existing.matchValue,
    payType: patch.payType !== undefined ? normalizePayType(patch.payType) : existing.payType,
    amount: patch.amount !== undefined ? Math.floor(Number(patch.amount)) : existing.amount,
    priority: patch.priority !== undefined ? Math.floor(Number(patch.priority)) : existing.priority,
    active: patch.active !== undefined ? Boolean(patch.active) : existing.active,
  }
  if (!next.name) throw new Error('Nama rule wajib diisi.')
  if (!Number.isFinite(next.amount) || next.amount <= 0) throw new Error('Amount harus > 0.')
  const finalMatchValue = next.matchType === 'default' ? null : String(next.matchValue ?? '').trim() || null
  if (next.matchType !== 'default' && !finalMatchValue) throw new Error('Match value wajib untuk rule non-default.')
  const ts = nowIso()
  db().prepare(
    `UPDATE packing_pay_rules SET name = ?, match_type = ?, match_value = ?, pay_type = ?, amount = ?, priority = ?, active = ?, updated_at = ? WHERE id = ?`,
  ).run(next.name, next.matchType, finalMatchValue, next.payType, next.amount, next.priority, next.active ? 1 : 0, ts, id)
  return getPackingPayRuleById(id)!
}

export function deletePackingPayRule(id: string) {
  const existing = getPackingPayRuleById(id)
  if (!existing) throw new Error('Rule tidak ditemukan.')
  db().prepare('DELETE FROM packing_pay_rules WHERE id = ?').run(id)
  return true
}

export function calculatePackingPayForOrder(order: { shippingChannel?: string | null; items?: Array<{ productName: string; variationName?: string | null; sku?: string | null; quantity: number }> } | null) {
  const rules = listPackingPayRules().filter((rule) => rule.active)
  const normalizedShipping = String(order?.shippingChannel ?? '').toLowerCase()
  const items = Array.isArray(order?.items) ? order!.items! : []

  for (const rule of rules) {
    const matchValue = String(rule.matchValue ?? '').toLowerCase().trim()
    let matchedQty = 0
    let matched = false

    if (rule.matchType === 'default') {
      matched = true
      matchedQty = 1
    } else if (rule.matchType === 'shipping_channel') {
      if (matchValue && normalizedShipping.includes(matchValue)) {
        matched = true
        matchedQty = 1
      }
    } else if (rule.matchType === 'product_contains') {
      const sum = items.filter((it) => String(it.productName ?? '').toLowerCase().includes(matchValue)).reduce((acc, it) => acc + Math.max(1, Number(it.quantity) || 1), 0)
      if (sum > 0) {
        matched = true
        matchedQty = sum
      }
    } else if (rule.matchType === 'variation_contains') {
      const sum = items.filter((it) => String(it.variationName ?? '').toLowerCase().includes(matchValue)).reduce((acc, it) => acc + Math.max(1, Number(it.quantity) || 1), 0)
      if (sum > 0) {
        matched = true
        matchedQty = sum
      }
    } else if (rule.matchType === 'sku_contains') {
      const sum = items.filter((it) => String(it.sku ?? '').toLowerCase().includes(matchValue)).reduce((acc, it) => acc + Math.max(1, Number(it.quantity) || 1), 0)
      if (sum > 0) {
        matched = true
        matchedQty = sum
      }
    }

    if (!matched) continue

    const quantity = rule.payType === 'per_qty' ? matchedQty : 1
    const total = rule.amount * quantity
    return {
      rule,
      amount: total,
      quantity,
      breakdown: {
        ruleName: rule.name,
        matchType: rule.matchType,
        matchValue: rule.matchValue,
        payType: rule.payType,
        amount: rule.amount,
        quantity,
        total,
      },
    }
  }

  const fallback = rules.find((r) => r.matchType === 'default') ?? { name: 'Default packing', payType: 'per_package' as const, amount: 1500, id: 'fallback', matchType: 'default' as const, matchValue: null, priority: 0, active: true, createdAt: nowIso(), updatedAt: nowIso() }
  return {
    rule: fallback,
    amount: fallback.amount,
    quantity: 1,
    breakdown: {
      ruleName: fallback.name,
      matchType: fallback.matchType,
      matchValue: fallback.matchValue,
      payType: fallback.payType,
      amount: fallback.amount,
      quantity: 1,
      total: fallback.amount,
    },
  }
}

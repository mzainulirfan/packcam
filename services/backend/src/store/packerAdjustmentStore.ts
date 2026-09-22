import type { PackerAdjustment, PackerAdjustmentStatus, PackingPaymentAdjustmentKind } from '@pakti/types'

import { ensureServerStorage, getDb } from '../db'
import type { HttpSession } from '../http'
import { broadcastBackendEvent } from '../realtime'
import { findOperatorProfile } from './operatorStore'

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

type PackerAdjustmentRow = {
  id: string
  packer_operator_name: string
  packer_operator_code: string
  packer_name_snapshot: string
  packer_code_snapshot: string
  label: string
  kind: string
  amount: number
  status: string
  applied_payment_id: string | null
  note: string | null
  created_by_operator_name: string | null
  created_by_operator_code: string | null
  created_by_session_id: string | null
  created_at: string
  updated_at: string
}

function normalizeStatus(value: unknown): PackerAdjustmentStatus {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'applied') return 'applied'
  if (normalized === 'cancelled') return 'cancelled'
  return 'pending'
}

function normalizeKind(value: unknown): PackingPaymentAdjustmentKind | null {
  if (value === 'deduct') return 'deduct'
  if (value === 'add') return 'add'
  return null
}

function mapRow(row: PackerAdjustmentRow): PackerAdjustment {
  return {
    id: row.id,
    packerOperatorName: row.packer_operator_name,
    packerOperatorCode: row.packer_operator_code,
    packerNameSnapshot: row.packer_name_snapshot,
    packerCodeSnapshot: row.packer_code_snapshot,
    label: row.label,
    kind: normalizeKind(row.kind) ?? 'deduct',
    amount: row.amount,
    status: normalizeStatus(row.status),
    appliedPaymentId: row.applied_payment_id,
    note: row.note,
    createdByOperatorName: row.created_by_operator_name,
    createdByOperatorCode: row.created_by_operator_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function listPackerAdjustments(options: {
  packerOperatorName?: string | null
  packerOperatorCode?: string | null
  status?: PackerAdjustmentStatus | 'all' | null
  limit?: number
} = {}) {
  const conditions: string[] = []
  const params: unknown[] = []
  if (options.packerOperatorName && options.packerOperatorCode) {
    conditions.push('packer_operator_name = ? AND packer_operator_code = ?')
    params.push(options.packerOperatorName.trim(), options.packerOperatorCode.trim())
  }
  const status = String(options.status ?? 'pending').trim().toLowerCase()
  if (status !== 'all') {
    conditions.push(`status = ?`)
    params.push(status === 'applied' || status === 'cancelled' ? status : 'pending')
  }
  const safeLimit = Math.min(200, Math.max(1, Math.floor(options.limit ?? 100)))
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const rows = db()
    .prepare(`SELECT * FROM packer_adjustments ${where} ORDER BY created_at DESC LIMIT ?`)
    .all(...params, safeLimit) as PackerAdjustmentRow[]
  return rows.map(mapRow)
}

export function listPendingPackerAdjustments(packerOperatorName: string, packerOperatorCode: string) {
  return listPackerAdjustments({ packerOperatorName, packerOperatorCode, status: 'pending', limit: 100 })
}

export function createPackerAdjustment(input: {
  packerOperatorName: string
  packerOperatorCode: string
  label: string
  kind: PackingPaymentAdjustmentKind | string
  amount: number | string
  note?: string | null
  createdBySession: HttpSession
}) {
  const packerOperatorName = String(input.packerOperatorName ?? '').trim()
  const packerOperatorCode = String(input.packerOperatorCode ?? '').trim()
  if (!packerOperatorName || !packerOperatorCode) {
    throw new Error('Petugas packing wajib dipilih.')
  }
  const profile = findOperatorProfile(packerOperatorName, packerOperatorCode, 'operator')
  if (!profile || profile.taskType !== 'packing') {
    throw new Error('Operator yang dipilih bukan petugas packing.')
  }
  const label = String(input.label ?? '').trim().slice(0, 100)
  if (!label) {
    throw new Error('Keterangan kasbon/bonus wajib diisi.')
  }
  const kind = normalizeKind(input.kind)
  if (!kind) {
    throw new Error('Tipe harus tambah (+) atau kurang (−).')
  }
  const amount = Math.round(Number(input.amount))
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Nominal harus lebih dari Rp 0.')
  }
  if (amount > 1_000_000_000) {
    throw new Error('Nominal terlalu besar.')
  }
  const note = typeof input.note === 'string' ? input.note.trim().slice(0, 200) || null : null
  const timestamp = nowIso()
  const id = makeId('packer_adjustment')
  db().prepare(
    `INSERT INTO packer_adjustments (
      id, packer_operator_name, packer_operator_code, packer_name_snapshot, packer_code_snapshot,
      label, kind, amount, status, applied_payment_id, note,
      created_by_operator_name, created_by_operator_code, created_by_session_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    profile.operatorName,
    profile.operatorCode,
    profile.fullName?.trim() || profile.operatorName,
    profile.operatorCode,
    label,
    kind,
    amount,
    note,
    input.createdBySession.operatorName,
    input.createdBySession.operatorCode,
    input.createdBySession.sessionId,
    timestamp,
    timestamp,
  )
  broadcastBackendEvent('sessions-updated', { packerAdjustmentId: id, action: 'packer-adjustment-created' })
  const row = db().prepare('SELECT * FROM packer_adjustments WHERE id = ? LIMIT 1').get(id) as PackerAdjustmentRow
  return mapRow(row)
}

export function cancelPackerAdjustment(id: string) {
  const row = db().prepare('SELECT * FROM packer_adjustments WHERE id = ? LIMIT 1').get(String(id ?? '').trim()) as PackerAdjustmentRow | undefined
  if (!row) {
    throw new Error('Catatan kasbon/bonus tidak ditemukan.')
  }
  if (row.status !== 'pending') {
    throw new Error('Hanya catatan pending yang bisa dibatalkan.')
  }
  db().prepare(`UPDATE packer_adjustments SET status = 'cancelled', updated_at = ? WHERE id = ?`).run(nowIso(), row.id)
  broadcastBackendEvent('sessions-updated', { packerAdjustmentId: row.id, action: 'packer-adjustment-cancelled' })
  const updated = db().prepare('SELECT * FROM packer_adjustments WHERE id = ? LIMIT 1').get(row.id) as PackerAdjustmentRow
  return mapRow(updated)
}

/** Ambil item ledger pending untuk dipakai dalam pembayaran/draft. Validasi milik packer yang sama. */
export function resolvePendingLedgerItems(
  database: ReturnType<typeof getDb>,
  ids: unknown,
  packerOperatorName: string,
  packerOperatorCode: string,
) {
  const list = Array.from(new Set((Array.isArray(ids) ? ids : []).map((id) => String(id ?? '').trim()).filter(Boolean)))
  if (list.length === 0) return []
  if (list.length > 10) {
    throw new Error('Maksimal 10 catatan tersimpan per pembayaran.')
  }
  return list.map((ledgerId) => {
    const row = database.prepare('SELECT * FROM packer_adjustments WHERE id = ? LIMIT 1').get(ledgerId) as PackerAdjustmentRow | undefined
    if (!row) {
      throw new Error(`Catatan tersimpan tidak ditemukan: ${ledgerId.slice(0, 8)}.`)
    }
    if (row.status !== 'pending') {
      throw new Error(`Catatan "${row.label}" sudah tidak pending (mungkin sudah terpakai/batal). Muat ulang dulu.`)
    }
    if (row.packer_operator_name !== packerOperatorName || row.packer_operator_code !== packerOperatorCode) {
      throw new Error(`Catatan "${row.label}" milik petugas lain.`)
    }
    return { id: row.id, label: row.label, kind: (normalizeKind(row.kind) ?? 'deduct') as 'add' | 'deduct', amount: row.amount }
  })
}

export function markLedgerItemsApplied(
  database: ReturnType<typeof getDb>,
  ids: string[],
  paymentId: string,
  timestamp: string,
) {
  for (const ledgerId of ids) {
    database.prepare(`UPDATE packer_adjustments SET status = 'applied', applied_payment_id = ?, updated_at = ? WHERE id = ?`).run(paymentId, timestamp, ledgerId)
  }
}

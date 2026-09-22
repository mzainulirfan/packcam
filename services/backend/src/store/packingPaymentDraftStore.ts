import type { PackingPaymentAdjustment, PackingPaymentDraft, PackingPaymentDraftStatus, PackingPaymentMethod } from '@pakti/types'

import { ensureServerStorage, getDb } from '../db'
import type { HttpSession } from '../http'
import { broadcastBackendEvent } from '../realtime'
import { normalizePaymentMethodOf, parseStoredAdjustments } from './packingPaymentDraftHelpers'
import { createPackingPayment, normalizePaymentAdjustments, validatePayablePackingSessions } from './packingPaymentStore'
import { findActiveDraftLocks } from './packingDraftLock'
import { resolvePendingLedgerItems } from './packerAdjustmentStore'

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

function generateDraftNo() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `DRAFT-${y}${m}${d}-${rand}`
}

type DraftRow = {
  id: string
  draft_no: string
  packer_operator_name: string
  packer_operator_code: string
  packer_name_snapshot: string
  packer_code_snapshot: string
  total_sessions: number
  total_packages: number
  subtotal_snapshot: number
  adjustment_total_snapshot: number
  estimated_total: number
  adjustments_snapshot: string | null
  ledger_adjustment_ids: string | null
  ledger_snapshot: string | null
  payment_method: string
  note: string | null
  status: string
  confirmed_payment_id: string | null
  created_by_operator_name: string | null
  created_by_operator_code: string | null
  created_by_session_id: string | null
  created_at: string
  updated_at: string
}

function parseIdList(value: string | null): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map((id) => String(id ?? '').trim()).filter(Boolean)
  } catch {
    return []
  }
}

function normalizeDraftStatus(value: unknown): PackingPaymentDraftStatus {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'confirmed') return 'confirmed'
  if (normalized === 'cancelled') return 'cancelled'
  return 'draft'
}

function loadSessionIds(draftId: string): string[] {
  const links = db()
    .prepare('SELECT packing_session_id FROM packing_payment_draft_sessions WHERE draft_id = ?')
    .all(draftId) as Array<{ packing_session_id: string }>
  return links.map((l) => l.packing_session_id)
}

function mapDraftRow(row: DraftRow): PackingPaymentDraft {
  return {
    id: row.id,
    draftNo: row.draft_no,
    packerOperatorName: row.packer_operator_name,
    packerOperatorCode: row.packer_operator_code,
    packerNameSnapshot: row.packer_name_snapshot,
    packerCodeSnapshot: row.packer_code_snapshot,
    totalSessions: row.total_sessions,
    totalPackages: row.total_packages,
    subtotalSnapshot: row.subtotal_snapshot,
    adjustmentTotalSnapshot: row.adjustment_total_snapshot,
    estimatedTotal: row.estimated_total,
    adjustments: parseStoredAdjustments(row.adjustments_snapshot),
    ledgerAdjustmentIds: parseIdList(row.ledger_adjustment_ids),
    ledgerItems: parseStoredAdjustments(row.ledger_snapshot),
    paymentMethod: normalizePaymentMethodOf(row.payment_method),
    note: row.note,
    status: normalizeDraftStatus(row.status),
    sessionIds: loadSessionIds(row.id),
    confirmedPaymentId: row.confirmed_payment_id,
    createdByOperatorName: row.created_by_operator_name,
    createdByOperatorCode: row.created_by_operator_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function listPackingPaymentDrafts(status: PackingPaymentDraftStatus | 'all' = 'draft', limit = 50) {
  const safeLimit = Math.min(200, Math.max(1, Math.floor(limit)))
  const normalized = String(status ?? 'draft').trim().toLowerCase()
  const rows = (normalized === 'all'
    ? db().prepare(`SELECT * FROM packing_payment_drafts ORDER BY created_at DESC LIMIT ?`).all(safeLimit)
    : db().prepare(`SELECT * FROM packing_payment_drafts WHERE status = ? ORDER BY created_at DESC LIMIT ?`).all(normalized === 'confirmed' || normalized === 'cancelled' ? normalized : 'draft', safeLimit)) as DraftRow[]
  return rows.map(mapDraftRow)
}

export function getPackingPaymentDraftById(id: string) {
  const row = db().prepare('SELECT * FROM packing_payment_drafts WHERE id = ? LIMIT 1').get(String(id ?? '').trim()) as DraftRow | undefined
  if (!row) return null
  return mapDraftRow(row)
}

export function createPackingPaymentDraft(input: {
  sessionIds: string[]
  manualAdjustments?: unknown
  ledgerAdjustmentIds?: unknown
  paymentMethod?: PackingPaymentMethod | string | null
  note?: string | null
  paidBySession: HttpSession
}) {
  const { sessionIds, first, totalSessions, totalPackages, subtotalAmount } = validatePayablePackingSessions(input.sessionIds)

  const locks = findActiveDraftLocks(sessionIds)
  if (locks.length > 0) {
    const firstLock = locks[0]!
    throw new Error(`Sesi sudah terkunci di draft pending ${firstLock.draftNo}. Konfirmasi atau batalkan draft itu dulu.`)
  }

  const manualAdjustments = normalizePaymentAdjustments(input.manualAdjustments ?? [])
  const ledgerItems = resolvePendingLedgerItems(db(), input.ledgerAdjustmentIds ?? [], first.packerOperatorName, first.packerOperatorCode)
  const allAdjustments: PackingPaymentAdjustment[] = [
    ...manualAdjustments,
    ...ledgerItems.map((item) => ({ label: item.label, kind: item.kind, amount: item.amount })),
  ]
  if (allAdjustments.length > 10) {
    throw new Error('Maksimal 10 baris penyesuaian per pembayaran.')
  }
  const adjustmentTotal = allAdjustments.reduce((acc, item) => acc + (item.kind === 'add' ? item.amount : -item.amount), 0)
  const estimatedTotal = subtotalAmount + adjustmentTotal
  if (estimatedTotal < 0) {
    throw new Error('Estimasi total tidak boleh negatif. Kurangi potongan atau tambah bonus.')
  }

  const paymentMethod = normalizePaymentMethodOf(input.paymentMethod)
  const note = typeof input.note === 'string' ? input.note.trim().slice(0, 200) || null : null
  const timestamp = nowIso()
  const id = makeId('packing_payment_draft')
  const draftNo = generateDraftNo()
  const ledgerIds = ledgerItems.map((item) => item.id)

  const tx = db().transaction(() => {
    db().prepare(
      `INSERT INTO packing_payment_drafts (
        id, draft_no, packer_operator_name, packer_operator_code, packer_name_snapshot, packer_code_snapshot,
        total_sessions, total_packages, subtotal_snapshot, adjustment_total_snapshot, estimated_total,
        adjustments_snapshot, ledger_adjustment_ids, ledger_snapshot, payment_method, note, status, confirmed_payment_id,
        created_by_operator_name, created_by_operator_code, created_by_session_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', NULL, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      draftNo,
      first.packerOperatorName,
      first.packerOperatorCode,
      first.packerNameSnapshot,
      first.packerCodeSnapshot,
      totalSessions,
      totalPackages,
      subtotalAmount,
      adjustmentTotal,
      estimatedTotal,
      JSON.stringify(manualAdjustments),
      JSON.stringify(ledgerIds),
      JSON.stringify(ledgerItems.map((item) => ({ label: item.label, kind: item.kind, amount: item.amount }))),
      paymentMethod,
      note,
      input.paidBySession.operatorName,
      input.paidBySession.operatorCode,
      input.paidBySession.sessionId,
      timestamp,
      timestamp,
    )
    for (const sid of sessionIds) {
      db().prepare('INSERT INTO packing_payment_draft_sessions (draft_id, packing_session_id) VALUES (?, ?)').run(id, sid)
    }
  })
  tx()

  broadcastBackendEvent('sessions-updated', { draftId: id, action: 'packing-payment-draft-created' })
  return getPackingPaymentDraftById(id)!
}

export function confirmPackingPaymentDraft(id: string, paidBySession: HttpSession) {
  const draftId = String(id ?? '').trim()
  const row = db().prepare('SELECT * FROM packing_payment_drafts WHERE id = ? LIMIT 1').get(draftId) as DraftRow | undefined
  if (!row) {
    throw new Error('Draft pending tidak ditemukan.')
  }
  if (row.status !== 'draft') {
    throw new Error('Hanya draft pending yang bisa dikonfirmasi.')
  }
  const draft = mapDraftRow(row)

  // Subtotal dihitung ulang live dari sesi; kunci milik draft sendiri dilewati.
  const payment = createPackingPayment({
    sessionIds: draft.sessionIds,
    paymentMethod: draft.paymentMethod,
    note: draft.note,
    adjustments: draft.adjustments,
    ledgerAdjustmentIds: draft.ledgerAdjustmentIds,
    skipLockCheckForDraftId: draft.id,
    paidBySession,
  })

  const timestamp = nowIso()
  db().prepare(`UPDATE packing_payment_drafts SET status = 'confirmed', confirmed_payment_id = ?, updated_at = ? WHERE id = ?`).run(payment.id, timestamp, draft.id)
  broadcastBackendEvent('sessions-updated', { draftId: draft.id, paymentId: payment.id, action: 'packing-payment-draft-confirmed' })
  return { draft: getPackingPaymentDraftById(draft.id)!, payment }
}

export function cancelPackingPaymentDraft(id: string) {
  const draftId = String(id ?? '').trim()
  const row = db().prepare('SELECT * FROM packing_payment_drafts WHERE id = ? LIMIT 1').get(draftId) as DraftRow | undefined
  if (!row) {
    throw new Error('Draft pending tidak ditemukan.')
  }
  if (row.status !== 'draft') {
    throw new Error('Hanya draft pending yang bisa dibatalkan.')
  }
  db().prepare(`UPDATE packing_payment_drafts SET status = 'cancelled', updated_at = ? WHERE id = ?`).run(nowIso(), draftId)
  broadcastBackendEvent('sessions-updated', { draftId, action: 'packing-payment-draft-cancelled' })
  return getPackingPaymentDraftById(draftId)!
}

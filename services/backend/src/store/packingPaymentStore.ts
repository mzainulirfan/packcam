import type { PackingPayment, PackingPaymentMethod } from '@pakti/types'

import { ensureServerStorage, getDb } from '../db'
import type { HttpSession } from '../http'
import { broadcastBackendEvent } from '../realtime'
import { getPackingSessionById } from './packingSessionStore'

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

function normalizePaymentMethod(value: unknown): PackingPaymentMethod {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'transfer') return 'transfer'
  if (normalized === 'other') return 'other'
  return 'cash'
}

type PackingPaymentRow = {
  id: string
  payment_no: string
  packer_operator_name: string
  packer_operator_code: string
  packer_name_snapshot: string
  packer_code_snapshot: string
  total_sessions: number
  total_packages: number
  total_amount: number
  payment_method: string
  paid_at: string
  paid_by_operator_name: string
  paid_by_operator_code: string
  paid_by_session_id: string | null
  note: string | null
  created_at: string
  updated_at: string
}



function mapPaymentRow(row: PackingPaymentRow, sessionIds: string[]): PackingPayment {
  return {
    id: row.id,
    paymentNo: row.payment_no,
    packerOperatorName: row.packer_operator_name,
    packerOperatorCode: row.packer_operator_code,
    packerNameSnapshot: row.packer_name_snapshot,
    packerCodeSnapshot: row.packer_code_snapshot,
    totalSessions: row.total_sessions,
    totalPackages: row.total_packages,
    totalAmount: row.total_amount,
    paymentMethod: normalizePaymentMethod(row.payment_method),
    paidAt: row.paid_at,
    paidByOperatorName: row.paid_by_operator_name,
    paidByOperatorCode: row.paid_by_operator_code,
    paidBySessionId: row.paid_by_session_id,
    note: row.note,
    sessionIds,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function ensurePaymentLinksTable() {
  db().exec(
    `CREATE TABLE IF NOT EXISTS packing_payment_sessions (
      payment_id TEXT NOT NULL,
      packing_session_id TEXT NOT NULL,
      PRIMARY KEY (payment_id, packing_session_id),
      FOREIGN KEY(payment_id) REFERENCES packing_payments(id) ON DELETE CASCADE,
      FOREIGN KEY(packing_session_id) REFERENCES packing_work_sessions(id) ON DELETE CASCADE
    )`,
  )
}

function generatePaymentNo() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `PAY-${y}${m}${d}-${rand}`
}

export function listPackingPayments(limit = 50) {
  ensurePaymentLinksTable()
  const safeLimit = Math.min(200, Math.max(1, Math.floor(limit)))
  const rows = db()
    .prepare('SELECT * FROM packing_payments ORDER BY paid_at DESC, created_at DESC LIMIT ?')
    .all(safeLimit) as PackingPaymentRow[]
  return rows.map((row) => {
    const links = db()
      .prepare('SELECT packing_session_id FROM packing_payment_sessions WHERE payment_id = ?')
      .all(row.id) as Array<{ packing_session_id: string }>
    const sessionIds = links.map((l) => l.packing_session_id)
    return mapPaymentRow(row, sessionIds)
  })
}

export function getPackingPaymentById(id: string) {
  ensurePaymentLinksTable()
  const row = db().prepare('SELECT * FROM packing_payments WHERE id = ? LIMIT 1').get(id.trim()) as PackingPaymentRow | undefined
  if (!row) return null
  const links = db()
    .prepare('SELECT packing_session_id FROM packing_payment_sessions WHERE payment_id = ?')
    .all(row.id) as Array<{ packing_session_id: string }>
  return mapPaymentRow(row, links.map((l) => l.packing_session_id))
}

export function createPackingPayment(input: {
  sessionIds: string[]
  paymentMethod?: PackingPaymentMethod | string | null
  note?: string | null
  paidBySession: HttpSession
}) {
  ensurePaymentLinksTable()
  const sessionIds = Array.from(new Set((input.sessionIds ?? []).map((id) => String(id).trim()).filter(Boolean)))
  if (sessionIds.length === 0) {
    throw new Error('Pilih minimal 1 sesi packing untuk dibayar.')
  }

  const sessions = sessionIds.map((id) => getPackingSessionById(id))
  const missing = sessions.findIndex((s) => !s)
  if (missing !== -1) {
    throw new Error(`Sesi packing tidak ditemukan: ${sessionIds[missing]}`)
  }

  const validSessions = sessions as NonNullable<(typeof sessions)[number]>[]

  // Only closed sessions can be paid
  const notClosed = validSessions.find((s) => s.status !== 'closed')
  if (notClosed) {
    throw new Error(`Hanya sesi closed yang bisa dibayar. Sesi ${notClosed.packerNameSnapshot} status ${notClosed.status}.`)
  }

  // Only unpaid sessions
  const alreadyPaid = validSessions.find((s) => s.paidAt)
  if (alreadyPaid) {
    throw new Error(`Sesi ${alreadyPaid.packerNameSnapshot} (${alreadyPaid.id.slice(0, 8)}) sudah dibayar.`)
  }

  // Must be same packer
  const first = validSessions[0]!
  const mixed = validSessions.find((s) => s.packerOperatorName !== first.packerOperatorName || s.packerOperatorCode !== first.packerOperatorCode)
  if (mixed) {
    throw new Error('Semua sesi dalam satu pembayaran harus dari petugas yang sama. Filter per petugas dulu.')
  }

  const totalSessions = validSessions.length
  const totalPackages = validSessions.reduce((acc, s) => acc + (s.completedPackingCount ?? 0), 0)
  const totalAmount = validSessions.reduce((acc, s) => acc + (s.totalPayAmount ?? 0), 0)

  const paymentMethod = normalizePaymentMethod(input.paymentMethod)
  const note = typeof input.note === 'string' ? input.note.trim() || null : null
  const timestamp = nowIso()
  const id = makeId('packing_payment')
  const paymentNo = generatePaymentNo()

  const tx = db().transaction(() => {
    db().prepare(
      `INSERT INTO packing_payments (
        id, payment_no, packer_operator_name, packer_operator_code, packer_name_snapshot, packer_code_snapshot,
        total_sessions, total_packages, total_amount, payment_method, paid_at,
        paid_by_operator_name, paid_by_operator_code, paid_by_session_id, note, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      paymentNo,
      first.packerOperatorName,
      first.packerOperatorCode,
      first.packerNameSnapshot,
      first.packerCodeSnapshot,
      totalSessions,
      totalPackages,
      totalAmount,
      paymentMethod,
      timestamp,
      input.paidBySession.operatorName,
      input.paidBySession.operatorCode,
      input.paidBySession.sessionId,
      note,
      timestamp,
      timestamp,
    )

    for (const sid of sessionIds) {
      db().prepare('INSERT INTO packing_payment_sessions (payment_id, packing_session_id) VALUES (?, ?)').run(id, sid)
      db().prepare(
        `UPDATE packing_work_sessions SET payment_id = ?, paid_at = ?, paid_amount = ?, paid_by_operator_name = ?, paid_by_operator_code = ?, updated_at = ? WHERE id = ?`,
      ).run(id, timestamp, validSessions.find((s) => s.id === sid)?.totalPayAmount ?? 0, input.paidBySession.operatorName, input.paidBySession.operatorCode, timestamp, sid)
    }
  })

  tx()

  broadcastBackendEvent('sessions-updated', { paymentId: id, action: 'packing-payment-created' })

  return getPackingPaymentById(id)!
}

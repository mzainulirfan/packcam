import type { PackingWorkSession, PackingWorkSessionStatus } from '@pakti/types'

import { getDb, ensureServerStorage } from '../db'
import type { HttpSession } from '../http'
import { broadcastBackendEvent } from '../realtime'
import { findOperatorProfile, listOperatorProfiles } from './operatorStore'

const DEFAULT_PACKING_PAY_AMOUNT = 1500

type PackingWorkSessionRow = {
  id: string
  packer_operator_name: string
  packer_operator_code: string
  packer_name_snapshot: string
  packer_code_snapshot: string
  started_at: string
  ended_at: string | null
  status: PackingWorkSessionStatus
  note: string | null
  created_by_session_id: string | null
  payment_id: string | null
  paid_at: string | null
  paid_amount: number | null
  paid_by_operator_name: string | null
  paid_by_operator_code: string | null
  created_at: string
  updated_at: string
  completed_packing_count: number | null
  total_pay_amount: number | null
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

function mapPackingSession(row: PackingWorkSessionRow): PackingWorkSession {
  return {
    id: row.id,
    packerOperatorName: row.packer_operator_name,
    packerOperatorCode: row.packer_operator_code,
    packerNameSnapshot: row.packer_name_snapshot,
    packerCodeSnapshot: row.packer_code_snapshot,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    status: row.status,
    note: row.note,
    completedPackingCount: row.completed_packing_count ?? 0,
    totalPayAmount: row.total_pay_amount ?? 0,
    createdBySessionId: row.created_by_session_id,
    paymentId: row.payment_id ?? null,
    paidAt: row.paid_at ?? null,
    paidAmount: row.paid_amount ?? null,
    paidByOperatorName: row.paid_by_operator_name ?? null,
    paidByOperatorCode: row.paid_by_operator_code ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function selectPackingSessions(whereClause = '', args: unknown[] = []) {
  return db().prepare(
    `SELECT
       s.id,
       s.packer_operator_name,
       s.packer_operator_code,
       s.packer_name_snapshot,
       s.packer_code_snapshot,
       s.started_at,
       s.ended_at,
       s.status,
       s.note,
       s.created_by_session_id,
       s.payment_id,
       s.paid_at,
       s.paid_amount,
       s.paid_by_operator_name,
       s.paid_by_operator_code,
       s.created_at,
       s.updated_at,
       COUNT(r.id) AS completed_packing_count,
       COALESCE(SUM(r.packing_pay_amount), 0) AS total_pay_amount
     FROM packing_work_sessions s
     LEFT JOIN recordings r
       ON r.packing_session_id = s.id
      AND r.task_type = 'packing'
      AND r.status = 'completed'
     ${whereClause}
     GROUP BY s.id
     ORDER BY s.started_at DESC`,
  ).all(...args) as PackingWorkSessionRow[]
}

export function listPackingOperators() {
  return listOperatorProfiles()
    .filter((profile) => profile.role === 'operator' && profile.taskType === 'packing')
    .sort((left, right) => (left.fullName ?? left.operatorName).localeCompare(right.fullName ?? right.operatorName))
}

export function getActivePackingSession(session?: HttpSession | null) {
  const args: unknown[] = ['active']
  const ownerFilter = session ? 'AND s.created_by_session_id = ?' : ''
  if (session) args.push(session.sessionId)

  const rows = selectPackingSessions(`WHERE s.status = ? ${ownerFilter}`, args)
  return rows[0] ? mapPackingSession(rows[0]) : null
}

export function getPackingSessionById(id: string) {
  const rows = selectPackingSessions('WHERE s.id = ?', [id.trim()])
  return rows[0] ? mapPackingSession(rows[0]) : null
}

export function listPackingSessions(limit = 50) {
  const safeLimit = Math.min(200, Math.max(1, Math.floor(limit)))
  const rows = selectPackingSessions('', []).slice(0, safeLimit)
  return rows.map(mapPackingSession)
}

export function createPackingSession(input: {
  packerOperatorName: string
  packerOperatorCode: string
  createdBySessionId?: string | null
  note?: string | null
  releaseActive?: boolean
}) {
  const packerOperatorName = input.packerOperatorName.trim()
  const packerOperatorCode = input.packerOperatorCode.trim()
  if (!packerOperatorName || !packerOperatorCode) {
    throw new Error('Operator packing wajib dipilih.')
  }

  const profile = findOperatorProfile(packerOperatorName, packerOperatorCode, 'operator')
  if (!profile || profile.taskType !== 'packing') {
    throw new Error('Operator yang dipilih bukan petugas packing.')
  }

  if (input.createdBySessionId) {
    const existing = getActivePackingSession({ sessionId: input.createdBySessionId } as HttpSession)
    if (existing) {
      releaseActivePackingSession(input.createdBySessionId)
    }
  }

  const timestamp = nowIso()
  const id = makeId('packing_session')
  db().prepare(
    `INSERT INTO packing_work_sessions (
      id,
      packer_operator_name,
      packer_operator_code,
      packer_name_snapshot,
      packer_code_snapshot,
      started_at,
      ended_at,
      status,
      note,
      created_by_session_id,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    profile.operatorName,
    profile.operatorCode,
    profile.fullName?.trim() || profile.operatorName,
    profile.operatorCode,
    timestamp,
    null,
    'active',
    input.note?.trim() || null,
    input.createdBySessionId ?? null,
    timestamp,
    timestamp,
  )

  broadcastBackendEvent('sessions-updated', { packingSessionId: id, action: 'packing-session-created' })
  return getPackingSessionById(id)
}

function releaseActivePackingSession(sessionId: string) {
  const timestamp = nowIso()
  db().prepare(
    `UPDATE packing_work_sessions
     SET created_by_session_id = NULL, updated_at = ?
     WHERE status = 'active' AND created_by_session_id = ?`,
  ).run(timestamp, sessionId)
  broadcastBackendEvent('sessions-updated', { sessionId, action: 'packing-session-released' })
}

export function closePackingSession(id: string, note?: string | null) {
  const session = getPackingSessionById(id)
  if (!session) {
    throw new Error('Sesi packing tidak ditemukan.')
  }
  if (session.status !== 'active') {
    return session
  }

  const timestamp = nowIso()
  db().prepare(
    `UPDATE packing_work_sessions
     SET status = 'closed', ended_at = ?, note = COALESCE(?, note), updated_at = ?
     WHERE id = ?`,
  ).run(timestamp, note?.trim() || null, timestamp, id)

  broadcastBackendEvent('sessions-updated', { packingSessionId: id, action: 'packing-session-closed' })
  return getPackingSessionById(id)
}

export function reopenPackingSession(input: {
  id: string
  currentSession: HttpSession
  releaseActive?: boolean
}) {
  const target = getPackingSessionById(input.id)
  if (!target) {
    throw new Error('Sesi packing tidak ditemukan.')
  }

  if (target.status !== 'active') {
    throw new Error('Hanya sesi packing yang belum diakhiri yang bisa dilanjutkan.')
  }

  if (target.createdBySessionId === input.currentSession.sessionId) {
    return target
  }

  if (target.createdBySessionId && target.createdBySessionId !== input.currentSession.sessionId && !input.releaseActive) {
    throw new Error('Sesi packing ini masih terhubung ke sesi login lain. Pilih lagi untuk mengambil alih sesi.')
  }

  const active = getActivePackingSession(input.currentSession)
  if (active && active.id !== target.id) {
    if (!input.releaseActive) {
      throw new Error('Masih ada sesi packing aktif. Lepas sesi aktif dulu atau aktifkan opsi releaseActive.')
    }

    releaseActivePackingSession(input.currentSession.sessionId)
  }

  const timestamp = nowIso()
  db().prepare(
    `UPDATE packing_work_sessions
     SET created_by_session_id = ?, updated_at = ?
     WHERE id = ?`,
  ).run(input.currentSession.sessionId, timestamp, target.id)

  broadcastBackendEvent('sessions-updated', { packingSessionId: target.id, action: 'packing-session-resumed' })
  return getPackingSessionById(target.id)
}

export function assertActivePackingSession(id: string) {
  const session = getPackingSessionById(id)
  if (!session || session.status !== 'active') {
    throw new Error('Sesi packing aktif wajib dipilih sebelum packing.')
  }

  return session
}

export function getDefaultPackingPayBreakdown() {
  return {
    ruleName: 'Default packing',
    payType: 'per_package',
    amount: DEFAULT_PACKING_PAY_AMOUNT,
    quantity: 1,
    total: DEFAULT_PACKING_PAY_AMOUNT,
  }
}

export function getDefaultPackingPayAmount() {
  return DEFAULT_PACKING_PAY_AMOUNT
}

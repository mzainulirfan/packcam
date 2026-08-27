import type { OperatorRole, WorkTask } from '@pakti/types'

import { verifyPassword } from '../auth'
import type { HttpSession } from '../http'
import { getDb, ensureServerStorage } from '../db'
import { broadcastBackendEvent } from '../realtime'
import { findOperatorProfile, findProfileByName } from './operatorStore'

type SessionRow = {
  session_id: string
  operator_name: string
  operator_code: string
  role: OperatorRole
  task_type: WorkTask
  created_at: string
  updated_at: string
}

const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS ?? 12)
const SESSION_TTL_MS = Math.max(1, SESSION_TTL_HOURS) * 60 * 60 * 1000

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

function normalizeOperatorName(value: string) {
  return value.trim()
}

function normalizeOperatorCode(value: string) {
  return value.trim()
}

function normalizeRole(value: OperatorRole | string | undefined | null): OperatorRole {
  return value === 'admin' ? 'admin' : 'operator'
}

function mapSession(row: SessionRow): HttpSession {
  return {
    sessionId: row.session_id,
    operatorName: row.operator_name,
    operatorCode: row.operator_code,
    role: row.role,
    taskType: row.task_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function createSession(operatorName: string, operatorCode: string, role: OperatorRole, taskType: WorkTask) {
  const sessionId = makeId('session')
  const timestamp = nowIso()
  db().prepare(
    `INSERT INTO operator_sessions (session_id, operator_name, operator_code, role, task_type, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(sessionId, operatorName, operatorCode, role, taskType, timestamp, timestamp)

  const session = getSessionById(sessionId)
  if (!session) {
    throw new Error('Gagal membuat sesi login.')
  }

  broadcastBackendEvent('sessions-updated', { sessionId, operatorName, operatorCode, role, taskType, createdAt: timestamp })
  return session
}

export function updateSessionTaskType(sessionId: string, taskType: WorkTask) {
  const timestamp = nowIso()
  const updated = db().prepare(
    `UPDATE operator_sessions
     SET task_type = ?, updated_at = ?
     WHERE session_id = ?`,
  ).run(taskType, timestamp, sessionId)

  if ((updated.changes ?? 0) === 0) {
    return null
  }

  broadcastBackendEvent('sessions-updated', { sessionId, taskType, updatedAt: timestamp })
  return getSessionById(sessionId)
}

export function getSessionById(sessionId: string) {
  const row = db()
    .prepare(
      `SELECT session_id, operator_name, operator_code, role, task_type, created_at, updated_at
       FROM operator_sessions
       WHERE session_id = ?
       LIMIT 1`,
    )
    .get(sessionId) as SessionRow | undefined

  return row ? mapSession(row) : null
}

export function deleteSessionById(sessionId: string) {
  db().prepare(`DELETE FROM operator_sessions WHERE session_id = ?`).run(sessionId)
  broadcastBackendEvent('sessions-updated', { sessionId, deleted: true })
}

export function findSessionByIdentity(operatorName: string, operatorCode: string, role: OperatorRole) {
  const row = db()
    .prepare(
      `SELECT session_id, operator_name, operator_code, role, task_type, created_at, updated_at
       FROM operator_sessions
       WHERE LOWER(operator_name) = LOWER(?)
         AND LOWER(operator_code) = LOWER(?)
         AND role = ?
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
    .get(normalizeOperatorName(operatorName), normalizeOperatorCode(operatorCode), role) as SessionRow | undefined

  return row ? mapSession(row) : null
}

export function authenticateOperator(input: {
  operatorName: string
  operatorCode?: string | null
  password: string
  role?: OperatorRole | null
}) {
  const role = normalizeRole(input.role)
  const operatorName = normalizeOperatorName(input.operatorName)
  const operatorCode = input.operatorCode?.trim() || ''

  const profile = operatorCode
    ? findOperatorProfile(operatorName, operatorCode, role)
    : findProfileByName(operatorName)

  if (!profile) {
    throw new Error('Username atau password salah.')
  }

  if (!profile.passwordSalt || !profile.passwordHash) {
    throw new Error('Akun ini belum punya password. Hubungi admin.')
  }

  if (!verifyPassword(input.password, profile.passwordSalt, profile.passwordHash)) {
    throw new Error('Username atau password salah.')
  }

  const session = createSession(profile.operatorName, profile.operatorCode, profile.role, profile.taskType)
  return {
    session,
    profile,
  }
}

export function resolveSession(sessionId: string | null | undefined) {
  if (!sessionId) {
    return null
  }

  const session = getSessionById(sessionId)
  if (!session) {
    return null
  }

  if (Date.now() - new Date(session.updatedAt).getTime() > SESSION_TTL_MS) {
    deleteSessionById(session.sessionId)
    return null
  }

  db()
    .prepare(`UPDATE operator_sessions SET updated_at = ? WHERE session_id = ?`)
    .run(nowIso(), session.sessionId)

  return getSessionById(session.sessionId)
}

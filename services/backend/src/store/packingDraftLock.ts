import { ensureServerStorage, getDb } from '../db'

function db() {
  ensureServerStorage()
  return getDb()
}

export type DraftSessionLock = {
  sessionId: string
  draftId: string
  draftNo: string
}

function normalizeIds(ids: unknown): string[] {
  const list = Array.isArray(ids) ? ids : []
  return Array.from(new Set(list.map((id) => String(id ?? '').trim()).filter(Boolean)))
}

/** Sesi yang terkunci di draft aktif (status 'draft'). Draft yang dikecualikan (milik sendiri saat konfirmasi) diabaikan. */
export function findActiveDraftLocks(sessionIds: unknown, excludeDraftId?: string | null): DraftSessionLock[] {
  const ids = normalizeIds(sessionIds)
  if (ids.length === 0) return []
  const placeholders = ids.map(() => '?').join(',')
  const params: unknown[] = [...ids]
  let exclude = ''
  if (excludeDraftId && String(excludeDraftId).trim()) {
    exclude = 'AND d.id != ?'
    params.push(String(excludeDraftId).trim())
  }
  const rows = db().prepare(
    `SELECT l.packing_session_id AS sessionId, d.id AS draftId, d.draft_no AS draftNo
     FROM packing_payment_draft_sessions l
     JOIN packing_payment_drafts d ON d.id = l.draft_id
     WHERE l.packing_session_id IN (${placeholders}) AND d.status = 'draft' ${exclude}`,
  ).all(...params) as DraftSessionLock[]
  return rows
}

/** Lempar error jika ada sesi yang terkunci draft aktif. Dipakai guard bayar/merge/hapus/reopen/ubah pay-rule. */
export function assertSessionsNotLocked(sessionIds: unknown, excludeDraftId?: string | null) {
  const locks = findActiveDraftLocks(sessionIds, excludeDraftId)
  if (locks.length > 0) {
    const first = locks[0]!
    const extra = locks.length > 1 ? ` (+${locks.length - 1} sesi lain)` : ''
    throw new Error(`Sesi terkunci di draft pending ${first.draftNo}${extra}. Konfirmasi atau batalkan draft dulu.`)
  }
}

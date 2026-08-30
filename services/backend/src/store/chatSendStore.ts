import { randomUUID } from 'node:crypto'
import type { ChatSendStatus, RecordingChatSend } from '@pakti/types'

import { ensureServerStorage, getDb } from '../db'
import { broadcastBackendEvent } from '../realtime'

type ChatSendRow = {
  id: string
  recording_id: string
  order_id: string | null
  resi_number: string
  order_number: string | null
  buyer_username: string
  task_type: 'qc' | 'packing'
  video_file_path: string
  attachment_file_paths: string | null
  status: ChatSendStatus
  attempts: number
  message_template: string | null
  error_message: string | null
  prepared_at: string | null
  sent_at: string | null
  created_at: string
  updated_at: string
}

type RecordingForChatSend = {
  id: string
  resi_number: string
  task_type: 'qc' | 'packing'
  status: 'recording' | 'completed' | 'error'
  media_type: 'video' | 'photo'
}

type ChatSendAttachment = {
  fileName: string
  filePath: string
  mimeType: string
}

type OrderForChatSend = {
  id: string
  order_number: string
  buyer_username: string | null
}

type AutoPrepareRecordingCandidate = {
  id: string
  resi_number: string
  task_type: 'qc' | 'packing'
  order_id: string | null
  buyer_username: string | null
  chat_status: ChatSendStatus | null
}

export type AutoPrepareRecordingChatSendsResult = {
  created: RecordingChatSend[]
  skipped: Array<{ recordingId: string; resiNumber: string; reason: string }>
  failed: Array<{ recordingId: string; resiNumber: string; error: string }>
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

const MAX_FAILED_ATTEMPTS = 3

function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function fileNameFromPath(filePath: string) {
  const normalized = filePath.replace(/\\/g, '/')
  return normalized.split('/').pop() || 'pakti-attachment'
}

function mimeTypeFromPath(filePath: string) {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  return 'video/mp4'
}

function normalizeAttachment(input: Partial<ChatSendAttachment> & { filePath: string }): ChatSendAttachment {
  return {
    fileName: normalizeOptionalString(input.fileName) ?? fileNameFromPath(input.filePath),
    filePath: input.filePath,
    mimeType: normalizeOptionalString(input.mimeType) ?? mimeTypeFromPath(input.filePath),
  }
}

function parseAttachments(value: string | null, fallbackFilePath: string) {
  const fallback = [normalizeAttachment({ filePath: fallbackFilePath })]
  if (!value) return fallback

  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return fallback
    const attachments = parsed
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const filePath = normalizeOptionalString((item as { filePath?: unknown }).filePath)
        if (!filePath) return null
        return normalizeAttachment({
          fileName: normalizeOptionalString((item as { fileName?: unknown }).fileName) ?? undefined,
          filePath,
          mimeType: normalizeOptionalString((item as { mimeType?: unknown }).mimeType) ?? undefined,
        })
      })
      .filter((item): item is ChatSendAttachment => Boolean(item))
    return attachments.length > 0 ? attachments : fallback
  } catch {
    return fallback
  }
}

function withAttachmentUrls(attachments: ChatSendAttachment[], apiBaseUrl: string) {
  const base = apiBaseUrl.replace(/\/+$/, '')
  return attachments.map((attachment) => {
    const normalizedFilePath = attachment.filePath.startsWith('/') ? attachment.filePath : `/${attachment.filePath}`
    return {
      ...attachment,
      fileUrl: apiBaseUrl ? `${base}/files${normalizedFilePath}` : undefined,
    }
  })
}

function getLocalTodayDateString() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function mapChatSend(row: ChatSendRow, apiBaseUrl = ''): RecordingChatSend {
  const normalizedFilePath = row.video_file_path.startsWith('/') ? row.video_file_path : `/${row.video_file_path}`
  const attachments = parseAttachments(row.attachment_file_paths, row.video_file_path)

  return {
    id: row.id,
    recordingId: row.recording_id,
    resiNumber: row.resi_number,
    orderNumber: row.order_number,
    buyerUsername: row.buyer_username,
    taskType: row.task_type,
    videoFilePath: row.video_file_path,
    videoUrl: apiBaseUrl ? `${apiBaseUrl.replace(/\/+$/, '')}/files${normalizedFilePath}` : undefined,
    attachments: withAttachmentUrls(attachments, apiBaseUrl),
    status: row.status,
    attempts: row.attempts,
    messageTemplate: row.message_template,
    errorMessage: row.error_message,
    preparedAt: row.prepared_at,
    sentAt: row.sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function getRecordingForChatSend(recordingId: string) {
  return db()
    .prepare(
      `SELECT id, resi_number, task_type, status, media_type
       FROM recordings
       WHERE id = ?
       LIMIT 1`,
    )
    .get(recordingId.trim()) as RecordingForChatSend | undefined
}

function getOrderForResi(resiNumber: string) {
  return db()
    .prepare(
      `SELECT id, order_number, buyer_username
       FROM orders
       WHERE source = 'shopee'
         AND lower(tracking_number) = lower(?)
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
    .get(resiNumber.trim()) as OrderForChatSend | undefined
}

function getChatSendRow(id: string) {
  return db()
    .prepare(
      `SELECT id, recording_id, order_id, resi_number, order_number, buyer_username, task_type, video_file_path,
              attachment_file_paths, status, attempts, message_template, error_message, prepared_at, sent_at, created_at, updated_at
       FROM recording_chat_sends
       WHERE id = ?
       LIMIT 1`,
    )
    .get(id.trim()) as ChatSendRow | undefined
}

export function prepareRecordingChatSend(input: {
  recordingId: string
  videoFilePath: string
  attachments?: ChatSendAttachment[]
  fallbackBuyerUsername?: string | null
  fallbackOrderNumber?: string | null
  messageTemplate?: string | null
}) {
  const recording = getRecordingForChatSend(input.recordingId)
  if (!recording) {
    throw new Error('Recording tidak ditemukan.')
  }

  if (recording.status !== 'completed') {
    throw new Error('Recording belum selesai.')
  }

  if (recording.media_type !== 'video') {
    throw new Error('Hanya dokumentasi video QC yang bisa jadi file utama Shopee Chat.')
  }

  const videoFilePath = normalizeOptionalString(input.videoFilePath)
  if (!videoFilePath) {
    throw new Error('Video share belum siap.')
  }

  const order = getOrderForResi(recording.resi_number)
  const buyerUsername = normalizeOptionalString(order?.buyer_username) ?? normalizeOptionalString(input.fallbackBuyerUsername)
  if (!buyerUsername) {
    if (!order) {
      throw new Error('Order Shopee untuk resi ini belum ada di Pakti. Isi username pembeli Shopee untuk kirim tanpa sync order.')
    }
    throw new Error('Order Shopee belum punya username pembeli. Isi username pembeli Shopee untuk kirim manual.')
  }
  const orderNumber = normalizeOptionalString(order?.order_number) ?? normalizeOptionalString(input.fallbackOrderNumber)

  const timestamp = nowIso()
  const id = makeId('chatsend')
  const attachments = (input.attachments?.length ? input.attachments : [{ filePath: videoFilePath, fileName: fileNameFromPath(videoFilePath), mimeType: 'video/mp4' }])
    .map((attachment) => normalizeAttachment(attachment))
  const messageTemplate =
    normalizeOptionalString(input.messageTemplate) ??
    `Halo kak ${buyerUsername}, berikut video dokumentasi paket untuk pesanan ${orderNumber ?? '-'} resi ${recording.resi_number}.`
  db().prepare(
    `INSERT INTO recording_chat_sends (
       id, recording_id, order_id, resi_number, order_number, buyer_username, task_type, video_file_path, attachment_file_paths,
       status, attempts, message_template, error_message, prepared_at, sent_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, NULL, NULL, NULL, ?, ?)
     ON CONFLICT(recording_id, buyer_username) DO UPDATE SET
       order_id = excluded.order_id,
       resi_number = excluded.resi_number,
       order_number = excluded.order_number,
        task_type = excluded.task_type,
        video_file_path = excluded.video_file_path,
        attachment_file_paths = excluded.attachment_file_paths,
       status = CASE WHEN recording_chat_sends.status = 'sent' THEN recording_chat_sends.status ELSE 'pending' END,
       message_template = excluded.message_template,
       error_message = NULL,
       prepared_at = CASE WHEN recording_chat_sends.status = 'sent' THEN recording_chat_sends.prepared_at ELSE NULL END,
       updated_at = excluded.updated_at`,
  ).run(
    id,
    recording.id,
    order?.id ?? null,
    recording.resi_number,
    orderNumber,
    buyerUsername,
    recording.task_type,
    videoFilePath,
    JSON.stringify(attachments),
    messageTemplate,
    timestamp,
    timestamp,
  )

  const row = db()
    .prepare(
      `SELECT id, recording_id, order_id, resi_number, order_number, buyer_username, task_type, video_file_path,
              attachment_file_paths, status, attempts, message_template, error_message, prepared_at, sent_at, created_at, updated_at
       FROM recording_chat_sends
       WHERE recording_id = ? AND buyer_username = ?
       LIMIT 1`,
    )
    .get(recording.id, buyerUsername) as ChatSendRow

  broadcastBackendEvent('chat-sends-updated', { id: row.id, status: row.status })
  return mapChatSend(row)
}

function findCompletedRecordingForResi(resiNumber: string, taskType: 'qc' | 'packing', mediaType: 'video' | 'photo') {
  return db()
    .prepare(
      `SELECT id, resi_number, task_type, status, media_type
       FROM recordings
       WHERE lower(resi_number) = lower(?)
         AND task_type = ?
         AND media_type = ?
         AND status = 'completed'
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
    .get(resiNumber.trim(), taskType, mediaType) as RecordingForChatSend | undefined
}

export async function prepareBundledRecordingChatSend(input: {
  recordingId: string
  messageTemplate?: string | null
  fallbackBuyerUsername?: string | null
  fallbackOrderNumber?: string | null
  prepareShareFile: (recordingId: string) => Promise<ChatSendAttachment>
}) {
  const source = getRecordingForChatSend(input.recordingId)
  if (!source) {
    throw new Error('Recording tidak ditemukan.')
  }
  if (source.status !== 'completed') {
    throw new Error('Recording belum selesai.')
  }

  let qcVideo: RecordingForChatSend | undefined
  let packingPhoto: RecordingForChatSend | undefined
  if (source.task_type === 'qc' && source.media_type === 'video') {
    qcVideo = source
    packingPhoto = findCompletedRecordingForResi(source.resi_number, 'packing', 'photo')
  } else if (source.task_type === 'packing' && source.media_type === 'photo') {
    qcVideo = findCompletedRecordingForResi(source.resi_number, 'qc', 'video')
    packingPhoto = source
  } else {
    throw new Error('Shopee Chat hanya mendukung video QC, dengan foto packing sebagai lampiran tambahan bila ada.')
  }

  if (!qcVideo) {
    throw new Error('Video QC untuk resi ini belum ada.')
  }

  const qcVideoFile = normalizeAttachment(await input.prepareShareFile(qcVideo.id))
  const attachments = [qcVideoFile]
  if (packingPhoto) {
    attachments.push(normalizeAttachment(await input.prepareShareFile(packingPhoto.id)))
  }

  return prepareRecordingChatSend({
    recordingId: qcVideo.id,
    videoFilePath: qcVideoFile.filePath,
    attachments,
    messageTemplate: input.messageTemplate,
    fallbackBuyerUsername: input.fallbackBuyerUsername,
    fallbackOrderNumber: input.fallbackOrderNumber,
  })
}

export async function prepareReadyRecordingChatSendsForToday(input: {
  limit?: number
  taskType?: 'qc' | 'packing'
  prepareShareFile: (recordingId: string) => Promise<{ filePath: string }>
}) {
  const limit = Math.min(20, Math.max(1, Math.floor(input.limit ?? 5)))
  const taskType = input.taskType === 'qc' ? 'qc' : 'packing'
  const today = getLocalTodayDateString()
  const scanLimit = limit * 5
  const candidates = db()
    .prepare(
      `SELECT r.id, r.resi_number, r.task_type,
              o.id AS order_id,
              o.buyer_username,
              cs.status AS chat_status
       FROM recordings r
       LEFT JOIN orders o
         ON o.source = 'shopee'
        AND lower(o.tracking_number) = lower(r.resi_number)
       LEFT JOIN recording_chat_sends cs
          ON lower(cs.resi_number) = lower(r.resi_number)
         AND cs.buyer_username = o.buyer_username
        WHERE r.status = 'completed'
          AND r.task_type = ?
          AND r.record_date = ?
          AND r.media_type IN ('video', 'photo')
        ORDER BY r.updated_at ASC
        LIMIT ?`,
    )
    .all(taskType, today, scanLimit) as AutoPrepareRecordingCandidate[]

  const result: AutoPrepareRecordingChatSendsResult = { created: [], skipped: [], failed: [] }

  for (const recording of candidates) {
    if (result.created.length >= limit) break

    if (!recording.order_id) {
      result.skipped.push({ recordingId: recording.id, resiNumber: recording.resi_number, reason: 'Order Shopee untuk resi ini belum ada.' })
      continue
    }

    if (!normalizeOptionalString(recording.buyer_username)) {
      result.skipped.push({ recordingId: recording.id, resiNumber: recording.resi_number, reason: 'Order Shopee belum punya username pembeli.' })
      continue
    }

    if (recording.chat_status) {
      result.skipped.push({ recordingId: recording.id, resiNumber: recording.resi_number, reason: `Job chat sudah ${recording.chat_status}.` })
      continue
    }

    try {
      result.created.push(await prepareBundledRecordingChatSend({ recordingId: recording.id, prepareShareFile: input.prepareShareFile }))
    } catch (error) {
      result.failed.push({
        recordingId: recording.id,
        resiNumber: recording.resi_number,
        error: error instanceof Error ? error.message : 'Gagal menyiapkan chat video otomatis.',
      })
    }
  }

  return result
}

export function listPendingChatSends(apiBaseUrl = '') {
  const rows = db()
    .prepare(
      `SELECT id, recording_id, order_id, resi_number, order_number, buyer_username, task_type, video_file_path,
              attachment_file_paths, status, attempts, message_template, error_message, prepared_at, sent_at, created_at, updated_at
       FROM recording_chat_sends
       WHERE status IN ('pending', 'failed')
         AND attempts < ?
       ORDER BY updated_at ASC
       LIMIT 50`,
    )
    .all(MAX_FAILED_ATTEMPTS) as ChatSendRow[]

  return rows.map((row) => mapChatSend(row, apiBaseUrl))
}

export function listRecentChatSends(limit = 20, apiBaseUrl = '') {
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)))
  const rows = db()
    .prepare(
      `SELECT id, recording_id, order_id, resi_number, order_number, buyer_username, task_type, video_file_path,
              attachment_file_paths, status, attempts, message_template, error_message, prepared_at, sent_at, created_at, updated_at
       FROM recording_chat_sends
       ORDER BY updated_at DESC
       LIMIT ?`,
    )
    .all(safeLimit) as ChatSendRow[]

  return rows.map((row) => mapChatSend(row, apiBaseUrl))
}

export function listChatSendsByRecordingIds(recordingIds: string[], apiBaseUrl = '') {
  const normalizedIds = recordingIds.map((id) => id.trim()).filter(Boolean)
  if (normalizedIds.length === 0) {
    return [] as RecordingChatSend[]
  }

  const placeholders = normalizedIds.map(() => '?').join(',')
  const rows = db()
    .prepare(
      `SELECT id, recording_id, order_id, resi_number, order_number, buyer_username, task_type, video_file_path,
              attachment_file_paths, status, attempts, message_template, error_message, prepared_at, sent_at, created_at, updated_at
       FROM recording_chat_sends
        WHERE recording_id IN (${placeholders})
           OR lower(resi_number) IN (
             SELECT lower(resi_number)
             FROM recordings
             WHERE id IN (${placeholders})
           )`,
    )
    .all(...normalizedIds, ...normalizedIds) as ChatSendRow[]

  return rows.map((row) => mapChatSend(row, apiBaseUrl))
}

export function getChatSendStats() {
  const rows = db()
    .prepare(
      `SELECT status, COUNT(*) AS count
       FROM recording_chat_sends
       GROUP BY status`,
    )
    .all() as Array<{ status: ChatSendStatus; count: number }>
  const sentToday = db()
    .prepare(`SELECT COUNT(*) AS count FROM recording_chat_sends WHERE status = 'sent' AND date(sent_at, 'localtime') = date('now', 'localtime')`)
    .get() as { count: number }
  const failedToday = db()
    .prepare(`SELECT COUNT(*) AS count FROM recording_chat_sends WHERE status IN ('failed', 'cancelled') AND date(updated_at, 'localtime') = date('now', 'localtime')`)
    .get() as { count: number }
  const latest = db()
    .prepare(`SELECT updated_at FROM recording_chat_sends ORDER BY updated_at DESC LIMIT 1`)
    .get() as { updated_at: string } | undefined
  const counts = { pending: 0, prepared: 0, sent: 0, failed: 0, cancelled: 0 } satisfies Record<ChatSendStatus, number>

  for (const row of rows) {
    counts[row.status] = row.count ?? 0
  }

  return {
    counts,
    sentToday: sentToday.count ?? 0,
    failedOrCancelledToday: failedToday.count ?? 0,
    latestUpdatedAt: latest?.updated_at ?? null,
  }
}

export function updateChatSendStatus(id: string, status: Exclude<ChatSendStatus, 'pending'>, errorMessage?: string | null) {
  const row = getChatSendRow(id)
  if (!row) {
    throw new Error('Job kirim chat tidak ditemukan.')
  }

  const timestamp = nowIso()
  const nextAttempts = status === 'prepared' || status === 'failed' ? row.attempts + 1 : row.attempts
  db().prepare(
    `UPDATE recording_chat_sends
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
    status === 'failed' || status === 'cancelled' ? normalizeOptionalString(errorMessage) ?? 'Extension gagal menyiapkan chat.' : null,
    status,
    timestamp,
    status,
    timestamp,
    timestamp,
    id,
  )

  const updated = getChatSendRow(id)
  if (!updated) {
    throw new Error('Job kirim chat tidak ditemukan.')
  }

  broadcastBackendEvent('chat-sends-updated', { id: updated.id, status: updated.status })
  return mapChatSend(updated)
}

export function retryChatSend(id: string) {
  const row = getChatSendRow(id)
  if (!row) {
    throw new Error('Job kirim chat tidak ditemukan.')
  }
  if (row.status !== 'failed' && row.status !== 'cancelled') {
    throw new Error('Hanya job chat failed/cancelled yang bisa di-retry.')
  }

  const timestamp = nowIso()
  db().prepare(
    `UPDATE recording_chat_sends
     SET status = 'pending',
         attempts = 0,
         error_message = NULL,
         prepared_at = NULL,
         sent_at = NULL,
         updated_at = ?
     WHERE id = ?`,
  ).run(timestamp, id)

  const updated = getChatSendRow(id)
  if (!updated) {
    throw new Error('Job kirim chat tidak ditemukan.')
  }

  broadcastBackendEvent('chat-sends-updated', { id: updated.id, status: updated.status })
  return mapChatSend(updated)
}

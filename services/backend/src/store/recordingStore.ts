import fs from 'node:fs'
import path from 'node:path'

import { DEFAULT_APP_SETTINGS } from '@pakti/shared/defaults'
import type { PackingPayStatus, RecordingMediaType, RecordingStatus, WorkTask } from '@pakti/types'

import { getDb, getDbPath, getPendingRecordingsDir, getUploadsDir, ensureServerStorage } from '../db'
import { broadcastBackendEvent } from '../realtime'
import {
  getBootstrapStatus as getOperatorBootstrapStatus,
} from './operatorStore'
import {
  isMp4Recording as isVideoMp4Recording,
  runFfmpegMp4TranscodeToFile as runVideoFfmpegMp4TranscodeToFile,
  runFfmpegWatermarkToFile as runVideoFfmpegWatermarkToFile,
} from '../video/watermark'
import {
  runFfmpegShareMp4Transcode as runVideoFfmpegShareMp4Transcode,
  SHOPEE_VIDEO_LIMIT_BYTES,
} from '../video/shareVideo'
import { calculatePackingPayForOrder } from './packingPayRuleStore'
import { assertActivePackingSession } from './packingSessionStore'
import { getShopeeOrderByResi } from './orderStore'

type RecordingRow = {
  id: string
  resi_number: string
  task_type: WorkTask
  operator_name: string | null
  operator_code: string | null
  file_name: string
  file_path: string
  media_type: RecordingMediaType
  mime_type: string | null
  file_size_bytes: number | null
  record_date: string
  start_time: string
  end_time: string | null
  duration_seconds: number | null
  status: RecordingStatus
  note: string | null
  packing_session_id: string | null
  packer_operator_name: string | null
  packer_operator_code: string | null
  order_number: string | null
  shipping_channel: string | null
  order_snapshot: string | null
  packing_pay_amount: number | null
  packing_pay_status: PackingPayStatus | null
  packing_pay_breakdown: string | null
  packing_pay_rule_id: string | null
  created_at: string
  updated_at: string
  share_file_name?: string
  share_file_path?: string
  share_file_mime_type?: string
  share_file_ready?: boolean
}

type RecordingShareFileInfo = {
  fileName: string
  filePath: string
  mimeType: string
  outputPath: string
  isReady: boolean
}

type PreparedShareFile = {
  fileName: string
  filePath: string
  mimeType: string
}

const shareFilePreparationLocks = new Map<string, Promise<PreparedShareFile>>()

type ScanLogRow = {
  id: string
  resi_number: string
  task_type: WorkTask
  operator_name: string | null
  operator_code: string | null
  scan_time: string
  action: 'start' | 'stop' | 'duplicate' | 'invalid'
  message: string | null
}

type LastErrorRow = {
  message: string
  createdAt: string
}

type RecordingDraftInput = {
  id?: string
  resiNumber: string
  taskType: WorkTask
  operatorName: string
  operatorCode: string
  startedAt?: string
  fileName?: string
  filePath?: string
  fileSizeBytes?: number | null
  status?: RecordingStatus
  note?: string | null
  mediaType?: RecordingMediaType | null
  mimeType?: string | null
  packingSessionId?: string | null
}

const JSON_STATE_KEY = 'current'
const MAX_SCAN_LOGS = 500
let watermarkQueue = Promise.resolve()

function nowIso() {
  return new Date().toISOString()
}

function makeId(prefix: string) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function normalizeTaskType(value: WorkTask | string | undefined | null): WorkTask {
  return value === 'packing' ? 'packing' : 'qc'
}

function normalizeMediaType(value: RecordingMediaType | string | undefined | null): RecordingMediaType {
  return value === 'photo' ? 'photo' : 'video'
}

function recordingSelectFields() {
  return `id, resi_number, task_type, operator_name, operator_code, file_name, file_path, media_type, mime_type,
          file_size_bytes, record_date, start_time, end_time, duration_seconds, status, note,
          packing_session_id, packer_operator_name, packer_operator_code, order_number, shipping_channel,
          order_snapshot, packing_pay_amount, packing_pay_status, packing_pay_breakdown, packing_pay_rule_id, created_at, updated_at`
}

function resolvePackingPay(resiNumber: string) {
  try {
    const order = getShopeeOrderByResi(resiNumber)
    const result = calculatePackingPayForOrder(order)
    const orderSnapshot = order
      ? JSON.stringify({
          shippingChannel: order.shippingChannel ?? null,
          orderNumber: order.orderNumber ?? null,
          buyerUsername: order.buyerUsername ?? null,
          items: order.items ?? [],
        })
      : null
    return {
      amount: result.amount,
      status: 'calculated' as const,
      breakdown: JSON.stringify(result.breakdown),
      ruleId: (result.rule as unknown as { id?: string })?.id ?? null,
      orderSnapshot,
      orderNumber: order?.orderNumber ?? null,
      shippingChannel: order?.shippingChannel ?? null,
    }
  } catch {
    return {
      amount: 1500,
      status: 'needs_review' as const,
      breakdown: JSON.stringify({ ruleName: 'Fallback', payType: 'per_package', amount: 1500, quantity: 1, total: 1500, error: 'pay calculation failed' }),
      ruleId: null,
      orderSnapshot: null,
      orderNumber: null,
      shippingChannel: null,
    }
  }
}

function canStartPackingForResi(resiNumber: string) {
  const row = db()
    .prepare(
      `SELECT COUNT(*) AS count
       FROM recordings
       WHERE resi_number = ?
         AND task_type = 'qc'
         AND status = 'completed'`,
    )
    .get(resiNumber.trim()) as { count: number }

  return (row.count ?? 0) > 0
}

function sanitizeFileSegment(value: string) {
  return value.trim().replace(/[^\w-]+/g, '_') || 'recording'
}

function sanitizeFileName(value: string) {
  const parsed = path.posix.parse(value.trim().replace(/\\/g, '/'))
  const ext = parsed.ext.toLowerCase()
  if (ext === '.mp4' || ext === '.webm' || ext === '.jpg' || ext === '.jpeg' || ext === '.png' || ext === '.webp') return `${sanitizeFileSegment(parsed.name)}${ext}`
  if (ext === '.jpeg') return `${sanitizeFileSegment(parsed.name)}.jpg`
  return `${sanitizeFileSegment(parsed.name)}.webm`
}

function assertSafeRelativeFilePath(value: string) {
  let normalized = value.trim().replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.\/+/, '')

  // Older records stored the server storage prefix in file_path. Keep the
  // database compatible while exposing paths relative to the uploads root.
  for (const prefix of ['services/backend/server-data/uploads/', 'uploads/']) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length)
      break
    }
  }

  if (!normalized) {
    throw new Error('Path file recording wajib diisi.')
  }

  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
    throw new Error('Path file recording harus relatif.')
  }

  if (normalized.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('Path file recording mengandung segment tidak valid.')
  }

  if (/[<>:"|?*\0]/.test(normalized)) {
    throw new Error('Path file recording mengandung karakter tidak valid.')
  }

  return normalized
}

function formatRecordingTimestamp(startedAt: Date) {
  const year = startedAt.getFullYear()
  const month = `${startedAt.getMonth() + 1}`.padStart(2, '0')
  const day = `${startedAt.getDate()}`.padStart(2, '0')
  const hours = `${startedAt.getHours()}`.padStart(2, '0')
  const minutes = `${startedAt.getMinutes()}`.padStart(2, '0')
  const seconds = `${startedAt.getSeconds()}`.padStart(2, '0')
  const milliseconds = `${startedAt.getMilliseconds()}`.padStart(3, '0')

  return `${year}${month}${day}_${hours}${minutes}${seconds}_${milliseconds}`
}

function buildRecordingFileName(resiNumber: string, format: string, taskType: WorkTask, startedAt: Date, mediaType: RecordingMediaType = 'video') {
  const prefix = normalizeTaskType(taskType)
  const timestamp = formatRecordingTimestamp(startedAt)
  if (mediaType === 'photo') return `${prefix}_${sanitizeFileSegment(resiNumber)}_${timestamp}.jpg`
  const extension = format.trim() === 'mp4' ? 'mp4' : 'webm'
  return `${prefix}_${sanitizeFileSegment(resiNumber)}_${timestamp}.${extension}`
}

function db() {
  ensureServerStorage()
  return getDb()
}

function writeJsonRow(table: string, value: unknown) {
  const timestamp = nowIso()
  db().prepare(
    `INSERT INTO ${table} (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(JSON_STATE_KEY, JSON.stringify(value), timestamp)

  return timestamp
}

function removeJsonRow(table: string) {
  db().prepare(`DELETE FROM ${table} WHERE key = ?`).run(JSON_STATE_KEY)
}

export function getHealthSnapshot() {
  const database = db()

  const counts = {
    operatorProfiles: database.prepare('SELECT COUNT(*) AS count FROM operator_profiles').get() as { count: number },
    sessions: database.prepare('SELECT COUNT(*) AS count FROM operator_sessions').get() as { count: number },
    recordings: database.prepare('SELECT COUNT(*) AS count FROM recordings').get() as { count: number },
    scanLogs: database.prepare('SELECT COUNT(*) AS count FROM scan_logs').get() as { count: number },
  }

  return {
    dbPath: getDbPath(),
    uploadDir: getUploadsDir(),
    setupRequired: getOperatorBootstrapStatus().needsSetup,
    counts: {
      operatorProfiles: counts.operatorProfiles.count ?? 0,
      sessions: counts.sessions.count ?? 0,
      recordings: counts.recordings.count ?? 0,
      scanLogs: counts.scanLogs.count ?? 0,
    },
  }
}

export function listRecordings() {
  const rows = db()
    .prepare(
      `SELECT ${recordingSelectFields()}
       FROM recordings
       ORDER BY start_time DESC`,
    )
    .all() as RecordingRow[]

  return rows.map(withRecordingShareFileInfo)
}

export function getRecordingById(id: string) {
  const row = db()
    .prepare(
      `SELECT ${recordingSelectFields()}
       FROM recordings
       WHERE id = ?
       LIMIT 1`,
    )
    .get(id) as RecordingRow | undefined

  return row ? withRecordingShareFileInfo(row) : null
}

export function listRecordingsByResi(resiNumber: string) {
  const normalizedResi = resiNumber.trim()
  if (!normalizedResi) {
    return []
  }

  const rows = db()
    .prepare(
      `SELECT ${recordingSelectFields()}
       FROM recordings
       WHERE resi_number = ?
         AND task_type IN ('qc', 'packing')
       ORDER BY start_time DESC`,
    )
    .all(normalizedResi) as RecordingRow[]

  return rows.map(withRecordingShareFileInfo)
}

export function createRecordingDraft(input: RecordingDraftInput) {
  const id = input.id ?? makeId('recording')
  const startedAt = input.startedAt ? new Date(input.startedAt) : new Date()
  const startTime = startedAt.toISOString()
  const recordDate = startTime.slice(0, 10)
  const taskType = normalizeTaskType(input.taskType)
  if (taskType === 'packing' && !canStartPackingForResi(input.resiNumber)) {
    throw new Error('Packing hanya bisa dimulai setelah QC selesai untuk resi ini.')
  }
  const mediaType = normalizeMediaType(input.mediaType)
  const packingSession = taskType === 'packing'
    ? assertActivePackingSession(input.packingSessionId ?? '')
    : null
  const fileName = input.fileName
    ? sanitizeFileName(input.fileName)
    : buildRecordingFileName(input.resiNumber, DEFAULT_APP_SETTINGS.videoFormat, taskType, startedAt, mediaType)
  const filePath = assertSafeRelativeFilePath(input.filePath ?? path.posix.join(DEFAULT_APP_SETTINGS.videoRootPath, fileName))
  const timestamp = nowIso()

  const mimeType = input.mimeType?.trim() || (mediaType === 'photo' ? 'image/jpeg' : null)
  db().prepare(
      `INSERT INTO recordings (
      id,
      resi_number,
      task_type,
      operator_name,
      operator_code,
      file_name,
      file_path,
      media_type,
      mime_type,
      file_size_bytes,
      record_date,
      start_time,
      end_time,
      duration_seconds,
      status,
      note,
      packing_session_id,
      packer_operator_name,
      packer_operator_code,
      order_number,
      shipping_channel,
      order_snapshot,
      packing_pay_amount,
      packing_pay_status,
      packing_pay_breakdown,
      packing_pay_rule_id,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      resi_number = excluded.resi_number,
      task_type = excluded.task_type,
      operator_name = excluded.operator_name,
      operator_code = excluded.operator_code,
      file_name = excluded.file_name,
      file_path = excluded.file_path,
      media_type = excluded.media_type,
      mime_type = COALESCE(excluded.mime_type, mime_type),
      file_size_bytes = excluded.file_size_bytes,
      record_date = excluded.record_date,
      start_time = excluded.start_time,
      status = excluded.status,
      note = excluded.note,
      packing_session_id = excluded.packing_session_id,
      packer_operator_name = excluded.packer_operator_name,
      packer_operator_code = excluded.packer_operator_code,
      updated_at = excluded.updated_at`,
  ).run(
    id,
    input.resiNumber.trim(),
    taskType,
    input.operatorName.trim() || null,
    input.operatorCode.trim() || null,
    fileName,
    filePath,
    mediaType,
    mimeType,
    input.fileSizeBytes ?? null,
    recordDate,
    startTime,
    null,
    null,
    input.status ?? 'recording',
    input.note ?? null,
    packingSession?.id ?? null,
    packingSession?.packerOperatorName ?? null,
    packingSession?.packerOperatorCode ?? null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    timestamp,
    timestamp,
  )

  broadcastBackendEvent('recordings-updated', { recordingId: id, action: 'draft-created', resiNumber: input.resiNumber.trim() })
  return getRecordingById(id)
}

export function finalizeRecording(
  id: string,
  payload: { fileSizeBytes?: number | null; endTime?: string; note?: string | null },
) {
  const recording = getRecordingById(id)
  if (!recording) {
    throw new Error('Recording tidak ditemukan.')
  }

  const pendingPath = getPendingRecordingPath(id)
  if (fs.existsSync(pendingPath)) {
    return finalizePendingRecording(recording, {
      endTime: payload.endTime,
      note: payload.note ?? null,
    })
  }

  const endTime = payload.endTime ?? nowIso()
  const durationSeconds = Math.max(1, Math.round((new Date(endTime).getTime() - new Date(recording.start_time).getTime()) / 1000))

  const packingPay = recording.task_type === 'packing' ? resolvePackingPay(recording.resi_number) : null
  const packingPayAmount = packingPay?.amount ?? null
  const packingPayStatus = packingPay?.status ?? null
  const packingPayBreakdown = packingPay?.breakdown ?? null
  const packingPayRuleId = packingPay?.ruleId ?? null
  const orderSnapshot = packingPay?.orderSnapshot ?? null
  const orderNumber = packingPay?.orderNumber ?? null
  const shippingChannel = packingPay?.shippingChannel ?? null

  db().prepare(
    `UPDATE recordings
     SET end_time = ?, duration_seconds = ?, file_size_bytes = COALESCE(?, file_size_bytes), status = 'completed', note = COALESCE(?, note),
         packing_pay_amount = COALESCE(?, packing_pay_amount), packing_pay_status = COALESCE(?, packing_pay_status),
         packing_pay_breakdown = COALESCE(?, packing_pay_breakdown), packing_pay_rule_id = COALESCE(?, packing_pay_rule_id),
         order_snapshot = COALESCE(?, order_snapshot), order_number = COALESCE(?, order_number), shipping_channel = COALESCE(?, shipping_channel), updated_at = ?
     WHERE id = ?`,
  ).run(endTime, durationSeconds, payload.fileSizeBytes ?? null, payload.note ?? null, packingPayAmount, packingPayStatus, packingPayBreakdown, packingPayRuleId, orderSnapshot, orderNumber, shippingChannel, nowIso(), id)

  broadcastBackendEvent('recordings-updated', { recordingId: id, action: 'finalized', resiNumber: recording.resi_number })
  const finalized = getRecordingById(id)
  scheduleRecordingWatermark(finalized)
  return finalized
}

export function appendRecordingChunk(id: string, chunk: Buffer) {
  const recording = getRecordingById(id)
  if (!recording) {
    throw new Error('Recording tidak ditemukan.')
  }

  if (recording.status !== 'recording') {
    throw new Error('Recording sudah tidak aktif.')
  }

  return appendBufferToPendingRecording(id, chunk)
}

export function recoverRecordingDraft(id: string) {
  const recording = getRecordingById(id)
  if (!recording) {
    throw new Error('Recording tidak ditemukan.')
  }

  if (recording.status !== 'recording') {
    return recording
  }

  const finalized = finalizePendingRecording(recording, {
    endTime: nowIso(),
    note: 'Rekaman dipulihkan dari chunk sementara server.',
  })

  return finalized
}

function getRecordingShareFileInfo(recording: RecordingRow): RecordingShareFileInfo {
  const fileName = `${sanitizeFileSegment(recording.task_type)}_${sanitizeFileSegment(recording.resi_number)}_${sanitizeFileSegment(recording.id)}.mp4`
  const filePath = path.posix.join('share', fileName)
  const outputPath = path.join(getUploadsDir(), filePath)

  let isReady = false
  if (recording.status === 'completed' && fs.existsSync(outputPath)) {
    const outputStats = fs.statSync(outputPath)
    isReady = outputStats.size > 0 && outputStats.size <= SHOPEE_VIDEO_LIMIT_BYTES
  }

  return {
    fileName,
    filePath,
    mimeType: 'video/mp4',
    outputPath,
    isReady,
  }
}

function withRecordingShareFileInfo(recording: RecordingRow): RecordingRow {
  const shareFile = getRecordingShareFileInfo(recording)
  const filePath = assertSafeRelativeFilePath(recording.file_path)

  return {
    ...recording,
    file_path: filePath,
    share_file_name: shareFile.fileName,
    share_file_path: shareFile.filePath,
    share_file_mime_type: shareFile.mimeType,
    share_file_ready: shareFile.isReady,
  }
}

async function prepareRecordingShareFileInternal(id: string): Promise<PreparedShareFile> {
  const recording = getRecordingById(id)
  if (!recording) {
    throw new Error('Recording tidak ditemukan.')
  }

  if (recording.status !== 'completed') {
    throw new Error('Recording belum selesai.')
  }

  if (recording.media_type === 'photo') {
    const inputPath = getUploadedFilePath(recording)
    if (!fs.existsSync(inputPath)) {
      throw new Error('File foto recording tidak ditemukan.')
    }
    return {
      fileName: recording.file_name,
      filePath: recording.file_path,
      mimeType: recording.mime_type || 'image/jpeg',
    }
  }

  const shareFile = getRecordingShareFileInfo(recording)
  const inputPath = getUploadedFilePath(recording)

  if (!fs.existsSync(inputPath)) {
    if (fs.existsSync(shareFile.outputPath)) {
      const outputSize = fs.statSync(shareFile.outputPath).size
      if (outputSize <= 0 || outputSize > SHOPEE_VIDEO_LIMIT_BYTES) {
        throw new Error('File share tidak valid atau masih lebih dari 25MB.')
      }

      return {
        fileName: shareFile.fileName,
        filePath: shareFile.filePath,
        mimeType: shareFile.mimeType,
      }
    }

    throw new Error('File recording tidak ditemukan.')
  }

  if (!shareFile.isReady) {
    const temporaryOutputPath = `${shareFile.outputPath}.tmp-${process.pid}.mp4`
    try {
      await runVideoFfmpegShareMp4Transcode(recording, inputPath, temporaryOutputPath)
      if (fs.existsSync(shareFile.outputPath)) {
        fs.rmSync(shareFile.outputPath, { force: true })
      }
      fs.renameSync(temporaryOutputPath, shareFile.outputPath)
    } finally {
      if (fs.existsSync(temporaryOutputPath)) {
        fs.rmSync(temporaryOutputPath, { force: true })
      }
    }
    broadcastBackendEvent('recordings-updated', { recordingId: recording.id, action: 'share-file-ready', resiNumber: recording.resi_number })
  }

  return {
    fileName: shareFile.fileName,
    filePath: shareFile.filePath,
    mimeType: shareFile.mimeType,
  }
}

export function prepareRecordingShareFile(id: string) {
  const activePreparation = shareFilePreparationLocks.get(id)
  if (activePreparation) {
    return activePreparation
  }

  const preparation = prepareRecordingShareFileInternal(id).finally(() => {
    if (shareFilePreparationLocks.get(id) === preparation) {
      shareFilePreparationLocks.delete(id)
    }
  })
  shareFilePreparationLocks.set(id, preparation)
  return preparation
}

export function invalidateCompletedRecordingsForResi(resiNumber: string) {
  const normalizedResi = resiNumber.trim()
  if (!normalizedResi) {
    throw new Error('Resi tidak boleh kosong.')
  }

  const timestamp = nowIso()
  const note = 'QC diulang. Rekaman sebelumnya tidak valid dan packing harus diulang.'
  const updatedRows = db()
    .prepare(
      `UPDATE recordings
       SET status = 'error',
           note = ?,
           updated_at = ?
       WHERE resi_number = ?
         AND status = 'completed'
         AND task_type IN ('qc', 'packing')`,
    )
    .run(note, timestamp, normalizedResi)

  if ((updatedRows.changes ?? 0) === 0) {
    throw new Error('Tidak ada QC atau packing selesai yang bisa diulang.')
  }

  broadcastBackendEvent('recordings-updated', { resiNumber: normalizedResi, action: 'repeat-qc' })
  const rows = db()
    .prepare(
      `SELECT ${recordingSelectFields()}
       FROM recordings
       WHERE resi_number = ?
         AND task_type IN ('qc', 'packing')
       ORDER BY start_time DESC`,
    )
    .all(normalizedResi) as RecordingRow[]

  return rows.map(withRecordingShareFileInfo)
}

export function markRecordingError(id: string, message: string) {
  const recording = getRecordingById(id)
  if (!recording) {
    return null
  }

  db().prepare(
    `UPDATE recordings
     SET status = 'error', note = ?, updated_at = ?
     WHERE id = ?`,
  ).run(message, nowIso(), id)

  broadcastBackendEvent('recordings-updated', { recordingId: id, action: 'error', message })
  return getRecordingById(id)
}

export function deleteRecording(id: string) {
  const recording = getRecordingById(id)
  if (!recording) {
    return false
  }

  db().prepare(`DELETE FROM recordings WHERE id = ?`).run(id)
  const absolutePath = getUploadedFilePath(recording)
  if (fs.existsSync(absolutePath)) {
    fs.rmSync(absolutePath, { force: true })
  }
  removePendingRecordingArtifact(id)

  broadcastBackendEvent('recordings-updated', { recordingId: id, action: 'deleted', resiNumber: recording.resi_number })
  return true
}

function getPendingRecordingPath(recordingId: string) {
  return path.join(getPendingRecordingsDir(), `${recordingId}.part`)
}

function ensurePendingRecordingDir() {
  fs.mkdirSync(getPendingRecordingsDir(), { recursive: true })
}

function removePendingRecordingArtifact(recordingId: string) {
  const pendingPath = getPendingRecordingPath(recordingId)
  if (fs.existsSync(pendingPath)) {
    fs.rmSync(pendingPath, { force: true })
  }
}

function appendBufferToPendingRecording(recordingId: string, buffer: Buffer) {
  const pendingPath = getPendingRecordingPath(recordingId)
  ensurePendingRecordingDir()
  fs.appendFileSync(pendingPath, buffer)
  return pendingPath
}

async function runFfmpegMp4Transcode(recording: RecordingRow, inputPath: string) {
  if (!fs.existsSync(inputPath)) {
    return
  }

  const outputPath = `${inputPath}.whatsapp.mp4`
  await runVideoFfmpegMp4TranscodeToFile(recording, inputPath, outputPath)

  fs.copyFileSync(outputPath, inputPath)
  fs.rmSync(outputPath, { force: true })
  const fileStats = fs.statSync(inputPath)
  db()
    .prepare(`UPDATE recordings SET file_size_bytes = ?, note = COALESCE(note, ?), updated_at = ? WHERE id = ?`)
    .run(fileStats.size, 'Video MP4 sudah dikonversi untuk WhatsApp.', nowIso(), recording.id)
  broadcastBackendEvent('recordings-updated', { recordingId: recording.id, action: 'mp4-transcoded', resiNumber: recording.resi_number })
}

async function runFfmpegWatermark(recording: RecordingRow, inputPath: string) {
  if (process.env.PAKTI_DISABLE_VIDEO_WATERMARK === '1') {
    return
  }

  if (isVideoMp4Recording(recording)) {
    return
  }

  if (!fs.existsSync(inputPath)) {
    return
  }

  const outputPath = `${inputPath}.watermarked.webm`
  await runVideoFfmpegWatermarkToFile(recording, inputPath, outputPath)

  fs.copyFileSync(outputPath, inputPath)
  fs.rmSync(outputPath, { force: true })
  const fileStats = fs.statSync(inputPath)
  db()
    .prepare(`UPDATE recordings SET file_size_bytes = ?, note = COALESCE(note, ?), updated_at = ? WHERE id = ?`)
    .run(fileStats.size, 'Video sudah diberi watermark.', nowIso(), recording.id)
  broadcastBackendEvent('recordings-updated', { recordingId: recording.id, action: 'watermarked', resiNumber: recording.resi_number })
}

function scheduleRecordingWatermark(recording: RecordingRow | null) {
  if (!recording || recording.status !== 'completed') {
    return
  }
  if (recording.media_type === 'photo') {
    return
  }

  const completedRecording = recording

  async function prepareShareFile() {
    try {
      await prepareRecordingShareFile(completedRecording.id)
      return true
    } catch (error) {
      reportLastError(error instanceof Error ? error.message : 'Gagal menyiapkan file share recording.')
      return false
    }
  }

  if (isVideoMp4Recording(completedRecording)) {
    const inputPath = getUploadedFilePath(completedRecording)
    watermarkQueue = watermarkQueue.then(async () => {
      let transcodeError: unknown = null
      try {
        await runFfmpegMp4Transcode(completedRecording, inputPath)
      } catch (error) {
        transcodeError = error
        if (fs.existsSync(`${inputPath}.whatsapp.mp4`)) {
          fs.rmSync(`${inputPath}.whatsapp.mp4`, { force: true })
        }
      }

      const sharePrepared = await prepareShareFile()
      if (!sharePrepared && transcodeError) {
        reportLastError(transcodeError instanceof Error ? transcodeError.message : 'Gagal mengonversi MP4 recording.')
      }
    })
    return
  }

  const inputPath = getUploadedFilePath(completedRecording)
  watermarkQueue = watermarkQueue.then(async () => {
    let watermarkError: unknown = null
    try {
      await runFfmpegWatermark(completedRecording, inputPath)
    } catch (error) {
      watermarkError = error
      if (fs.existsSync(`${inputPath}.watermarked.webm`)) {
        fs.rmSync(`${inputPath}.watermarked.webm`, { force: true })
      }
    }

    const sharePrepared = await prepareShareFile()
    if (!sharePrepared && watermarkError) {
      reportLastError(watermarkError instanceof Error ? watermarkError.message : 'Gagal memberi watermark video.')
    }
  })
}

function finalizePendingRecording(
  recording: RecordingRow,
  payload: { endTime?: string; note?: string | null },
) {
  const pendingPath = getPendingRecordingPath(recording.id)
  const finalPath = getUploadedFilePath(recording)

  if (!fs.existsSync(pendingPath)) {
    if (!fs.existsSync(finalPath)) {
      throw new Error('Chunk sementara recording tidak ditemukan.')
    }

    const fileStats = fs.statSync(finalPath)
    const endTime = payload.endTime ?? nowIso()
    const durationSeconds = Math.max(1, Math.round((new Date(endTime).getTime() - new Date(recording.start_time).getTime()) / 1000))
    const packingPay = recording.task_type === 'packing' ? resolvePackingPay(recording.resi_number) : null
    const packingPayAmount = packingPay?.amount ?? null
    const packingPayStatus = packingPay?.status ?? null
    const packingPayBreakdown = packingPay?.breakdown ?? null
    const packingPayRuleId = packingPay?.ruleId ?? null
    const orderSnapshot = packingPay?.orderSnapshot ?? null
    const orderNumber = packingPay?.orderNumber ?? null
    const shippingChannel = packingPay?.shippingChannel ?? null

    db().prepare(
      `UPDATE recordings
       SET end_time = ?, duration_seconds = ?, file_size_bytes = COALESCE(?, file_size_bytes), status = 'completed', note = COALESCE(?, note),
           packing_pay_amount = COALESCE(?, packing_pay_amount), packing_pay_status = COALESCE(?, packing_pay_status),
           packing_pay_breakdown = COALESCE(?, packing_pay_breakdown), packing_pay_rule_id = COALESCE(?, packing_pay_rule_id),
           order_snapshot = COALESCE(?, order_snapshot), order_number = COALESCE(?, order_number), shipping_channel = COALESCE(?, shipping_channel), updated_at = ?
       WHERE id = ?`,
    ).run(endTime, durationSeconds, fileStats.size, payload.note ?? null, packingPayAmount, packingPayStatus, packingPayBreakdown, packingPayRuleId, orderSnapshot, orderNumber, shippingChannel, nowIso(), recording.id)

    const finalized = getRecordingById(recording.id)
    scheduleRecordingWatermark(finalized)
    return finalized
  }

  fs.mkdirSync(path.dirname(finalPath), { recursive: true })
  fs.renameSync(pendingPath, finalPath)
  const fileStats = fs.statSync(finalPath)
  const endTime = payload.endTime ?? nowIso()
  const durationSeconds = Math.max(1, Math.round((new Date(endTime).getTime() - new Date(recording.start_time).getTime()) / 1000))
  const packingPay = recording.task_type === 'packing' ? resolvePackingPay(recording.resi_number) : null
  const packingPayAmount = packingPay?.amount ?? null
  const packingPayStatus = packingPay?.status ?? null
  const packingPayBreakdown = packingPay?.breakdown ?? null
  const packingPayRuleId = packingPay?.ruleId ?? null
  const orderSnapshot = packingPay?.orderSnapshot ?? null
  const orderNumber = packingPay?.orderNumber ?? null
  const shippingChannel = packingPay?.shippingChannel ?? null

  db().prepare(
    `UPDATE recordings
     SET end_time = ?, duration_seconds = ?, file_size_bytes = COALESCE(?, file_size_bytes), status = 'completed', note = COALESCE(?, note),
         packing_pay_amount = COALESCE(?, packing_pay_amount), packing_pay_status = COALESCE(?, packing_pay_status),
         packing_pay_breakdown = COALESCE(?, packing_pay_breakdown), packing_pay_rule_id = COALESCE(?, packing_pay_rule_id),
         order_snapshot = COALESCE(?, order_snapshot), order_number = COALESCE(?, order_number), shipping_channel = COALESCE(?, shipping_channel), updated_at = ?
     WHERE id = ?`,
  ).run(endTime, durationSeconds, fileStats.size, payload.note ?? null, packingPayAmount, packingPayStatus, packingPayBreakdown, packingPayRuleId, orderSnapshot, orderNumber, shippingChannel, nowIso(), recording.id)

  broadcastBackendEvent('recordings-updated', { recordingId: recording.id, action: 'finalized', resiNumber: recording.resi_number })
  const finalized = getRecordingById(recording.id)
  scheduleRecordingWatermark(finalized)
  return finalized
}

function clearUploadArtifacts() {
  for (const dir of [getUploadsDir(), getPendingRecordingsDir()]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
      continue
    }

    for (const entry of fs.readdirSync(dir)) {
      fs.rmSync(path.join(dir, entry), { recursive: true, force: true })
    }

    fs.mkdirSync(dir, { recursive: true })
  }
}

export function listScanLogs() {
  const rows = db()
    .prepare(
      `SELECT id, resi_number, task_type, operator_name, operator_code, scan_time, action, message
       FROM scan_logs
       ORDER BY scan_time DESC
       LIMIT ${MAX_SCAN_LOGS}`,
    )
    .all() as ScanLogRow[]

  return rows
}

export function createScanLog(input: {
  resiNumber: string
  taskType: WorkTask
  action: ScanLogRow['action']
  message?: string | null
  operatorName?: string | null
  operatorCode?: string | null
}) {
  const row: ScanLogRow = {
    id: makeId('scanlog'),
    resi_number: input.resiNumber.trim(),
    task_type: normalizeTaskType(input.taskType),
    operator_name: input.operatorName?.trim() || null,
    operator_code: input.operatorCode?.trim() || null,
    scan_time: nowIso(),
    action: input.action,
    message: input.message?.trim() || null,
  }

  db().prepare(
      `INSERT INTO scan_logs (id, resi_number, task_type, operator_name, operator_code, scan_time, action, message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(row.id, row.resi_number, row.task_type, row.operator_name, row.operator_code, row.scan_time, row.action, row.message)

  const totalRows = db().prepare(`SELECT COUNT(*) AS count FROM scan_logs`).get() as { count: number }
  const extra = Math.max(0, (totalRows.count ?? 0) - MAX_SCAN_LOGS)
  if (extra > 0) {
    db().prepare(
      `DELETE FROM scan_logs
       WHERE id IN (
         SELECT id FROM scan_logs
         ORDER BY scan_time ASC
         LIMIT ?
      )`,
    ).run(extra)
  }

  broadcastBackendEvent('scan-logs-updated', { scanLogId: row.id, resiNumber: row.resi_number, action: row.action })
  return row
}

export function readLastError() {
  const row = db()
    .prepare(`SELECT value FROM last_error WHERE key = ? LIMIT 1`)
    .get(JSON_STATE_KEY) as { value?: string } | undefined

  if (!row?.value) {
    return null
  }

  try {
    return JSON.parse(row.value) as LastErrorRow
  } catch {
    return null
  }
}

export function reportLastError(message: string) {
  const payload: LastErrorRow = {
    message,
    createdAt: nowIso(),
  }

  writeJsonRow('last_error', payload)
  broadcastBackendEvent('last-error-updated', payload)
  return payload
}

export function clearLastError() {
  removeJsonRow('last_error')
  broadcastBackendEvent('last-error-updated', { cleared: true })
}

export function clearScanData() {
  db().prepare(`DELETE FROM recordings`).run()
  db().prepare(`DELETE FROM scan_logs`).run()
  db().prepare(`DELETE FROM last_error`).run()
  clearUploadArtifacts()
  broadcastBackendEvent('recordings-updated', { cleared: true })
  broadcastBackendEvent('scan-logs-updated', { cleared: true })
  broadcastBackendEvent('last-error-updated', { cleared: true })
}

export function clearAllData() {
  db().prepare(`DELETE FROM operator_sessions`).run()
  db().prepare(`DELETE FROM operator_profiles`).run()
  db().prepare(`DELETE FROM recordings`).run()
  db().prepare(`DELETE FROM scan_logs`).run()
  db().prepare(`DELETE FROM system_config`).run()
  db().prepare(`DELETE FROM app_settings`).run()
  db().prepare(`DELETE FROM bootstrap_state`).run()
  db().prepare(`DELETE FROM last_error`).run()
  clearUploadArtifacts()
  broadcastBackendEvent('sessions-updated', { cleared: true })
  broadcastBackendEvent('operators-updated', { cleared: true })
  broadcastBackendEvent('recordings-updated', { cleared: true })
  broadcastBackendEvent('scan-logs-updated', { cleared: true })
  broadcastBackendEvent('system-config-updated', { cleared: true })
  broadcastBackendEvent('settings-updated', { cleared: true })
  broadcastBackendEvent('last-error-updated', { cleared: true })
}

export function getUploadedFilePath(recording: RecordingRow) {
  const uploadsRoot = path.resolve(getUploadsDir())
  const targetPath = path.resolve(uploadsRoot, assertSafeRelativeFilePath(recording.file_path))

  if (targetPath !== uploadsRoot && !targetPath.startsWith(`${uploadsRoot}${path.sep}`)) {
    throw new Error('Path file recording berada di luar folder upload.')
  }

  return targetPath
}

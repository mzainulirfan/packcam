import type { AppSettings, PackingPayStatus, RecordingMediaType, RecordingStatus, RecordingRow, WorkTask } from '@pakti/types'
import { buildRecordingFileName, buildDailyVideoPath } from '@pakti/shared/videoPath'
import {
  createServerRecordingDraftApi,
  deleteServerRecordingApi,
  readServerRecordingsApi,
  appendServerRecordingChunkApi,
  invalidateCompletedRecordingsForResiApi,
  recoverServerRecordingApi,
  finalizeServerRecordingApi,
  reportServerLastErrorApi,
} from '@pakti/api-client'

export type LocalRecordingRecord = {
  id: string
  resiNumber: string
  taskType: WorkTask
  operatorName: string | null
  operatorCode: string | null
  fileName: string
  filePath: string
  mediaType: RecordingMediaType
  fileSizeBytes: number | null
  recordDate: string
  startTime: string
  endTime: string | null
  durationSeconds: number | null
  status: RecordingStatus
  note: string | null
  packingSessionId: string | null
  packerOperatorName: string | null
  packerOperatorCode: string | null
  packingPayAmount: number | null
  packingPayStatus: PackingPayStatus | null
  packingPayBreakdown: unknown | null
  createdAt: string
  updatedAt: string
  blobKey: string | null
  mimeType: string | null
  shareFileName: string | null
  shareFilePath: string | null
  shareFileMimeType: string | null
  shareFileReady: boolean
}

const recordingCache: LocalRecordingRecord[] = []

let cacheLoaded = false
let cachePromise: Promise<void> | null = null

type RecordingDraftInput = {
  id?: string
  resiNumber: string
  taskType: WorkTask
  startedAt: Date
  settings: Pick<AppSettings, 'videoRootPath' | 'videoFormat'>
  operatorName: string
  operatorCode: string
  mimeType?: string | null
  mediaType?: RecordingMediaType | null
  packingSessionId?: string | null
}

type RecordingUpdate = Partial<Omit<LocalRecordingRecord, 'id' | 'createdAt'>>

function nowIso() {
  return new Date().toISOString()
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `recording_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function normalizeTaskType(value: WorkTask | string | undefined | null): WorkTask {
  return value === 'packing' ? 'packing' : 'qc'
}

function isPhotoFileNameShared(name: string | null | undefined) {
  const ext = (name ?? '').toLowerCase().split('.').pop() ?? ''
  return ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'webp'
}
function normalizeServerRecord(record: RecordingRow): LocalRecordingRecord {
  const inferredMediaType = (record.mediaType as string) === 'photo' || isPhotoFileNameShared(record.fileName) || isPhotoFileNameShared(record.filePath) ? 'photo' as const : 'video' as const
  return {
    id: record.id,
    resiNumber: record.resiNumber,
    taskType: normalizeTaskType(record.taskType),
    operatorName: record.operatorName ?? null,
    operatorCode: record.operatorCode ?? null,
    fileName: record.fileName,
    filePath: record.filePath,
    mediaType: inferredMediaType,
    fileSizeBytes: record.fileSizeBytes ?? null,
    recordDate: record.recordDate,
    startTime: record.startTime,
    endTime: record.endTime ?? null,
    durationSeconds: record.durationSeconds ?? null,
    status: record.status,
    note: record.note ?? null,
    packingSessionId: record.packingSessionId ?? null,
    packerOperatorName: record.packerOperatorName ?? null,
    packerOperatorCode: record.packerOperatorCode ?? null,
    packingPayAmount: record.packingPayAmount ?? null,
    packingPayStatus: record.packingPayStatus ?? null,
    packingPayBreakdown: record.packingPayBreakdown ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    blobKey: record.blobKey ?? record.id,
    mimeType: record.mimeType ?? null,
    shareFileName: record.shareFileName ?? null,
    shareFilePath: record.shareFilePath ?? null,
    shareFileMimeType: record.shareFileMimeType ?? null,
    shareFileReady: Boolean(record.shareFileReady),
  }
}

function upsertCache(record: LocalRecordingRecord) {
  const index = recordingCache.findIndex((entry) => entry.id === record.id)

  if (index >= 0) {
    recordingCache[index] = record
    window.dispatchEvent(new CustomEvent('pakti:recordings-updated'))
    return
  }

  recordingCache.push(record)
  window.dispatchEvent(new CustomEvent('pakti:recordings-updated'))
}

function removeFromCache(recordIds: string[]) {
  for (let index = recordingCache.length - 1; index >= 0; index -= 1) {
    if (recordIds.includes(recordingCache[index]?.id ?? '')) {
      recordingCache.splice(index, 1)
    }
  }
}

async function ensureCacheLoaded() {
  if (cacheLoaded) {
    return
  }

  if (!cachePromise) {
    cachePromise = readServerRecordingsApi()
      .then((records) => {
        recordingCache.splice(0, recordingCache.length, ...records.map(normalizeServerRecord))
        cacheLoaded = true
        window.dispatchEvent(new CustomEvent('pakti:recordings-updated'))
      })
      .catch(() => {
        cacheLoaded = true
      })
      .finally(() => {
        cachePromise = null
      })
  }

  await cachePromise
}

export async function refreshRecordingsFromServer() {
  cacheLoaded = false
  await ensureCacheLoaded()
  return listRecordings()
}

function syncCacheFromServer(record: RecordingRow | null) {
  if (!record) {
    return null
  }

  const next = normalizeServerRecord(record)
  upsertCache(next)
  return next
}

function sortByNewest(records: LocalRecordingRecord[]) {
  return [...records].sort((left, right) => right.startTime.localeCompare(left.startTime))
}

export async function hydrateRecordings() {
  await ensureCacheLoaded()
  return listRecordings()
}

export function listRecordings() {
  return sortByNewest(recordingCache)
}

export function findRecordingById(id: string) {
  return recordingCache.find((record) => record.id === id) ?? null
}

export function findLatestRecordingByResi(resiNumber: string) {
  return sortByNewest(recordingCache).find((record) => record.resiNumber === resiNumber) ?? null
}

export function findLatestRecordingByResiAndTask(resiNumber: string, taskType: WorkTask) {
  return sortByNewest(recordingCache).find(
    (record) => record.resiNumber === resiNumber && record.taskType === taskType,
  ) ?? null
}

export function getRecordingTaskProgress(resiNumber: string) {
  const allForResi = sortByNewest(recordingCache).filter((record) => record.resiNumber === resiNumber)
  const qc = allForResi.find((record) => record.taskType === 'qc')
  const packing = allForResi.find((record) => record.taskType === 'packing')

  return {
    done: [
      ...(qc?.status === 'completed' ? ['qc' as const] : []),
      ...(packing?.status === 'completed' ? ['packing' as const] : []),
    ],
    pending: [
      ...(qc?.status !== 'completed' ? ['qc' as const] : []),
      ...(qc?.status === 'completed' && packing?.status !== 'completed' ? ['packing' as const] : []),
    ],
    qc,
    packing,
  }
}

export function createRecordingDraft({
  id = makeId(),
  resiNumber,
  taskType,
  startedAt,
  settings,
  operatorName,
  operatorCode,
  mimeType = null,
  mediaType = 'video',
  packingSessionId = null,
}: RecordingDraftInput) {
  const normalizedMediaType = mediaType === 'photo' ? 'photo' : 'video'
  const startTime = startedAt.toISOString()
  const recordDate = startTime.slice(0, 10)
  const fileName = buildRecordingFileName(resiNumber, settings.videoFormat, taskType, startedAt, normalizedMediaType)
  const filePath = buildDailyVideoPath(settings, resiNumber, taskType, startedAt, normalizedMediaType)
  const timestamp = nowIso()

  const draft: LocalRecordingRecord = {
    id,
    resiNumber,
    taskType,
    operatorName: operatorName.trim() || null,
    operatorCode: operatorCode.trim() || null,
    fileName,
    filePath,
    mediaType: normalizedMediaType,
    fileSizeBytes: null,
    recordDate,
    startTime,
    endTime: null,
    durationSeconds: null,
    status: 'recording',
    note: null,
    packingSessionId,
    packerOperatorName: null,
    packerOperatorCode: null,
    packingPayAmount: null,
    packingPayStatus: null,
    packingPayBreakdown: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    blobKey: null,
    mimeType,
    shareFileName: null,
    shareFilePath: null,
    shareFileMimeType: null,
    shareFileReady: false,
  }

  upsertCache(draft)

  return draft
}

export function updateRecording(id: string, update: RecordingUpdate): LocalRecordingRecord | null {
  const current = findRecordingById(id)
  if (!current) {
    return null
  }

  const nextRecord: LocalRecordingRecord = {
    ...current,
    ...update,
    updatedAt: nowIso(),
  }

  upsertCache(nextRecord)
  return nextRecord
}

export function setRecordingError(id: string, message: string) {
  const next = updateRecording(id, {
    status: 'error',
    note: message,
  })

  if (!next) {
    return null
  }

  void createServerRecordingDraftApi({
    id,
    resiNumber: next.resiNumber,
    taskType: next.taskType,
    operatorName: next.operatorName ?? '',
    operatorCode: next.operatorCode ?? '',
    startedAt: next.startTime,
    fileName: next.fileName,
    filePath: next.filePath,
    fileSizeBytes: next.fileSizeBytes ?? null,
    status: 'error',
    note: message,
    mediaType: next.mediaType,
    mimeType: next.mimeType,
    packingSessionId: next.packingSessionId,
  }).catch(() => undefined)

  return next
}

export function computeDurationSeconds(startTime: string, endTime: string) {
  const start = new Date(startTime).getTime()
  const end = new Date(endTime).getTime()
  return Math.max(1, Math.round((end - start) / 1000))
}

export async function saveRecordingChunk(recordId: string, index: number, chunk: BlobPart) {
  void index
  const blob = chunk instanceof Blob ? chunk : new Blob([chunk])
  await appendServerRecordingChunkApi(recordId, blob)
}

export async function saveRecordingArtifact(
  record: LocalRecordingRecord,
  options: { endTime?: string; note?: string | null } = {},
): Promise<LocalRecordingRecord | null> {
  const finalized = await finalizeServerRecordingApi(record.id, {
    endTime: options.endTime ?? nowIso(),
    note: options.note ?? null,
  })
  const merged = syncCacheFromServer(finalized)
  const finalizedEndTime = finalized.endTime ?? nowIso()

  const fallback = merged ?? {
    ...record,
    fileSizeBytes: finalized.fileSizeBytes ?? record.fileSizeBytes,
    endTime: finalizedEndTime,
    durationSeconds: finalized.durationSeconds ?? computeDurationSeconds(record.startTime, finalizedEndTime),
    status: 'completed',
    blobKey: record.id,
    mimeType: record.mimeType,
    updatedAt: finalized.updatedAt,
  }

  upsertCache(fallback)
  return fallback
}

export async function recoverIncompleteRecordings() {
  await ensureCacheLoaded()
  const recordings = listRecordings().filter((record) => record.status === 'recording')
  const results: Array<{ id: string; message: string; status: 'completed' | 'error' }> = []

  for (const record of recordings) {
    try {
      const recovered = await recoverServerRecordingApi(record.id)
      syncCacheFromServer(recovered)
      results.push({
        id: record.id,
        message: `Rekaman ${record.resiNumber} berhasil dipulihkan.`,
        status: 'completed',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Rekaman tidak selesai dan tidak bisa dipulihkan.'
      setRecordingError(record.id, message)
      void reportServerLastErrorApi(message).catch(() => undefined)
      results.push({
        id: record.id,
        message: `Rekaman ${record.resiNumber} belum bisa dipulihkan dari server.`,
        status: 'error',
      })
      continue
    }
  }

  return results
}

export async function invalidateCompletedRecordingsForResi(resiNumber: string) {
  await ensureCacheLoaded()
  const updatedRecords = await invalidateCompletedRecordingsForResiApi(resiNumber)
  const syncedRecords = updatedRecords
    .map((record) => syncCacheFromServer(record))
    .filter((record): record is LocalRecordingRecord => record !== null)

  return syncedRecords
}

export async function deleteRecordingFiles(records: LocalRecordingRecord[]) {
  await Promise.all(records.map((record) => deleteServerRecordingApi(record.id)))
  removeFromCache(records.map((record) => record.id))
}

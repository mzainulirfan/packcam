import { readCollection, writeCollection } from './storage'
import type { RecordingStatus } from './types'
import { buildRecordingFileName, buildDailyVideoPath } from './videoPath'
import type { AppSettings } from './types'
import { isDesktopRuntime } from '../platform/runtime'
import { readDesktopFile, removeDesktopPath, writeDesktopFile } from '../platform/tauriBridge'

export type LocalRecordingRecord = {
  id: string
  resiNumber: string
  operatorName: string | null
  operatorCode: string | null
  fileName: string
  filePath: string
  fileSizeBytes: number | null
  recordDate: string
  startTime: string
  endTime: string | null
  durationSeconds: number | null
  status: RecordingStatus
  note: string | null
  createdAt: string
  updatedAt: string
  blobKey: string | null
  mimeType: string | null
}

const DB_NAME = 'packcam-recordings'
const DB_VERSION = 2
const BLOB_STORE = 'video_blobs'
const CHUNK_STORE = 'video_chunks'
const COLLECTION_KEY = 'recordings'

type RecordingDraftInput = {
  id?: string
  resiNumber: string
  startedAt: Date
  settings: Pick<AppSettings, 'videoRootPath' | 'videoFormat'>
  operatorName: string
  operatorCode: string
  mimeType?: string | null
}

type RecordingUpdate = Partial<Omit<LocalRecordingRecord, 'id' | 'createdAt'>>

function nowIso() {
  return new Date().toISOString()
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `recording_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function readRecordings() {
  return readCollection<LocalRecordingRecord[]>(COLLECTION_KEY, [])
}

function writeRecordings(records: LocalRecordingRecord[]) {
  writeCollection(COLLECTION_KEY, records)
}

export function listRecordings() {
  return readRecordings().sort((left, right) => right.startTime.localeCompare(left.startTime))
}

export function findRecordingById(id: string) {
  return readRecordings().find((record) => record.id === id) ?? null
}

export function findLatestRecordingByResi(resiNumber: string) {
  return (
    readRecordings()
      .filter((record) => record.resiNumber === resiNumber)
      .sort((left, right) => right.startTime.localeCompare(left.startTime))[0] ?? null
  )
}

export function createRecordingDraft({
  id = makeId(),
  resiNumber,
  startedAt,
  settings,
  operatorName,
  operatorCode,
  mimeType = null,
}: RecordingDraftInput) {
  const startTime = startedAt.toISOString()
  const recordDate = startTime.slice(0, 10)
  const fileName = buildRecordingFileName(resiNumber, settings.videoFormat)
  const filePath = buildDailyVideoPath(settings, recordDate, resiNumber)
  const timestamp = nowIso()

  const draft: LocalRecordingRecord = {
    id,
    resiNumber,
    operatorName: operatorName.trim() || null,
    operatorCode: operatorCode.trim() || null,
    fileName,
    filePath,
    fileSizeBytes: null,
    recordDate,
    startTime,
    endTime: null,
    durationSeconds: null,
    status: 'recording',
    note: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    blobKey: null,
    mimeType,
  }

  const records = readRecordings()
  const nextRecords = [...records.filter((record) => record.id !== draft.id), draft]
  writeRecordings(nextRecords)

  return draft
}

export function updateRecording(id: string, update: RecordingUpdate): LocalRecordingRecord | null {
  const records = readRecordings()
  const updatedAt = nowIso()
  let nextRecord: LocalRecordingRecord | null = null

  const nextRecords = records.map((record) => {
    if (record.id !== id) {
      return record
    }

    const merged: LocalRecordingRecord = {
      ...record,
      ...update,
      updatedAt,
    }

    nextRecord = merged
    return merged
  })

  writeRecordings(nextRecords)
  return nextRecord
}

export function setRecordingError(id: string, message: string) {
  return updateRecording(id, {
    status: 'error',
    note: message,
  })
}

export function computeDurationSeconds(startTime: string, endTime: string) {
  const start = new Date(startTime).getTime()
  const end = new Date(endTime).getTime()
  return Math.max(1, Math.round((end - start) / 1000))
}

function openBlobDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('IndexedDB tidak tersedia.'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error ?? new Error('Gagal membuka IndexedDB.'))

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE, { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains(CHUNK_STORE)) {
        db.createObjectStore(CHUNK_STORE, { keyPath: 'key' })
      }
    }

    request.onsuccess = () => resolve(request.result)
  })
}

export async function saveRecordingBlob(key: string, blob: Blob) {
  const db = await openBlobDatabase()

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(BLOB_STORE, 'readwrite')
    const store = transaction.objectStore(BLOB_STORE)
    const request = store.put({
      key,
      blob,
      createdAt: nowIso(),
    })

    request.onerror = () => reject(request.error ?? new Error('Gagal menyimpan blob.'))
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Gagal transaksi blob.'))
  })

  db.close()
}

export async function saveRecordingChunk(recordId: string, index: number, chunk: BlobPart) {
  const db = await openBlobDatabase()

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(CHUNK_STORE, 'readwrite')
    const store = transaction.objectStore(CHUNK_STORE)
    const request = store.put({
      key: `${recordId}:${index}`,
      recordId,
      index,
      chunk,
      createdAt: nowIso(),
    })

    request.onerror = () => reject(request.error ?? new Error('Gagal menyimpan chunk.'))
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Gagal transaksi chunk.'))
  })

  db.close()
}

export async function loadRecordingChunks(recordId: string) {
  const db = await openBlobDatabase()

  const chunks = await new Promise<Array<{ index: number; chunk: BlobPart }>>((resolve, reject) => {
    const transaction = db.transaction(CHUNK_STORE, 'readonly')
    const store = transaction.objectStore(CHUNK_STORE)
    const request = store.getAll()

    request.onerror = () => reject(request.error ?? new Error('Gagal memuat chunk.'))
    request.onsuccess = () => {
      const records = (request.result as Array<{ recordId: string; index: number; chunk: BlobPart }> | undefined) ?? []
      resolve(
        records
          .filter((entry) => entry.recordId === recordId)
          .sort((left, right) => left.index - right.index)
          .map((entry) => ({ index: entry.index, chunk: entry.chunk })),
      )
    }
  })

  db.close()
  return chunks
}

export async function clearRecordingChunks(recordId: string) {
  const db = await openBlobDatabase()

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(CHUNK_STORE, 'readwrite')
    const store = transaction.objectStore(CHUNK_STORE)
    const request = store.getAll()

    request.onerror = () => reject(request.error ?? new Error('Gagal membersihkan chunk.'))
    request.onsuccess = () => {
      const records = (request.result as Array<{ key: string; recordId: string }> | undefined) ?? []
      for (const entry of records.filter((item) => item.recordId === recordId)) {
        store.delete(entry.key)
      }
    }

    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Gagal transaksi hapus chunk.'))
  })

  db.close()
}

export async function getRecordingBlob(key: string) {
  if (isDesktopRuntime()) {
    const record = readRecordings().find((entry) => entry.blobKey === key || entry.id === key)
    if (record) {
      const desktopBlob = await readDesktopFile(record.filePath)
      if (desktopBlob) {
        return desktopBlob
      }
    }
  }

  const db = await openBlobDatabase()

  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const transaction = db.transaction(BLOB_STORE, 'readonly')
    const store = transaction.objectStore(BLOB_STORE)
    const request = store.get(key)

    request.onerror = () => reject(request.error ?? new Error('Gagal mengambil blob.'))
    request.onsuccess = () => {
      const result = request.result as { blob?: Blob } | undefined
      resolve(result?.blob ?? null)
    }
  })

  db.close()
  return blob
}

export async function saveRecordingArtifact(record: LocalRecordingRecord, blob: Blob): Promise<LocalRecordingRecord | null> {
  const blobKey = record.id
  await saveRecordingBlob(blobKey, blob)
  if (isDesktopRuntime()) {
    const saved = await writeDesktopFile(record.filePath, blob)
    if (!saved) {
      throw new Error(`Gagal menyimpan file video ke ${record.filePath}.`)
    }
  }
  const endTime = nowIso()

  return updateRecording(record.id, {
    status: 'completed',
    endTime,
    durationSeconds: computeDurationSeconds(record.startTime, endTime),
    fileSizeBytes: blob.size,
    blobKey,
    mimeType: blob.type || record.mimeType,
    note: null,
  })
}

export async function recoverIncompleteRecordings() {
  const recordings = listRecordings().filter((record) => record.status === 'recording')
  const results: Array<{ id: string; message: string; status: 'completed' | 'error' }> = []

  for (const record of recordings) {
    const chunks = await loadRecordingChunks(record.id)

    if (!chunks.length) {
      updateRecording(record.id, {
        status: 'error',
        note: 'Rekaman tidak selesai dan tidak ada chunk yang bisa dipulihkan.',
      })
      results.push({
        id: record.id,
        message: `Rekaman ${record.resiNumber} ditandai error karena tidak ada data.`,
        status: 'error',
      })
      continue
    }

    const blob = new Blob(chunks.map((entry) => entry.chunk), {
      type: record.mimeType ?? 'video/webm',
    })

    await saveRecordingArtifact(record, blob)
    await clearRecordingChunks(record.id)
    triggerRecordingDownload(blob, record.fileName)

    results.push({
      id: record.id,
      message: `Rekaman ${record.resiNumber} berhasil dipulihkan.`,
      status: 'completed',
    })
  }

  return results
}

export function triggerRecordingDownload(blob: Blob, fileName: string) {
  if (isDesktopRuntime()) {
    return
  }

  if (typeof document === 'undefined') {
    return
  }

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  link.click()

  window.setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 1000)
}

export async function deleteRecordingFiles(records: LocalRecordingRecord[]) {
  if (!isDesktopRuntime()) {
    return
  }

  for (const record of records) {
    await removeDesktopPath(record.filePath)
  }
}

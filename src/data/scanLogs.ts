import { readCollection, writeCollection } from './storage'

export type ScanLogAction = 'start' | 'stop' | 'duplicate' | 'invalid'

export type ScanLogRecord = {
  id: string
  resiNumber: string
  operatorName: string | null
  operatorCode: string | null
  scanTime: string
  action: ScanLogAction
  message: string | null
}

export type ScanLogActor = {
  operatorName?: string | null
  operatorCode?: string | null
}

const COLLECTION_KEY = 'scanLogs'
const MAX_LOG_ITEMS = 500

function nowIso() {
  return new Date().toISOString()
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `scanlog_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function readLogs() {
  return readCollection<ScanLogRecord[]>(COLLECTION_KEY, [])
}

function writeLogs(records: ScanLogRecord[]) {
  writeCollection(COLLECTION_KEY, records.slice(-MAX_LOG_ITEMS))
}

export function listScanLogs() {
  return readLogs().sort((left, right) => right.scanTime.localeCompare(left.scanTime))
}

export function logScanEvent(
  resiNumber: string,
  action: ScanLogAction,
  message: string | null = null,
  actor: ScanLogActor = {},
) {
  const nextLog: ScanLogRecord = {
    id: makeId(),
    resiNumber,
    operatorName: actor.operatorName?.trim() || null,
    operatorCode: actor.operatorCode?.trim() || null,
    scanTime: nowIso(),
    action,
    message,
  }

  const logs = readLogs()
  writeLogs([...logs, nextLog])
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('packcam:scan-log-updated'))
  }
  return nextLog
}

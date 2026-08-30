import { logServerScanEventApi, readServerScanLogsApi } from '@pakti/api-client'

export type ScanLogAction = 'start' | 'stop' | 'duplicate' | 'invalid'

export type ScanLogRecord = {
  id: string
  resiNumber: string
  taskType: 'qc' | 'packing'
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

export async function listScanLogs() {
  return readServerScanLogsApi()
}

export function logScanEvent(
  resiNumber: string,
  action: ScanLogAction,
  message: string | null = null,
  actor: ScanLogActor = {},
  taskType: 'qc' | 'packing' = 'qc',
) {
  void logServerScanEventApi({
    resiNumber,
    taskType,
    action,
    message,
    operatorName: actor.operatorName?.trim() || null,
    operatorCode: actor.operatorCode?.trim() || null,
  }).catch(() => undefined)

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pakti:scan-logs-updated'))
  }

  return {
    id: crypto.randomUUID(),
    resiNumber,
    taskType,
    operatorName: actor.operatorName?.trim() || null,
    operatorCode: actor.operatorCode?.trim() || null,
    scanTime: new Date().toISOString(),
    action,
    message,
  } satisfies ScanLogRecord
}

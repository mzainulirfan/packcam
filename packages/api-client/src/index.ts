import type { AppSettings, OperatorProfile, OperatorRole, OperatorSession, RecordingRow, ScanLogRow, ShopeeOrder, SystemConfig } from '@pakti/types'

type ApiResponse<T> = {
  ok: boolean
  data?: T
  error?: string
}

export const SESSION_INVALID_EVENT = 'pakti:session-invalid'

const configuredApiBaseUrl = (import.meta.env?.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '')
const API_BASE_URL = configuredApiBaseUrl || (import.meta.env?.PROD ? 'https://api-pakti.zakado.id' : '')

export function getApiBaseUrl() {
  return API_BASE_URL
}

export function buildApiUrl(path: string) {
  if (/^https?:\/\//i.test(path)) {
    return path
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE_URL}${normalizedPath}`
}

export function buildServerFileUrl(filePath: string) {
  if (/^https?:\/\//i.test(filePath)) {
    return filePath
  }

  const normalizedPath = filePath.startsWith('/') ? filePath : `/${filePath}`
  return buildApiUrl(`/files${normalizedPath}`)
}

type ServerRecordingRow = {
  id: string
  resi_number: string
  task_type: 'qc' | 'packing'
  operator_name: string | null
  operator_code: string | null
  file_name: string
  file_path: string
  file_size_bytes: number | null
  record_date: string
  start_time: string
  end_time: string | null
  duration_seconds: number | null
  status: RecordingRow['status']
  note: string | null
  created_at: string
  updated_at: string
  blob_key?: string | null
  mime_type?: string | null
  share_file_name?: string | null
  share_file_path?: string | null
  share_file_mime_type?: string | null
  share_file_ready?: boolean
}

type ServerScanLogRow = {
  id: string
  resi_number: string
  task_type: 'qc' | 'packing'
  operator_name: string | null
  operator_code: string | null
  scan_time: string
  action: ScanLogRow['action']
  message: string | null
}

export type ServerSystemConfigPayload = SystemConfig & {
  updatedAt: string | null
}

export type ServerSettingsPayload = AppSettings & {
  updatedAt: string | null
}

export type BootstrapStatusPayload = {
  needsSetup: boolean
  adminCount: number
  operatorCount: number
}

export type HistoryRecordingsQuery = {
  search?: string
  taskType?: 'all' | 'qc' | 'packing'
  operator?: string
  dateFrom?: string
  dateTo?: string
}

export type HistoryRecordingsPayload = {
  records: RecordingRow[]
  totalRecords: number
}

export type ShopeeOrderImportResult = {
  imported: number
  updated: number
  skipped: number
}

function normalizeRecordingRow(record: ServerRecordingRow): RecordingRow {
  return {
    id: record.id,
    resiNumber: record.resi_number,
    taskType: record.task_type,
    operatorName: record.operator_name,
    operatorCode: record.operator_code,
    fileName: record.file_name,
    filePath: record.file_path,
    fileSizeBytes: record.file_size_bytes,
    recordDate: record.record_date,
    startTime: record.start_time,
    endTime: record.end_time,
    durationSeconds: record.duration_seconds,
    status: record.status,
    note: record.note,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    blobKey: record.blob_key ?? record.id,
    mimeType: record.mime_type ?? null,
    shareFileName: record.share_file_name ?? null,
    shareFilePath: record.share_file_path ?? null,
    shareFileMimeType: record.share_file_mime_type ?? null,
    shareFileReady: Boolean(record.share_file_ready),
  }
}

function normalizeScanLogRow(log: ServerScanLogRow): ScanLogRow {
  return {
    id: log.id,
    resiNumber: log.resi_number,
    taskType: log.task_type,
    operatorName: log.operator_name,
    operatorCode: log.operator_code,
    scanTime: log.scan_time,
    action: log.action,
    message: log.message,
  }
}

async function requestApi<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(buildApiUrl(path), {
    credentials: 'include',
    ...init,
    headers: {
      ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(init.headers ?? {}),
    },
  })

  const bodyText = await response.text()

  if (!bodyText.trim()) {
    throw new Error(`Server belum aktif atau respons kosong untuk ${path}.`)
  }

  let payload: ApiResponse<T>
  try {
    payload = JSON.parse(bodyText) as ApiResponse<T>
  } catch {
    throw new Error(`Server belum aktif atau respons tidak valid untuk ${path}.`)
  }

  if (!response.ok || !payload?.ok) {
    const message = payload?.error || `Request failed: ${response.status}`

    if (response.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(SESSION_INVALID_EVENT))
    }

    throw new Error(message)
  }

  return payload.data as T
}

export function isApiReachable() {
  return requestApi<{ status: string }>('/api/health')
    .then(() => true)
    .catch(() => false)
}

export function getBootstrapStatusApi() {
  return requestApi<BootstrapStatusPayload>('/api/bootstrap')
}

export function bootstrapAdminApi(payload: {
  operatorName: string
  operatorCode: string
  password: string
  fullName?: string | null
}) {
  return requestApi<{ profile: OperatorProfile; session: OperatorSession }>('/api/bootstrap/admin', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function readServerHealthApi() {
  return requestApi<unknown>('/api/health')
}

export function readServerAdminStatusApi() {
  return requestApi<{
    bootstrap: BootstrapStatusPayload
    health: unknown
    counts: {
      operatorProfiles: number
      sessions: number
      recordings: number
      scanLogs: number
    }
    recentRecordings: ServerRecordingRow[]
    recentScanLogs: ServerScanLogRow[]
    lastError: { message: string; createdAt: string } | null
  }>('/api/admin/status')
    .then((status) => ({
      ...status,
      recentRecordings: status.recentRecordings.map(normalizeRecordingRow),
      recentScanLogs: status.recentScanLogs.map(normalizeScanLogRow),
    }))
}

export function readServerSystemConfigApi() {
  return requestApi<ServerSystemConfigPayload>('/api/system-config')
}

export function saveServerSystemConfigApi(config: SystemConfig) {
  return requestApi<ServerSystemConfigPayload>('/api/system-config', {
    method: 'PUT',
    body: JSON.stringify(config),
  })
}

export function readServerSettingsApi() {
  return requestApi<ServerSettingsPayload>('/api/settings')
}

export function saveServerSettingsApi(settings: AppSettings) {
  return requestApi<ServerSettingsPayload>('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  })
}

export function openServerSettingsFolderApi() {
  return requestApi<{ path: string }>('/api/settings/open-folder', {
    method: 'POST',
  })
}

export function readServerOperatorProfilesApi() {
  return requestApi<OperatorProfile[]>('/api/operators')
}

export function upsertServerOperatorProfileApi(profile: {
  operatorName: string
  operatorCode: string
  role?: OperatorRole
  taskType?: 'qc' | 'packing'
  fullName?: string | null
  password?: string | null
}) {
  return requestApi<OperatorProfile>('/api/operators', {
    method: 'POST',
    body: JSON.stringify(profile),
  })
}

export function deleteServerOperatorProfileApi(operatorName: string, operatorCode: string, role: OperatorRole) {
  return requestApi<{ deleted: boolean }>(`/api/operators/${encodeURIComponent(operatorName)}/${encodeURIComponent(operatorCode)}/${role}`, {
    method: 'DELETE',
  })
}

export function resetServerOperatorPasswordApi(
  operatorName: string,
  operatorCode: string,
  role: OperatorRole,
  password: string,
) {
  return requestApi<OperatorProfile>(`/api/operators/${encodeURIComponent(operatorName)}/${encodeURIComponent(operatorCode)}/${role}/password`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  })
}

export function loginServerOperatorApi(payload: {
  operatorName: string
  operatorCode?: string
  password: string
  role?: OperatorRole
}) {
  return requestApi<{ session: OperatorSession; profile: OperatorProfile }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function logoutServerOperatorApi() {
  return requestApi<{ loggedOut: boolean }>('/api/auth/logout', {
    method: 'POST',
  })
}

export function readServerSessionApi() {
  return requestApi<{ session: OperatorSession | null }>('/api/session')
}

export function updateServerSessionTaskApi(taskType: 'qc' | 'packing') {
  return requestApi<{ session: OperatorSession }>('/api/session/task', {
    method: 'PUT',
    body: JSON.stringify({ taskType }),
  })
}

export function readServerRecordingsApi() {
  return requestApi<ServerRecordingRow[]>('/api/recordings')
    .then((records) => records.map(normalizeRecordingRow))
}

export function readServerHistoryRecordingsApi(query: HistoryRecordingsQuery = {}) {
  const params = new URLSearchParams()

  if (query.search?.trim()) params.set('search', query.search.trim())
  if (query.taskType && query.taskType !== 'all') params.set('taskType', query.taskType)
  if (query.operator?.trim() && query.operator !== 'all') params.set('operator', query.operator.trim())
  if (query.dateFrom?.trim()) params.set('dateFrom', query.dateFrom.trim())
  if (query.dateTo?.trim()) params.set('dateTo', query.dateTo.trim())

  const suffix = params.toString() ? `?${params.toString()}` : ''

  return requestApi<{ records: ServerRecordingRow[]; totalRecords: number }>(`/api/history/recordings${suffix}`)
    .then((payload) => ({
      records: payload.records.map(normalizeRecordingRow),
      totalRecords: payload.totalRecords,
    }))
}

export function readServerRecordingsByResiApi(resiNumber: string) {
  return requestApi<ServerRecordingRow[]>(`/api/recordings/resi/${encodeURIComponent(resiNumber)}`)
    .then((records) => records.map(normalizeRecordingRow))
}

export function importShopeeOrdersApi(orders: Array<Partial<ShopeeOrder>>, extensionApiKey?: string) {
  return requestApi<ShopeeOrderImportResult>('/api/import/shopee/orders', {
    method: 'POST',
    headers: extensionApiKey ? { 'X-Pakti-Extension-Key': extensionApiKey } : undefined,
    body: JSON.stringify({ orders }),
  })
}

export function readShopeeOrderByResiApi(resiNumber: string) {
  return requestApi<ShopeeOrder>(`/api/orders/by-resi/${encodeURIComponent(resiNumber)}`)
}

export function readShopeeOrderByOrderNumberApi(orderNumber: string) {
  return requestApi<ShopeeOrder>(`/api/orders/by-order/${encodeURIComponent(orderNumber)}`)
}

export function readRecentShopeeOrdersApi(limit = 50) {
  return requestApi<ShopeeOrder[]>(`/api/orders/recent?limit=${encodeURIComponent(String(limit))}`)
}

export function createServerRecordingDraftApi(payload: {
  id?: string
  resiNumber: string
  taskType: 'qc' | 'packing'
  operatorName: string
  operatorCode: string
  startedAt?: string
  fileName?: string
  filePath?: string
  fileSizeBytes?: number | null
  status?: 'recording' | 'completed' | 'error'
  note?: string | null
}) {
  return requestApi<ServerRecordingRow>('/api/recordings', {
    method: 'POST',
    body: JSON.stringify(payload),
  }).then(normalizeRecordingRow)
}

export async function appendServerRecordingChunkApi(recordingId: string, chunk: Blob) {
  const formData = new FormData()
  formData.append('chunk', chunk, `recording-${recordingId}.part`)

  return requestApi<{
    recording: ServerRecordingRow | null
    chunk: { path: string; size: number; mimetype: string }
  }>(`/api/recordings/${encodeURIComponent(recordingId)}/chunks`, {
    method: 'POST',
    body: formData,
  }).then((result) => ({
    ...result,
    recording: result.recording ? normalizeRecordingRow(result.recording) : null,
  }))
}

export function finalizeServerRecordingApi(
  recordingId: string,
  payload: { fileSizeBytes?: number | null; endTime?: string; note?: string | null } = {},
) {
  return requestApi<ServerRecordingRow>(`/api/recordings/${encodeURIComponent(recordingId)}/finalize`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }).then(normalizeRecordingRow)
}

export function prepareServerRecordingShareFileApi(recordingId: string) {
  return requestApi<{ fileName: string; filePath: string; mimeType: string }>(
    `/api/recordings/${encodeURIComponent(recordingId)}/share-file`,
    {
      method: 'POST',
    },
  )
}

export function deleteServerRecordingApi(recordingId: string) {
  return requestApi<{ deleted: boolean }>(`/api/recordings/${encodeURIComponent(recordingId)}`, {
    method: 'DELETE',
  })
}

export function recoverServerRecordingApi(recordingId: string) {
  return requestApi<ServerRecordingRow>(`/api/recordings/${encodeURIComponent(recordingId)}/recover`, {
    method: 'POST',
  }).then(normalizeRecordingRow)
}

export function invalidateCompletedRecordingsForResiApi(resiNumber: string) {
  return requestApi<ServerRecordingRow[]>('/api/recordings/repeat-qc', {
    method: 'POST',
    body: JSON.stringify({ resiNumber }),
  }).then((records) => records.map(normalizeRecordingRow))
}

export function readServerScanLogsApi() {
  return requestApi<ServerScanLogRow[]>('/api/scan-logs')
    .then((logs) => logs.map(normalizeScanLogRow))
}

export function logServerScanEventApi(payload: {
  resiNumber: string
  taskType: 'qc' | 'packing'
  action: ScanLogRow['action']
  message?: string | null
  operatorName?: string | null
  operatorCode?: string | null
}) {
  return requestApi<ServerScanLogRow>('/api/scan-logs', {
    method: 'POST',
    body: JSON.stringify(payload),
  }).then(normalizeScanLogRow)
}

export function readServerLastErrorApi() {
  return requestApi<{ message: string; createdAt: string } | null>('/api/last-error')
}

export function reportServerLastErrorApi(message: string) {
  return requestApi<{ message: string; createdAt: string } | null>('/api/last-error', {
    method: 'POST',
    body: JSON.stringify({ message }),
  })
}

export function clearServerLastErrorApi() {
  return requestApi<{ cleared: boolean }>('/api/last-error', {
    method: 'DELETE',
  })
}

export function clearServerScanDataApi() {
  return requestApi<{ cleared: boolean }>('/api/data/scan', {
    method: 'DELETE',
  })
}

export function clearServerAllDataApi() {
  return requestApi<{ cleared: boolean }>('/api/data/all', {
    method: 'DELETE',
  })
}

export async function blobToBase64(blob: Blob) {
  const buffer = new Uint8Array(await blob.arrayBuffer())
  let binary = ''

  for (let index = 0; index < buffer.length; index += 1) {
    binary += String.fromCharCode(buffer[index] ?? 0)
  }

  return btoa(binary)
}

import type { RecordingRow, WorkTask } from '@pakti/types'

export type HistoryTaskFilter = 'all' | WorkTask
export type HistoryDateFilter = 'all' | 'today' | 'yesterday' | 'week'
export type HistorySortOrder = 'newest' | 'oldest'

export type HistoryGroup = {
  resiNumber: string
  rows: RecordingRow[]
  latestRow: RecordingRow | null
}

export type HistoryEmptyState = {
  tone: 'neutral' | 'warning'
  title: string
  message: string
  detail: string
  taskType?: WorkTask
}

export type RecordingIdentitySummary = {
  actorName: string | null
  actorCode: string | null
  creditedName: string | null
  creditedCode: string | null
  isHistoricalOnBehalf: boolean
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return '-'
  }

  try {
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}

export function formatTask(taskType: WorkTask) {
  return taskType === 'qc' ? 'QC' : 'Packing'
}

export function formatOperatorIdentity(operatorName?: string | null, operatorCode?: string | null) {
  const name = operatorName?.trim() ?? ''
  const code = operatorCode?.trim() ?? ''

  if (name && code) {
    return `${name} (${code})`
  }

  return name || code || 'operator lain'
}

function normalizedIdentityPart(value?: string | null) {
  return value?.trim().toLowerCase() ?? ''
}

function isSameStoredIdentity(
  leftName?: string | null,
  leftCode?: string | null,
  rightName?: string | null,
  rightCode?: string | null,
) {
  const normalizedLeftName = normalizedIdentityPart(leftName)
  const normalizedLeftCode = normalizedIdentityPart(leftCode)
  const normalizedRightName = normalizedIdentityPart(rightName)
  const normalizedRightCode = normalizedIdentityPart(rightCode)

  if (normalizedLeftCode && normalizedRightCode) {
    return normalizedLeftCode === normalizedRightCode
  }

  return Boolean(normalizedLeftName) && normalizedLeftName === normalizedRightName
}

/**
 * `operator*` adalah akun login yang mencatat rekaman. Untuk data packing lama,
 * `packerOperator*` dapat berbeda karena dahulu admin boleh mencatat atas nama
 * petugas lain. Keduanya tetap ditampilkan sebagai audit, tanpa menulis ulang
 * histori tersebut.
 */
export function getRecordingIdentitySummary(record: RecordingRow): RecordingIdentitySummary {
  const actorName = record.operatorName?.trim() || null
  const actorCode = record.operatorCode?.trim() || null
  const hasStoredPacker = record.taskType === 'packing' && Boolean(record.packerOperatorName?.trim() || record.packerOperatorCode?.trim())
  const creditedName = hasStoredPacker ? record.packerOperatorName?.trim() || null : actorName
  const creditedCode = hasStoredPacker ? record.packerOperatorCode?.trim() || null : actorCode

  return {
    actorName,
    actorCode,
    creditedName,
    creditedCode,
    isHistoricalOnBehalf: Boolean(
      hasStoredPacker &&
      !isSameStoredIdentity(actorName, actorCode, creditedName, creditedCode)
    ),
  }
}

/** History "akun saya" mengikuti akun login yang benar-benar mencatat data. */
export function matchesRecordingLoginIdentity(
  record: RecordingRow,
  currentOperatorName: string,
  currentOperatorCode: string,
) {
  const recordOperatorName = normalizedIdentityPart(record.operatorName)
  const recordOperatorCode = normalizedIdentityPart(record.operatorCode)
  const normalizedCurrentName = normalizedIdentityPart(currentOperatorName)
  const normalizedCurrentCode = normalizedIdentityPart(currentOperatorCode)

  return normalizedCurrentCode
    ? recordOperatorCode === normalizedCurrentCode ||
      (recordOperatorName === normalizedCurrentName && recordOperatorCode === '')
    : Boolean(normalizedCurrentName) && recordOperatorName === normalizedCurrentName
}

export function formatStatus(status: RecordingRow['status']) {
  if (status === 'completed') return 'Selesai'
  if (status === 'recording') return 'Rekam'
  return 'Error'
}

export function getShareStatusLabel(record: RecordingRow) {
  if (record.status !== 'completed' || !record.filePath) {
    return 'Belum selesai'
  }

  if (record.mediaType === 'photo') return 'Share siap'

  return record.shareFileReady ? 'Share siap' : 'Menyiapkan share'
}

export function getShareStatusDescription(record: RecordingRow) {
  if (record.status !== 'completed' || !record.filePath) {
    return 'Selesaikan rekaman dulu untuk share.'
  }

  if (record.mediaType === 'photo') return 'File siap dibagikan.'

  return record.shareFileReady
    ? 'File siap dibagikan.'
    : 'File MP4 sedang disiapkan otomatis.'
}

export function getGroupShareStatus(rows: RecordingRow[]) {
  const completedRows = rows.filter((record) => record.status === 'completed' && Boolean(record.filePath))
  if (completedRows.length === 0) {
    return { label: 'Belum selesai', ready: false }
  }

  return completedRows.every((record) => record.mediaType === 'photo' || record.shareFileReady)
    ? { label: 'Share siap', ready: true }
    : { label: 'Menyiapkan share', ready: false }
}

function isPhotoFile(name: string | null | undefined) {
  const ext = (name ?? '').toLowerCase().split('.').pop() ?? ''
  return ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'webp'
}
export function getMediaLabel(record: RecordingRow) {
  const mt = (record as unknown as { mediaType?: string }).mediaType
  if (mt === 'photo') return 'foto'
  if (isPhotoFile((record as unknown as { fileName?: string }).fileName) || isPhotoFile((record as unknown as { filePath?: string }).filePath)) return 'foto'
  return 'video'
}

export function getPayLabel(record: RecordingRow) {
  const pay = record.packingPayAmount
  if (pay == null || record.taskType !== 'packing') return null
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(pay)
}

export function getPayStatusBadge(record: RecordingRow) {
  const status = record.packingPayStatus
  if (status === 'needs_review') return 'needs_review'
  if (status === 'manual_override') return 'override'
  return null
}

export function getPackerLabel(record: RecordingRow) {
  const name = record.packerOperatorName
  const code = record.packerOperatorCode
  if (!name && !code) return null
  return `${name ?? ''}${code ? ` · ${code}` : ''}`.trim()
}

export function getShareStatusClassName(record: RecordingRow) {
  if (record.status !== 'completed' || !record.filePath) {
    return 'rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-surface-soft)] px-2 py-0.5 text-[11px] text-[var(--op-mute)]'
  }

  return record.mediaType === 'photo' || record.shareFileReady
    ? 'rounded-[4px] bg-[var(--op-ink)] px-2 py-0.5 text-[11px] font-medium text-[var(--op-canvas)]'
    : 'rounded-[4px] border border-[var(--op-warning,#ff9f0a)] px-2 py-0.5 text-[11px] text-[var(--op-warning,#ff9f0a)]'
}

export function getGroupShareStatusClassName(ready: boolean) {
  return ready
    ? 'rounded-[4px] bg-[var(--op-ink)] px-2 py-0.5 text-[11px] font-medium text-[var(--op-canvas)]'
    : 'rounded-[4px] border border-[var(--op-warning,#ff9f0a)] px-2 py-0.5 text-[11px] text-[var(--op-warning,#ff9f0a)]'
}

/** Shared Jakarta day boundary for server loading and local date filtering. */
export function getHistorySince(filter: HistoryDateFilter, now = new Date()): string | null {
  if (filter === 'all') return null
  const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const midnight = new Date(`${key}T00:00:00+07:00`)
  const days = filter === 'yesterday' ? 1 : filter === 'week' ? 6 : 0
  return new Date(midnight.getTime() - days * 86400000).toISOString()
}

export function matchesHistoryDateFilter(updatedAt: string, filter: HistoryDateFilter, now = new Date()) {
  if (filter === 'all') return true
  const time = new Date(updatedAt).getTime()
  if (!Number.isFinite(time)) return false
  const start = Date.parse(getHistorySince(filter, now)!)
  const today = Date.parse(getHistorySince('today', now)!)
  const end = filter === 'yesterday' ? today : today + 86400000
  return time >= start && time < end
}

export function filterRecordings(input: {
  recordings: RecordingRow[]
  historyTaskFilter: HistoryTaskFilter
  historyDateFilter: HistoryDateFilter
  normalizedHistoryQuery: string
  queryMatchedResiNumbers?: Set<string>
  historyAllAccounts: boolean
  currentOperatorName: string
  currentOperatorCode: string
}) {
  return input.recordings.filter((record) => {
    const matchesTask = input.historyTaskFilter === 'all' ? true : record.taskType === input.historyTaskFilter
    const matchesDate = matchesHistoryDateFilter(record.updatedAt, input.historyDateFilter)
    const normalizedRecordResi = record.resiNumber.trim().toLowerCase()
    const matchesQuery = input.normalizedHistoryQuery
      ? normalizedRecordResi.includes(input.normalizedHistoryQuery) || (record.orderNumber ?? '').trim().toLowerCase().includes(input.normalizedHistoryQuery) || Boolean(input.queryMatchedResiNumbers?.has(normalizedRecordResi))
      : true
    const matchesAccount = input.historyAllAccounts
      ? true
      : matchesRecordingLoginIdentity(record, input.currentOperatorName, input.currentOperatorCode)

    return matchesTask && matchesDate && matchesQuery && matchesAccount
  })
}

export function groupRecordings(recordings: RecordingRow[], historySortOrder: HistorySortOrder) {
  const groups = new Map<string, RecordingRow[]>()
  const order: string[] = []

  for (const record of recordings) {
    const key = record.resiNumber.trim().toLowerCase()

    if (!groups.has(key)) {
      groups.set(key, [])
      order.push(key)
    }

    groups.get(key)?.push(record)
  }

  return order.map((resiNumber) => {
    const rows = groups.get(resiNumber) ?? []
    const sortedRows = [...rows].sort((a, b) => {
      if (a.taskType !== b.taskType) {
        return a.taskType === 'qc' ? -1 : 1
      }

      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })

    return {
      resiNumber: rows[0]?.resiNumber.trim() ?? resiNumber,
      rows: sortedRows,
      latestRow: [...rows].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] ?? null,
    }
  }).sort((a, b) => {
    const aTime = a.latestRow?.updatedAt ? new Date(a.latestRow.updatedAt).getTime() : 0
    const bTime = b.latestRow?.updatedAt ? new Date(b.latestRow.updatedAt).getTime() : 0
    return historySortOrder === 'newest' ? bTime - aTime : aTime - bTime
  })
}

export function getLatestTaskRecord(rows: RecordingRow[], task: WorkTask) {
  return rows.filter(record => record.taskType === task)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0]
}

export function getDocStatus(group: { rows: RecordingRow[]; resiNumber: string }, allRecordings?: RecordingRow[]) {
  // Use allRecordings for the resi if provided, so filter (task/date) doesn't hide the other task
  const rows = allRecordings
    ? allRecordings.filter((r) => r.resiNumber.trim().toLowerCase() === group.resiNumber.trim().toLowerCase())
    : group.rows
  const qc = getLatestTaskRecord(rows, 'qc')
  const packing = getLatestTaskRecord(rows, 'packing')
  const qcDone = qc?.status === 'completed'
  const packingDone = packing?.status === 'completed'

  if (qcDone && packingDone) return 'lengkap' as const
  if (qcDone || packingDone) return 'belum-lengkap' as const
  return 'kosong' as const
}

export function groupHistoryByDate(groupedRecordings: HistoryGroup[], historyDocStatusFilter: 'all' | 'lengkap' | 'belum-lengkap', allRecordings?: RecordingRow[]) {
  const sections = new Map<string, HistoryGroup[]>()
  const filteredByDocStatus = historyDocStatusFilter === 'all'
    ? groupedRecordings
    : groupedRecordings.filter((group) => historyDocStatusFilter === 'lengkap' ? getDocStatus(group, allRecordings) === 'lengkap' : getDocStatus(group, allRecordings) !== 'lengkap')

  const jakartaKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
  for (const group of filteredByDocStatus) {
    const dateKey = group.latestRow?.updatedAt ? jakartaKey(group.latestRow.updatedAt) : '-'
    if (!sections.has(dateKey)) sections.set(dateKey, [])
    sections.get(dateKey)?.push(group)
  }

  return [...sections.entries()]
}

export function formatSectionDate(dateKey: string) {
  if (dateKey === '-') return ''
  // dateKey is YYYY-MM-DD in Asia/Jakarta
  const jakartaToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const jakartaYesterday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() - 86400000))
  if (dateKey === jakartaToday) return 'Hari ini'
  if (dateKey === jakartaYesterday) return 'Kemarin'
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(Date.UTC(y, (m - 1), d))
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(dt)
}

export function getHistoryEmptyState(input: {
  groupedRecordingsLength: number
  historyQuery: string
  matchingResiRecords: RecordingRow[]
  latestMatchingResiRecord: RecordingRow | null
  historyAllAccounts: boolean
  currentOperatorName: string
  currentOperatorCode: string
}): HistoryEmptyState | null {
  if (input.groupedRecordingsLength > 0) {
    return null
  }

  if (!input.historyQuery) {
    return {
      tone: 'neutral',
      title: 'Belum ada history',
      message: 'Belum ada history untuk akun ini.',
      detail: 'Coba scan resi atau ubah filter untuk melihat data lain.',
    }
  }

  if (input.matchingResiRecords.length === 0) {
    return {
      tone: 'neutral',
      title: 'Tidak ada hasil',
      message: 'Tidak ada resi atau pesanan yang cocok.',
      detail: 'Coba ubah tanggal, filter, atau kata pencarian.',
    }
  }

  const hasCurrentAccountMatch = input.matchingResiRecords.some((record) => {
    return input.historyAllAccounts
      ? true
      : matchesRecordingLoginIdentity(record, input.currentOperatorName, input.currentOperatorCode)
  })

  if (!hasCurrentAccountMatch && !input.historyAllAccounts) {
    const identity = input.latestMatchingResiRecord
      ? getRecordingIdentitySummary(input.latestMatchingResiRecord)
      : null
    return {
      tone: 'warning',
      title: 'Sudah diproses',
      message: `Resi ini sudah diproses oleh ${formatOperatorIdentity(
        identity?.actorName,
        identity?.actorCode,
      )}.`,
      detail: identity?.isHistoricalOnBehalf
        ? `Data packing historis ini tercatat atas nama ${formatOperatorIdentity(identity.creditedName, identity.creditedCode)}. Aktifkan mode semua akun untuk audit.`
        : 'Aktifkan mode semua akun bila ingin melihat riwayat lengkapnya.',
      taskType: input.latestMatchingResiRecord?.taskType,
    }
  }

  return {
    tone: 'neutral',
    title: 'Belum ada hasil',
    message: 'Belum ada history yang cocok dengan filter ini.',
    detail: 'Coba ubah filter task atau pencarian resi.',
  }
}

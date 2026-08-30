import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Download,
  Trash2,
} from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'

import { useOperatorSession } from '../app/operatorSession'
import { navigateTo } from '../app/uiState'
import { setRepeatQcResi } from '../app/repeatQcState'
import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { ModalOverlay } from '../components/ui/ModalOverlay'
import { DialogCloseButton, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { notify } from '../app/notify'
import { buildServerFileUrl, deleteServerRecordingApi, openServerSettingsFolderApi, prepareServerRecordingShareFileApi, prepareShopeeChatSendApi, readRecentShopeeOrdersApi, readServerHistoryRecordingsApi, readShopeeChatSendsByRecordingIdsApi } from '@pakti/api-client'
import type { RecordingChatSend, ShopeeOrder } from '@pakti/types'
import { recordsToCsv, recordsToExcelXml } from '@pakti/shared/exporters'
import type { LocalRecordingRecord } from '@pakti/shared/recordings'
import type { RecordingRow, WorkTask } from '@pakti/types'
import { downloadTextFile } from '@pakti/shared'
import { HistoryDetailDialog } from '../history/HistoryDetailDialog'
import { HistoryFilters, type HistoryTaskFilter } from '../history/HistoryFilters'
import { HistoryRecordingCard } from '../history/HistoryRecordingCard'

type HistoryRecordingGroup = {
  resiNumber: string
  latest: LocalRecordingRecord
  records: LocalRecordingRecord[]
}

type OrderItemLike = {
  id?: string | null
  sku?: string | null
  productName: string
  variationName?: string | null
  quantity: number
}

type HistoryFilterState = {
  searchText: string
  taskFilter: HistoryTaskFilter
  operatorFilter: string
  dateFrom: string
  dateTo: string
}

const PAGE_SIZE = 10
const HISTORY_FILTERS_KEY = 'pakti.historyFilters'

function getDefaultHistoryFilterState(): HistoryFilterState {
  const today = formatDateInput(new Date())

  return {
    searchText: '',
    taskFilter: 'all',
    operatorFilter: 'all',
    dateFrom: today,
    dateTo: today,
  }
}

function readStoredHistoryFilters(): HistoryFilterState {
  if (typeof window === 'undefined') {
    return getDefaultHistoryFilterState()
  }

  const raw = window.sessionStorage.getItem(HISTORY_FILTERS_KEY)
  if (!raw) {
    return getDefaultHistoryFilterState()
  }

  try {
    const parsed = JSON.parse(raw) as Partial<HistoryFilterState> | null

    if (!parsed || typeof parsed !== 'object') {
      return getDefaultHistoryFilterState()
    }

    return {
      searchText: typeof parsed.searchText === 'string' ? parsed.searchText : '',
      taskFilter: parsed.taskFilter === 'qc' || parsed.taskFilter === 'packing' ? parsed.taskFilter : 'all',
      operatorFilter: typeof parsed.operatorFilter === 'string' ? parsed.operatorFilter : 'all',
      dateFrom: typeof parsed.dateFrom === 'string' ? parsed.dateFrom : '',
      dateTo: typeof parsed.dateTo === 'string' ? parsed.dateTo : '',
    }
  } catch {
    return getDefaultHistoryFilterState()
  }
}

function writeStoredHistoryFilters(state: HistoryFilterState) {
  if (typeof window === 'undefined') {
    return
  }

  window.sessionStorage.setItem(HISTORY_FILTERS_KEY, JSON.stringify(state))
}

export function HistoryPage() {
  const operatorSession = useOperatorSession()
  const isAdmin = operatorSession?.role === 'admin'
  const currentOperatorName = operatorSession?.operatorName ?? ''
  const currentOperatorCode = operatorSession?.operatorCode ?? ''
  const initialHistoryFilters = useMemo(() => readStoredHistoryFilters(), [])
  const [searchText, setSearchText] = useState(initialHistoryFilters.searchText)
  const [taskFilter, setTaskFilter] = useState<HistoryTaskFilter>(initialHistoryFilters.taskFilter)
  const [operatorFilter, setOperatorFilter] = useState(initialHistoryFilters.operatorFilter)
  const [dateFrom, setDateFrom] = useState(initialHistoryFilters.dateFrom)
  const [dateTo, setDateTo] = useState(initialHistoryFilters.dateTo)
  const [isExportOpen, setIsExportOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [previewTarget, setPreviewTarget] = useState<LocalRecordingRecord | null>(null)
  const [dualPreviewTarget, setDualPreviewTarget] = useState<HistoryRecordingGroup | null>(null)
  const [downloadingRecordId, setDownloadingRecordId] = useState<string | null>(null)
  const [preparingChatSendId, setPreparingChatSendId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<LocalRecordingRecord | null>(null)
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null)
  const [recordings, setRecordings] = useState<LocalRecordingRecord[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const [isRefreshingHistory, setIsRefreshingHistory] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [historyReloadKey, setHistoryReloadKey] = useState(0)
  const [packingSessionFilter, setPackingSessionFilter] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      return window.sessionStorage.getItem('pakti.historyPackingSessionId')
    } catch {
      return null
    }
  })
  const [chatSendByRecordingId, setChatSendByRecordingId] = useState<Map<string, RecordingChatSend>>(new Map())
  const [shopeeOrderByResi, setShopeeOrderByResi] = useState<Map<string, ShopeeOrder>>(new Map())

  useEffect(() => {
    let cancelled = false
    void readRecentShopeeOrdersApi(500)
      .then((orders) => {
        if (cancelled) return
        const map = new Map<string, ShopeeOrder>()
        for (const order of orders) {
          if (order.trackingNumber) map.set(order.trackingNumber.trim().toLowerCase(), order)
        }
        setShopeeOrderByResi(map)
      })
      .catch(() => {
        if (!cancelled) setShopeeOrderByResi(new Map())
      })
    return () => {
      cancelled = true
    }
  }, [historyReloadKey])

  useEffect(() => {
    if (recordings.length === 0) {
      queueMicrotask(() => setChatSendByRecordingId(new Map()))
      return
    }

    let cancelled = false

    function refreshChatSends() {
      const ids = recordings.map((record) => record.id)
      void readShopeeChatSendsByRecordingIdsApi(ids)
        .then((sends) => {
          if (cancelled) return
          const map = new Map<string, RecordingChatSend>()
          for (const send of sends) {
            map.set(send.recordingId, send)
            for (const record of recordings) {
              if (record.resiNumber.trim().toLowerCase() === send.resiNumber.trim().toLowerCase()) {
                map.set(record.id, send)
              }
            }
          }
          setChatSendByRecordingId(map)
        })
        .catch(() => {
          if (!cancelled) setChatSendByRecordingId(new Map())
        })
    }

    refreshChatSends()

    const fallbackRefreshTimer = window.setTimeout(refreshChatSends, 3000)
    window.addEventListener('pakti:chat-sends-updated', refreshChatSends)

    return () => {
      cancelled = true
      window.clearTimeout(fallbackRefreshTimer)
      window.removeEventListener('pakti:chat-sends-updated', refreshChatSends)
    }
  }, [recordings])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoadingHistory(true)
      setHistoryError(null)

      try {
        const result = await readServerHistoryRecordingsApi({
          search: searchText,
          taskType: taskFilter,
          dateFrom,
          dateTo,
        })

        if (!cancelled) {
          setRecordings(result.records.map(normalizeHistoryRecord))
        }
      } catch (error) {
        if (!cancelled) {
          setRecordings([])
          setHistoryError(error instanceof Error ? error.message : 'History belum bisa dimuat.')
        }
      } finally {
        if (!cancelled) {
          setIsLoadingHistory(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [dateFrom, dateTo, historyReloadKey, searchText, taskFilter])

  useEffect(() => {
    function handleRecordingsUpdated() {
      setIsRefreshingHistory(true)
      void readServerHistoryRecordingsApi({
        search: searchText,
        taskType: taskFilter,
        dateFrom,
        dateTo,
      })
        .then((result) => {
          setRecordings(result.records.map(normalizeHistoryRecord))
          setHistoryError(null)
        })
        .catch((error) => {
          notify.error('Refresh history gagal', error instanceof Error ? error.message : 'Data history belum bisa diperbarui.')
        })
        .finally(() => {
          setIsRefreshingHistory(false)
        })
    }

    window.addEventListener('pakti:recordings-updated', handleRecordingsUpdated)

    return () => {
      window.removeEventListener('pakti:recordings-updated', handleRecordingsUpdated)
    }
  }, [dateFrom, dateTo, searchText, taskFilter])

  useEffect(() => {
    writeStoredHistoryFilters({
      searchText,
      taskFilter,
      operatorFilter,
      dateFrom,
      dateTo,
    })
  }, [dateFrom, dateTo, operatorFilter, searchText, taskFilter])

  useEffect(() => {
    if (packingSessionFilter) {
      try {
        window.sessionStorage.setItem('pakti.historyPackingSessionId', packingSessionFilter)
      } catch (_e) {
        void _e
      }
    } else {
      try {
        window.sessionStorage.removeItem('pakti.historyPackingSessionId')
      } catch (_e) {
        void _e
      }
    }
  }, [packingSessionFilter])

  const operatorOptions = useMemo(() => {
    if (!isAdmin) {
      return []
    }

    const options = new Map<string, string>()

    for (const record of recordings) {
      const key = record.operatorName?.trim() || record.operatorCode?.trim() || ''

      if (!key) {
        continue
      }

      options.set(key, record.operatorName?.trim() || record.operatorCode?.trim() || key)
    }

    return [...options.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label))
  }, [isAdmin, recordings])

  const filteredRecordings = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase()
    const normalizedOperatorName = operatorSession?.operatorName.trim().toLowerCase() ?? ''
    const normalizedSelectedOperator = operatorFilter.trim().toLowerCase()

    return recordings.filter((record) => {
      const matchesSearch =
        !normalizedSearch ||
        record.resiNumber.toLowerCase().includes(normalizedSearch) ||
        record.fileName.toLowerCase().includes(normalizedSearch) ||
        record.filePath.toLowerCase().includes(normalizedSearch) ||
        (record.note?.toLowerCase().includes(normalizedSearch) ?? false) ||
        record.taskType.includes(normalizedSearch) ||
        record.status.includes(normalizedSearch)

      const matchesOperator =
        isAdmin ||
        (record.operatorName?.trim().toLowerCase() ?? '') === normalizedOperatorName
      const matchesAdminOperator =
        !isAdmin ||
        operatorFilter === 'all' ||
        (record.operatorName?.trim().toLowerCase() || record.operatorCode?.trim().toLowerCase() || '') ===
          normalizedSelectedOperator

      const matchesTask = taskFilter === 'all' || record.taskType === taskFilter
      const matchesDateFrom = !dateFrom || record.recordDate >= dateFrom
      const matchesDateTo = !dateTo || record.recordDate <= dateTo
      const matchesPackingSession = !packingSessionFilter || (record as unknown as { packingSessionId?: string | null }).packingSessionId === packingSessionFilter

      return (
        matchesSearch &&
        matchesOperator &&
        matchesAdminOperator &&
        matchesTask &&
        matchesDateFrom &&
        matchesDateTo &&
        matchesPackingSession
      )
    })
  }, [
    dateFrom,
    dateTo,
    isAdmin,
    operatorFilter,
    operatorSession?.operatorName,
    packingSessionFilter,
    recordings,
    searchText,
    taskFilter,
  ])

  const groupedRecordings = useMemo(() => groupRecordingsByResi(filteredRecordings), [filteredRecordings])

  const totalPages = Math.max(1, Math.ceil(groupedRecordings.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageItems = groupedRecordings.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const selectedRecord = useMemo(() => {
    return filteredRecordings.find((record) => record.id === selectedId) ?? pageItems[0]?.latest ?? null
  }, [filteredRecordings, pageItems, selectedId])

  const selectedGroup = useMemo(() => {
    if (!selectedRecord) {
      return null
    }

    return getGroupByResi(filteredRecordings, selectedRecord.resiNumber) ?? null
  }, [filteredRecordings, selectedRecord])

  const [detailHistoryTab, setDetailHistoryTab] = useState<'qc' | 'packing'>('qc')
  const previewUrl = previewTarget ? buildServerFileUrl(previewTarget.filePath) : null
  const previewMessage = previewTarget ? `Preview siap untuk ${previewTarget.resiNumber}.` : 'Pilih rekaman untuk preview.'
  const visibleChatSendByRecordingId = recordings.length === 0
    ? new Map<string, RecordingChatSend>()
    : chatSendByRecordingId

  const exportSummaryLabel = `${filteredRecordings.length} rekaman / ${groupedRecordings.length} resi`
  const historyMetrics = useMemo(() => {
    const completed = groupedRecordings.filter((group) => getGroupStatus(group) === 'completed').length
    const incomplete = groupedRecordings.length - completed

    return { completed, incomplete }
  }, [groupedRecordings])
  const hasActiveFilters = Boolean(searchText.trim() || taskFilter !== 'all' || operatorFilter !== 'all' || dateFrom || dateTo)
  const selectedShopeeOrder = selectedRecord ? shopeeOrderByResi.get(selectedRecord.resiNumber.trim().toLowerCase()) ?? null : null
  const selectedChatSend = selectedRecord ? visibleChatSendByRecordingId.get(selectedRecord.id) ?? null : null
  const selectedChatActionLabel = preparingChatSendId === selectedRecord?.id
    ? '[Menyiapkan...]'
    : selectedChatSend?.status === 'sent'
      ? '[Sudah terkirim]'
      : selectedChatSend?.status === 'prepared'
        ? '[Buka Shopee Chat]'
        : selectedChatSend?.status === 'pending'
          ? '[Antri kirim]'
          : selectedChatSend?.status === 'failed' || selectedChatSend?.status === 'cancelled'
            ? '[Siapkan ulang]'
            : '[Shopee Chat]'
  const selectedChatActionDescription = selectedRecord?.status !== 'completed'
    ? 'Hanya untuk rekaman selesai'
    : selectedChatSend?.status === 'sent'
      ? `Terkirim ke ${selectedChatSend.buyerUsername}`
      : selectedChatSend?.status === 'prepared'
        ? `Siap untuk ${selectedChatSend.buyerUsername}`
        : selectedChatSend?.status === 'pending'
          ? `Menunggu dikirim ke ${selectedChatSend.buyerUsername}`
          : selectedChatSend?.status === 'failed' || selectedChatSend?.status === 'cancelled'
            ? 'Job sebelumnya gagal/batal'
            : 'Siapkan pesan ke pembeli'
  const disableSelectedChatAction = preparingChatSendId === selectedRecord?.id || selectedRecord?.status !== 'completed' || selectedChatSend?.status === 'sent' || selectedChatSend?.status === 'pending'

  function handleTaskChange(nextFilter: HistoryTaskFilter) {
    setTaskFilter(nextFilter)
    setPage(1)
  }

  function handleOperatorChange(value: string) {
    setOperatorFilter(value)
    setPage(1)
  }

  function handleTextChange(value: string) {
    setSearchText(value)
    if (value.trim()) {
      setDateFrom('')
      setDateTo('')
    } else {
      const today = formatDateInput(new Date())
      setDateFrom(today)
      setDateTo(today)
    }
    setPage(1)
  }

  function handleDateChange(kind: 'from' | 'to', value: string) {
    if (kind === 'from') {
      setDateFrom(value)
    } else {
      setDateTo(value)
    }
    setPage(1)
  }

  function clearFilters() {
    const defaultHistoryFilterState = getDefaultHistoryFilterState()
    setSearchText(defaultHistoryFilterState.searchText)
    setTaskFilter(defaultHistoryFilterState.taskFilter)
    setOperatorFilter(defaultHistoryFilterState.operatorFilter)
    setDateFrom(defaultHistoryFilterState.dateFrom)
    setDateTo(defaultHistoryFilterState.dateTo)
    setPackingSessionFilter(null)
    setPage(1)
  }

  function handleExportCsv() {
    const csv = recordsToCsv(filteredRecordings)
    downloadTextFile(
      `pakti-recordings-${formatDateForExport(new Date())}.csv`,
      csv,
      'text/csv;charset=utf-8',
    )
    notify.save('Export CSV berhasil', `${filteredRecordings.length} rekaman siap diunduh.`)
  }

  function handleExportExcel() {
    const xml = recordsToExcelXml(filteredRecordings)
    downloadTextFile(
      `pakti-recordings-${formatDateForExport(new Date())}.xls`,
      xml,
      'application/vnd.ms-excel',
    )
    notify.save('Export Excel berhasil', `${filteredRecordings.length} rekaman siap diunduh.`)
  }

  async function handleOpenVideoFolder() {
    try {
      const result = await openServerSettingsFolderApi()
      void result.path
    } catch (error) {
      void error
    }
  }

  function handleDownloadPreview() {
    if (!previewTarget) {
      return
    }

    void handleDownloadRecord(previewTarget)
  }

  async function handleDownloadRecord(record: LocalRecordingRecord) {
    if (downloadingRecordId) {
      return
    }

    try {
      setDownloadingRecordId(record.id)
      if ((record as unknown as { mediaType?: string }).mediaType === 'photo') {
        const link = document.createElement('a')
        link.href = buildServerFileUrl(record.filePath)
        link.download = record.fileName
        link.rel = 'noopener'
        link.click()
        return
      }
      const shareFile = record.shareFileReady && record.shareFilePath && record.shareFileName
        ? { fileName: record.shareFileName, filePath: record.shareFilePath }
        : await prepareServerRecordingShareFileApi(record.id)
      const link = document.createElement('a')
      link.href = buildServerFileUrl(shareFile.filePath)
      link.download = shareFile.fileName
      link.rel = 'noopener'
      link.click()
    } catch (error) {
      notify.error(
        'Download video gagal',
        error instanceof Error ? error.message : 'File video belum bisa disiapkan untuk download.',
      )
    } finally {
      setDownloadingRecordId(null)
    }
  }

  async function handlePrepareShopeeChat(record: LocalRecordingRecord) {
    if (preparingChatSendId) {
      return
    }

    try {
      setPreparingChatSendId(record.id)
      let job: RecordingChatSend
      try {
        job = await prepareShopeeChatSendApi(record.id)
      } catch (error) {
        const message = error instanceof Error ? error.message : ''
        if (!message.includes('Isi username pembeli Shopee')) {
          throw error
        }
        const buyerUsername = window.prompt(`Order ${record.resiNumber} belum ada/username kosong di Pakti. Isi username pembeli Shopee untuk kirim manual:`)?.trim()
        if (!buyerUsername) {
          throw error
        }
        job = await prepareShopeeChatSendApi(record.id, null, { buyerUsername })
      }
      setChatSendByRecordingId((prev) => {
        const next = new Map(prev)
        next.set(job.recordingId, job)
        next.set(record.id, job)
        return next
      })
      notify.save(
        'Job Shopee Chat siap',
        `Job untuk ${job.buyerUsername} (${job.resiNumber}) siap. Shopee Webchat dibuka — cek tab Webchat yang sudah ada, tidak perlu klik extension lagi (otomatis isi chat).`,
      )
      window.open('https://seller.shopee.co.id/new-webchat/conversations', 'pakti-shopee-webchat')
    } catch (error) {
      notify.error(
        'Gagal siapkan Shopee Chat',
        error instanceof Error ? error.message : 'Job kirim chat belum bisa dibuat.',
      )
    } finally {
      setPreparingChatSendId(null)
    }
  }

  async function handleConfirmDeleteRecord() {
    if (!deleteTarget || deletingRecordId) {
      return
    }

    try {
      setDeletingRecordId(deleteTarget.id)
      await deleteServerRecordingApi(deleteTarget.id)
      const result = await readServerHistoryRecordingsApi({
        search: searchText,
        taskType: taskFilter,
        dateFrom,
        dateTo,
      })
      const nextRecords = result.records.map(normalizeHistoryRecord)
      setRecordings(nextRecords)

      if (selectedId === deleteTarget.id) {
        setSelectedId(nextRecords[0]?.id ?? null)
      }

      if (previewTarget?.id === deleteTarget.id) {
        closePreview()
      }

      if (dualPreviewTarget?.records.some((record) => record.id === deleteTarget.id)) {
        closeDualPreview()
      }

      notify.save('Recording dihapus', `Resi ${deleteTarget.resiNumber} bisa direkam ulang.`)
      setDeleteTarget(null)
    } catch (error) {
      notify.error(
        'Hapus recording gagal',
        error instanceof Error ? error.message : 'Recording belum bisa dihapus.',
      )
    } finally {
      setDeletingRecordId(null)
    }
  }

  async function handleCopyText(value: string, label: string) {
    const copied = await copyText(value)

    if (copied) {
      const title =
        label === 'Resi'
          ? 'Copy resi berhasil'
          : label === 'Metadata'
            ? 'Copy metadata berhasil'
            : 'Copy path berhasil'

      notify.copy(title, `${label} berhasil disalin ke clipboard.`)
    }
  }

  function openDetail(record: LocalRecordingRecord) {
    setSelectedId(record.id)
    setDetailHistoryTab(record.taskType === 'packing' ? 'packing' : 'qc')
    setIsDetailModalOpen(true)
  }

  function closeDetail() {
    setIsDetailModalOpen(false)
  }

  function closePreview() {
    setPreviewTarget(null)
  }

  function closeDualPreview() {
    setDualPreviewTarget(null)
  }

  return (
    <div className="history-opencode mx-auto grid w-full max-w-[1520px] gap-8 px-0 py-1">
      <div className="grid gap-8">
        <section className="history-opencode__hero flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="history-opencode__section-label">[+] Operasional · Riwayat</div>
            <h1 className="history-opencode__title">History Dokumentasi</h1>
            <p className="history-opencode__lede">Pantau dokumentasi QC dan packing berdasarkan nomor resi dan nomor pesanan. Klik baris untuk detail.</p>
          </div>

          <Button type="button" variant="outline" className="history-opencode__button" onClick={() => setIsExportOpen(true)}>
            [export]
          </Button>
        </section>

        <section className="history-opencode__stats">
          <StatCard marker="[+]" label="Total dokumentasi" value={groupedRecordings.length} unit="paket" />
          <StatCard marker="[x]" label="Lengkap" value={historyMetrics.completed} unit="paket" />
          <StatCard marker="[-]" label="Belum lengkap" value={historyMetrics.incomplete} unit="paket" />
        </section>

        <HistoryFilters
          searchText={searchText}
          taskFilter={taskFilter}
          operatorFilter={operatorFilter}
          dateFrom={dateFrom}
          dateTo={dateTo}
          isAdmin={isAdmin}
          operatorOptions={operatorOptions}
          onSearchTextChange={handleTextChange}
          onTaskFilterChange={handleTaskChange}
          onOperatorFilterChange={handleOperatorChange}
          onDateChange={handleDateChange}
          onClearFilters={clearFilters}
        />

        {packingSessionFilter ? (
          <Alert>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm">
                Filter sesi: <span className="font-mono font-bold">{packingSessionFilter.slice(0, 8)}</span> — hanya rekaman packing untuk sesi ini.
              </p>
              <Button type="button" variant="ghost" size="sm" onClick={() => setPackingSessionFilter(null)}>
                [clear]
              </Button>
            </div>
          </Alert>
        ) : null}

        <div className="grid gap-4 min-w-0">
          <section className="history-opencode__table-section min-w-0 overflow-hidden">
            <div className="history-opencode__table-header flex items-center justify-between">
                <div>
                  <h2>[+] Dokumentasi paket</h2>
                  <p>
                    {isRefreshingHistory ? 'Memperbarui data terbaru...' : 'Klik nomor resi atau baris untuk melihat detail dokumentasi.'}
                  </p>
                </div>
                <div className="hidden items-center gap-2 sm:flex">
                  <span>{groupedRecordings.length} hasil</span>
                </div>
            </div>
            <div className="min-w-0 p-0">
              {isLoadingHistory ? (
                <HistorySkeleton />
              ) : null}

              {historyError ? (
                <div className="mb-4 grid gap-3 rounded-[4px] border border-rose-300 bg-rose-50 p-6 text-sm text-rose-900">
                  <div className="grid gap-1">
                    <strong>History belum bisa dimuat.</strong>
                    <p>{historyError}</p>
                  </div>
                  <Button type="button" variant="outline" className="w-fit border-rose-300 bg-white" onClick={() => setHistoryReloadKey((current) => current + 1)}>
                    Coba lagi
                  </Button>
                </div>
              ) : null}

              <div className="history-opencode__mobile-list md:hidden">
                {!isLoadingHistory && !historyError && pageItems.length ? (
                  pageItems.map((group) => {
                    const isSelected = group.latest.id === selectedRecord?.id
                    const groupChatSend = group.records.map((r) => visibleChatSendByRecordingId.get(r.id)).find(Boolean)
                    return (
                      <article
                        key={group.resiNumber}
                          className={isSelected ? 'history-opencode__mobile-card is-selected' : 'history-opencode__mobile-card'}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <button
                              type="button"
                              className="history-opencode__resi-link truncate text-left"
                              onClick={() => openDetail(group.latest)}
                            >
                              {group.resiNumber}
                            </button>
                            {shopeeOrderByResi.get(group.resiNumber.trim().toLowerCase())?.orderNumber ? (
                              <p className="history-opencode__meta truncate text-[11px] opacity-80">No. Pesanan {shopeeOrderByResi.get(group.resiNumber.trim().toLowerCase())!.orderNumber}</p>
                            ) : null}
                            <p className="history-opencode__meta">{formatCompactDateTime(group.latest.updatedAt)}</p>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <StatusPill status={getGroupStatus(group)} />
                            {groupChatSend ? (
                              <span className="history-opencode__badge">
                                {groupChatSend.status === 'sent' ? '[✓] Terkirim' : groupChatSend.status === 'prepared' ? '[~] Siap kirim' : '[…] Antri'} {groupChatSend.buyerUsername ? `· ${groupChatSend.buyerUsername}` : ''}
                              </span>
                            ) : null}
                            {group.records.some((record) => isRepeatQcInvalidRecord(record)) ? (
                              <span className="history-opencode__badge">
                                [!] Repeat QC
                              </span>
                            ) : null}
                            {group.records.some((r) => r.taskType === 'packing' && (r as unknown as { packingPayAmount?: number | null }).packingPayAmount != null) ? (
                              <span className="history-opencode__badge bg-foreground text-background">[dibayar]</span>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-3">
                          <span className="history-opencode__meta truncate">
                            {formatOperatorForCurrentSession(group.latest.operatorName, group.latest.operatorCode, currentOperatorName, currentOperatorCode)}
                          </span>
                          <div className="flex gap-1">
                            {(() => {
                              const latestChatSend = visibleChatSendByRecordingId.get(group.latest.id)
                              const label =
                                preparingChatSendId === group.latest.id
                                  ? '[...]'
                                  : latestChatSend?.status === 'sent'
                                    ? '[terkirim]'
                                    : latestChatSend?.status === 'prepared'
                                      ? '[siap]'
                                      : latestChatSend?.status === 'pending'
                                        ? '[antri]'
                                        : '[kirim]'
                              const disabled = preparingChatSendId === group.latest.id || group.latest.status !== 'completed' || latestChatSend?.status === 'sent'
                              return (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="history-opencode__button"
                                  disabled={disabled}
                                  onClick={() => void handlePrepareShopeeChat(group.latest)}
                                  title={latestChatSend?.status === 'sent' ? `Sudah terkirim ke ${latestChatSend.buyerUsername}` : 'Kirim video ke pembeli via Shopee Chat'}
                                >
                                  {label}
                                </Button>
                              )
                            })()}
                            <Button type="button" variant="outline" size="sm" className="history-opencode__button" onClick={() => openDetail(group.latest)}>
                              [detail]
                            </Button>
                          </div>
                        </div>

                      </article>
                    )
                  })
                ) : !isLoadingHistory && !historyError ? (
                  <EmptyHistoryState hasActiveFilters={hasActiveFilters} onReset={clearFilters} />
                ) : null}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <div className="overflow-x-auto">
                  <table className="history-opencode__table w-full min-w-[720px] border-collapse">
                    <thead>
                      <tr>
                        <Th>Resi</Th>
                        <Th>Operator</Th>
                        <Th>Status</Th>
                        <Th>Terkirim</Th>
                        <Th className="text-right">Aksi</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {!isLoadingHistory && !historyError && pageItems.length ? (
                        pageItems.map((group) => {
                          const isSelected = group.latest.id === selectedRecord?.id
                          const tableGroupChatSend = group.records.map((r) => visibleChatSendByRecordingId.get(r.id)).find(Boolean)
                          return (
                            <tr
                              key={group.resiNumber}
                              tabIndex={0}
                              onClick={() => openDetail(group.latest)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault()
                                  openDetail(group.latest)
                                }
                              }}
                              className={
                                isSelected
                                  ? 'history-opencode__row is-selected table-row cursor-pointer outline-none'
                                  : 'history-opencode__row table-row cursor-pointer outline-none'
                              }
                            >
                              <Td>
                                <button
                                  type="button"
                                  className="history-opencode__resi-link text-left"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    openDetail(group.latest)
                                  }}
                                >
                                  {group.resiNumber}
                                </button>
                                {shopeeOrderByResi.get(group.resiNumber.trim().toLowerCase())?.orderNumber ? (
                                  <div className="history-opencode__meta text-[11px]">No. Pesanan {shopeeOrderByResi.get(group.resiNumber.trim().toLowerCase())!.orderNumber}</div>
                                ) : null}
                                <div className="history-opencode__meta text-[11px]">{formatCompactDateTime(group.latest.updatedAt)}</div>
                              </Td>
                              <Td>
                                <OperatorCell value={formatOperatorForCurrentSession(group.latest.operatorName, group.latest.operatorCode, currentOperatorName, currentOperatorCode)} />
                              </Td>
                              <Td>
                                <div className="flex flex-col gap-1">
                                  <StatusPill status={getGroupStatus(group)} />
                                  {group.records.some((record) => isRepeatQcInvalidRecord(record)) ? (
                                    <span className="history-opencode__badge text-[11px]">[!] Repeat QC</span>
                                  ) : null}
                                  {group.records.some((r) => r.taskType === 'packing' && (r as unknown as { packingPayAmount?: number | null }).packingPayAmount != null) ? (
                                    <span className="history-opencode__badge bg-foreground text-background text-[11px]">[dibayar]</span>
                                  ) : null}
                                </div>
                              </Td>
                              <Td>
                                {tableGroupChatSend ? (
                                  <span className="history-opencode__badge">
                                    {tableGroupChatSend.status === 'sent' ? '[✓] Terkirim' : tableGroupChatSend.status === 'prepared' ? '[~] Siap kirim' : '[…] Antri'} {tableGroupChatSend.buyerUsername ? `· ${tableGroupChatSend.buyerUsername}` : ''}
                                  </span>
                                ) : (
                                  <span className="history-opencode__meta">—</span>
                                )}
                              </Td>
                              <Td>
                                <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                                  {(() => {
                                    const latestChatSend = visibleChatSendByRecordingId.get(group.latest.id)
                                    const label =
                                      preparingChatSendId === group.latest.id
                                        ? '[...]'
                                        : latestChatSend?.status === 'sent'
                                          ? '[terkirim]'
                                          : latestChatSend?.status === 'prepared'
                                            ? '[siap]'
                                            : latestChatSend?.status === 'pending'
                                              ? '[antri]'
                                              : '[kirim]'
                                    const disabled = preparingChatSendId === group.latest.id || group.latest.status !== 'completed' || latestChatSend?.status === 'sent'
                                    return (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="history-opencode__button"
                                        disabled={disabled}
                                        onClick={() => void handlePrepareShopeeChat(group.latest)}
                                        title={latestChatSend?.status === 'sent' ? `Sudah terkirim ke ${latestChatSend.buyerUsername}` : group.latest.status !== 'completed' ? 'Hanya untuk rekaman selesai' : 'Kirim video ke pembeli via Shopee Chat'}
                                      >
                                        {label}
                                      </Button>
                                    )
                                  })()}
                                </div>
                              </Td>
                            </tr>
                          )
                        })
                      ) : !isLoadingHistory && !historyError ? (
                        <tr>
                            <td colSpan={5} className="p-6">
                              <EmptyHistoryState hasActiveFilters={hasActiveFilters} onReset={clearFilters} />
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>

              {groupedRecordings.length > PAGE_SIZE ? (
                <div className="history-opencode__pagination flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    Menampilkan <span>{(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, groupedRecordings.length)}</span> dari <span>{groupedRecordings.length}</span> dokumentasi
                  </span>
                  <div className="flex flex-wrap items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="history-opencode__button"
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                      disabled={currentPage <= 1}
                    >
                      ‹
                    </Button>
                    {(() => {
                      const pages: (number | '…')[] = []
                      if (totalPages <= 7) {
                        for (let i = 1; i <= totalPages; i++) pages.push(i)
                      } else {
                        pages.push(1)
                        if (currentPage > 3) pages.push('…')
                        for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i)
                        if (currentPage < totalPages - 2) pages.push('…')
                        pages.push(totalPages)
                      }
                      return pages.map((p, idx) =>
                        p === '…' ? (
                          <span key={`e-${idx}`} className="px-1 text-slate-400">
                            …
                          </span>
                        ) : (
                          <Button
                            key={p}
                            type="button"
                            variant={p === currentPage ? 'default' : 'outline'}
                            size="sm"
                            className={p === currentPage ? 'history-opencode__page-number' : 'history-opencode__button min-w-8'}
                            onClick={() => setPage(p as number)}
                          >
                            {p}
                          </Button>
                        ),
                      )
                    })()}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="history-opencode__button"
                      onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                      disabled={currentPage >= totalPages}
                    >
                      ›
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </div>

        {isExportOpen ? (
          <ModalOverlay onClose={() => setIsExportOpen(false)} contentClassName="max-w-lg">
            <div className="grid gap-4">
              <DialogHeader className="flex items-start justify-between gap-4 text-left">
                <div className="grid gap-1">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Export data</p>
                  <DialogTitle className="text-xl">Pilih format export</DialogTitle>
                  <DialogDescription className="text-sm leading-6 text-slate-500">
                    Pilih format file untuk mengunduh history yang sedang tampil.
                  </DialogDescription>
                </div>
                <DialogCloseButton onClick={() => setIsExportOpen(false)} />
              </DialogHeader>

              <Alert variant="info">
                <div className="grid gap-1">
                  <p className="font-medium">Data siap diexport</p>
                  <p className="text-sm leading-6 text-current/80">
                    {exportSummaryLabel}. Export akan mengikuti filter aktif saat ini.
                  </p>
                </div>
              </Alert>

              <div className="grid gap-3 sm:grid-cols-2">
                <Button
                  type="button"
                  className="h-12 justify-between"
                  onClick={() => {
                    handleExportCsv()
                    setIsExportOpen(false)
                  }}
                >
                  <span>Export CSV</span>
                  <Download className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 justify-between border-slate-200"
                  onClick={() => {
                    handleExportExcel()
                    setIsExportOpen(false)
                  }}
                >
                  <span>Export Excel</span>
                  <Download className="size-4" />
                </Button>
              </div>
            </div>
          </ModalOverlay>
        ) : null}

        {selectedRecord ? (
          <HistoryDetailDialog
            open={isDetailModalOpen}
            record={selectedRecord}
            operatorLabel={formatOperatorForCurrentSession(
              selectedRecord.operatorName,
              selectedRecord.operatorCode,
              currentOperatorName,
              currentOperatorCode,
            )}
            onCopyResi={() => void handleCopyText(selectedRecord.resiNumber, 'Resi')}
            onClose={closeDetail}
          >
                <div className="grid gap-4">
                  {selectedGroup?.records.some((record) => isRepeatQcInvalidRecord(record)) ? (
                    <div className="history-opencode__detail-note is-warning">
                      <p>[!] Ada rekaman lama tidak valid karena repeat QC.</p>
                    </div>
                  ) : null}

                  <div className="grid gap-3">
                    <dl className="grid gap-2">
                      {selectedShopeeOrder ? (
                        <OrderDetailRow order={selectedShopeeOrder} />
                      ) : (selectedRecord as unknown as { orderSnapshot?: { shippingChannel?: string; items?: Array<{ productName: string; variationName?: string | null; quantity: number }> } }).orderSnapshot ? (
                        <DetailRow
                          label="Snapshot order"
                          value={(() => {
                            const snap = (selectedRecord as unknown as { orderSnapshot: { shippingChannel?: string; items?: OrderItemLike[] } }).orderSnapshot
                            const items = dedupeOrderItems(snap.items ?? []).map((it) => {
                              const variationName = cleanOrderVariationName(it.variationName)
                              const productName = cleanOrderProductName(it.productName) ?? it.productName
                              return `${productName}${variationName ? ` (${variationName})` : ''} x${it.quantity}`
                            }).join(', ')
                            return `${snap.shippingChannel ?? '-'} · ${items || '-'}`
                          })()}
                        />
                      ) : null}
                      {(selectedRecord as unknown as { packingSessionId?: string | null }).packingSessionId ? (
                        <DetailRow label="Packing session" value={(selectedRecord as unknown as { packingSessionId: string }).packingSessionId} />
                      ) : null}
                      {(selectedRecord as unknown as { packerOperatorName?: string | null }).packerOperatorName ? (
                        <DetailRow label="Packer" value={`${(selectedRecord as unknown as { packerOperatorName: string }).packerOperatorName} · ${(selectedRecord as unknown as { packerOperatorCode?: string | null }).packerOperatorCode ?? '-'}`} />
                      ) : null}
                      {(selectedRecord as unknown as { packingPayAmount?: number | null }).packingPayAmount != null ? (
                        <DetailRow
                          label="Upah"
                          value={`${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format((selectedRecord as unknown as { packingPayAmount: number }).packingPayAmount)} · ${(selectedRecord as unknown as { packingPayStatus?: string | null }).packingPayStatus ?? '-'} · ${(() => { const b = (selectedRecord as unknown as { packingPayBreakdown?: { ruleName?: string; payType?: string; amount?: number; quantity?: number; total?: number } }).packingPayBreakdown; return b ? `${b.ruleName ?? '-'} ${b.payType ?? ''} Rp${b.amount ?? 0} x${b.quantity ?? 1}` : '-'; })()}`}
                        />
                      ) : null}
                      <DetailRow
                        label="Waktu"
                        value={`${formatDateTime(selectedRecord.startTime)} — ${selectedRecord.endTime ? formatDateTime(selectedRecord.endTime) : '-'} (${formatDuration(selectedRecord.durationSeconds)})`}
                      />
                      <DetailRow label="Catatan" value={selectedRecord.note ?? '-'} />
                    </dl>
                  </div>

                  <div className="history-opencode__quick-actions grid gap-3">
                    <div className="history-opencode__quick-actions-head">
                      <p>Aksi cepat</p>
                      <span>Pilih tindakan lanjutan untuk dokumentasi resi ini.</span>
                    </div>
                    <div className="history-opencode__quick-actions-grid">
                      {selectedGroup && canRepeatQc(selectedGroup) ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="history-opencode__button history-opencode__quick-action-button is-primary"
                          onClick={() => {
                            setRepeatQcResi(selectedGroup.resiNumber)
                            navigateTo('scan')
                          }}
                        >
                          <span>[Ulangi QC]</span>
                          <small>Rekam ulang proses QC</small>
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="history-opencode__button history-opencode__quick-action-button"
                        onClick={() => void handleOpenVideoFolder()}
                      >
                        <span>[Buka folder]</span>
                        <small>Lihat lokasi file video</small>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="history-opencode__button history-opencode__quick-action-button"
                        disabled={disableSelectedChatAction}
                        onClick={() => void handlePrepareShopeeChat(selectedRecord)}
                      >
                        <span>{selectedChatActionLabel}</span>
                        <small>{selectedChatActionDescription}</small>
                      </Button>
                    </div>
                  </div>

                </div>

                <div className="grid gap-3">
                  {selectedGroup ? (
                    (() => {
                      const qcRecords = selectedGroup.records.filter((r) => r.taskType === 'qc')
                      const packingRecords = selectedGroup.records.filter((r) => r.taskType === 'packing')
                      const activeRecords = detailHistoryTab === 'qc' ? qcRecords : packingRecords
                      const previewRecord = activeRecords.find((r) => r.id === selectedRecord.id) ?? activeRecords[0] ?? null
                      return (
                        <>
                          <Tabs value={detailHistoryTab} onValueChange={(value) => setDetailHistoryTab(value as 'qc' | 'packing')}>
                            <TabsList variant="line" className="inline-flex gap-6 rounded-none border-0 bg-transparent p-0">
                              <TabsTrigger
                                value="qc"
                                className="rounded-none !border-0 bg-transparent px-3 py-2 font-mono text-[11px] tracking-wide text-[#646262] shadow-none data-active:!bg-transparent data-active:!shadow-none data-[state=active]:bg-transparent data-[state=active]:font-bold data-[state=active]:text-[#201d1d] data-[state=active]:shadow-none"
                              >
                                [{`QC · ${qcRecords.length}`}]
                              </TabsTrigger>
                              <TabsTrigger
                                value="packing"
                                className="rounded-none !border-0 bg-transparent px-3 py-2 font-mono text-[11px] tracking-wide text-[#646262] shadow-none data-active:!bg-transparent data-active:!shadow-none data-[state=active]:bg-transparent data-[state=active]:font-bold data-[state=active]:text-[#201d1d] data-[state=active]:shadow-none"
                              >
                                [{`Packing · ${packingRecords.length}`}]
                              </TabsTrigger>
                            </TabsList>
                            <TabsContent value="qc" className="grid gap-2 pt-2">
                              {qcRecords.length ? (
                                qcRecords.map((record) => {
                                  const invalidRecord = isRepeatQcInvalidRecord(record)
                                  const isSelectedRecord = record.id === selectedRecord.id
                                  return (
                                    <HistoryRecordingCard
                                      key={record.id}
                                      record={record}
                                      isSelected={isSelectedRecord}
                                      invalidRecord={invalidRecord}
                                      chatSend={visibleChatSendByRecordingId.get(record.id) ?? null}
                                      downloadingRecordId={downloadingRecordId}
                                      deletingRecordId={deletingRecordId}
                                      formatDateTime={formatDateTime}
                                      onDownload={handleDownloadRecord}
                                      onDelete={setDeleteTarget}
                                    />
                                  )
                                })
                              ) : (
                                <p className="history-opencode__meta py-2 text-center">Belum ada rekaman QC.</p>
                              )}
                            </TabsContent>
                            <TabsContent value="packing" className="grid gap-2 pt-2">
                              {packingRecords.length ? (
                                packingRecords.map((record) => {
                                  const invalidRecord = isRepeatQcInvalidRecord(record)
                                  const isSelectedRecord = record.id === selectedRecord.id
                                  return (
                                    <HistoryRecordingCard
                                      key={record.id}
                                      record={record}
                                      isSelected={isSelectedRecord}
                                      invalidRecord={invalidRecord}
                                      chatSend={visibleChatSendByRecordingId.get(record.id) ?? null}
                                      downloadingRecordId={downloadingRecordId}
                                      deletingRecordId={deletingRecordId}
                                      formatDateTime={formatDateTime}
                                      onDownload={handleDownloadRecord}
                                      onDelete={setDeleteTarget}
                                    />
                                  )
                                })
                              ) : (
                                <p className="history-opencode__meta py-2 text-center">Belum ada rekaman Packing.</p>
                              )}
                            </TabsContent>
                          </Tabs>
                          {activeRecords.length === 0 ? null : previewRecord?.status === 'completed' && previewRecord.filePath ? (
                            <div className="overflow-hidden rounded border border-[rgba(15,0,0,0.12)] bg-black">
                              {(() => {
                                const ext = (previewRecord.fileName ?? previewRecord.filePath ?? '').toLowerCase().split('.').pop() ?? ''
                                const isPhoto = previewRecord.mediaType === 'photo' || ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'webp'
                                return isPhoto
                              })() ? (
                                <img src={buildServerFileUrl(previewRecord.filePath)} alt={previewRecord.fileName} className="block max-h-[42vh] w-full bg-black object-contain" crossOrigin="use-credentials" />
                              ) : (
                                <video
                                  src={buildServerFileUrl(previewRecord.filePath)}
                                  controls
                                  playsInline
                                  preload="metadata"
                                  className="block max-h-[42vh] w-full bg-black object-contain"
                                  crossOrigin="use-credentials"
                                />
                              )}
                            </div>
                          ) : (
                            <div className="history-opencode__empty-detail text-sm">Preview belum tersedia untuk {detailHistoryTab.toUpperCase()}.</div>
                          )}
                        </>
                      )
                    })()
                  ) : (
                    <div className="history-opencode__empty-detail">Pilih salah satu baris untuk melihat detail data.</div>
                  )}
                </div>
          </HistoryDetailDialog>
        ) : null}

        {previewTarget ? (
          <ModalOverlay
            onClose={closePreview}
            contentClassName="w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] p-0 sm:w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-2rem)] lg:w-[92rem] lg:max-w-[92rem]"
          >
            <div className="history-opencode__detail-modal flex max-h-[92vh] flex-col overflow-hidden">
              <DialogHeader className="history-opencode__detail-header flex items-start justify-between gap-4 text-left">
                <div className="grid gap-1">
                  <p>[+] Video preview</p>
                  <DialogTitle>{previewTarget.resiNumber}</DialogTitle>
                  <DialogDescription>
                    Operator:{' '}
                    {formatOperatorForCurrentSession(
                      previewTarget.operatorName,
                      previewTarget.operatorCode,
                      currentOperatorName,
                      currentOperatorCode,
                    )}
                  </DialogDescription>
                </div>
                <DialogCloseButton onClick={closePreview} />
              </DialogHeader>

              <div className="history-opencode__preview-body grid gap-4">
                {previewUrl ? (
                  <video
                    src={previewUrl}
                    crossOrigin="use-credentials"
                    controls
                    autoPlay
                    playsInline
                    className="history-opencode__video max-h-[74vh] w-full bg-black"
                  />
                ) : (
                  <div className="history-opencode__empty-detail grid gap-2">
                    <strong>[-] Preview belum tersedia.</strong>
                    <p>{previewMessage}</p>
                  </div>
                )}

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button type="button" className="history-opencode__button" onClick={handleDownloadPreview} disabled={!previewUrl || downloadingRecordId !== null}>
                    {previewTarget && downloadingRecordId === previewTarget.id ? '[preparing]' : previewTarget.shareFileReady ? '[download]' : '[preparing video]'}
                  </Button>
                  <Button type="button" variant="outline" className="history-opencode__button" onClick={() => void handleCopyText(previewTarget.filePath, 'Path file')}>
                    [copy-path]
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={deletingRecordId !== null}
                    onClick={() => setDeleteTarget(previewTarget)}
                  >
                    {deletingRecordId === previewTarget.id ? '[deleting]' : '[delete]'}
                  </Button>
                </div>

                <p className="history-opencode__meta">{previewMessage}</p>
              </div>
            </div>
          </ModalOverlay>
        ) : null}

        {dualPreviewTarget ? (
          <ModalOverlay
            onClose={closeDualPreview}
            contentClassName="w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] p-0 sm:w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-2rem)] lg:w-[108rem] lg:max-w-[108rem]"
          >
            <div className="history-opencode__detail-modal flex max-h-[92vh] flex-col overflow-hidden">
              <DialogHeader className="history-opencode__detail-header flex items-start justify-between gap-4 text-left">
                <div className="grid gap-1">
                  <p>[+] Video resi</p>
                  <DialogTitle>{dualPreviewTarget.resiNumber}</DialogTitle>
                  <DialogDescription>
                    Kedua video sudah selesai, tampilkan QC dan packing dalam satu tampilan.
                  </DialogDescription>
                </div>
                <DialogCloseButton onClick={closeDualPreview} />
              </DialogHeader>

              <div className="history-opencode__preview-body flex-1 overflow-y-auto overscroll-contain">
                <div className="grid gap-4 md:grid-cols-2 md:items-start">
                {(['qc', 'packing'] as const).map((taskType) => {
                  const record = dualPreviewTarget.records.find((item) => item.taskType === taskType && item.status === 'completed')

                  if (!record) {
                    return null
                  }

                  return (
                    <div key={taskType} className="history-opencode__video-card grid min-w-0 gap-2">
                      <div className="flex items-center justify-between gap-4">
                        <div className="grid gap-1">
                          <p>[+] Tugas</p>
                          <strong>{taskType}</strong>
                        </div>
                      </div>

                      <video
                        src={buildServerFileUrl(record.filePath)}
                        crossOrigin="use-credentials"
                        controls
                        playsInline
                        className="history-opencode__video h-[34vh] w-full bg-black sm:h-[40vh] md:h-[44vh] lg:h-[62vh]"
                      />

                      <div className="flex flex-col gap-3 sm:flex-row">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="history-opencode__button"
                          onClick={() => void handleCopyText(record.filePath, 'Path file')}
                        >
                          [copy-path]
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={downloadingRecordId !== null}
                          onClick={() => handleDownloadRecord(record)}
                        >
                          {downloadingRecordId === record.id ? '[preparing]' : record.shareFileReady ? '[download]' : '[preparing video]'}
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={deletingRecordId !== null}
                          onClick={() => setDeleteTarget(record)}
                        >
                          {deletingRecordId === record.id ? '[deleting]' : '[delete]'}
                        </Button>
                      </div>

                      <div className="history-opencode__record-meta flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <span className="truncate">File: {record.fileName}</span>
                        <span className="truncate">Durasi: {formatDuration(record.durationSeconds)}</span>
                      </div>
                    </div>
                  )
                })}
                </div>
              </div>
            </div>
          </ModalOverlay>
        ) : null}

        {deleteTarget ? (
          <ModalOverlay
            onClose={() => {
              if (!deletingRecordId) {
                setDeleteTarget(null)
              }
            }}
          >
            <div className="grid gap-4">
              <DialogHeader className="flex items-start justify-between gap-4 text-left">
                <div className="grid gap-1">
                  <p className="text-xs uppercase tracking-[0.2em] text-rose-500">Hapus recording</p>
                  <DialogTitle className="text-xl">Hapus video {deleteTarget.resiNumber}?</DialogTitle>
                  <DialogDescription className="text-sm leading-6 text-slate-500">
                    File video dan metadata recording ini akan dihapus dari server. Setelah dihapus, resi ini bisa direkam ulang.
                  </DialogDescription>
                </div>
                <DialogCloseButton onClick={() => setDeleteTarget(null)} />
              </DialogHeader>

              <div className="grid gap-2 rounded-[4px] border border-rose-300 bg-rose-50 p-4 text-sm leading-6 text-rose-950">
                <strong>{deleteTarget.taskType === 'qc' ? 'QC' : 'Packing'} - {deleteTarget.fileName}</strong>
                <span>{formatDateTime(deleteTarget.startTime)}</span>
              </div>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" disabled={Boolean(deletingRecordId)} onClick={() => setDeleteTarget(null)}>
                  Batal
                </Button>
                <Button type="button" variant="destructive" disabled={Boolean(deletingRecordId)} onClick={() => void handleConfirmDeleteRecord()}>
                  <Trash2 className="size-4" />
                  {deletingRecordId ? '[Menghapus...]' : '[Hapus recording]'}
                </Button>
              </div>
            </div>
          </ModalOverlay>
        ) : null}
      </div>
    </div>
  )
}

function normalizeHistoryRecord(record: RecordingRow): LocalRecordingRecord {
  return {
    ...record,
    blobKey: record.blobKey ?? record.id,
    mimeType: record.mimeType ?? null,
    mediaType: record.mediaType ?? 'video',
    packingSessionId: (record as unknown as { packingSessionId?: string | null }).packingSessionId ?? null,
    packerOperatorName: (record as unknown as { packerOperatorName?: string | null }).packerOperatorName ?? null,
    packerOperatorCode: (record as unknown as { packerOperatorCode?: string | null }).packerOperatorCode ?? null,
    packingPayAmount: (record as unknown as { packingPayAmount?: number | null }).packingPayAmount ?? null,
    packingPayStatus: (record as unknown as { packingPayStatus?: string | null }).packingPayStatus as LocalRecordingRecord['packingPayStatus'] ?? null,
    packingPayBreakdown: (record as unknown as { packingPayBreakdown?: unknown | null }).packingPayBreakdown ?? null,
    ...( { orderSnapshot: (record as unknown as { orderSnapshot?: unknown | null }).orderSnapshot ?? null } as unknown as object ),
    ...( { packingPayRuleId: (record as unknown as { packingPayRuleId?: string | null }).packingPayRuleId ?? null } as unknown as object ),
    ...( { orderNumber: (record as unknown as { orderNumber?: string | null }).orderNumber ?? null } as unknown as object ),
    ...( { shippingChannel: (record as unknown as { shippingChannel?: string | null }).shippingChannel ?? null } as unknown as object ),
    shareFileName: record.shareFileName ?? null,
    shareFilePath: record.shareFilePath ?? null,
    shareFileMimeType: record.shareFileMimeType ?? null,
    shareFileReady: Boolean(record.shareFileReady),
  }
}

function StatCard({
  marker,
  label,
  value,
  unit,
}: {
  marker: string
  label: string
  value: number
  unit: string
}) {
  return (
    <article className="history-opencode__stat">
      <span className="history-opencode__stat-marker">{marker}</span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{unit}</span>
      </div>
    </article>
  )
}

function HistorySkeleton() {
  return (
    <div className="history-opencode__skeleton" aria-label="Memuat history">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="history-opencode__skeleton-row">
          <span>[loading]</span>
          <span>........................................</span>
        </div>
      ))}
    </div>
  )
}

function EmptyHistoryState({ hasActiveFilters, onReset }: { hasActiveFilters: boolean; onReset: () => void }) {
  return (
    <div className="history-opencode__empty">
      <div className="grid max-w-md gap-2">
        <strong>{hasActiveFilters ? '[-] Dokumentasi tidak ditemukan' : '[-] Belum ada dokumentasi'}</strong>
        <p>
          {hasActiveFilters
            ? 'Tidak ada dokumentasi yang cocok dengan filter atau nomor resi tersebut.'
            : 'Dokumentasi QC dan packing yang sudah direkam akan muncul di halaman ini.'}
        </p>
      </div>
      <Button type="button" className="history-opencode__button" variant={hasActiveFilters ? 'outline' : 'default'} onClick={hasActiveFilters ? onReset : () => navigateTo('scan')}>
        {hasActiveFilters ? '[reset]' : '[scan]'}
      </Button>
    </div>
  )
}

function OperatorCell({ value }: { value: string }) {
  return (
    <div className="history-opencode__operator-cell">
      <span>[{getInitials(value)}]</span>
      <span>{value}</span>
    </div>
  )
}

function StatusPill({ status }: { status: LocalRecordingRecord['status'] | 'idle' | 'partial' }) {
  const label =
    status === 'completed'
      ? 'Lengkap'
      : status === 'recording'
        ? 'Recording'
        : status === 'error'
          ? 'Error'
          : status === 'partial'
            ? 'Belum lengkap'
            : 'Belum ada'
  const marker =
    status === 'completed'
      ? '[x]'
      : status === 'partial'
        ? '[-]'
        : status === 'error'
          ? '[!]'
          : status === 'recording'
            ? '[~]'
            : '[-]'

  return (
    <span className="history-opencode__status">
      {marker} {label}
    </span>
  )
}

function DetailRow({
  label,
  value,
  singleLine = false,
}: {
  label: string
  value: ReactNode
  singleLine?: boolean
}) {
  return (
    <div className="history-opencode__detail-row grid min-w-0 gap-1">
      <dt>{label}</dt>
      <dd
        className={singleLine ? 'truncate' : '[overflow-wrap:anywhere] break-words'}
        title={typeof value === 'string' ? value : undefined}
      >
        {value}
      </dd>
    </div>
  )
}

function OrderDetailRow({ order }: { order: ShopeeOrder }) {
  const items = dedupeOrderItems(order.items)

  return (
    <div className="history-opencode__detail-row history-opencode__order-detail-row grid min-w-0 gap-2">
      <dt>No. Pesanan</dt>
      <dd className="grid min-w-0 gap-2">
        <div className="history-opencode__order-head">
          <span className="truncate" title={order.orderNumber}>{order.orderNumber}</span>
          <small className="truncate" title={order.buyerUsername || undefined}>Pembeli: {order.buyerUsername || '-'}</small>
        </div>
        <div className="history-opencode__order-product-list" aria-label="Daftar barang pesanan">
          {items.length ? (
            items.map((item, index) => {
              const productName = cleanOrderProductName(item.productName) ?? item.productName
              return (
              <span key={item.id ?? `${productName}-${index}`} className="history-opencode__order-product" title={productName}>
                <span className="history-opencode__order-product-name">{productName}</span>
                {cleanOrderVariationName(item.variationName) ? <small>{cleanOrderVariationName(item.variationName)}</small> : null}
                <strong>x{item.quantity}</strong>
              </span>
              )
            })
          ) : (
            <span className="history-opencode__order-empty">Barang belum tersedia.</span>
          )}
        </div>
      </dd>
    </div>
  )
}

function dedupeOrderItems<T extends OrderItemLike>(items: T[]) {
  const seen = new Set<string>()
  const result: T[] = []

  for (const item of items) {
    const variationName = cleanOrderVariationName(item.variationName)
    const key = [
      (cleanOrderProductName(item.productName) ?? item.productName).trim().toLowerCase(),
      variationName?.trim().toLowerCase() ?? '',
      String(item.quantity),
    ].join('|')
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    result.push(item)
  }

  return result
}

function cleanOrderProductName(value: string | null | undefined) {
  const text = value?.replace(/\s+/g, ' ').trim()
  if (!text) return null

  return text
    .replace(/\s*(?:variasi\s*:|variation\s*:|varian\s*:|pesan\s*:|rp\s*\d|cod\b|perlu dikirim\b|menunggu\b|hemat kargo\b|spx\b).*$/i, '')
    .replace(/\s*x\s*\d+.+$/i, '')
    .replace(/\s*x\s*\d+\s*$/i, '')
    .trim() || null
}

function cleanOrderVariationName(value: string | null | undefined) {
  const text = value?.replace(/\s+/g, ' ').trim()
  if (!text) return null

  return text
    .replace(/\s*x\s*\d+.+$/i, '')
    .replace(/\s*x\s*\d+\s*(?:pesan\s*:|rp\s*\d|cod\b|perlu dikirim\b|menunggu\b|hemat kargo\b|spx\b).*$/i, '')
    .replace(/\s*(?:pesan\s*:|rp\s*\d|cod\b|perlu dikirim\b|menunggu\b|hemat kargo\b|spx\b).*$/i, '')
    .replace(/\s*x\s*\d+\s*$/i, '')
    .trim() || null
}

function Th({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <th className={`px-5 py-3 ${className}`}>[{children}]</th>
}

function Td({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <td className={`px-5 py-4 align-middle ${className}`}>{children}</td>
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function formatCompactDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  const dateLabel = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(date)
  const timeLabel = new Intl.DateTimeFormat('id-ID', { timeStyle: 'short' }).format(date)

  return `${dateLabel} · ${timeLabel}`
}

function getInitials(value: string) {
  const words = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (words.length === 0 || value === '-') {
    return '--'
  }

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
}

function formatDuration(durationSeconds: number | null) {
  if (durationSeconds === null) {
    return '-'
  }

  const minutes = Math.floor(durationSeconds / 60)
  const seconds = durationSeconds % 60

  if (minutes === 0) {
    return `${seconds}s`
  }

  return `${minutes}m ${seconds}s`
}

function groupRecordingsByResi(records: LocalRecordingRecord[]): HistoryRecordingGroup[] {
  const groups = new Map<string, LocalRecordingRecord[]>()

  for (const record of records) {
    const key = record.resiNumber.trim()

    if (!key) {
      continue
    }

    const current = groups.get(key)
    if (current) {
      current.push(record)
      continue
    }

    groups.set(key, [record])
  }

  return [...groups.entries()]
    .map(([resiNumber, groupedRecords]) => {
      const sortedRecords = sortRecordsByNewest(groupedRecords)

      return {
        resiNumber,
        latest: sortedRecords[0] ?? sortedRecords[sortedRecords.length - 1] ?? sortedRecords[0]!,
        records: sortedRecords,
      }
    })
    .sort((left, right) => right.latest.startTime.localeCompare(left.latest.startTime))
}

function getGroupByResi(records: LocalRecordingRecord[], resiNumber: string) {
  return groupRecordingsByResi(records).find((group) => group.resiNumber === resiNumber) ?? null
}

function getLatestRecordForTask(group: HistoryRecordingGroup, taskType: WorkTask) {
  return group.records.find((record) => record.taskType === taskType) ?? null
}

function getGroupStatus(group: HistoryRecordingGroup): LocalRecordingRecord['status'] | 'partial' | 'idle' {
  const qc = getLatestRecordForTask(group, 'qc')
  const packing = getLatestRecordForTask(group, 'packing')

  if (qc?.status === 'recording' || packing?.status === 'recording') {
    return 'recording'
  }

  if (qc?.status === 'completed' && packing?.status === 'completed') {
    return 'completed'
  }

  if (qc?.status === 'error' || packing?.status === 'error') {
    return 'error'
  }

  if (qc?.status === 'completed' || packing?.status === 'completed') {
    return 'partial'
  }

  return 'idle'
}

function canRepeatQc(group: HistoryRecordingGroup) {
  return getLatestRecordForTask(group, 'qc')?.status === 'completed'
}

function isRepeatQcInvalidRecord(record: LocalRecordingRecord) {
  return record.status === 'error' && (record.note?.toLowerCase().includes('qc diulang') ?? false)
}

function sortRecordsByNewest(records: LocalRecordingRecord[]) {
  return [...records].sort(
    (left, right) => right.startTime.localeCompare(left.startTime) || right.updatedAt.localeCompare(left.updatedAt),
  )
}

function formatDateForExport(date: Date) {
  return date.toISOString().slice(0, 10)
}

function formatDateInput(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function formatOperatorForCurrentSession(
  operatorName: string | null | undefined,
  operatorCode: string | null | undefined,
  currentOperatorName: string,
  currentOperatorCode: string,
) {
  const name = operatorName?.trim() || ''
  const code = operatorCode?.trim() || ''
  const normalizedCurrentName = currentOperatorName.trim()
  const normalizedCurrentCode = currentOperatorCode.trim()

  if (name) {
    return name
  }

  if (code && normalizedCurrentCode && code === normalizedCurrentCode && normalizedCurrentName) {
    return normalizedCurrentName
  }

  return code || '-'
}

async function copyText(value: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return false
  }

  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}

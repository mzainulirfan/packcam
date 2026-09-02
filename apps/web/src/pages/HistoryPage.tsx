import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDown01Icon, Cancel01Icon, Copy01Icon, Delete02Icon, Download01Icon, Package01Icon, RefreshIcon, Search01Icon, Tick02Icon, Clock01Icon } from '@hugeicons/core-free-icons'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'

import { useOperatorSession } from '../app/operatorSession'
import { navigateTo } from '../app/uiState'
import { setRepeatQcResi } from '../app/repeatQcState'
import { Button } from '../components/ui/button'
import { ModalOverlay } from '../components/ui/ModalOverlay'
import { DialogDescription, DialogTitle } from '../components/ui/dialog'
import { notify } from '../app/notify'
import { buildServerFileUrl, deleteServerRecordingApi, openServerSettingsFolderApi, prepareServerRecordingShareFileApi, prepareShopeeChatSendApi, readRecentShopeeOrdersApi, readServerHistoryRecordingsApi, readShopeeChatSendsByRecordingIdsApi, readShopeeOrderByOrderNumberApi, readShopeeOrderByResiApi } from '@pakti/api-client'
import type { RecordingChatSend, ShopeeOrder } from '@pakti/types'
import { recordsToCsv, recordsToExcelXml } from '@pakti/shared/exporters'
import type { LocalRecordingRecord } from '@pakti/shared/recordings'
import type { RecordingRow, WorkTask } from '@pakti/types'
import { downloadTextFile } from '@pakti/shared'
import { HistoryDetailDialog } from '../history/HistoryDetailDialog'
import { HistoryFilters, type HistoryDocStatusFilter, type HistoryTaskFilter } from '../history/HistoryFilters'
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
  docStatusFilter: 'all' | 'lengkap' | 'belum'
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
    docStatusFilter: 'all',
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
      docStatusFilter: parsed.docStatusFilter === 'lengkap' || parsed.docStatusFilter === 'belum' ? parsed.docStatusFilter : 'all',
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
  const [docStatusFilter, setDocStatusFilter] = useState<'all' | 'lengkap' | 'belum'>(initialHistoryFilters.docStatusFilter)
  const [operatorFilter, setOperatorFilter] = useState(initialHistoryFilters.operatorFilter)
  const [dateFrom, setDateFrom] = useState(initialHistoryFilters.dateFrom)
  const [dateTo, setDateTo] = useState(initialHistoryFilters.dateTo)
  const [isExportOpen, setIsExportOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)
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
      const searchSession = new URLSearchParams(window.location.search).get('session')
      if (searchSession?.trim()) return searchSession.trim()
      return window.sessionStorage.getItem('pakti.historyPackingSessionId')
    } catch {
      return null
    }
  })
  const [chatSendByRecordingId, setChatSendByRecordingId] = useState<Map<string, RecordingChatSend>>(new Map())
  const [shopeeOrderByResi, setShopeeOrderByResi] = useState<Map<string, ShopeeOrder>>(new Map())
  const [shopeeOrderByOrderNumber, setShopeeOrderByOrderNumber] = useState<Map<string, ShopeeOrder>>(new Map())

  useEffect(() => {
    try {
      const verifyResi = window.sessionStorage.getItem('pakti.shopeeVerifyResi')?.trim() || ''
      const verifyOrder = window.sessionStorage.getItem('pakti.shopeeVerifyOrder')?.trim() || ''
      const query = verifyResi || verifyOrder
      if (!query) return
      window.sessionStorage.removeItem('pakti.shopeeVerifyResi')
      window.sessionStorage.removeItem('pakti.shopeeVerifyOrder')
      setSearchText(query)
      setDateFrom('')
      setDateTo('')
      setPage(1)
    } catch (_e) {
      void _e
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void readRecentShopeeOrdersApi(500)
      .then((orders) => {
        if (cancelled) return
        const byResi = new Map<string, ShopeeOrder>()
        const byOrderNumber = new Map<string, ShopeeOrder>()
        for (const order of orders) {
          if (order.trackingNumber) byResi.set(order.trackingNumber.trim().toLowerCase(), order)
          byOrderNumber.set(order.orderNumber.trim().toLowerCase(), order)
        }
        setShopeeOrderByResi(byResi)
        setShopeeOrderByOrderNumber(byOrderNumber)
      })
      .catch(() => {
        if (!cancelled) {
          setShopeeOrderByResi(new Map())
          setShopeeOrderByOrderNumber(new Map())
        }
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
      docStatusFilter,
      operatorFilter,
      dateFrom,
      dateTo,
    })
  }, [dateFrom, dateTo, docStatusFilter, operatorFilter, searchText, taskFilter])

  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (!exportRef.current?.contains(e.target as Node)) setIsExportOpen(false)
    }
    if (isExportOpen) document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isExportOpen])

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

    try {
      const url = new URL(window.location.href)
      if (packingSessionFilter) url.searchParams.set('session', packingSessionFilter)
      else url.searchParams.delete('session')
      const next = `${url.pathname}${url.search}${url.hash}`
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
      if (next !== current) window.history.replaceState(null, '', next)
    } catch {}
  }, [packingSessionFilter])

  useEffect(() => {
    function handlePopState() {
      try {
        const next = new URLSearchParams(window.location.search).get('session')?.trim() || null
        setPackingSessionFilter(next)
      } catch {}
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

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

  const docStatusFilteredGroups = useMemo(() => {
    if (docStatusFilter === 'all') return groupedRecordings
    return groupedRecordings.filter((group) => {
      const isLengkap = getGroupStatus(group) === 'completed'
      return docStatusFilter === 'lengkap' ? isLengkap : !isLengkap
    })
  }, [groupedRecordings, docStatusFilter])

  const totalPages = Math.max(1, Math.ceil(docStatusFilteredGroups.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageItems = docStatusFilteredGroups.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const selectedRecord = useMemo(() => {
    return filteredRecordings.find((record) => record.id === selectedId) ?? pageItems[0]?.latest ?? null
  }, [filteredRecordings, pageItems, selectedId])

  const selectedOrderSnapshot = (selectedRecord as unknown as { orderSnapshot?: { shippingChannel?: string; orderNumber?: string | null; buyerUsername?: string | null; items?: OrderItemLike[] } | null })?.orderSnapshot ?? null

  useEffect(() => {
    if (!selectedRecord?.resiNumber) {
      return
    }

    const lookupKey = selectedRecord.resiNumber.trim().toLowerCase()
    const snapshotOrderNumber = selectedOrderSnapshot?.orderNumber?.trim() || ''
    if (shopeeOrderByResi.has(lookupKey) || shopeeOrderByOrderNumber.has(lookupKey) || (snapshotOrderNumber && shopeeOrderByOrderNumber.has(snapshotOrderNumber.toLowerCase()))) {
      return
    }

    let cancelled = false
    const resiOrOrderNumber = selectedRecord.resiNumber
    const orderNumber = snapshotOrderNumber || resiOrOrderNumber
    void readShopeeOrderByResiApi(resiOrOrderNumber)
      .catch(() => readShopeeOrderByOrderNumberApi(orderNumber))
      .then((order) => {
        if (cancelled) return
        setShopeeOrderByResi((prev) => {
          const next = new Map(prev)
          if (order.trackingNumber) next.set(order.trackingNumber.trim().toLowerCase(), order)
          return next
        })
        setShopeeOrderByOrderNumber((prev) => {
          const next = new Map(prev)
          next.set(order.orderNumber.trim().toLowerCase(), order)
          return next
        })
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [selectedOrderSnapshot?.orderNumber, selectedRecord, shopeeOrderByOrderNumber, shopeeOrderByResi])

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

  const exportSummaryLabel = `${filteredRecordings.length} rekaman / ${docStatusFilteredGroups.length} resi`
  const historyMetrics = useMemo(() => {
    const completed = docStatusFilteredGroups.filter((group) => getGroupStatus(group) === 'completed').length
    const incomplete = docStatusFilteredGroups.length - completed

    return { completed, incomplete }
  }, [docStatusFilteredGroups])
  const hasActiveFilters = Boolean(searchText.trim() || taskFilter !== 'all' || docStatusFilter !== 'all' || operatorFilter !== 'all' || dateFrom || dateTo)

  function getShopeeOrderForRecord(record: LocalRecordingRecord) {
    const snapshot = (record as unknown as { orderSnapshot?: { orderNumber?: string | null } | null }).orderSnapshot ?? null
    const key = record.resiNumber.trim().toLowerCase()
    return shopeeOrderByResi.get(key) ??
      shopeeOrderByOrderNumber.get(key) ??
      (snapshot?.orderNumber ? shopeeOrderByOrderNumber.get(snapshot.orderNumber.trim().toLowerCase()) : undefined) ??
      null
  }

  const selectedShopeeOrder = selectedRecord ? getShopeeOrderForRecord(selectedRecord) : null
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

  function handleDocStatusChange(nextFilter: HistoryDocStatusFilter) {
    setDocStatusFilter(nextFilter)
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
    setDocStatusFilter(defaultHistoryFilterState.docStatusFilter)
    setOperatorFilter(defaultHistoryFilterState.operatorFilter)
    setDateFrom(defaultHistoryFilterState.dateFrom)
    setDateTo(defaultHistoryFilterState.dateTo)
    setPackingSessionFilter(null)
    setPage(1)
  }

  function handleExportCsv() {
    const exportRecords = docStatusFilteredGroups.flatMap((group) => group.records)
    const csv = recordsToCsv(exportRecords)
    downloadTextFile(
      `pakti-recordings-${formatDateForExport(new Date())}.csv`,
      csv,
      'text/csv;charset=utf-8',
    )
    notify.save('Export CSV berhasil', `${exportRecords.length} rekaman siap diunduh.`)
  }

  function handleExportExcel() {
    const exportRecords = docStatusFilteredGroups.flatMap((group) => group.records)
    const xml = recordsToExcelXml(exportRecords)
    downloadTextFile(
      `pakti-recordings-${formatDateForExport(new Date())}.xls`,
      xml,
      'application/vnd.ms-excel',
    )
    notify.save('Export Excel berhasil', `${exportRecords.length} rekaman siap diunduh.`)
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

  async function handlePrepareShopeeChat(record: LocalRecordingRecord, shopeeOrder = getShopeeOrderForRecord(record)) {
    if (preparingChatSendId) {
      return
    }

    try {
      setPreparingChatSendId(record.id)
      let job: RecordingChatSend
      try {
        job = await prepareShopeeChatSendApi(record.id, null, {
          buyerUsername: shopeeOrder?.buyerUsername ?? null,
          orderNumber: shopeeOrder?.orderNumber ?? null,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : ''
        if (!message.includes('Isi username pembeli Shopee')) {
          throw error
        }
        const buyerUsername = window.prompt(`Order ${record.resiNumber} belum ada/username kosong di Pakti. Isi username pembeli Shopee untuk kirim manual:`)?.trim()
        if (!buyerUsername) {
          throw error
        }
        job = await prepareShopeeChatSendApi(record.id, null, { buyerUsername, orderNumber: shopeeOrder?.orderNumber ?? null })
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
    <div className="history-page mx-auto max-w-[1240px] bg-[#f6f5f4] px-4 py-8 font-['Inter'] sm:px-6 lg:py-10 xl:px-8">
      <section className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Operasional / History</div>
          <h1 className="mt-2 font-['Inter'] text-[32px] font-bold leading-[1.1] tracking-[-0.8px] text-[#000000] sm:text-[36px]">History Dokumentasi</h1>
          <p className="mt-2 max-w-2xl font-['Inter'] text-[14px] leading-6 text-[#615d59]">Telusuri dokumentasi QC dan packing berdasarkan resi, pesanan, operator, periode, atau status pengiriman.</p>
        </div>
        <div ref={exportRef} className="relative flex shrink-0 items-center gap-2">
          <Button type="button" onClick={() => setIsExportOpen((v) => !v)} className="inline-flex h-8 shrink-0 items-center justify-center gap-2 rounded-[8px] border border-[#e6e6e6] bg-white px-3.5 font-['Inter'] text-[12px] font-medium text-[#31302e] hover:bg-[#f6f5f4] active:scale-[0.98]">
              <HugeiconsIcon icon={Download01Icon} size={14} strokeWidth={1.9} /> Export <HugeiconsIcon icon={ArrowDown01Icon} size={12} strokeWidth={1.9} />
            </Button>
            {isExportOpen ? (
              <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-[280px] overflow-hidden rounded-xl border border-[#dddddd] bg-white shadow-[0_10px_28px_rgba(0,0,0,0.08)]">
                <div className="border-b border-[#dddddd] bg-[#fbfaf9] px-3 py-2">
                  <p className="font-['Inter'] text-[12px] font-semibold text-[#000000]">Export {exportSummaryLabel}</p>
                  <p className="font-['Inter'] text-[11px] text-[#615d59]">Mengikuti filter aktif</p>
                </div>
                <div className="grid gap-1 p-1">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left font-['Inter'] text-[13px] font-medium text-[#31302e] hover:bg-[#f6f5f4]"
                    onClick={() => {
                      handleExportCsv()
                      setIsExportOpen(false)
                    }}
                  >
                    Export CSV <HugeiconsIcon icon={Download01Icon} size={14} strokeWidth={1.9} />
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left font-['Inter'] text-[13px] font-medium text-[#31302e] hover:bg-[#f6f5f4]"
                    onClick={() => {
                      handleExportExcel()
                      setIsExportOpen(false)
                    }}
                  >
                    Export Excel <HugeiconsIcon icon={Download01Icon} size={14} strokeWidth={1.9} />
                  </button>
                </div>
              </div>
            ) : null}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-[12px] border border-[#e6e6e6] bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Total dokumentasi</div>
              <div className="mt-2.5 flex items-baseline gap-2">
                <span className="font-['Inter'] text-[26px] font-bold leading-none tracking-[-0.5px] text-[#000000]">{docStatusFilteredGroups.length}</span>
                <span className="font-['Inter'] text-[12px] text-[#615d59]">paket</span>
              </div>
            </div>
            <span className="grid h-7 w-7 place-items-center rounded-[8px] bg-[#f6f5f4] text-[#31302e]">
              <HugeiconsIcon icon={Package01Icon} size={16} strokeWidth={1.9} />
            </span>
          </div>
        </article>
        <article className="rounded-[12px] border border-[#e6e6e6] bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Dokumentasi lengkap</div>
              <div className="mt-2.5 flex items-baseline gap-2">
                <span className="font-['Inter'] text-[26px] font-bold leading-none tracking-[-0.5px] text-[#000000]">{historyMetrics.completed}</span>
                <span className="font-['Inter'] text-[12px] text-[#615d59]">{docStatusFilteredGroups.length ? `${Math.round((historyMetrics.completed / docStatusFilteredGroups.length) * 100)}%` : '0%'}</span>
              </div>
            </div>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#f6f5f4] text-[#31302e]">
              <HugeiconsIcon icon={Tick02Icon} size={18} strokeWidth={1.9} />
            </span>
          </div>
        </article>
        <article className="rounded-[12px] border border-[#e6e6e6] bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Perlu perhatian</div>
              <div className="mt-2.5 flex items-baseline gap-2">
                <span className="font-['Inter'] text-[26px] font-bold leading-none tracking-[-0.5px] text-[#000000]">{historyMetrics.incomplete}</span>
                <span className="font-['Inter'] text-[12px] text-[#615d59]">paket</span>
              </div>
            </div>
            <span className="grid h-7 w-7 place-items-center rounded-[8px] bg-[#f6f5f4] text-[#31302e]">
              <HugeiconsIcon icon={Clock01Icon} size={16} strokeWidth={1.9} />
            </span>
          </div>
        </article>
      </section>

      {packingSessionFilter ? (
        <div className="mt-5 flex flex-col gap-3 rounded-[12px] border border-[#e6e6e6] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-['Inter'] text-[13px] text-[#31302e]">
            Filter sesi: <span className="font-['Inter'] font-semibold text-[#000000]">{packingSessionFilter.slice(0, 8)}</span> — hanya rekaman packing untuk sesi ini.
          </p>
          <Button type="button" variant="ghost" size="sm" onClick={() => setPackingSessionFilter(null)} className="h-8 rounded-[8px] border border-[#e6e6e6] bg-white px-3 font-['Inter'] text-[12px] font-medium text-[#31302e] hover:bg-[#f6f5f4]">
            <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.9} /> Clear
          </Button>
        </div>
      ) : null}

        <div className="mt-5 grid gap-4 min-w-0">
          <section className="overflow-hidden rounded-[12px] border border-[#e6e6e6] bg-white">
            <HistoryFilters
              searchText={searchText}
              taskFilter={taskFilter}
              docStatusFilter={docStatusFilter}
              operatorFilter={operatorFilter}
              dateFrom={dateFrom}
              dateTo={dateTo}
              isAdmin={isAdmin}
              operatorOptions={operatorOptions}
              onSearchTextChange={handleTextChange}
              onTaskFilterChange={handleTaskChange}
              onDocStatusFilterChange={handleDocStatusChange}
              onOperatorFilterChange={handleOperatorChange}
              onDateChange={handleDateChange}
              onClearFilters={clearFilters}
            />
            <div className="flex items-center justify-between gap-4 border-b border-[#e6e6e6] bg-[#fbfaf9] px-4 py-3 sm:px-5">
              <div>
                <h2 className="font-['Inter'] text-[14px] font-semibold leading-none text-[#000000]">Dokumentasi paket</h2>
                <p className="mt-1 font-['Inter'] text-[12px] leading-none text-[#a39e98]">{isRefreshingHistory ? 'Memperbarui data terbaru...' : 'Klik nomor resi atau baris untuk melihat detail dokumentasi.'}</p>
              </div>
              <span className="inline-flex items-center rounded-full border border-[#e6e6e6] bg-white px-2.5 py-1 font-['Inter'] text-[11px] font-semibold text-[#31302e]">{docStatusFilteredGroups.length} hasil</span>
            </div>
            <div className="min-w-0 p-0">
              {isLoadingHistory ? <HistorySkeleton /> : null}

              {historyError ? (
                <div className="m-4 grid gap-3 rounded-[8px] border border-[#fecaca] bg-[#fee2e2] p-4 font-['Inter'] text-[13px] text-[#991b1b]">
                  <div className="grid gap-1">
                    <strong className="font-semibold text-[#991b1b]">History belum bisa dimuat.</strong>
                    <p className="text-[#991b1b]">{historyError}</p>
                  </div>
                  <Button type="button" variant="ghost" className="h-9 w-fit rounded-full border border-[#fecaca] bg-white px-4 font-['Inter'] text-[13px] text-[#991b1b] hover:bg-white" onClick={() => setHistoryReloadKey((current) => current + 1)}>
                    Coba lagi
                  </Button>
                </div>
              ) : null}

              <div className="grid gap-2 bg-[#f6f5f4] p-3 md:hidden">
                {!isLoadingHistory && !historyError && pageItems.length ? (
                  pageItems.map((group) => {
                    const isSelected = group.latest.id === selectedRecord?.id
                    const groupChatSend = group.records.map((r) => visibleChatSendByRecordingId.get(r.id)).find(Boolean)
                    return (
                      <article
                        key={group.resiNumber}
                        onClick={() => openDetail(group.latest)}
                        className={`grid cursor-pointer gap-3 rounded-[12px] border bg-white p-4 transition-colors ${isSelected ? 'border-[#000000] bg-[#f6f5f4]' : 'border-[#e6e6e6] hover:border-[#d8d5d1] hover:bg-[#fbfaf9]'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="grid min-w-0 gap-0.5">
                            <span className="font-['Inter'] text-[14px] font-semibold leading-tight tracking-[-0.2px] text-[#000000]">{group.resiNumber}</span>
                            {shopeeOrderByResi.get(group.resiNumber.trim().toLowerCase())?.orderNumber ? (
                              <span className="truncate font-['Inter'] text-[12px] text-[#615d59]">{shopeeOrderByResi.get(group.resiNumber.trim().toLowerCase())!.orderNumber}</span>
                            ) : null}
                            <span className="font-['Inter'] text-[11px] text-[#a39e98]">{formatCompactDateTime(group.latest.updatedAt)}</span>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <DocumentationStatus group={group} />
                            {group.records.some((record) => isRepeatQcInvalidRecord(record)) ? (
                              <span className="inline-flex rounded-full bg-[#fef3c7] px-2 py-0.5 font-['Inter'] text-[11px] font-semibold text-[#92400e] ring-1 ring-[#fde68a]">Repeat QC</span>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-3 border-t border-[#e6e6e6] pt-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#000000] text-[11px] font-semibold text-white">{getInitials(formatOperatorForCurrentSession(group.latest.operatorName, group.latest.operatorCode, currentOperatorName, currentOperatorCode))}</span>
                            <span className="truncate font-['Inter'] text-[12px] text-[#615d59]">{formatOperatorForCurrentSession(group.latest.operatorName, group.latest.operatorCode, currentOperatorName, currentOperatorCode)}</span>
                            <ChatDeliveryStatusAction
                              chatSend={groupChatSend}
                              record={group.latest}
                              preparing={preparingChatSendId === group.latest.id}
                              onSend={() => void handlePrepareShopeeChat(group.latest)}
                              compact
                            />
                          </div>
                          <span className="grid h-7 w-7 place-items-center rounded-full bg-[#f6f5f4] text-[#a39e98]">›</span>
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
                  <table className="w-full min-w-[760px] border-collapse">
                    <thead className="bg-[#f6f5f4]">
                      <tr className="text-left">
                        <Th className="px-5">Paket</Th>
                        <Th>Operator</Th>
                        <Th>Dokumentasi</Th>
                        <Th>Pengiriman</Th>
                        <Th className="px-5 text-right">Status</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e6e6e6] bg-white">
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
                              className={`cursor-pointer outline-none transition-colors ${isSelected ? 'bg-[#f6f5f4]' : 'bg-white hover:bg-[#fbfaf9]'}`}
                            >
                              <Td className="px-5 py-4">
                                <div className="grid gap-0.5">
                                  <span className="font-['Inter'] text-[14px] font-semibold leading-tight text-[#000000]">{group.resiNumber}</span>
                                  {shopeeOrderByResi.get(group.resiNumber.trim().toLowerCase())?.orderNumber ? (
                                    <span className="font-['Inter'] text-[12px] text-[#615d59]">{shopeeOrderByResi.get(group.resiNumber.trim().toLowerCase())!.orderNumber}</span>
                                  ) : null}
                                  <span className="font-['Inter'] text-[11px] text-[#a39e98]">{formatCompactDateTime(group.latest.updatedAt)}</span>
                                </div>
                              </Td>
                              <Td>
                                <OperatorCell value={formatOperatorForCurrentSession(group.latest.operatorName, group.latest.operatorCode, currentOperatorName, currentOperatorCode)} />
                              </Td>
                              <Td>
                                <div className="grid gap-1">
                                  <DocumentationStatus group={group} />
                                  {group.records.some((record) => isRepeatQcInvalidRecord(record)) ? (
                                    <span className="inline-flex w-fit rounded-full bg-[#fef3c7] px-2 py-0.5 font-['Inter'] text-[11px] font-semibold text-[#92400e] ring-1 ring-[#fde68a]">Repeat QC</span>
                                  ) : null}
                                </div>
                              </Td>
                              <Td>
                                <ShippingStatus chatSend={tableGroupChatSend} />
                              </Td>
                              <Td className="px-5 py-4">
                                <div className="flex justify-end" onClick={(event) => event.stopPropagation()}>
                                  <ChatDeliveryStatusAction
                                    chatSend={tableGroupChatSend}
                                    record={group.latest}
                                    preparing={preparingChatSendId === group.latest.id}
                                    onSend={() => void handlePrepareShopeeChat(group.latest)}
                                  />
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

              {docStatusFilteredGroups.length > PAGE_SIZE ? (
                <div className="flex flex-col gap-3 border-t border-[#dddddd] bg-[#fbfaf9] px-4 py-3 font-['Inter'] sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <span className="font-['Inter'] text-[13px] text-[#615d59]">
                    <span className="font-semibold text-[#000000]">{(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, docStatusFilteredGroups.length)}</span> dari <span className="font-semibold text-[#000000]">{docStatusFilteredGroups.length}</span> dokumentasi
                  </span>
                  <div className="flex flex-wrap items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 min-w-8 rounded-lg border border-[#dddddd] bg-white px-2 font-['Inter'] text-[13px] text-[#31302e] hover:bg-[#f6f5f4]"
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
                          <span key={`e-${idx}`} className="px-1 font-['Inter'] text-[13px] text-[#a39e98]">
                            …
                          </span>
                        ) : (
                          <Button
                            key={p}
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={
                              p === currentPage
                                ? "h-8 min-w-8 rounded-lg bg-[#000000] px-2 font-['Inter'] text-[13px] font-semibold text-white hover:bg-[#000000]"
                                : "h-8 min-w-8 rounded-lg border border-[#dddddd] bg-white px-2 font-['Inter'] text-[13px] text-[#31302e] hover:bg-[#f6f5f4]"
                            }
                            onClick={() => setPage(p as number)}
                          >
                            {p}
                          </Button>
                        ),
                      )
                    })()}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 min-w-8 rounded-lg border border-[#dddddd] bg-white px-2 font-['Inter'] text-[13px] text-[#31302e] hover:bg-[#f6f5f4]"
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
                <div className="space-y-3">
                  {selectedGroup?.records.some((record) => isRepeatQcInvalidRecord(record)) ? (
                    <div className="rounded-[8px] border border-[#fde68a] bg-[#fef3c7] px-3 py-2.5">
                      <p className="font-['Inter'] text-[12px] font-semibold text-[#92400e]">Ada rekaman lama tidak valid karena repeat QC.</p>
                    </div>
                  ) : null}

                  <div className="grid gap-2">
                    <dl className="grid gap-1.5">
                      {selectedShopeeOrder ? (
                        <OrderDetailRow order={selectedShopeeOrder} fallbackItems={selectedOrderSnapshot?.items ?? []} />
                      ) : selectedOrderSnapshot ? (
                        <DetailRow
                          label="Snapshot order"
                          value={(() => {
                            const snap = selectedOrderSnapshot
                            const items = dedupeOrderItems(snap.items ?? []).map((it) => {
                              const productName = cleanOrderProductName(it.productName) ?? it.productName
                              return `${productName} x${it.quantity}`
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

                  <div className="grid gap-2 rounded-[8px] border border-[#e6e6e6] bg-white p-3">
                    <div className="border-b border-[#e6e6e6] pb-2">
                      <p className="font-['Inter'] text-[12px] font-semibold text-[#000000]">Aksi cepat</p>
                      <span className="font-['Inter'] text-[11px] text-[#a39e98]">Pilih tindakan lanjutan.</span>
                    </div>
                    <div className="grid gap-1.5">
                      {selectedGroup && canRepeatQc(selectedGroup) ? (
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-auto justify-between rounded-[8px] border border-[#000000] bg-[#000000] px-3 py-2.5 text-left font-['Inter'] text-white hover:bg-[#31302e]"
                          onClick={() => {
                            setRepeatQcResi(selectedGroup.resiNumber)
                            navigateTo('scan')
                          }}
                        >
                          <span className="grid text-left"><span className="font-['Inter'] text-[13px] font-semibold">Ulangi QC</span><span className="font-['Inter'] text-[11px] text-white/70">Rekam ulang proses QC</span></span>
                          <HugeiconsIcon icon={RefreshIcon} size={16} strokeWidth={1.9} />
                        </Button>
                      ) : null}
                      <Button type="button" variant="ghost" className="h-auto justify-between rounded-[8px] border border-[#e6e6e6] bg-white px-3 py-2.5 text-left font-['Inter'] hover:bg-[#f6f5f4]" onClick={() => void handleOpenVideoFolder()}>
                        <span className="grid text-left"><span className="font-['Inter'] text-[13px] font-semibold text-[#000000]">Buka folder</span><span className="font-['Inter'] text-[11px] text-[#615d59]">Lihat lokasi file video</span></span>
                        <HugeiconsIcon icon={Package01Icon} size={16} strokeWidth={1.9} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-auto justify-between rounded-[8px] border border-[#e6e6e6] bg-white px-3 py-2.5 text-left font-['Inter'] hover:bg-[#f6f5f4]"
                        disabled={disableSelectedChatAction}
                        onClick={() => void handlePrepareShopeeChat(selectedRecord)}
                      >
                        <span className="grid text-left"><span className="font-['Inter'] text-[13px] font-semibold text-[#000000]">{selectedChatActionLabel.replace(/\[|\]/g, '')}</span><span className="font-['Inter'] text-[11px] text-[#615d59]">{selectedChatActionDescription}</span></span>
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
                              <TabsTrigger value="qc" className="rounded-none !border-0 bg-transparent px-3 py-2 font-['Inter'] text-[12px] font-medium tracking-wide text-[#615d59] shadow-none data-[state=active]:font-semibold data-[state=active]:text-[#000000]">
                                QC · {qcRecords.length}
                              </TabsTrigger>
                              <TabsTrigger value="packing" className="rounded-none !border-0 bg-transparent px-3 py-2 font-['Inter'] text-[12px] font-medium tracking-wide text-[#615d59] shadow-none data-[state=active]:font-semibold data-[state=active]:text-[#000000]">
                                Packing · {packingRecords.length}
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
                                <p className="py-2 text-center font-['Inter'] text-[13px] text-[#a39e98]">Belum ada rekaman QC.</p>
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
                                <p className="py-2 text-center font-['Inter'] text-[13px] text-[#a39e98]">Belum ada rekaman Packing.</p>
                              )}
                            </TabsContent>
                          </Tabs>
                          {activeRecords.length === 0 ? null : previewRecord?.status === 'completed' && previewRecord.filePath ? (
                            <div className="overflow-hidden rounded-xl border border-[#e6e6e6] bg-black">
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
                            <div className="rounded-[8px] border border-[#e6e6e6] bg-white px-3 py-3 text-center font-['Inter'] text-[13px] text-[#615d59]">Preview belum tersedia untuk {detailHistoryTab.toUpperCase()}.</div>
                          )}
                        </>
                      )
                    })()
                  ) : (
                    <div className="rounded-[8px] border border-dashed border-[#e6e6e6] bg-[#f6f5f4] px-3 py-6 text-center font-['Inter'] text-[13px] text-[#615d59]">Pilih salah satu baris untuk melihat detail data.</div>
                  )}
                </div>
          </HistoryDetailDialog>
        ) : null}

        {previewTarget ? (
          <ModalOverlay onClose={closePreview} contentClassName="w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] p-0 sm:w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-2rem)] lg:w-[92rem] lg:max-w-[92rem] overflow-hidden rounded-2xl border-[#e6e6e6] bg-white font-['Inter'] shadow-[0_10px_28px_rgba(0,0,0,0.08)]">
            <div className="flex max-h-[92vh] flex-col overflow-hidden bg-white font-['Inter']">
              <div className="flex items-start justify-between gap-4 border-b border-[#e6e6e6] bg-white p-6 text-left">
                <div className="grid gap-1">
                  <p className="font-['Inter'] text-[12px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Video preview</p>
                  <DialogTitle className="font-['Inter'] text-[20px] font-semibold tracking-[-0.2px] text-[#000000]">{previewTarget.resiNumber}</DialogTitle>
                  <DialogDescription className="font-['Inter'] text-[13px] text-[#615d59]">
                    Operator: {formatOperatorForCurrentSession(previewTarget.operatorName, previewTarget.operatorCode, currentOperatorName, currentOperatorCode)}
                  </DialogDescription>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={closePreview} className="h-9 w-9 shrink-0 rounded-lg text-[#615d59] hover:bg-[#f6f5f4] hover:text-[#000000]">
                  <HugeiconsIcon icon={Cancel01Icon} size={19} strokeWidth={1.9} />
                </Button>
              </div>

              <div className="grid gap-4 bg-[#f6f5f4] p-4 lg:p-6">
                {previewUrl ? (
                  <video src={previewUrl} crossOrigin="use-credentials" controls autoPlay playsInline className="max-h-[74vh] w-full rounded-xl bg-black" />
                ) : (
                  <div className="grid gap-2 rounded-[8px] border border-[#e6e6e6] bg-white p-4">
                    <strong className="font-['Inter'] text-[14px] font-semibold text-[#000000]">Preview belum tersedia.</strong>
                    <p className="font-['Inter'] text-[13px] text-[#615d59]">{previewMessage}</p>
                  </div>
                )}

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button type="button" className="h-9 rounded-full bg-[#0075de] px-4 font-['Inter'] text-[13px] font-medium text-white hover:bg-[#005bab]" onClick={handleDownloadPreview} disabled={!previewUrl || downloadingRecordId !== null}>
                    <HugeiconsIcon icon={Download01Icon} size={16} strokeWidth={1.9} /> {previewTarget && downloadingRecordId === previewTarget.id ? 'Menyiapkan...' : previewTarget.shareFileReady ? 'Download' : 'Menyiapkan video'}
                  </Button>
                  <Button type="button" variant="ghost" className="h-9 rounded-full border border-[#e6e6e6] bg-white px-4 font-['Inter'] text-[13px] text-[#31302e] hover:bg-[#f6f5f4]" onClick={() => void handleCopyText(previewTarget.filePath, 'Path file')}>
                    <HugeiconsIcon icon={Copy01Icon} size={16} strokeWidth={1.9} /> Copy path
                  </Button>
                  <Button type="button" variant="ghost" className="h-9 rounded-full border border-[#fecaca] bg-[#fee2e2] px-4 font-['Inter'] text-[13px] font-medium text-[#991b1b] hover:bg-[#fecaca]" disabled={deletingRecordId !== null} onClick={() => setDeleteTarget(previewTarget)}>
                    <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={1.9} /> {deletingRecordId === previewTarget.id ? 'Menghapus...' : 'Hapus'}
                  </Button>
                </div>

                <p className="font-['Inter'] text-[12px] text-[#a39e98]">{previewMessage}</p>
              </div>
            </div>
          </ModalOverlay>
        ) : null}

        {dualPreviewTarget ? (
          <ModalOverlay onClose={closeDualPreview} contentClassName="w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] p-0 sm:w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-2rem)] lg:w-[108rem] lg:max-w-[108rem] overflow-hidden rounded-2xl border-[#e6e6e6] bg-white font-['Inter'] shadow-[0_10px_28px_rgba(0,0,0,0.08)]">
            <div className="flex max-h-[92vh] flex-col overflow-hidden bg-white font-['Inter']">
              <div className="flex items-start justify-between gap-4 border-b border-[#e6e6e6] bg-white p-6 text-left">
                <div className="grid gap-1">
                  <p className="font-['Inter'] text-[12px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Video resi</p>
                  <DialogTitle className="font-['Inter'] text-[20px] font-semibold tracking-[-0.2px] text-[#000000]">{dualPreviewTarget.resiNumber}</DialogTitle>
                  <DialogDescription className="font-['Inter'] text-[13px] text-[#615d59]">Kedua video sudah selesai, tampilkan QC dan packing dalam satu tampilan.</DialogDescription>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={closeDualPreview} className="h-9 w-9 shrink-0 rounded-lg text-[#615d59] hover:bg-[#f6f5f4] hover:text-[#000000]">
                  <HugeiconsIcon icon={Cancel01Icon} size={19} strokeWidth={1.9} />
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto bg-[#f6f5f4] p-4 lg:p-6">
                <div className="grid gap-4 md:grid-cols-2 md:items-start">
                  {(['qc', 'packing'] as const).map((taskType) => {
                    const record = dualPreviewTarget.records.find((item) => item.taskType === taskType && item.status === 'completed')

                    if (!record) {
                      return null
                    }

                    return (
                      <div key={taskType} className="grid min-w-0 gap-3 rounded-xl border border-[#e6e6e6] bg-white p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div className="grid gap-1">
                            <p className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Tugas</p>
                            <span className="font-['Inter'] text-[14px] font-semibold capitalize text-[#000000]">{taskType}</span>
                          </div>
                        </div>

                        <video src={buildServerFileUrl(record.filePath)} crossOrigin="use-credentials" controls playsInline className="h-[34vh] w-full rounded-xl bg-black sm:h-[40vh] md:h-[44vh] lg:h-[62vh]" />

                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="ghost" size="sm" className="h-8 rounded-full border border-[#e6e6e6] bg-white px-3 font-['Inter'] text-[12px] text-[#31302e] hover:bg-[#f6f5f4]" onClick={() => void handleCopyText(record.filePath, 'Path file')}>
                            <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={1.9} /> Copy path
                          </Button>
                          <Button type="button" size="sm" className="h-8 rounded-full bg-[#0075de] px-3 font-['Inter'] text-[12px] font-medium text-white hover:bg-[#005bab]" disabled={downloadingRecordId !== null} onClick={() => handleDownloadRecord(record)}>
                            <HugeiconsIcon icon={Download01Icon} size={14} strokeWidth={1.9} /> {downloadingRecordId === record.id ? 'Menyiapkan...' : record.shareFileReady ? 'Download' : 'Menyiapkan video'}
                          </Button>
                          <Button type="button" variant="ghost" size="sm" className="h-8 rounded-full border border-[#fecaca] bg-[#fee2e2] px-3 font-['Inter'] text-[12px] font-medium text-[#991b1b] hover:bg-[#fecaca]" disabled={deletingRecordId !== null} onClick={() => setDeleteTarget(record)}>
                            <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={1.9} /> {deletingRecordId === record.id ? 'Menghapus...' : 'Hapus'}
                          </Button>
                        </div>

                        <div className="flex flex-col gap-1 font-['Inter'] text-[12px] text-[#615d59] sm:flex-row sm:items-center sm:justify-between">
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
          <ModalOverlay onClose={() => { if (!deletingRecordId) setDeleteTarget(null) }} contentClassName="overflow-hidden rounded-2xl border-[#e6e6e6] bg-white font-['Inter'] shadow-[0_10px_28px_rgba(0,0,0,0.08)]">
            <div className="grid gap-4 p-6">
              <div className="flex items-start justify-between gap-4 text-left">
                <div className="grid gap-1">
                  <p className="font-['Inter'] text-[12px] font-semibold uppercase tracking-[0.08em] text-[#991b1b]">Hapus recording</p>
                  <DialogTitle className="font-['Inter'] text-[20px] font-semibold tracking-[-0.2px] text-[#000000]">Hapus video {deleteTarget.resiNumber}?</DialogTitle>
                  <DialogDescription className="font-['Inter'] text-[13px] leading-5 text-[#615d59]">File video dan metadata recording ini akan dihapus dari server. Setelah dihapus, resi ini bisa direkam ulang.</DialogDescription>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => setDeleteTarget(null)} className="h-9 w-9 shrink-0 rounded-lg text-[#615d59] hover:bg-[#f6f5f4] hover:text-[#000000]">
                  <HugeiconsIcon icon={Cancel01Icon} size={19} strokeWidth={1.9} />
                </Button>
              </div>

              <div className="grid gap-2 rounded-[8px] border border-[#fecaca] bg-[#fee2e2] p-4 font-['Inter'] text-[13px] leading-5 text-[#991b1b]">
                <strong className="font-semibold">{deleteTarget.taskType === 'qc' ? 'QC' : 'Packing'} - {deleteTarget.fileName}</strong>
                <span className="text-[#991b1b]">{formatDateTime(deleteTarget.startTime)}</span>
              </div>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button type="button" variant="ghost" disabled={Boolean(deletingRecordId)} onClick={() => setDeleteTarget(null)} className="h-9 rounded-full border border-[#e6e6e6] bg-white px-5 font-['Inter'] text-[13px] text-[#31302e] hover:bg-[#f6f5f4]">
                  Batal
                </Button>
                <Button type="button" variant="ghost" disabled={Boolean(deletingRecordId)} onClick={() => void handleConfirmDeleteRecord()} className="h-9 rounded-full bg-[#991b1b] px-5 font-['Inter'] text-[13px] font-medium text-white hover:bg-[#7f1d1d]">
                  <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={1.9} /> {deletingRecordId ? 'Menghapus...' : 'Hapus recording'}
                </Button>
              </div>
            </div>
          </ModalOverlay>
        ) : null}
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

// @ts-ignore TS6133 - kept for future use
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
    <article className="rounded-xl border border-[#e6e6e6] bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">{label}</div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-['Inter'] text-[28px] font-bold leading-none tracking-[-0.5px] text-[#000000]">{value}</span>
            <span className="font-['Inter'] text-[13px] text-[#615d59]">{unit}</span>
          </div>
        </div>
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#f6f5f4] text-[#31302e] font-['Inter'] text-[12px] font-semibold">{marker}</span>
      </div>
    </article>
  )
}

function HistorySkeleton() {
  return (
    <div className="grid gap-2 p-4" aria-label="Memuat history">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex justify-between gap-3 rounded-lg border border-[#e6e6e6] bg-[#f6f5f4] p-3">
          <span className="h-4 w-24 animate-pulse rounded bg-[#e6e6e6]" />
          <span className="h-4 w-32 animate-pulse rounded bg-[#e6e6e6]" />
        </div>
      ))}
    </div>
  )
}

function EmptyHistoryState({ hasActiveFilters, onReset }: { hasActiveFilters: boolean; onReset: () => void }) {
  return (
    <div className="border-t border-[#dddddd] px-6 py-14 text-center">
      <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-[#f6f5f4] text-[#615d59]">
        <HugeiconsIcon icon={Search01Icon} size={20} strokeWidth={1.9} />
      </div>
      <div className="mt-3 font-['Inter'] text-[14px] font-medium text-[#000000]">{hasActiveFilters ? 'Dokumentasi tidak ditemukan' : 'Belum ada dokumentasi'}</div>
      <p className="mx-auto mt-1 max-w-md font-['Inter'] text-[13px] leading-5 text-[#615d59]">{hasActiveFilters ? 'Tidak ada dokumentasi yang cocok dengan filter atau nomor resi tersebut.' : 'Dokumentasi QC dan packing yang sudah direkam akan muncul di halaman ini.'}</p>
      <Button type="button" variant="ghost" className={`mt-4 h-9 rounded-lg px-4 font-['Inter'] text-[13px] font-medium ${hasActiveFilters ? 'border border-[#dddddd] bg-white text-[#31302e] hover:bg-[#f6f5f4]' : 'bg-[#0075de] text-white hover:bg-[#005bab]'}`} onClick={hasActiveFilters ? onReset : () => navigateTo('scan')}>
        {hasActiveFilters ? 'Reset' : 'Scan'}
      </Button>
    </div>
  )
}

function OperatorCell({ value }: { value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 font-['Inter'] text-[13px] text-[#31302e]">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#000000] text-[11px] font-semibold text-white">{getInitials(value)}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  )
}

// @ts-ignore TS6133 - kept for future use, now replaced by DocumentationStatus subtle pill
function StatusPill({ status }: { status: LocalRecordingRecord['status'] | 'idle' | 'partial' }) {
  const label = status === 'completed' ? 'Lengkap' : status === 'recording' ? 'Recording' : status === 'error' ? 'Error' : status === 'partial' ? 'Belum lengkap' : 'Belum ada'
  const tone = status === 'completed' ? 'border border-[#e6e6e6] bg-[#f6f5f4] text-[#31302e]' : status === 'error' ? 'bg-[#fee2e2] text-[#991b1b] ring-1 ring-[#fecaca]' : status === 'recording' ? 'bg-[#fef3c7] text-[#92400e] ring-1 ring-[#fde68a]' : 'border border-[#e6e6e6] bg-white text-[#615d59]'
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-['Inter'] text-[11px] font-semibold ${tone}`}>{status === 'completed' ? <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2} /> : null}{label}</span>
}

function DocumentationStatus({ group }: { group: HistoryRecordingGroup }) {
  const qc = group.records.find((r) => r.taskType === 'qc' && r.status === 'completed')
  const packing = group.records.find((r) => r.taskType === 'packing' && r.status === 'completed')
  const completed = (qc ? 1 : 0) + (packing ? 1 : 0)
  const total = 2
  const status = getGroupStatus(group)
  const isComplete = status === 'completed'
  return (
    <span className={`inline-flex items-center gap-1 font-['Inter'] text-[12px] font-medium ${isComplete ? 'text-[#31302e]' : 'text-[#615d59]'}`}>
      {isComplete ? <HugeiconsIcon icon={Tick02Icon} size={13} strokeWidth={2} /> : <HugeiconsIcon icon={Clock01Icon} size={13} strokeWidth={1.9} />}
      {completed}/{total} dokumentasi
    </span>
  )
}

function ChatDeliveryStatusAction({
  chatSend,
  record,
  preparing,
  onSend,
  compact = false,
}: {
  chatSend?: import('@pakti/types').RecordingChatSend | null
  record: LocalRecordingRecord
  preparing: boolean
  onSend: () => void
  compact?: boolean
}) {
  if (chatSend?.status === 'sent') {
    return (
      <span className={`inline-flex items-center gap-1 rounded-lg border border-[#dddddd] bg-white px-2.5 py-1 font-['Inter'] font-medium text-[#31302e] ${compact ? 'text-[11px]' : 'text-[12px]'}`}>
        <HugeiconsIcon icon={Tick02Icon} size={13} strokeWidth={2} /> Terkirim{chatSend.buyerUsername ? ` ke @${chatSend.buyerUsername}` : ''}
      </span>
    )
  }

  const disabled = preparing || record.status !== 'completed' || chatSend?.status === 'pending'
  const label = preparing ? 'Menyiapkan...' : chatSend?.status === 'pending' ? 'Dalam antrean' : 'Kirim sekarang'
  const title = record.status !== 'completed'
    ? 'Hanya untuk rekaman selesai'
    : chatSend?.status === 'pending'
      ? 'Menunggu dikirim ke pembeli'
      : 'Kirim video ke pembeli via Shopee Chat'

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={`rounded-lg border border-[#dddddd] bg-white px-3 font-['Inter'] font-medium text-[#31302e] hover:bg-[#f6f5f4] ${compact ? 'h-8 text-[11px]' : 'h-8 text-[12px]'} disabled:text-[#615d59]`}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation()
        onSend()
      }}
      title={title}
    >
      {label}
    </Button>
  )
}

function ShippingStatus({ chatSend, compact = false }: { chatSend?: import('@pakti/types').RecordingChatSend | null; compact?: boolean }) {
  if (!chatSend) {
    return <span className="font-['Inter'] text-[12px] text-[#a39e98]">—</span>
  }
  const isSent = chatSend.status === 'sent'
  const label = isSent ? 'Terkirim' : chatSend.status === 'prepared' ? 'Siap kirim' : 'Dalam antrean'
  const dot = isSent ? '✓' : chatSend.status === 'prepared' ? '○' : '○'
  return (
    <span className={`grid gap-0.5 ${compact ? '' : ''}`}>
      <span className={`inline-flex items-center gap-1 font-['Inter'] text-[12px] font-medium ${isSent ? 'text-[#31302e]' : 'text-[#92400e]'}`}>
        <span className="text-[11px]">{dot}</span> {label}
      </span>
      {chatSend.buyerUsername ? <span className="font-['Inter'] text-[11px] font-normal text-[#a39e98]">@{chatSend.buyerUsername}</span> : null}
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
    <div className="grid gap-1 rounded-[8px] border border-[#e6e6e6] bg-[#f6f5f4] px-3 py-2.5">
      <dt className="font-['Inter'] text-[12px] font-medium text-[#615d59]">{label}</dt>
      <dd className={`font-['Inter'] text-[13px] font-medium text-[#000000] ${singleLine ? 'truncate' : '[overflow-wrap:anywhere] break-words'}`} title={typeof value === 'string' ? value : undefined}>
        {value}
      </dd>
    </div>
  )
}

function OrderDetailRow({ order, fallbackItems = [] }: { order: ShopeeOrder; fallbackItems?: OrderItemLike[] }) {
  const items = dedupeOrderItems(order.items.length ? order.items : fallbackItems)

  return (
    <div className="grid gap-1 rounded-[8px] border border-[#e6e6e6] bg-[#f6f5f4] px-3 py-2.5">
      <dt className="font-['Inter'] text-[12px] font-medium text-[#615d59]">No. Pesanan</dt>
      <dd className="grid min-w-0 gap-2">
        <div className="grid gap-0.5">
          <span className="truncate font-['Inter'] text-[13px] font-semibold text-[#000000]" title={order.orderNumber}>
            {order.orderNumber}
          </span>
          <span className="truncate font-['Inter'] text-[12px] text-[#a39e98]" title={order.buyerUsername || undefined}>
            Pembeli: {order.buyerUsername || '-'}
          </span>
        </div>
        <div className="grid gap-1.5" aria-label="Daftar barang pesanan">
          {items.length ? (
            items.map((item, index) => {
              const productName = cleanOrderProductName(item.productName) ?? item.productName
              const variation = cleanOrderVariationName(item.variationName)
              return (
                <span
                  key={item.id ?? `${productName}-${index}`}
                  className="flex items-start justify-between gap-2 rounded-[8px] border border-[#e6e6e6] bg-white px-2.5 py-2"
                  title={`${productName}${variation ? ` • ${variation}` : ''}`}
                >
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="font-['Inter'] text-[13px] font-medium leading-snug text-[#000000] line-clamp-2 [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical] overflow-hidden">{productName}</span>
                    {variation ? <span className="truncate font-['Inter'] text-[11px] leading-tight text-[#615d59]">{variation}</span> : null}
                  </span>
                  <span className="shrink-0 rounded-full bg-[#f6f5f4] px-2 py-1 font-['Inter'] text-[11px] font-semibold leading-none text-[#000000] ring-1 ring-[#e6e6e6]">×{item.quantity}</span>
                </span>
              )
            })
          ) : (
            <span className="font-['Inter'] text-[13px] text-[#a39e98]">Barang belum tersedia.</span>
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
    .replace(/\s*(?:variasi\s*:|variation\s*:|varian\s*:|pesan\s*:|rp\s*\d|cod\b|perlu dikirim\b|menunggu\b|hemat kargo\b|spx\s+(?:instan|instant)\b).*$/i, '')
    .replace(/\s*x\s*\d+.+$/i, '')
    .replace(/\s*x\s*\d+\s*$/i, '')
    .trim() || null
}

function cleanOrderVariationName(value: string | null | undefined) {
  const text = value?.replace(/\s+/g, ' ').trim()
  if (!text) return null

  return text
    .replace(/\s*x\s*\d+.+$/i, '')
    .replace(/\s*x\s*\d+\s*(?:pesan\s*:|rp\s*\d|cod\b|perlu dikirim\b|menunggu\b|hemat kargo\b|spx\s+(?:instan|instant)\b).*$/i, '')
    .replace(/\s*(?:pesan\s*:|rp\s*\d|cod\b|perlu dikirim\b|menunggu\b|hemat kargo\b|spx\s+(?:instan|instant)\b).*$/i, '')
    .replace(/\s*x\s*\d+\s*$/i, '')
    .trim() || null
}

function Th({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <th className={`bg-[#f6f5f4] px-4 py-3 text-left font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98] ${className}`}>{children}</th>
}

function Td({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <td className={`bg-transparent px-4 py-3 align-middle font-['Inter'] text-[13px] text-[#31302e] ${className}`}>{children}</td>
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

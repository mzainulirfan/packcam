import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  CalendarRange,
  Copy,
  Download,
  FolderOpen,
  History,
  FileText,
  RefreshCcw,
  Search,
  Trash2,
} from 'lucide-react'

import { useOperatorSession } from '../app/operatorSession'
import { navigateTo } from '../app/uiState'
import { setRepeatQcResi } from '../app/repeatQcState'
import { StageCard } from '../components/StageCard'
import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { ModalOverlay } from '../components/ui/ModalOverlay'
import { DialogCloseButton, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { notify } from '../app/notify'
import { buildServerFileUrl, deleteServerRecordingApi, openServerSettingsFolderApi, prepareServerRecordingShareFileApi } from '@pakti/api-client'
import { recordsToCsv, recordsToExcelXml } from '@pakti/shared/exporters'
import { hydrateRecordings, listRecordings, refreshRecordingsFromServer, type LocalRecordingRecord } from '@pakti/shared/recordings'
import type { WorkTask } from '@pakti/types'
import { downloadTextFile } from '@pakti/shared'

type HistoryTaskFilter = 'all' | WorkTask

type HistoryRecordingGroup = {
  resiNumber: string
  latest: LocalRecordingRecord
  records: LocalRecordingRecord[]
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

const defaultHistoryFilterState: HistoryFilterState = {
  searchText: '',
  taskFilter: 'all',
  operatorFilter: 'all',
  dateFrom: '',
  dateTo: '',
}

const taskOptions: Array<{ value: HistoryTaskFilter; label: string }> = [
  { value: 'all', label: 'Semua task' },
  { value: 'qc', label: 'QC' },
  { value: 'packing', label: 'Packing' },
]


function readStoredHistoryFilters(): HistoryFilterState {
  if (typeof window === 'undefined') {
    return defaultHistoryFilterState
  }

  const raw = window.sessionStorage.getItem(HISTORY_FILTERS_KEY)
  if (!raw) {
    return defaultHistoryFilterState
  }

  try {
    const parsed = JSON.parse(raw) as Partial<HistoryFilterState> | null

    if (!parsed || typeof parsed !== 'object') {
      return defaultHistoryFilterState
    }

    return {
      searchText: typeof parsed.searchText === 'string' ? parsed.searchText : '',
      taskFilter: parsed.taskFilter === 'qc' || parsed.taskFilter === 'packing' ? parsed.taskFilter : 'all',
      operatorFilter: typeof parsed.operatorFilter === 'string' ? parsed.operatorFilter : 'all',
      dateFrom: typeof parsed.dateFrom === 'string' ? parsed.dateFrom : '',
      dateTo: typeof parsed.dateTo === 'string' ? parsed.dateTo : '',
    }
  } catch {
    return defaultHistoryFilterState
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
  const [isDateRangeOpen, setIsDateRangeOpen] = useState(false)
  const [isExportOpen, setIsExportOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [previewTarget, setPreviewTarget] = useState<LocalRecordingRecord | null>(null)
  const [dualPreviewTarget, setDualPreviewTarget] = useState<HistoryRecordingGroup | null>(null)
  const [downloadingRecordId, setDownloadingRecordId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<LocalRecordingRecord | null>(null)
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null)
  const [recordings, setRecordings] = useState<LocalRecordingRecord[]>([])

  useEffect(() => {
    void hydrateRecordings()
      .catch(() => undefined)
      .finally(() => {
        setRecordings(listRecordings())
      })
  }, [])

  useEffect(() => {
    function handleRecordingsUpdated() {
      void refreshRecordingsFromServer().then((records) => {
        setRecordings(records)
      })
    }

    window.addEventListener('pakti:recordings-updated', handleRecordingsUpdated)

    return () => {
      window.removeEventListener('pakti:recordings-updated', handleRecordingsUpdated)
    }
  }, [])

  useEffect(() => {
    writeStoredHistoryFilters({
      searchText,
      taskFilter,
      operatorFilter,
      dateFrom,
      dateTo,
    })
  }, [dateFrom, dateTo, operatorFilter, searchText, taskFilter])

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

      return (
        matchesSearch &&
        matchesOperator &&
        matchesAdminOperator &&
        matchesTask &&
        matchesDateFrom &&
        matchesDateTo
      )
    })
  }, [
    dateFrom,
    dateTo,
    isAdmin,
    operatorFilter,
    operatorSession?.operatorName,
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

  const selectedPreviewMode = selectedGroup ? getGroupPreviewMode(selectedGroup) : 'none'
  const previewUrl = previewTarget ? buildServerFileUrl(previewTarget.filePath) : null
  const previewMessage = previewTarget ? `Preview siap untuk ${previewTarget.resiNumber}.` : 'Pilih rekaman untuk preview.'

  const exportSummaryLabel = `${filteredRecordings.length} rekaman / ${groupedRecordings.length} resi`

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
    setSearchText(defaultHistoryFilterState.searchText)
    setTaskFilter(defaultHistoryFilterState.taskFilter)
    setOperatorFilter(defaultHistoryFilterState.operatorFilter)
    setDateFrom(defaultHistoryFilterState.dateFrom)
    setDateTo(defaultHistoryFilterState.dateTo)
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

  async function handleConfirmDeleteRecord() {
    if (!deleteTarget || deletingRecordId) {
      return
    }

    try {
      setDeletingRecordId(deleteTarget.id)
      await deleteServerRecordingApi(deleteTarget.id)
      const nextRecords = await refreshRecordingsFromServer()
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
    setIsDetailModalOpen(true)
  }

  function closeDetail() {
    setIsDetailModalOpen(false)
  }

  function closePreview() {
    setPreviewTarget(null)
  }

  function openDualPreview(group: HistoryRecordingGroup) {
    setDualPreviewTarget(group)
  }

  function closeDualPreview() {
    setDualPreviewTarget(null)
  }

  return (
    <StageCard title="History">
      <div className="grid gap-4">
        <section className="grid gap-4 rounded-[4px] border border-slate-300 bg-white p-4 lg:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid gap-2">
              <div className="inline-flex w-fit items-center gap-2 rounded-[4px] border border-slate-300 bg-white px-3 py-1 text-xs uppercase tracking-[0.22em] text-slate-600">
                <History className="size-3.5" />
                [ History ]
              </div>
              <h3 className="text-2xl font-semibold tracking-tight text-slate-950">{groupedRecordings.length} dokumentasi paket</h3>
              <p className="max-w-3xl text-sm leading-6 text-slate-500">
                Index dokumentasi QC dan Packing. Pilih resi untuk membuka video, metadata, dan aksi lanjutan.
              </p>
            </div>

            <Button type="button" variant="outline" className="h-10 rounded-[4px] border-slate-300" onClick={() => setIsExportOpen(true)}>
              <Download className="size-4" />
              Export
            </Button>
          </div>
        </section>

        <Card className="rounded-[4px] border-slate-300 shadow-none">
          <CardHeader className="space-y-2">
            <CardTitle className="text-lg">Filter history</CardTitle>
            <CardDescription>Cari resi, task, status dokumentasi, operator, dan rentang tanggal.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className={isAdmin ? 'grid gap-3 xl:grid-cols-[minmax(20rem,1.5fr)_12rem_14rem_12rem_auto]' : 'grid gap-3 xl:grid-cols-[minmax(20rem,1.5fr)_12rem_14rem_auto]'}>
              <FilterField label="Cari">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={searchText}
                    onChange={(event) => handleTextChange(event.target.value)}
                    placeholder="Cari resi, file, atau path"
                    className="h-12 pl-11"
                  />
                </div>
              </FilterField>

              <FilterField label="Tugas">
                <Select value={taskFilter} onValueChange={(value) => handleTaskChange(value as HistoryTaskFilter)}>
                  <SelectTrigger className="h-12 w-full">
                    <SelectValue placeholder="Pilih task" />
                  </SelectTrigger>
                  <SelectContent>
                    {taskOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>

              {isAdmin ? (
                <FilterField label="User">
                  <Select value={operatorFilter} onValueChange={handleOperatorChange}>
                    <SelectTrigger className="h-12 w-full">
                      <SelectValue placeholder="Semua user" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua user</SelectItem>
                      {operatorOptions
                        .filter((option) => option.value.trim() !== '')
                        .map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </FilterField>
              ) : null}

              <FilterField label="Tanggal">
                <Button type="button" variant="outline" className="h-12 w-full justify-between border-slate-200" onClick={() => setIsDateRangeOpen(true)}>
                  <span className="truncate">{formatDateRangeLabel(dateFrom, dateTo)}</span>
                  <CalendarRange className="size-4 shrink-0" />
                </Button>
              </FilterField>

              <div className="flex items-end gap-3">
                <Button type="button" variant="outline" className="h-12 flex-1 border-slate-300" onClick={clearFilters} aria-label="Reset filter" title="Reset filter">
                  <RefreshCcw className="size-4" />
                  Reset
                </Button>
              </div>
            </div>

          </CardContent>
        </Card>

        <div className="grid gap-4 min-w-0">
          <Card className="min-w-0 rounded-[4px] border-slate-300 shadow-none">
            <CardHeader className="space-y-2">
              <CardTitle className="text-lg">Daftar dokumentasi</CardTitle>
              <CardDescription>Klik resi untuk membuka detail. Video hanya dimuat di detail dokumentasi.</CardDescription>
            </CardHeader>
            <CardContent className="min-w-0 pt-4">
              <div className="grid gap-4 lg:hidden">
                {pageItems.length ? (
                  pageItems.map((group) => {
                    const isSelected = group.latest.id === selectedRecord?.id
                    return (
                      <article
                        key={group.resiNumber}
                        className={isSelected ? 'grid gap-4 rounded-[4px] border border-slate-400 bg-slate-50 p-4' : 'grid gap-4 rounded-[4px] border border-slate-300 bg-white p-4'}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="grid min-w-0 gap-1.5">
                            <button
                              type="button"
                              className="truncate text-left text-base font-semibold tracking-tight text-slate-950 hover:underline"
                              onClick={() => openDetail(group.latest)}
                            >
                              {group.resiNumber}
                            </button>
                            <p className="truncate text-sm leading-6 text-slate-500">
                              {formatOperatorForCurrentSession(
                                group.latest.operatorName,
                                group.latest.operatorCode,
                                currentOperatorName,
                                currentOperatorCode,
                              )}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <StatusPill status={getGroupStatus(group)} />
                            {group.records.some((record) => isRepeatQcInvalidRecord(record)) ? (
                              <span className="inline-flex rounded-[4px] border border-rose-300 bg-rose-50 px-2.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-[0.16em] text-rose-700">
                                Repeat QC
                              </span>
                            ) : null}
                          </div>
                        </div>

                          <dl className="grid gap-2 text-sm sm:grid-cols-2">
                            <CompactTaskRow label="QC" record={getLatestRecordForTask(group, 'qc')} />
                            <CompactTaskRow label="Packing" record={getLatestRecordForTask(group, 'packing')} />
                            <div className="rounded-[4px] border border-slate-200 bg-white px-3 py-2">
                              <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">Update</dt>
                              <dd className="mt-1 font-medium text-slate-950">{formatDateTime(group.latest.updatedAt)}</dd>
                            </div>
                            <div className="rounded-[4px] border border-slate-200 bg-white px-3 py-2">
                              <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">Rekaman</dt>
                              <dd className="mt-1 font-medium text-slate-950">{group.records.length} file</dd>
                            </div>
                          </dl>

                        <div className="grid gap-2">
                          <Button type="button" variant="outline" size="default" className="w-full gap-1.5" onClick={() => openDetail(group.latest)}>
                            <FileText className="size-3.5" />
                            Detail
                          </Button>
                          <Button type="button" variant="outline" size="default" className="w-full gap-1.5 border-slate-300" onClick={() => void handleCopyText(group.latest.resiNumber, 'Resi')}>
                            <Copy className="size-3.5" />
                            Copy resi
                          </Button>
                        </div>

                      </article>
                    )
                  })
                ) : (
                  <div className="grid gap-2 rounded-[4px] border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-500">
                    <strong className="text-slate-950">Belum ada data yang cocok.</strong>
                    <p>Coba ubah kata kunci, status, atau rentang tanggal.</p>
                  </div>
                )}
              </div>

              <div className="hidden overflow-hidden rounded-[4px] border border-slate-300 bg-white lg:block">
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-sm">
                    <thead className="bg-slate-50">
                      <tr className="text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                        <Th>Resi</Th>
                        <Th>Operator</Th>
                                <Th>QC</Th>
                                <Th>Packing</Th>
                                <Th>Update</Th>
                                <Th>Status</Th>
                                <Th className="text-right">Aksi</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.length ? (
                        pageItems.map((group) => {
                          const isSelected = group.latest.id === selectedRecord?.id
                          return (
                            <tr
                              key={group.resiNumber}
                              className={
                                isSelected
                                  ? 'border-b border-slate-200 bg-slate-50'
                                  : 'border-b border-slate-200 bg-white transition-colors hover:bg-slate-50'
                              }
                            >
                              <Td>
                                <button
                                  type="button"
                                  className="font-medium text-slate-950 underline-offset-4 hover:underline"
                                  onClick={() => openDetail(group.latest)}
                                >
                                  {group.resiNumber}
                                </button>
                              </Td>
                              <Td>
                                {formatOperatorForCurrentSession(
                                  group.latest.operatorName,
                                  group.latest.operatorCode,
                                  currentOperatorName,
                                  currentOperatorCode,
                                )}
                              </Td>
                              <Td><TaskStatusText record={getLatestRecordForTask(group, 'qc')} /></Td>
                              <Td><TaskStatusText record={getLatestRecordForTask(group, 'packing')} /></Td>
                              <Td>{formatDateTime(group.latest.updatedAt)}</Td>
                              <Td>
                                <div className="flex flex-col gap-2">
                                  <StatusPill status={getGroupStatus(group)} />
                                  {group.records.some((record) => isRepeatQcInvalidRecord(record)) ? (
                                    <span className="inline-flex w-fit rounded-[4px] border border-rose-300 bg-rose-50 px-2.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-[0.16em] text-rose-700">
                                      Repeat QC
                                    </span>
                                  ) : null}
                                </div>
                              </Td>
                              <Td>
                                <div className="grid gap-2">
                                  <div className="flex flex-wrap justify-end gap-2">
                                    <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => openDetail(group.latest)}>
                                      <FileText className="size-3.5" />
                                      Detail
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="gap-1.5 border-slate-200"
                                      onClick={() => void handleCopyText(group.latest.resiNumber, 'Resi')}
                                    >
                                      <Copy className="size-3.5" />
                                      Copy resi
                                    </Button>
                                  </div>
                                </div>
                              </Td>
                            </tr>
                          )
                        })
                      ) : (
                        <tr>
                            <td colSpan={7} className="p-6">
                              <div className="grid gap-2 rounded-[4px] border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-500">
                              <strong className="text-slate-950">Belum ada data yang cocok.</strong>
                              <p>Coba ubah kata kunci, status, atau rentang tanggal.</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {groupedRecordings.length > PAGE_SIZE ? (
                <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-sm text-slate-500">
                    Page {currentPage} of {totalPages}
                  </span>
                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                      disabled={currentPage <= 1}
                    >
                      Prev
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                      disabled={currentPage >= totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        {isDateRangeOpen ? (
          <ModalOverlay onClose={() => setIsDateRangeOpen(false)}>
            <div className="grid gap-4">
              <DialogHeader className="flex items-start justify-between gap-4 text-left">
                <div className="grid gap-1">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Filter tanggal</p>
                  <DialogTitle className="text-xl">Rentang tanggal</DialogTitle>
                  <DialogDescription className="text-sm leading-6 text-slate-500">
                    Atur batas awal dan akhir history yang ingin ditampilkan.
                  </DialogDescription>
                </div>
                <DialogCloseButton onClick={() => setIsDateRangeOpen(false)} />
              </DialogHeader>

              <div className="grid gap-4 md:grid-cols-2">
                <FilterField label="Dari">
                  <Input type="date" value={dateFrom} onChange={(event) => handleDateChange('from', event.target.value)} className="h-12" />
                </FilterField>
                <FilterField label="Sampai">
                  <Input type="date" value={dateTo} onChange={(event) => handleDateChange('to', event.target.value)} className="h-12" />
                </FilterField>
              </div>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDateFrom('')
                    setDateTo('')
                    setPage(1)
                  }}
                >
                  Clear
                </Button>
                <Button type="button" onClick={() => setIsDateRangeOpen(false)}>
                  Terapkan
                </Button>
              </div>
            </div>
          </ModalOverlay>
        ) : null}

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

        {isDetailModalOpen && selectedRecord ? (
          <ModalOverlay
            onClose={closeDetail}
            contentClassName="w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] p-0 sm:w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-2rem)] lg:w-[114rem] lg:max-w-[114rem]"
            staticBackdrop
          >
            <div className="flex max-h-[88vh] flex-col overflow-hidden">
              <DialogHeader className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3.5 text-left">
                <div className="min-w-0 grid gap-1">
                  <p className="text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">Detail history</p>
                  <DialogTitle className="truncate text-xl">{selectedRecord.resiNumber}</DialogTitle>
                  <DialogDescription className="truncate text-sm leading-5 text-slate-500">
                    {formatOperatorForCurrentSession(
                      selectedRecord.operatorName,
                      selectedRecord.operatorCode,
                      currentOperatorName,
                      currentOperatorCode,
                    )}
                  </DialogDescription>
                </div>
                <DialogCloseButton onClick={closeDetail} />
              </DialogHeader>

              <div className="grid flex-1 items-start gap-3 overflow-y-auto px-4 py-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
                <div className="grid gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="grid min-w-0 gap-1">
                      <p className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-500">Selected</p>
                      <h4 className="truncate text-base font-semibold tracking-tight text-slate-950">
                        {selectedRecord.resiNumber}
                      </h4>
                    </div>
                    {selectedGroup ? <StatusPill status={getGroupStatus(selectedGroup)} /> : <StatusPill status={selectedRecord.status} />}
                  </div>

                  {selectedGroup ? (
                    <Alert variant={selectedGroup.records.some((record) => isRepeatQcInvalidRecord(record)) ? 'destructive' : 'info'}>
                      <div className="grid gap-1">
                        <p className="text-sm font-medium">Ringkasan resi</p>
                        <p className="text-sm leading-5 text-current/80">
                          {selectedGroup.records.length} record untuk resi ini. QC terakhir{' '}
                          {getLatestRecordForTask(selectedGroup, 'qc')?.status ?? 'idle'} dan packing terakhir{' '}
                          {getLatestRecordForTask(selectedGroup, 'packing')?.status ?? 'idle'}.
                        </p>
                        {selectedGroup.records.some((record) => isRepeatQcInvalidRecord(record)) ? (
                          <p className="text-sm leading-5 text-current/80">
                            Ada record lama yang sudah tidak valid karena repeat QC. Detailnya ditandai di daftar bawah.
                          </p>
                        ) : null}
                      </div>
                    </Alert>
                  ) : null}

                  <dl className="grid min-w-0 gap-2 xl:grid-cols-2">
                    <DetailRow label="Tugas" value={<TaskPill taskType={selectedRecord.taskType} />} />
                    <DetailRow
                      label="Group"
                      value={`${getGroupByResi(filteredRecordings, selectedRecord.resiNumber)?.records.length ?? 0} rekaman`}
                    />
                    <DetailRow label="File name" value={selectedRecord.fileName} singleLine />
                    <DetailRow
                      label="Operator"
                      value={formatOperatorForCurrentSession(
                        selectedRecord.operatorName,
                        selectedRecord.operatorCode,
                        currentOperatorName,
                        currentOperatorCode,
                      )}
                    />
                    <DetailRow label="File path" value={selectedRecord.filePath} singleLine />
                    <DetailRow label="Record date" value={selectedRecord.recordDate} />
                    <DetailRow label="Start" value={formatDateTime(selectedRecord.startTime)} />
                    <DetailRow label="End" value={selectedRecord.endTime ? formatDateTime(selectedRecord.endTime) : '-'} />
                    <DetailRow label="Duration" value={formatDuration(selectedRecord.durationSeconds)} />
                    <DetailRow label="Size" value={formatBytes(selectedRecord.fileSizeBytes)} />
                    <DetailRow label="Note" value={selectedRecord.note ?? '-'} />
                  </dl>

                  <div className="flex flex-wrap gap-2">
                    {selectedPreviewMode === 'dual' ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-slate-200"
                        onClick={() => {
                          if (selectedGroup) {
                            openDualPreview(selectedGroup)
                          }
                        }}
                      >
                        Lihat 2 video
                      </Button>
                    ) : selectedPreviewMode === 'single' ? (
                      <Button type="button" size="sm" onClick={() => setPreviewTarget(selectedRecord)}>
                        Preview
                      </Button>
                    ) : null}
                    {selectedGroup && canRepeatQc(selectedGroup) ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-amber-200 text-amber-700 hover:bg-amber-50"
                        onClick={() => {
                          setRepeatQcResi(selectedGroup.resiNumber)
                          navigateTo('scan')
                        }}
                      >
                        Ulangi QC
                      </Button>
                    ) : null}
                  </div>

                  <div className="grid gap-2 rounded-[4px] border border-slate-300 bg-slate-50 p-3">
                    <p className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-500">Aksi cepat</p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5 border-slate-200"
                        onClick={() => void handleCopyText(selectedRecord.resiNumber, 'Resi')}
                      >
                        <Copy className="size-3.5" />
                        Copy resi
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5 border-slate-200"
                        onClick={() => void handleCopyText(buildRecordMetadataText(selectedRecord, selectedGroup), 'Metadata')}
                      >
                        <Copy className="size-3.5" />
                        Copy metadata
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5 border-slate-200"
                        onClick={() => void handleOpenVideoFolder()}
                      >
                        <FolderOpen className="size-3.5" />
                        Buka folder
                      </Button>
                    </div>
                  </div>

                </div>

                <div className="grid gap-2">
                  {selectedGroup ? (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-500">Riwayat resi</p>
                        <p className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-500">{selectedGroup.records.length} record</p>
                      </div>

                      <div className="grid gap-2">
                        {selectedGroup.records.map((record) => {
                          const invalidRecord = isRepeatQcInvalidRecord(record)
                          const isSelectedRecord = record.id === selectedRecord.id

                          return (
                            <div
                              key={record.id}
                              className={
                                isSelectedRecord
                                  ? 'grid gap-2 rounded-[4px] border border-slate-400 bg-white p-3'
                                  : 'grid gap-2 rounded-[4px] border border-slate-300 bg-white p-3'
                              }
                            >
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div className="grid gap-1.5">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <TaskPill taskType={record.taskType} />
                                    <StatusPill status={record.status} />
                                    {invalidRecord ? (
                                      <span className="inline-flex rounded-[4px] border border-rose-300 bg-rose-50 px-2.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-[0.16em] text-rose-700">
                                        Tidak valid
                                      </span>
                                      ) : null}
                                    {isSelectedRecord ? (
                                      <span className="inline-flex rounded-[4px] border border-slate-300 bg-slate-50 px-2.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-[0.16em] text-slate-600">
                                        Dipilih
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="grid gap-0.5 text-xs text-slate-600">
                                    <span className="truncate">File: {record.fileName}</span>
                                    <span className="truncate">Path: {record.filePath}</span>
                                    <span>{formatDateTime(record.startTime)}</span>
                                    <span>{record.note ?? 'Tidak ada catatan tambahan.'}</span>
                                  </div>
                                </div>

                                {record.status === 'completed' ? (
                                  <video
                                    src={buildServerFileUrl(record.filePath)}
                                    crossOrigin="use-credentials"
                                    controls
                                    playsInline
                                    className="max-h-[42vh] w-full rounded-[4px] bg-black object-contain"
                                  />
                                ) : null}

                                <div className="flex flex-wrap gap-2">
                                  <Button type="button" variant="outline" size="sm" className="border-slate-200" onClick={() => void handleCopyText(record.filePath, 'Path file')}>
                                    <Copy className="size-4" />
                                    Copy path
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="border-slate-200"
                                    disabled={downloadingRecordId !== null}
                                    onClick={() => handleDownloadRecord(record)}
                                  >
                                    <Download className="size-4" />
                                    {downloadingRecordId === record.id ? 'Menyiapkan...' : record.shareFileReady ? 'Download' : 'Menyiapkan video'}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="sm"
                                    disabled={deletingRecordId !== null}
                                    onClick={() => setDeleteTarget(record)}
                                  >
                                    <Trash2 className="size-4" />
                                    {deletingRecordId === record.id ? 'Menghapus...' : 'Hapus'}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="rounded-[4px] border border-dashed border-slate-300 bg-slate-50 p-4 text-sm leading-6 text-slate-500">
                      Pilih salah satu baris untuk melihat detail data.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </ModalOverlay>
        ) : null}

        {previewTarget ? (
          <ModalOverlay
            onClose={closePreview}
            contentClassName="w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] p-0 sm:w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-2rem)] lg:w-[92rem] lg:max-w-[92rem]"
          >
            <div className="flex max-h-[92vh] flex-col overflow-hidden">
              <DialogHeader className="flex items-start justify-between gap-4 text-left">
                <div className="grid gap-1 px-4 pt-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Video preview</p>
                  <DialogTitle className="text-xl">{previewTarget.resiNumber}</DialogTitle>
                  <DialogDescription className="text-sm leading-6 text-slate-500">
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

              <div className="grid gap-4 px-4 pb-4">
                {previewUrl ? (
                  <video
                    src={previewUrl}
                    crossOrigin="use-credentials"
                    controls
                    autoPlay
                    playsInline
                    className="max-h-[74vh] w-full rounded-[4px] bg-black"
                  />
                ) : (
                  <div className="grid gap-2 rounded-[4px] border border-dashed border-slate-300 bg-slate-50 p-4 text-slate-500">
                    <strong className="text-slate-950">Preview belum tersedia.</strong>
                    <p>{previewMessage}</p>
                  </div>
                )}

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button type="button" onClick={handleDownloadPreview} disabled={!previewUrl || downloadingRecordId !== null}>
                    <Download className="size-4" />
                    {previewTarget && downloadingRecordId === previewTarget.id ? 'Menyiapkan...' : previewTarget.shareFileReady ? 'Download' : 'Menyiapkan video'}
                  </Button>
                  <Button type="button" variant="outline" className="border-slate-200" onClick={() => void handleCopyText(previewTarget.filePath, 'Path file')}>
                    <Copy className="size-4" />
                    Copy path
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={deletingRecordId !== null}
                    onClick={() => setDeleteTarget(previewTarget)}
                  >
                    <Trash2 className="size-4" />
                    {deletingRecordId === previewTarget.id ? 'Menghapus...' : 'Hapus'}
                  </Button>
                </div>

                <p className="text-sm leading-6 text-slate-500">{previewMessage}</p>
              </div>
            </div>
          </ModalOverlay>
        ) : null}

        {dualPreviewTarget ? (
          <ModalOverlay
            onClose={closeDualPreview}
            contentClassName="w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] p-0 sm:w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-2rem)] lg:w-[108rem] lg:max-w-[108rem]"
          >
            <div className="flex max-h-[92vh] flex-col overflow-hidden">
              <DialogHeader className="flex items-start justify-between gap-4 text-left">
                <div className="grid gap-1 px-4 pt-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Video resi</p>
                  <DialogTitle className="text-xl">{dualPreviewTarget.resiNumber}</DialogTitle>
                  <DialogDescription className="text-sm leading-6 text-slate-500">
                    Kedua video sudah selesai, tampilkan QC dan packing dalam satu tampilan.
                  </DialogDescription>
                </div>
                <DialogCloseButton onClick={closeDualPreview} />
              </DialogHeader>

              <div className="flex-1 overflow-y-auto px-4 pb-4 overscroll-contain">
                <div className="grid gap-4 md:grid-cols-2 md:items-start">
                {(['qc', 'packing'] as const).map((taskType) => {
                  const record = dualPreviewTarget.records.find((item) => item.taskType === taskType && item.status === 'completed')

                  if (!record) {
                    return null
                  }

                  return (
                    <div key={taskType} className="grid min-w-0 gap-2 rounded-[4px] border border-slate-300 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="grid gap-1">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Tugas</p>
                          <strong className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-950">{taskType}</strong>
                        </div>
                      </div>

                      <video
                        src={buildServerFileUrl(record.filePath)}
                        crossOrigin="use-credentials"
                        controls
                        playsInline
                        className="h-[34vh] w-full rounded-[4px] bg-black sm:h-[40vh] md:h-[44vh] lg:h-[62vh]"
                      />

                      <div className="flex flex-col gap-3 sm:flex-row">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="border-slate-200"
                          onClick={() => void handleCopyText(record.filePath, 'Path file')}
                        >
                          Copy path
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={downloadingRecordId !== null}
                          onClick={() => handleDownloadRecord(record)}
                        >
                          <Download className="size-4" />
                          {downloadingRecordId === record.id ? 'Menyiapkan...' : record.shareFileReady ? 'Download' : 'Menyiapkan video'}
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={deletingRecordId !== null}
                          onClick={() => setDeleteTarget(record)}
                        >
                          <Trash2 className="size-4" />
                          {deletingRecordId === record.id ? 'Menghapus...' : 'Hapus'}
                        </Button>
                      </div>

                      <div className="flex flex-col gap-2 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
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
                  {deletingRecordId ? 'Menghapus...' : 'Hapus recording'}
                </Button>
              </div>
            </div>
          </ModalOverlay>
        ) : null}
      </div>
    </StageCard>
  )
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</Label>
      {children}
    </div>
  )
}

function CompactTaskRow({ label, record }: { label: string; record: LocalRecordingRecord | null }) {
  return (
    <div className="rounded-[4px] border border-slate-200 bg-white px-3 py-2">
      <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</dt>
      <dd className="mt-1 flex items-center justify-between gap-3 text-sm">
        <TaskStatusText record={record} />
        <span className="shrink-0 text-xs text-slate-500">{record ? formatDuration(record.durationSeconds) : '-'}</span>
      </dd>
    </div>
  )
}

function TaskStatusText({ record }: { record: LocalRecordingRecord | null }) {
  if (!record) {
    return <span className="text-slate-500">— Belum ada</span>
  }

  if (record.status === 'completed') {
    return <span className="font-medium text-slate-950">✓ Selesai</span>
  }

  if (record.status === 'recording') {
    return <span className="font-medium text-amber-700">… Recording</span>
  }

  return <span className="font-medium text-rose-700">× Error</span>
}

function StatusPill({ status }: { status: LocalRecordingRecord['status'] | 'idle' | 'partial' }) {
  const label =
    status === 'completed'
      ? '✓ Lengkap'
      : status === 'recording'
        ? '… Recording'
        : status === 'error'
          ? '× Error'
          : status === 'partial'
            ? '! Belum lengkap'
            : '— Belum ada'
  const toneClass =
    status === 'completed'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : status === 'recording'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : status === 'error'
          ? 'border-rose-200 bg-rose-50 text-rose-700'
          : status === 'partial'
            ? 'border-amber-200 bg-amber-50 text-amber-700'
          : 'border-slate-200 bg-slate-50 text-slate-600'

  return (
    <span className={`inline-flex rounded-[4px] border px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] ${toneClass}`}>
      {label}
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
    <div className="grid min-w-0 gap-1 rounded-[4px] border border-slate-300 bg-slate-50 p-4">
      <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</dt>
      <dd
        className={singleLine ? 'truncate text-sm leading-6 text-slate-950' : '[overflow-wrap:anywhere] break-words text-sm leading-6 text-slate-950'}
        title={typeof value === 'string' ? value : undefined}
      >
        {value}
      </dd>
    </div>
  )
}

function TaskPill({ taskType }: { taskType: WorkTask }) {
  return (
    <span
      className={
        taskType === 'qc'
          ? 'inline-flex rounded-[4px] border border-blue-300 bg-blue-50 px-2.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-[0.16em] text-blue-700'
          : 'inline-flex rounded-[4px] border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-[0.16em] text-emerald-700'
      }
    >
      {taskType}
    </span>
  )
}

function Th({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <th className={`px-3 py-3 text-xs font-medium ${className}`}>{children}</th>
}

function Td({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <td className={`px-3 py-3 align-middle text-sm text-slate-700 ${className}`}>{children}</td>
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

function formatBytes(value: number | null) {
  if (value === null || typeof value === 'undefined' || Number.isNaN(value)) {
    return '-'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = Number(value)
  let unitIndex = 0

  if (!Number.isFinite(size)) {
    return '-'
  }

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
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

function getGroupPreviewMode(group: HistoryRecordingGroup): 'single' | 'dual' | 'none' {
  const qc = getLatestRecordForTask(group, 'qc')
  const packing = getLatestRecordForTask(group, 'packing')
  const completedRecords = [qc, packing].filter((record): record is LocalRecordingRecord => record?.status === 'completed')

  if (completedRecords.length === 1) {
    return 'single'
  }

  if (completedRecords.length === 2) {
    return 'dual'
  }

  return 'none'
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

function formatDateRangeLabel(dateFrom: string, dateTo: string) {
  if (!dateFrom && !dateTo) {
    return 'Semua'
  }

  if (dateFrom && dateTo) {
    return `${dateFrom} - ${dateTo}`
  }

  return dateFrom || dateTo || 'Semua'
}

function buildRecordMetadataText(record: LocalRecordingRecord, group?: HistoryRecordingGroup | null) {
  const lines = [
    `resi_number: ${record.resiNumber}`,
    `task_type: ${record.taskType}`,
    `status: ${record.status}`,
    `operator_name: ${record.operatorName ?? '-'}`,
    `operator_code: ${record.operatorCode ?? '-'}`,
    `record_date: ${record.recordDate}`,
    `start_time: ${record.startTime}`,
    `end_time: ${record.endTime ?? '-'}`,
    `duration_seconds: ${record.durationSeconds ?? '-'}`,
    `file_name: ${record.fileName}`,
    `file_path: ${record.filePath}`,
    `file_size_bytes: ${record.fileSizeBytes ?? '-'}`,
    `note: ${record.note ?? '-'}`,
  ]

  if (group) {
    lines.push(`group_record_count: ${group.records.length}`)
    lines.push(`group_latest_status: ${getGroupStatus(group)}`)
  }

  return lines.join('\n')
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

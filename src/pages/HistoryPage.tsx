import { useEffect, useMemo, useState } from 'react'
import { useOperatorSession } from '../app/operatorSession'
import { StageCard } from '../components/StageCard'
import { recordsToCsv, recordsToExcelXml } from '../data/exporters'
import { getRecordingBlob, listRecordings, type LocalRecordingRecord } from '../data/recordings'
import { downloadTextFile } from '../utils/download'

type HistoryStatusFilter = 'all' | 'recording' | 'completed' | 'error'

const PAGE_SIZE = 10

const statusOptions: Array<{ value: HistoryStatusFilter; label: string }> = [
  { value: 'all', label: 'Semua' },
  { value: 'recording', label: 'Recording' },
  { value: 'completed', label: 'Completed' },
  { value: 'error', label: 'Error' },
]

export function HistoryPage() {
  const operatorSession = useOperatorSession()
  const isAdmin = operatorSession?.role === 'admin'
  const currentOperatorName = operatorSession?.operatorName ?? ''
  const currentOperatorCode = operatorSession?.operatorCode ?? ''
  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState<HistoryStatusFilter>('all')
  const [operatorFilter, setOperatorFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [isDateRangeOpen, setIsDateRangeOpen] = useState(false)
  const [isExportOpen, setIsExportOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mobileDetailTarget, setMobileDetailTarget] = useState<LocalRecordingRecord | null>(null)
  const [previewTarget, setPreviewTarget] = useState<LocalRecordingRecord | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewMessage, setPreviewMessage] = useState('Pilih rekaman untuk preview.')

  const recordings = useMemo(() => listRecordings(), [])
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
        record.filePath.toLowerCase().includes(normalizedSearch)

      const matchesOperator =
        isAdmin ||
        (record.operatorName?.trim().toLowerCase() ?? '') === normalizedOperatorName
      const matchesAdminOperator =
        !isAdmin ||
        operatorFilter === 'all' ||
        (record.operatorName?.trim().toLowerCase() || record.operatorCode?.trim().toLowerCase() || '') ===
          normalizedSelectedOperator

      const matchesStatus = statusFilter === 'all' || record.status === statusFilter
      const matchesDateFrom = !dateFrom || record.recordDate >= dateFrom
      const matchesDateTo = !dateTo || record.recordDate <= dateTo

      return (
        matchesSearch &&
        matchesOperator &&
        matchesAdminOperator &&
        matchesStatus &&
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
    statusFilter,
  ])

  const totalPages = Math.max(1, Math.ceil(filteredRecordings.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageItems = filteredRecordings.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const selectedRecord = useMemo(() => {
    return filteredRecordings.find((record) => record.id === selectedId) ?? pageItems[0] ?? null
  }, [filteredRecordings, pageItems, selectedId])

  useEffect(() => {
    let cancelled = false

    async function loadPreview(record: LocalRecordingRecord | null) {
      if (!record) {
        setPreviewUrl(null)
        setPreviewMessage('Belum ada rekaman yang bisa dipreview.')
        return
      }

      setPreviewMessage(`Memuat preview untuk ${record.resiNumber}...`)

      const blob = (await getRecordingBlob(record.blobKey ?? record.id)) ?? null

      if (cancelled) {
        return
      }

      if (!blob) {
        setPreviewUrl(null)
        setPreviewMessage('Blob video tidak ditemukan. Rekaman ini belum bisa dipreview.')
        return
      }

      const nextUrl = URL.createObjectURL(blob)
      setPreviewUrl(nextUrl)
      setPreviewMessage(`Preview siap untuk ${record.resiNumber}.`)
    }

    if (previewTarget) {
      void loadPreview(previewTarget)
    }

    return () => {
      cancelled = true
    }
  }, [previewTarget])

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewTarget, previewUrl])

  const summary = useMemo(() => {
    const completed = filteredRecordings.filter((record) => record.status === 'completed').length
    const recording = filteredRecordings.filter((record) => record.status === 'recording').length
    const error = filteredRecordings.filter((record) => record.status === 'error').length

    return {
      total: filteredRecordings.length,
      completed,
      recording,
      error,
    }
  }, [filteredRecordings])

  function handleFilterChange(nextFilter: HistoryStatusFilter) {
    setStatusFilter(nextFilter)
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
    setSearchText('')
    setStatusFilter('all')
    setOperatorFilter('all')
    setDateFrom('')
    setDateTo('')
    setPage(1)
  }

  function handleExportCsv() {
    const csv = recordsToCsv(filteredRecordings)
    downloadTextFile(
      `packcam-recordings-${formatDateForExport(new Date())}.csv`,
      csv,
      'text/csv;charset=utf-8',
    )
  }

  function handleExportExcel() {
    const xml = recordsToExcelXml(filteredRecordings)
    downloadTextFile(
      `packcam-recordings-${formatDateForExport(new Date())}.xls`,
      xml,
      'application/vnd.ms-excel',
    )
  }

  function handleDownloadPreview() {
    if (!previewTarget || !previewUrl) {
      return
    }

    const link = document.createElement('a')
    link.href = previewUrl
    link.download = previewTarget.fileName
    link.rel = 'noopener'
    link.click()
  }

  function openDetail(record: LocalRecordingRecord) {
    setSelectedId(record.id)

    if (window.matchMedia('(max-width: 960px)').matches) {
      setMobileDetailTarget(record)
    }
  }

  return (
    <StageCard
      title="History"
    >
      <div className="history-stack">
        <div className="history-summary">
          <article>
            <span>Total</span>
            <strong>{summary.total}</strong>
          </article>
          <article>
            <span>Completed</span>
            <strong>{summary.completed}</strong>
          </article>
          <article>
            <span>Recording</span>
            <strong>{summary.recording}</strong>
          </article>
          <article>
            <span>Error</span>
            <strong>{summary.error}</strong>
          </article>
        </div>

        <div className={isAdmin ? 'history-filters history-filters--admin' : 'history-filters history-filters--user'}>
          <label className="history-field">
            <span>Cari</span>
            <input
              type="text"
              value={searchText}
              onChange={(event) => handleTextChange(event.target.value)}
              placeholder="Cari resi, file, atau path"
            />
          </label>

          <label className="history-field">
            <span>St</span>
            <div className="history-select">
              <select
                value={statusFilter}
                onChange={(event) => handleFilterChange(event.target.value as HistoryStatusFilter)}
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <i className="bx bx-chevron-down" aria-hidden="true" />
            </div>
          </label>

          {isAdmin ? (
            <label className="history-field">
              <span>Usr</span>
              <div className="history-select">
                <select
                  value={operatorFilter}
                  onChange={(event) => handleOperatorChange(event.target.value)}
                >
                  <option value="all">Semua user</option>
                  {operatorOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <i className="bx bx-chevron-down" aria-hidden="true" />
              </div>
            </label>
          ) : null}

          <label className="history-field">
            <span>Tgl</span>
            <button
              type="button"
              className="action-button history-range-button"
              onClick={() => setIsDateRangeOpen(true)}
            >
              <strong>{formatDateRangeLabel(dateFrom, dateTo)}</strong>
              <i className="bx bx-calendar" aria-hidden="true" />
            </button>
          </label>

          <button
            type="button"
            className="action-button history-reset-button"
            onClick={clearFilters}
            aria-label="Reset filter"
            title="Reset filter"
          >
            <i className="bx bx-reset" aria-hidden="true" />
          </button>

          <div className="history-export">
            <button
              type="button"
              className="action-button history-export__trigger"
              onClick={() => setIsExportOpen((current) => !current)}
              aria-label="Export data"
              title="Export data"
            >
              <i className="bx bx-export" aria-hidden="true" />
            </button>

            {isExportOpen ? (
              <div className="history-export__menu" role="menu" aria-label="Export menu">
                <button
                  type="button"
                  className="history-export__item"
                  role="menuitem"
                  onClick={() => {
                    handleExportCsv()
                    setIsExportOpen(false)
                  }}
                >
                  Export CSV
                </button>
                <button
                  type="button"
                  className="history-export__item"
                  role="menuitem"
                  onClick={() => {
                    handleExportExcel()
                    setIsExportOpen(false)
                  }}
                >
                  Export Excel
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {isDateRangeOpen ? (
          <div className="modal-overlay" role="presentation" onClick={() => setIsDateRangeOpen(false)}>
            <div
              className="modal-card history-date-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="history-date-range-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal-card__header">
                <div>
                  <p className="modal-card__eyebrow">Filter tanggal</p>
                  <h3 id="history-date-range-title">Rentang tanggal</h3>
                  <p className="modal-card__meta">Atur batas awal dan akhir history yang ingin ditampilkan.</p>
                </div>
                <button type="button" className="modal-card__close" onClick={() => setIsDateRangeOpen(false)}>
                  Tutup
                </button>
              </div>

              <div className="modal-card__body history-date-modal__body">
                <label className="history-field">
                  <span>Dari</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(event) => handleDateChange('from', event.target.value)}
                  />
                </label>

                <label className="history-field">
                  <span>Sampai</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(event) => handleDateChange('to', event.target.value)}
                  />
                </label>
              </div>

              <div className="modal-card__actions">
                <button
                  type="button"
                  className="action-button"
                  onClick={() => {
                    setDateFrom('')
                    setDateTo('')
                    setPage(1)
                  }}
                >
                  Clear
                </button>
                <button
                  type="button"
                  className="action-button action-button--primary"
                  onClick={() => setIsDateRangeOpen(false)}
                >
                  Terapkan
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="history-layout">
          <section className="history-table-section">
            <div className="table-frame history-table">
              <div className="history-table__scroll">
                <table className="history-table__table">
                  <thead>
                    <tr>
                      <th>Resi</th>
                      <th>Operator</th>
                      <th>Tanggal</th>
                      <th>Status</th>
                      <th>Durasi</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.length ? (
                      pageItems.map((record) => (
                          <tr
                          key={record.id}
                          className={record.id === selectedRecord?.id ? 'history-table__row history-table__row--selected' : 'history-table__row'}
                        >
                          <td className="history-table__resi" data-label="Resi">
                              <button
                                type="button"
                                className="history-table__resi-button"
                                onClick={() => openDetail(record)}
                              >
                              {record.resiNumber}
                            </button>
                          </td>
                          <td data-label="Operator">
                            {formatOperatorForCurrentSession(
                              record.operatorName,
                              record.operatorCode,
                              currentOperatorName,
                              currentOperatorCode,
                            )}
                          </td>
                          <td data-label="Tanggal">{record.recordDate}</td>
                          <td data-label="Status">
                            <strong className={`record-status record-status--${record.status}`}>{record.status}</strong>
                          </td>
                          <td data-label="Durasi">{formatDuration(record.durationSeconds)}</td>
                          <td data-label="Aksi">
                              <div className="history-table__actions">
                                <button type="button" className="history-row__button" onClick={() => openDetail(record)}>
                                  Detail
                                </button>
                              {record.status === 'completed' ? (
                                <button
                                  type="button"
                                  className="history-row__button history-row__button--ghost"
                                  onClick={() => setPreviewTarget(record)}
                                >
                                  Preview
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))
                  ) : (
                    <tr>
                      <td colSpan={6} data-label="Status">
                        <div className="empty-state">
                          <strong>Belum ada data yang cocok.</strong>
                          <p>Coba ubah kata kunci, status, atau rentang tanggal.</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {filteredRecordings.length > PAGE_SIZE ? (
                <div className="history-pagination">
                  <span>
                    Page {currentPage} of {totalPages}
                  </span>
                  <div>
                    <button
                      type="button"
                      className="action-button"
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                      disabled={currentPage <= 1}
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      className="action-button"
                      onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                      disabled={currentPage >= totalPages}
                    >
                      Next
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          <aside className="history-detail history-detail--desktop">
            <div className="history-detail__header">
              <div>
                <p className="history-detail__eyebrow">Detail</p>
                <h3>{selectedRecord ? selectedRecord.resiNumber : 'Belum memilih data'}</h3>
              </div>
              <span className={`record-status record-status--${selectedRecord?.status ?? 'idle'}`}>
                {selectedRecord?.status ?? 'idle'}
              </span>
            </div>

            {selectedRecord ? (
              <dl className="history-detail__list">
                <div>
                  <dt>File name</dt>
                  <dd>{selectedRecord.fileName}</dd>
                </div>
                <div>
                  <dt>Operator</dt>
                  <dd>
                    {formatOperatorForCurrentSession(
                      selectedRecord.operatorName,
                      selectedRecord.operatorCode,
                      currentOperatorName,
                      currentOperatorCode,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>File path</dt>
                  <dd>{selectedRecord.filePath}</dd>
                </div>
                <div>
                  <dt>Record date</dt>
                  <dd>{selectedRecord.recordDate}</dd>
                </div>
                <div>
                  <dt>Start</dt>
                  <dd>{formatDateTime(selectedRecord.startTime)}</dd>
                </div>
                <div>
                  <dt>End</dt>
                  <dd>{selectedRecord.endTime ? formatDateTime(selectedRecord.endTime) : '-'}</dd>
                </div>
                <div>
                  <dt>Duration</dt>
                  <dd>{formatDuration(selectedRecord.durationSeconds)}</dd>
                </div>
                <div>
                  <dt>Size</dt>
                  <dd>{formatBytes(selectedRecord.fileSizeBytes)}</dd>
                </div>
                <div>
                  <dt>Note</dt>
                  <dd>{selectedRecord.note ?? '-'}</dd>
                </div>
              </dl>
            ) : (
              <p className="history-detail__empty">
                Pilih salah satu baris untuk melihat detail data.
              </p>
            )}
          </aside>
        </div>

        {mobileDetailTarget ? (
          <div className="modal-overlay" role="presentation" onClick={() => setMobileDetailTarget(null)}>
            <div
              className="modal-card history-mobile-detail-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="history-mobile-detail-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal-card__header">
                <div>
                  <p className="modal-card__eyebrow">Detail</p>
                  <h3 id="history-mobile-detail-title">{mobileDetailTarget.resiNumber}</h3>
                  <p className="modal-card__meta">
                    {formatOperatorForCurrentSession(
                      mobileDetailTarget.operatorName,
                      mobileDetailTarget.operatorCode,
                      currentOperatorName,
                      currentOperatorCode,
                    )}
                  </p>
                </div>
                <button type="button" className="modal-card__close" onClick={() => setMobileDetailTarget(null)}>
                  Tutup
                </button>
              </div>

              <div className="modal-card__body">
                <dl className="history-detail__list history-detail__list--modal">
                  <div>
                    <dt>File name</dt>
                    <dd>{mobileDetailTarget.fileName}</dd>
                  </div>
                  <div>
                    <dt>File path</dt>
                    <dd>{mobileDetailTarget.filePath}</dd>
                  </div>
                  <div>
                    <dt>Record date</dt>
                    <dd>{mobileDetailTarget.recordDate}</dd>
                  </div>
                  <div>
                    <dt>Start</dt>
                    <dd>{formatDateTime(mobileDetailTarget.startTime)}</dd>
                  </div>
                  <div>
                    <dt>End</dt>
                    <dd>{mobileDetailTarget.endTime ? formatDateTime(mobileDetailTarget.endTime) : '-'}</dd>
                  </div>
                  <div>
                    <dt>Duration</dt>
                    <dd>{formatDuration(mobileDetailTarget.durationSeconds)}</dd>
                  </div>
                  <div>
                    <dt>Size</dt>
                    <dd>{formatBytes(mobileDetailTarget.fileSizeBytes)}</dd>
                  </div>
                  <div>
                    <dt>Note</dt>
                    <dd>{mobileDetailTarget.note ?? '-'}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        ) : null}

        {previewTarget ? (
          <div className="modal-overlay" role="presentation" onClick={() => setPreviewTarget(null)}>
            <div
              className="modal-card history-preview-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="history-preview-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal-card__header">
                <div>
                  <p className="modal-card__eyebrow">Video preview</p>
                  <h3 id="history-preview-title">{previewTarget.resiNumber}</h3>
                  <p className="modal-card__meta">
                    Operator:{' '}
                    {formatOperatorForCurrentSession(
                      previewTarget.operatorName,
                      previewTarget.operatorCode,
                      currentOperatorName,
                      currentOperatorCode,
                    )}
                  </p>
                </div>
                <button type="button" className="modal-card__close" onClick={() => setPreviewTarget(null)}>
                  Tutup
                </button>
              </div>

              <div className="modal-card__body history-preview-modal__body">
                {previewUrl ? (
                  <video
                    src={previewUrl}
                    controls
                    autoPlay
                    playsInline
                    className="history-preview-modal__video"
                  />
                ) : (
                  <div className="player-video__empty">
                    <strong>Preview belum tersedia.</strong>
                    <p>{previewMessage}</p>
                  </div>
                )}
                <div className="history-preview-modal__actions">
                  <button
                    type="button"
                    className="action-button action-button--primary"
                    onClick={handleDownloadPreview}
                    disabled={!previewUrl}
                  >
                    Download
                  </button>
                  <button
                    type="button"
                    className="action-button"
                    onClick={() => void copyText(previewTarget.filePath)}
                  >
                    Copy path
                  </button>
                </div>
                <p className="history-preview-modal__message">{previewMessage}</p>
              </div>
            </div>
          </div>
        ) : null}

      </div>
    </StageCard>
  )
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
  if (value === null) {
    return '-'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = value
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
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

async function copyText(value: string) {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return
  }

  await navigator.clipboard.writeText(value)
}

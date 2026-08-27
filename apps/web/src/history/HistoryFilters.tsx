import { useEffect, useRef, useState } from 'react'
import type { WorkTask } from '@pakti/types'

import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'

export type HistoryTaskFilter = 'all' | WorkTask

type OperatorOption = {
  value: string
  label: string
}

type HistoryFiltersProps = {
  searchText: string
  taskFilter: HistoryTaskFilter
  operatorFilter: string
  dateFrom: string
  dateTo: string
  isAdmin: boolean
  operatorOptions: OperatorOption[]
  onSearchTextChange: (value: string) => void
  onTaskFilterChange: (value: HistoryTaskFilter) => void
  onOperatorFilterChange: (value: string) => void
  onDateChange: (kind: 'from' | 'to', value: string) => void
  onClearFilters: () => void
}

const taskOptions: Array<{ value: HistoryTaskFilter; label: string }> = [
  { value: 'all', label: 'Semua task' },
  { value: 'qc', label: 'QC' },
  { value: 'packing', label: 'Packing' },
]

export function HistoryFilters({
  searchText,
  taskFilter,
  operatorFilter,
  dateFrom,
  dateTo,
  isAdmin,
  operatorOptions,
  onSearchTextChange,
  onTaskFilterChange,
  onOperatorFilterChange,
  onDateChange,
  onClearFilters,
}: HistoryFiltersProps) {
  const today = formatDateInput(new Date())
  const yesterday = formatDateInput(addDays(new Date(), -1))
  const sevenDaysAgo = formatDateInput(addDays(new Date(), -6))
  const activeDatePreset = getActiveDatePreset({ dateFrom, dateTo, today, yesterday, sevenDaysAgo })
  const [showCustomRange, setShowCustomRange] = useState(activeDatePreset === 'custom')
  const shouldShowCustomRange = showCustomRange || activeDatePreset === 'custom'

  function applyDatePreset(preset: 'today' | 'yesterday' | '7days') {
    setShowCustomRange(false)

    if (preset === 'today') {
      onDateChange('from', today)
      onDateChange('to', today)
      return
    }

    if (preset === 'yesterday') {
      onDateChange('from', yesterday)
      onDateChange('to', yesterday)
      return
    }

    onDateChange('from', sevenDaysAgo)
    onDateChange('to', today)
  }

  function handleClearFilters() {
    setShowCustomRange(false)
    onClearFilters()
  }

  return (
    <section className="history-opencode__filters">
      <div className="grid gap-4">
        <div className="flex items-center justify-between gap-3 border-b border-[rgba(15,0,0,0.08)] pb-3">
          <p className="text-sm font-bold">[+] Filter Pencarian</p>
          <Button type="button" variant="ghost" size="sm" className="history-opencode__button" onClick={handleClearFilters} aria-label="Reset filter" title="Reset filter">
            [reset]
          </Button>
        </div>
        <div className="history-opencode__filter-bar">
          <div className="relative">
            <span className="history-opencode__input-prefix" aria-hidden="true">[?]</span>
            <Input value={searchText} onChange={(event) => onSearchTextChange(event.target.value)} placeholder="Cari resi / no. pesanan..." className="history-opencode__input pl-12" aria-label="Cari resi atau nomor pesanan" />
            {searchText.trim() ? (
              <Button type="button" variant="ghost" size="sm" className="history-opencode__clear" onClick={() => onSearchTextChange('')}>
                [clear]
              </Button>
            ) : null}
          </div>

          <div className={isAdmin ? 'grid items-start gap-3 xl:grid-cols-[minmax(260px,auto)_240px_minmax(360px,1fr)]' : 'grid items-start gap-3 xl:grid-cols-[minmax(260px,auto)_minmax(360px,1fr)]'}>
            <div className="history-opencode__task-filter" aria-label="Filter task">
              {taskOptions.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={taskFilter === option.value ? 'is-active' : ''}
                  onClick={() => onTaskFilterChange(option.value)}
                >
                  {taskFilter === option.value ? `[${option.label}]` : option.label}
                </Button>
              ))}
            </div>

            {isAdmin ? (
              <OperatorSearchSelect
                value={operatorFilter}
                options={operatorOptions}
                onChange={onOperatorFilterChange}
              />
            ) : null}

            <div className="history-opencode__date-filter">
              <div className="history-opencode__date-presets" aria-label="Filter tanggal">
                <Button type="button" variant="ghost" size="sm" className={activeDatePreset === 'today' && !showCustomRange ? 'is-active' : ''} onClick={() => applyDatePreset('today')}>
                  {activeDatePreset === 'today' && !showCustomRange ? '[Hari ini]' : 'Hari ini'}
                </Button>
                <Button type="button" variant="ghost" size="sm" className={activeDatePreset === 'yesterday' && !showCustomRange ? 'is-active' : ''} onClick={() => applyDatePreset('yesterday')}>
                  {activeDatePreset === 'yesterday' && !showCustomRange ? '[Kemarin]' : 'Kemarin'}
                </Button>
                <Button type="button" variant="ghost" size="sm" className={activeDatePreset === '7days' && !showCustomRange ? 'is-active' : ''} onClick={() => applyDatePreset('7days')}>
                  {activeDatePreset === '7days' && !showCustomRange ? '[7 hari]' : '7 hari'}
                </Button>
                <Button type="button" variant="ghost" size="sm" className={shouldShowCustomRange ? 'is-active' : ''} onClick={() => setShowCustomRange(true)}>
                  {shouldShowCustomRange ? '[Custom/Rentang]' : 'Custom/Rentang'}
                </Button>
              </div>
              {shouldShowCustomRange ? (
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <div className="relative">
                    <span className="history-opencode__date-label">Mulai</span>
                    <Input type="date" value={dateFrom} onChange={(event) => onDateChange('from', event.target.value)} className="history-opencode__input pl-14" aria-label="Tanggal mulai" />
                  </div>
                  <span className="history-opencode__range-separator">to</span>
                  <div className="relative">
                    <span className="history-opencode__date-label">Sampai</span>
                    <Input type="date" value={dateTo} onChange={(event) => onDateChange('to', event.target.value)} className="history-opencode__input pl-16" aria-label="Tanggal akhir" />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function getActiveDatePreset({
  dateFrom,
  dateTo,
  today,
  yesterday,
  sevenDaysAgo,
}: {
  dateFrom: string
  dateTo: string
  today: string
  yesterday: string
  sevenDaysAgo: string
}) {
  if (!dateFrom && !dateTo) {
    return 'none'
  }

  if (dateFrom === today && dateTo === today) {
    return 'today'
  }

  if (dateFrom === yesterday && dateTo === yesterday) {
    return 'yesterday'
  }

  if (dateFrom === sevenDaysAgo && dateTo === today) {
    return '7days'
  }

  return 'custom'
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function formatDateInput(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function OperatorSearchSelect({
  value,
  options,
  onChange,
}: {
  value: string
  options: OperatorOption[]
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement | null>(null)
  const cleanedOptions = options.filter((option) => option.value.trim() !== '')
  const selectedLabel = value === 'all' ? 'Semua user' : cleanedOptions.find((option) => option.value === value)?.label ?? 'Pilih user'
  const displayedSelectedLabel = value === 'all' || cleanedOptions.some((option) => option.value === value) ? `[${selectedLabel}]` : selectedLabel
  const normalizedQuery = query.trim().toLowerCase()
  const filteredOptions = normalizedQuery
    ? cleanedOptions.filter((option) => option.label.toLowerCase().includes(normalizedQuery) || option.value.toLowerCase().includes(normalizedQuery))
    : cleanedOptions

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  function selectOperator(nextValue: string) {
    onChange(nextValue)
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="history-opencode__operator-filter">
      <Button type="button" variant="outline" className="history-opencode__operator-trigger" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        <span className="truncate">{displayedSelectedLabel}</span>
      </Button>
      {open ? (
        <div className="history-opencode__operator-popover">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari operator..." className="history-opencode__input" aria-label="Cari operator" autoFocus />
          <div className="history-opencode__operator-options">
            <button type="button" className={value === 'all' ? 'is-active' : ''} onClick={() => selectOperator('all')}>
              Semua user
            </button>
            {filteredOptions.length ? (
              filteredOptions.map((option) => (
                <button key={option.value} type="button" className={value === option.value ? 'is-active' : ''} onClick={() => selectOperator(option.value)}>
                  {option.label}
                </button>
              ))
            ) : (
              <span>Tidak ada operator.</span>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

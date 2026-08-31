import { useEffect, useRef, useState } from 'react'
import type { WorkTask } from '@pakti/types'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDown01Icon, RefreshIcon, Search01Icon } from '@hugeicons/core-free-icons'

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
    <section className="overflow-hidden rounded-xl border border-[#e6e6e6] bg-white">
      <div className="flex flex-nowrap items-center gap-2 overflow-x-auto p-2 scrollbar-thin [scrollbar-width:thin] sm:p-2.5">
        <label className="relative flex min-w-[180px] flex-1 max-w-[320px]">
          <span className="pointer-events-none absolute inset-y-0 left-0 grid w-8 place-items-center text-[#a39e98]">
            <HugeiconsIcon icon={Search01Icon} size={16} strokeWidth={1.9} />
          </span>
          <Input
            value={searchText}
            onChange={(event) => onSearchTextChange(event.target.value)}
            placeholder="Cari resi / pesanan..."
            className="h-8 w-full rounded-[8px] border-[#e6e6e6] bg-white pl-8 pr-7 font-['Inter'] text-[13px] placeholder:text-[#a39e98] focus-visible:border-[#CFCBC7] focus-visible:ring-0"
            aria-label="Cari resi atau nomor pesanan"
          />
          {searchText.trim() ? (
            <button
              type="button"
              onClick={() => onSearchTextChange('')}
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full px-1.5 py-0.5 font-['Inter'] text-[11px] font-medium text-[#615d59] hover:bg-[#f6f5f4]"
            >
              ×
            </button>
          ) : null}
        </label>

        <div className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-[#e6e6e6] bg-[#f6f5f4] p-0.5">
          {taskOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onTaskFilterChange(option.value)}
              className={`rounded-md px-2.5 py-1 font-['Inter'] text-[12px] font-medium transition-colors ${taskFilter === option.value ? 'bg-white text-[#000000] shadow-sm ring-1 ring-[#e6e6e6]' : 'text-[#615d59] hover:text-[#000000]'}`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {isAdmin ? <span className="shrink-0"><OperatorSearchSelect value={operatorFilter} options={operatorOptions} onChange={onOperatorFilterChange} compact /></span> : null}

        <div className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-[#e6e6e6] bg-[#f6f5f4] p-0.5">
          <button
            type="button"
            onClick={() => applyDatePreset('today')}
            className={`rounded-md px-2.5 py-1 font-['Inter'] text-[12px] font-medium ${activeDatePreset === 'today' && !showCustomRange ? 'bg-white text-[#000000] shadow-sm ring-1 ring-[#e6e6e6]' : 'text-[#615d59] hover:text-[#000000]'}`}
          >
            Hari ini
          </button>
          <button
            type="button"
            onClick={() => applyDatePreset('yesterday')}
            className={`rounded-md px-2.5 py-1 font-['Inter'] text-[12px] font-medium ${activeDatePreset === 'yesterday' && !showCustomRange ? 'bg-white text-[#000000] shadow-sm ring-1 ring-[#e6e6e6]' : 'text-[#615d59] hover:text-[#000000]'}`}
          >
            Kemarin
          </button>
          <button
            type="button"
            onClick={() => applyDatePreset('7days')}
            className={`rounded-md px-2.5 py-1 font-['Inter'] text-[12px] font-medium ${activeDatePreset === '7days' && !showCustomRange ? 'bg-white text-[#000000] shadow-sm ring-1 ring-[#e6e6e6]' : 'text-[#615d59] hover:text-[#000000]'}`}
          >
            7 hari
          </button>
          <button
            type="button"
            onClick={() => setShowCustomRange(true)}
            className={`rounded-md px-2.5 py-1 font-['Inter'] text-[12px] font-medium ${shouldShowCustomRange ? 'bg-white text-[#000000] shadow-sm ring-1 ring-[#e6e6e6]' : 'text-[#615d59] hover:text-[#000000]'}`}
          >
            Custom
          </button>
        </div>

        {shouldShowCustomRange ? (
          <div className="flex shrink-0 items-center gap-1">
            <Input type="date" value={dateFrom} onChange={(event) => onDateChange('from', event.target.value)} className="h-7 rounded-[6px] border-[#e6e6e6] bg-white px-2 font-['Inter'] text-[12px] focus-visible:border-[#0075de] focus-visible:ring-0" aria-label="Tanggal mulai" />
            <span className="font-['Inter'] text-[11px] text-[#a39e98]">—</span>
            <Input type="date" value={dateTo} onChange={(event) => onDateChange('to', event.target.value)} className="h-7 rounded-[6px] border-[#e6e6e6] bg-white px-2 font-['Inter'] text-[12px] focus-visible:border-[#0075de] focus-visible:ring-0" aria-label="Tanggal akhir" />
          </div>
        ) : null}

        <Button
          type="button"
          variant="ghost"
          onClick={handleClearFilters}
          className="ml-auto inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 font-['Inter'] text-[12px] font-medium text-[#615d59] hover:bg-[#f6f5f4]"
          title="Reset filter"
        >
          <HugeiconsIcon icon={RefreshIcon} size={14} strokeWidth={1.9} /> Reset
        </Button>
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
  compact = false,
}: {
  value: string
  options: OperatorOption[]
  onChange: (value: string) => void
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement | null>(null)
  const cleanedOptions = options.filter((option) => option.value.trim() !== '')
  const selectedLabel = value === 'all' ? 'Semua user' : cleanedOptions.find((option) => option.value === value)?.label ?? 'Pilih user'
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
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className={`inline-flex items-center gap-2 rounded-lg border border-[#e6e6e6] bg-white pr-8 font-['Inter'] font-medium text-[#000000] hover:bg-[#f6f5f4] ${compact ? 'h-8 px-2.5 text-[12px]' : 'h-10 px-3 text-[13px]'}`}
      >
        <span className={`${compact ? 'max-w-[12ch]' : 'max-w-[14ch]'} truncate`}>{selectedLabel}</span>
        <span className="pointer-events-none absolute right-2 grid place-items-center text-[#a39e98]">
          <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={1.9} />
        </span>
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 grid gap-2 rounded-xl border border-[#e6e6e6] bg-white p-2 shadow-[0_10px_28px_rgba(0,0,0,0.08)]">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari operator..."
            className="h-9 rounded-[8px] border-[#e6e6e6] bg-white font-['Inter'] text-[13px] placeholder:text-[#a39e98] focus-visible:border-[#0075de] focus-visible:ring-0"
            aria-label="Cari operator"
            autoFocus
          />
          <div className="grid max-h-[220px] overflow-y-auto">
            <button type="button" className={`rounded-lg px-3 py-2 text-left font-['Inter'] text-[13px] ${value === 'all' ? 'bg-[#000000] text-white' : 'text-[#31302e] hover:bg-[#f6f5f4]'}`} onClick={() => selectOperator('all')}>
              Semua user
            </button>
            {filteredOptions.length ? (
              filteredOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`rounded-lg px-3 py-2 text-left font-['Inter'] text-[13px] ${value === option.value ? 'bg-[#000000] text-white' : 'text-[#31302e] hover:bg-[#f6f5f4]'}`}
                  onClick={() => selectOperator(option.value)}
                >
                  {option.label}
                </button>
              ))
            ) : (
              <span className="px-3 py-2 font-['Inter'] text-[13px] text-[#a39e98]">Tidak ada operator.</span>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

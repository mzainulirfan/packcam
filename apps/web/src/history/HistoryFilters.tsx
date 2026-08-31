import { useEffect, useRef, useState } from 'react'
import type { WorkTask } from '@pakti/types'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDown01Icon, Calendar03Icon, RefreshIcon, Search01Icon, Task01Icon, Tick02Icon, UserCircleIcon } from '@hugeicons/core-free-icons'

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
  { value: 'all', label: 'Semua tugas' },
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
  const hasActiveFilters = Boolean(searchText.trim()) || taskFilter !== 'all' || operatorFilter !== 'all' || activeDatePreset !== 'none'

  return (
    <div className="relative z-20 overflow-visible border-b border-[#dddddd] p-4 sm:p-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <label className="relative flex flex-1 min-w-[240px]">
          <span className="pointer-events-none absolute inset-y-0 left-0 grid w-10 place-items-center text-[#a39e98]">
            <HugeiconsIcon icon={Search01Icon} size={18} strokeWidth={1.9} />
          </span>
          <Input
            value={searchText}
            onChange={(event) => onSearchTextChange(event.target.value)}
            placeholder="Cari resi atau nomor pesanan..."
            className="h-10 w-full rounded-[4px] border-[#dddddd] bg-white pl-10 pr-8 font-['Inter'] text-[14px] placeholder:text-[#a39e98] focus-visible:border-[#CFCBC7] focus-visible:ring-0"
            aria-label="Cari resi atau nomor pesanan"
          />
          {searchText.trim() ? (
            <button type="button" onClick={() => onSearchTextChange('')} className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full px-1.5 py-0.5 font-['Inter'] text-[11px] font-medium text-[#615d59] hover:bg-[#f6f5f4]">
              ×
            </button>
          ) : null}
        </label>

        <div className="flex flex-wrap gap-2">
          <TaskDropdown value={taskFilter} onChange={onTaskFilterChange} />
          {isAdmin ? <OperatorSearchSelect value={operatorFilter} options={operatorOptions} onChange={onOperatorFilterChange} compact /> : null}
          <PeriodeDropdown
            activePreset={activeDatePreset}
            showCustom={shouldShowCustomRange}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onPreset={applyDatePreset}
            onCustomToggle={() => setShowCustomRange(true)}
            onDateChange={onDateChange}
          />
          <Button type="button" variant="ghost" onClick={handleClearFilters} disabled={!hasActiveFilters} className="h-10 inline-flex items-center gap-2 rounded-lg px-3 font-['Inter'] text-[13px] font-medium text-[#615d59] hover:bg-[#f6f5f4] disabled:opacity-40" title="Reset filter">
            <HugeiconsIcon icon={RefreshIcon} size={16} strokeWidth={1.9} /> Reset
          </Button>
        </div>
      </div>
    </div>
  )
}

function TaskDropdown({ value, onChange }: { value: HistoryTaskFilter; onChange: (v: HistoryTaskFilter) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  const label = value === 'all' ? 'Semua tugas' : value === 'qc' ? 'QC' : 'Packing'
  useEffect(() => {
    function onDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [])
  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" onClick={() => setOpen((v) => !v)} className="relative inline-flex h-10 items-center rounded-lg border border-[#dddddd] bg-white pl-9 pr-8 font-['Inter'] text-[13px] font-medium text-[#000000] hover:bg-[#f6f5f4]">
        <span className="pointer-events-none absolute left-3 grid place-items-center text-[#31302e]">
          <HugeiconsIcon icon={Task01Icon} size={17} strokeWidth={1.9} />
        </span>
        {label}
        <span className="pointer-events-none absolute right-3 grid place-items-center text-[#a39e98]">
          <HugeiconsIcon icon={ArrowDown01Icon} size={15} strokeWidth={1.9} />
        </span>
      </button>
      {open ? (
        <div className="absolute left-0 top-[calc(100%+6px)] z-30 min-w-[160px] rounded-xl border border-[#dddddd] bg-white p-1 shadow-[0_10px_28px_rgba(0,0,0,0.08)]">
          {taskOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left font-['Inter'] text-[13px] ${value === opt.value ? 'bg-[#f6f5f4] font-semibold text-[#000000]' : 'text-[#31302e] hover:bg-[#f6f5f4]'}`}
            >
              {opt.label} {value === opt.value ? <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function PeriodeDropdown({
  activePreset,
  showCustom,
  dateFrom,
  dateTo,
  onPreset,
  onCustomToggle,
  onDateChange,
}: {
  activePreset: string
  showCustom: boolean
  dateFrom: string
  dateTo: string
  onPreset: (p: 'today' | 'yesterday' | '7days') => void
  onCustomToggle: () => void
  onDateChange: (k: 'from' | 'to', v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  const label = activePreset === 'today' ? 'Hari ini' : activePreset === 'yesterday' ? 'Kemarin' : activePreset === '7days' ? '7 hari terakhir' : showCustom ? 'Custom' : 'Periode'
  useEffect(() => {
    function onDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [])
  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" onClick={() => setOpen((v) => !v)} className="relative inline-flex h-10 items-center rounded-lg border border-[#dddddd] bg-white pl-9 pr-8 font-['Inter'] text-[13px] font-medium text-[#000000] hover:bg-[#f6f5f4]">
        <span className="pointer-events-none absolute left-3 grid place-items-center text-[#31302e]">
          <HugeiconsIcon icon={Calendar03Icon} size={17} strokeWidth={1.9} />
        </span>
        {label}
        <span className="pointer-events-none absolute right-3 grid place-items-center text-[#a39e98]">
          <HugeiconsIcon icon={ArrowDown01Icon} size={15} strokeWidth={1.9} />
        </span>
      </button>
      {open ? (
        <div className="absolute left-0 top-[calc(100%+6px)] z-30 grid min-w-[260px] gap-1 rounded-xl border border-[#dddddd] bg-white p-1 shadow-[0_10px_28px_rgba(0,0,0,0.08)]">
          <button type="button" onClick={() => { onPreset('today'); setOpen(false) }} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left font-['Inter'] text-[13px] ${activePreset === 'today' && !showCustom ? 'bg-[#f6f5f4] font-semibold text-[#000000]' : 'text-[#31302e] hover:bg-[#f6f5f4]'}`}>
            Hari ini {activePreset === 'today' && !showCustom ? <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} /> : null}
          </button>
          <button type="button" onClick={() => { onPreset('yesterday'); setOpen(false) }} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left font-['Inter'] text-[13px] ${activePreset === 'yesterday' && !showCustom ? 'bg-[#f6f5f4] font-semibold text-[#000000]' : 'text-[#31302e] hover:bg-[#f6f5f4]'}`}>
            Kemarin {activePreset === 'yesterday' && !showCustom ? <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} /> : null}
          </button>
          <button type="button" onClick={() => { onPreset('7days'); setOpen(false) }} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left font-['Inter'] text-[13px] ${activePreset === '7days' && !showCustom ? 'bg-[#f6f5f4] font-semibold text-[#000000]' : 'text-[#31302e] hover:bg-[#f6f5f4]'}`}>
            7 hari terakhir {activePreset === '7days' && !showCustom ? <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} /> : null}
          </button>
          <button type="button" onClick={() => { onCustomToggle(); setOpen(false) }} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left font-['Inter'] text-[13px] ${showCustom ? 'bg-[#f6f5f4] font-semibold text-[#000000]' : 'text-[#31302e] hover:bg-[#f6f5f4]'}`}>
            Custom {showCustom ? <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} /> : null}
          </button>
          {showCustom ? (
            <div className="flex items-center gap-1 border-t border-[#dddddd] px-1 pt-2">
              <Input type="date" value={dateFrom} onChange={(e) => onDateChange('from', e.target.value)} className="h-7 rounded-[4px] border-[#dddddd] bg-white px-2 font-['Inter'] text-[12px] focus-visible:border-[#0075de] focus-visible:ring-0" />
              <span className="font-['Inter'] text-[11px] text-[#a39e98]">—</span>
              <Input type="date" value={dateTo} onChange={(e) => onDateChange('to', e.target.value)} className="h-7 rounded-[4px] border-[#dddddd] bg-white px-2 font-['Inter'] text-[12px] focus-visible:border-[#0075de] focus-visible:ring-0" />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
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
  if (!dateFrom && !dateTo) return 'none'
  if (dateFrom === today && dateTo === today) return 'today'
  if (dateFrom === yesterday && dateTo === yesterday) return 'yesterday'
  if (dateFrom === sevenDaysAgo && dateTo === today) return '7days'
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
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
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
        className={`relative inline-flex items-center border border-[#dddddd] bg-[#f6f5f4] pl-9 pr-8 font-['Inter'] font-medium text-[#000000] hover:bg-[#f6f5f4] ${compact ? 'h-10 rounded-lg text-[13px]' : 'h-10 rounded-lg px-3 text-[13px]'}`}
      >
        <span className="pointer-events-none absolute left-3 grid place-items-center text-[#31302e]">
          <HugeiconsIcon icon={UserCircleIcon} size={17} strokeWidth={1.9} />
        </span>
        <span className={`${compact ? 'max-w-[12ch]' : 'max-w-[14ch]'} truncate`}>{selectedLabel}</span>
        <span className="pointer-events-none absolute right-3 grid place-items-center text-[#a39e98]">
          <HugeiconsIcon icon={ArrowDown01Icon} size={15} strokeWidth={1.9} />
        </span>
      </button>
      {open ? (
        <div className="absolute left-0 top-[calc(100%+6px)] z-30 grid min-w-[200px] gap-2 rounded-xl border border-[#dddddd] bg-white p-2 shadow-[0_10px_28px_rgba(0,0,0,0.08)]">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari operator..."
            className="h-9 rounded-[4px] border-[#dddddd] bg-white font-['Inter'] text-[13px] placeholder:text-[#a39e98] focus-visible:border-[#0075de] focus-visible:ring-0"
            aria-label="Cari operator"
            autoFocus
          />
          <div className="grid max-h-[220px] overflow-y-auto">
            <button type="button" className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left font-['Inter'] text-[13px] ${value === 'all' ? 'bg-[#f6f5f4] font-semibold text-[#000000]' : 'text-[#31302e] hover:bg-[#f6f5f4]'}`} onClick={() => selectOperator('all')}>
              Semua user {value === 'all' ? <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} /> : null}
            </button>
            {filteredOptions.length ? (
              filteredOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left font-['Inter'] text-[13px] ${value === option.value ? 'bg-[#f6f5f4] font-semibold text-[#000000]' : 'text-[#31302e] hover:bg-[#f6f5f4]'}`}
                  onClick={() => selectOperator(option.value)}
                >
                  {option.label} {value === option.value ? <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} /> : null}
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

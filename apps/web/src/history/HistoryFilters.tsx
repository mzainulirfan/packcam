import { useEffect, useRef, useState } from 'react'
import type { WorkTask } from '@pakti/types'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDown01Icon, Cancel01Icon, RefreshIcon, Search01Icon, Tick02Icon } from '@hugeicons/core-free-icons'

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

  const hasActiveFilters = taskFilter !== 'all' || operatorFilter !== 'all' || activeDatePreset !== 'none'
  const activeChips: Array<{ key: string; label: string; onRemove: () => void }> = []
  if (taskFilter !== 'all') activeChips.push({ key: 'task', label: taskFilter === 'qc' ? 'QC' : 'Packing', onRemove: () => onTaskFilterChange('all') })
  if (isAdmin && operatorFilter !== 'all') {
    const opLabel = operatorOptions.find((o) => o.value === operatorFilter)?.label ?? operatorFilter
    activeChips.push({ key: 'operator', label: opLabel, onRemove: () => onOperatorFilterChange('all') })
  }
  if (activeDatePreset !== 'none') {
    const dateLabel = activeDatePreset === 'today' ? 'Hari ini' : activeDatePreset === 'yesterday' ? 'Kemarin' : activeDatePreset === '7days' ? '7 hari' : `${dateFrom} – ${dateTo}`
    activeChips.push({ key: 'date', label: dateLabel, onRemove: () => { setShowCustomRange(false); onDateChange('from', ''); onDateChange('to', '') } })
  }

  return (
    <section className="relative z-20 mt-5 overflow-visible rounded-xl border border-[#e6e6e6] bg-white">
      <div className="flex flex-wrap items-center gap-2 p-2 sm:p-2.5 lg:flex-nowrap">
        <label className="relative flex min-w-[200px] flex-1 max-w-[360px] shrink-0">
          <span className="pointer-events-none absolute inset-y-0 left-0 grid w-8 place-items-center text-[#a39e98]">
            <HugeiconsIcon icon={Search01Icon} size={16} strokeWidth={1.9} />
          </span>
          <Input
            value={searchText}
            onChange={(event) => onSearchTextChange(event.target.value)}
            placeholder="Cari resi atau nomor pesanan..."
            className="h-8 w-full rounded-[8px] border-[#e6e6e6] bg-white pl-8 pr-7 font-['Inter'] text-[13px] placeholder:text-[#a39e98] focus-visible:border-[#CFCBC7] focus-visible:ring-0"
            aria-label="Cari resi atau nomor pesanan"
          />
          {searchText.trim() ? (
            <button type="button" onClick={() => onSearchTextChange('')} className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full px-1.5 py-0.5 font-['Inter'] text-[11px] font-medium text-[#615d59] hover:bg-[#f6f5f4]">
              ×
            </button>
          ) : null}
        </label>

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

        <Button type="button" variant="ghost" onClick={handleClearFilters} className="ml-auto inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 font-['Inter'] text-[12px] font-medium text-[#615d59] hover:bg-[#f6f5f4]" title="Reset filter">
          <HugeiconsIcon icon={RefreshIcon} size={14} strokeWidth={1.9} /> Reset
        </Button>
      </div>

      {hasActiveFilters ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-[#e6e6e6] bg-[#fbfaf9] px-2 py-2 sm:px-2.5">
          {activeChips.map((chip) => (
            <span key={chip.key} className="inline-flex items-center gap-1 rounded-full border border-[#e6e6e6] bg-white px-2.5 py-1 font-['Inter'] text-[12px] font-medium text-[#31302e]">
              {chip.label}
              <button type="button" onClick={chip.onRemove} className="grid h-4 w-4 place-items-center rounded-full text-[#a39e98] hover:bg-[#f6f5f4] hover:text-[#000000]">
                <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
              </button>
            </span>
          ))}
          <button type="button" onClick={handleClearFilters} className="font-['Inter'] text-[12px] font-medium text-[#615d59] hover:text-[#000000] hover:underline">
            Reset semua
          </button>
        </div>
      ) : null}
    </section>
  )
}

function TaskDropdown({ value, onChange }: { value: HistoryTaskFilter; onChange: (v: HistoryTaskFilter) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  const label = value === 'all' ? 'Semua task' : value === 'qc' ? 'QC' : 'Packing'
  useEffect(() => {
    function onDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [])
  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e6e6e6] bg-white px-2.5 pr-7 font-['Inter'] text-[12px] font-medium text-[#000000] hover:bg-[#f6f5f4]">
        <span className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.06em] text-[#a39e98]">Task:</span> {label}
        <span className="pointer-events-none absolute right-2 grid place-items-center text-[#a39e98]">
          <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={1.9} />
        </span>
      </button>
      {open ? (
        <div className="absolute left-0 top-[calc(100%+6px)] z-30 min-w-[160px] rounded-xl border border-[#e6e6e6] bg-white p-1 shadow-[0_10px_28px_rgba(0,0,0,0.08)]">
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
      <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e6e6e6] bg-white px-2.5 pr-7 font-['Inter'] text-[12px] font-medium text-[#000000] hover:bg-[#f6f5f4]">
        <span className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.06em] text-[#a39e98]">Periode:</span> {label}
        <span className="pointer-events-none absolute right-2 grid place-items-center text-[#a39e98]">
          <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={1.9} />
        </span>
      </button>
      {open ? (
        <div className="absolute left-0 top-[calc(100%+6px)] z-30 grid min-w-[260px] gap-1 rounded-xl border border-[#e6e6e6] bg-white p-1 shadow-[0_10px_28px_rgba(0,0,0,0.08)]">
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
            <div className="flex items-center gap-1 border-t border-[#e6e6e6] px-1 pt-2">
              <Input type="date" value={dateFrom} onChange={(e) => onDateChange('from', e.target.value)} className="h-7 rounded-[6px] border-[#e6e6e6] bg-white px-2 font-['Inter'] text-[12px] focus-visible:border-[#0075de] focus-visible:ring-0" />
              <span className="font-['Inter'] text-[11px] text-[#a39e98]">—</span>
              <Input type="date" value={dateTo} onChange={(e) => onDateChange('to', e.target.value)} className="h-7 rounded-[6px] border-[#e6e6e6] bg-white px-2 font-['Inter'] text-[12px] focus-visible:border-[#0075de] focus-visible:ring-0" />
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
        className={`inline-flex items-center gap-1.5 rounded-lg border border-[#e6e6e6] bg-white pr-7 font-['Inter'] font-medium text-[#000000] hover:bg-[#f6f5f4] ${compact ? 'h-8 px-2.5 text-[12px]' : 'h-10 px-3 text-[13px]'}`}
      >
        <span className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.06em] text-[#a39e98]">User:</span>
        <span className={`${compact ? 'max-w-[12ch]' : 'max-w-[14ch]'} truncate`}>{selectedLabel}</span>
        <span className="pointer-events-none absolute right-2 grid place-items-center text-[#a39e98]">
          <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={1.9} />
        </span>
      </button>
      {open ? (
        <div className="absolute left-0 top-[calc(100%+6px)] z-30 grid min-w-[200px] gap-2 rounded-xl border border-[#e6e6e6] bg-white p-2 shadow-[0_10px_28px_rgba(0,0,0,0.08)]">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari operator..."
            className="h-9 rounded-[8px] border-[#e6e6e6] bg-white font-['Inter'] text-[13px] placeholder:text-[#a39e98] focus-visible:border-[#0075de] focus-visible:ring-0"
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

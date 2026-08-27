import type { WorkTask } from '@pakti/types'

import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'

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
  return (
    <section className="history-opencode__filters">
      <div className="grid gap-3">
        <div className="relative">
          <span className="history-opencode__input-prefix" aria-hidden="true">[?]</span>
          <Input value={searchText} onChange={(event) => onSearchTextChange(event.target.value)} placeholder="Cari resi / no. pesanan..." className="history-opencode__input pl-12" aria-label="Cari resi atau nomor pesanan" />
          {searchText.trim() ? (
            <Button type="button" variant="ghost" size="sm" className="history-opencode__clear" onClick={() => onSearchTextChange('')}>
              [clear]
            </Button>
          ) : null}
        </div>

        <div className="grid gap-3 xl:grid-cols-[180px_200px_minmax(360px,1fr)_auto]">
          <Select value={taskFilter} onValueChange={(value) => onTaskFilterChange(value as HistoryTaskFilter)}>
            <SelectTrigger className="history-opencode__select">
              <SelectValue placeholder="Task" />
            </SelectTrigger>
            <SelectContent>
              {taskOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {isAdmin ? (
            <Select value={operatorFilter} onValueChange={onOperatorFilterChange}>
              <SelectTrigger className="history-opencode__select">
                <SelectValue placeholder="User" />
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
          ) : null}

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

          <Button type="button" variant="ghost" className="history-opencode__button" onClick={onClearFilters} aria-label="Reset filter" title="Reset filter">
            [reset]
          </Button>
        </div>
      </div>
    </section>
  )
}

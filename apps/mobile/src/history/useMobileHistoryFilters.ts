import { useMemo } from 'react'
import type { RecordingRow } from '@pakti/types'
import {
  filterRecordings,
  getHistoryEmptyState,
  groupHistoryByDate,
  groupRecordings,
  type HistoryDateFilter,
  type HistorySortOrder,
  type HistoryTaskFilter,
} from './historyUtils'

type UseMobileHistoryFiltersInput = {
  recordings: RecordingRow[]
  operatorName?: string | null
  operatorCode?: string | null
  historyTaskFilter: HistoryTaskFilter
  historyResiQuery: string
  historyAllAccounts: boolean
  historyDateFilter: HistoryDateFilter
  historySortOrder: HistorySortOrder
  historyDocStatusFilter: 'all' | 'lengkap' | 'belum-lengkap'
}

export function useMobileHistoryFilters({
  recordings,
  operatorName,
  operatorCode,
  historyTaskFilter,
  historyResiQuery,
  historyAllAccounts,
  historyDateFilter,
  historySortOrder,
  historyDocStatusFilter,
}: UseMobileHistoryFiltersInput) {
  const currentOperatorName = operatorName?.trim().toLowerCase() ?? ''
  const currentOperatorCode = operatorCode?.trim().toLowerCase() ?? ''
  const historyQuery = historyResiQuery.trim()
  const normalizedHistoryQuery = historyQuery.toLowerCase()

  const filteredRecordings = useMemo(() => {
    return filterRecordings({
      recordings,
      historyTaskFilter,
      historyDateFilter,
      normalizedHistoryQuery,
      historyAllAccounts,
      currentOperatorName,
      currentOperatorCode,
    })
  }, [
    currentOperatorCode,
    currentOperatorName,
    historyAllAccounts,
    historyDateFilter,
    historyTaskFilter,
    normalizedHistoryQuery,
    recordings,
  ])

  const hasHistoryFilters = historyTaskFilter !== 'all' || Boolean(historyQuery) || historyAllAccounts || historyDateFilter !== 'all'

  const matchingResiRecords = useMemo(() => {
    if (!normalizedHistoryQuery) {
      return []
    }

    return recordings.filter((record) => record.resiNumber.trim().toLowerCase().includes(normalizedHistoryQuery))
  }, [normalizedHistoryQuery, recordings])

  const latestMatchingResiRecord = useMemo(() => {
    if (!historyQuery || matchingResiRecords.length === 0) {
      return null
    }

    return [...matchingResiRecords].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] ?? null
  }, [historyQuery, matchingResiRecords])

  const groupedRecordings = useMemo(() => {
    return groupRecordings(filteredRecordings, historySortOrder)
  }, [filteredRecordings, historySortOrder])

  const historyFilterSheetActive = historyDocStatusFilter !== 'all' || historyAllAccounts || historyDateFilter !== 'all' || historySortOrder !== 'newest'

  const groupedByDate = useMemo(() => {
    return groupHistoryByDate(groupedRecordings, historyDocStatusFilter)
  }, [groupedRecordings, historyDocStatusFilter])

  const historyEmptyState = useMemo(() => getHistoryEmptyState({
    groupedRecordingsLength: groupedRecordings.length,
    historyQuery,
    matchingResiRecords,
    latestMatchingResiRecord,
    historyAllAccounts,
    currentOperatorName,
    currentOperatorCode,
  }), [
    currentOperatorCode,
    currentOperatorName,
    groupedRecordings.length,
    historyAllAccounts,
    historyQuery,
    latestMatchingResiRecord,
    matchingResiRecords,
  ])

  return {
    groupedRecordings,
    groupedByDate,
    hasHistoryFilters,
    historyFilterSheetActive,
    historyEmptyState,
  }
}

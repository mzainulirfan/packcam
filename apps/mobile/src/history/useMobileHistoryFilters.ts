import { useMemo } from 'react'
import type { RecordingRow, ShopeeOrder } from '@pakti/types'
import {
  filterRecordings,
  getHistoryEmptyState,
  groupHistoryByDate,
  groupRecordings,
  matchesRecordingLoginIdentity,
  type HistoryDateFilter,
  type HistorySortOrder,
  type HistoryTaskFilter,
} from './historyUtils'

type UseMobileHistoryFiltersInput = {
  recordings: RecordingRow[]
  shopeeOrders: ShopeeOrder[]
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
  shopeeOrders,
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
  const historyScopeRecordings = useMemo(() => {
    if (historyAllAccounts) {
      return recordings
    }

    return recordings.filter((record) => matchesRecordingLoginIdentity(
      record,
      currentOperatorName,
      currentOperatorCode,
    ))
  }, [currentOperatorCode, currentOperatorName, historyAllAccounts, recordings])
  const queryMatchedResiNumbers = useMemo(() => {
    if (!normalizedHistoryQuery) {
      return new Set<string>()
    }

    return new Set(
      [...historyScopeRecordings
        .filter(record => (record.orderNumber ?? '').trim().toLowerCase().includes(normalizedHistoryQuery))
        .map(record => record.resiNumber.trim().toLowerCase()), ...shopeeOrders
        .filter((order) => order.orderNumber.trim().toLowerCase().includes(normalizedHistoryQuery))
        .map((order) => order.trackingNumber?.trim().toLowerCase())
        .filter((resi): resi is string => Boolean(resi))],
    )
  }, [normalizedHistoryQuery, shopeeOrders, historyScopeRecordings])

  const filteredRecordings = useMemo(() => {
    return filterRecordings({
      recordings,
      historyTaskFilter,
      historyDateFilter,
      normalizedHistoryQuery,
      queryMatchedResiNumbers,
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
    queryMatchedResiNumbers,
    recordings,
  ])

  const hasHistoryFilters = historyTaskFilter !== 'all' || Boolean(historyQuery) || historyAllAccounts || historyDateFilter !== 'today' || historyDocStatusFilter !== 'all' || historySortOrder !== 'newest'

  const matchingResiRecords = useMemo(() => {
    if (!normalizedHistoryQuery) {
      return []
    }

    return historyScopeRecordings.filter((record) => {
      const normalizedResi = record.resiNumber.trim().toLowerCase()
      return normalizedResi.includes(normalizedHistoryQuery) || (record.orderNumber ?? '').trim().toLowerCase().includes(normalizedHistoryQuery) || queryMatchedResiNumbers.has(normalizedResi)
    })
  }, [normalizedHistoryQuery, queryMatchedResiNumbers, historyScopeRecordings])

  const latestMatchingResiRecord = useMemo(() => {
    if (!historyQuery || matchingResiRecords.length === 0) {
      return null
    }

    return [...matchingResiRecords].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] ?? null
  }, [historyQuery, matchingResiRecords])

  const groupedRecordings = useMemo(() => {
    return groupRecordings(filteredRecordings, historySortOrder)
  }, [filteredRecordings, historySortOrder])

  const historyFilterSheetActive = historyDocStatusFilter !== 'all' || historyAllAccounts || historyDateFilter !== 'today' || historySortOrder !== 'newest'

  const groupedByDate = useMemo(() => {
    return groupHistoryByDate(groupedRecordings, historyDocStatusFilter, historyScopeRecordings)
  }, [groupedRecordings, historyDocStatusFilter, historyScopeRecordings])

  const historyResultCount = groupedByDate.reduce((count, [, groups]) => count + groups.length, 0)

  const historyEmptyState = useMemo(() => getHistoryEmptyState({
    groupedRecordingsLength: historyResultCount,
    historyQuery,
    matchingResiRecords,
    latestMatchingResiRecord,
    historyAllAccounts,
    currentOperatorName,
    currentOperatorCode,
  }), [
    currentOperatorCode,
    currentOperatorName,
    historyResultCount,
    historyAllAccounts,
    historyQuery,
    latestMatchingResiRecord,
    matchingResiRecords,
  ])

  return {
    groupedRecordings,
    groupedByDate,
    historyResultCount,
    historyScopeRecordings,
    hasHistoryFilters,
    historyFilterSheetActive,
    historyEmptyState,
  }
}

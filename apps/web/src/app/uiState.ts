import { useSyncExternalStore } from 'react'
import { getPageFromPath, getPackingSessionIdFromPath, getPagePath, type PageId } from './navigation'

type Listener = () => void

export type RouteState = {
  page: PageId
  packingSessionId: string | null
}

function readLocationRoute(): RouteState {
  if (typeof window === 'undefined') {
    return { page: 'scan', packingSessionId: null }
  }

  const page = getPageFromPath(window.location.pathname)
  const packingSessionId = page === 'packing-session-detail' ? getPackingSessionIdFromPath(window.location.pathname) : null
  return { page, packingSessionId }
}

let routeState: RouteState = readLocationRoute()
const listeners = new Set<Listener>()

function emitChange() {
  for (const listener of listeners) {
    listener()
  }
}

function setRouteState(next: RouteState) {
  routeState = next
  emitChange()
}

export function navigateTo(page: PageId) {
  const path = getPagePath(page)

  if (typeof window !== 'undefined' && window.location.pathname !== path) {
    window.history.pushState(null, '', path)
  }

  setRouteState({ page, packingSessionId: null })
}

export function navigateToPackingSessionDetail(id: string) {
  const path = `/packing-sessions/${encodeURIComponent(id)}`
  if (typeof window !== 'undefined' && window.location.pathname !== path) {
    window.history.pushState(null, '', path)
  }
  setRouteState({ page: 'packing-session-detail', packingSessionId: id })
}

export function navigateToHistoryWithSession(sessionId: string | null) {
  const base = '/history'
  const url = sessionId ? `${base}?session=${encodeURIComponent(sessionId)}` : base
  if (typeof window !== 'undefined') {
    const next = `${window.location.pathname}${window.location.search}`
    if (next !== url) window.history.pushState(null, '', url)
  }
  setRouteState({ page: 'history', packingSessionId: null })
  try {
    if (sessionId) window.sessionStorage.setItem('pakti.historyPackingSessionId', sessionId)
    else window.sessionStorage.removeItem('pakti.historyPackingSessionId')
  } catch {}
}

export function useActivePage(): PageId {
  return useSyncExternalStore(subscribe, getPageSnapshot, getServerPageSnapshot)
}

export function useRouteState(): RouteState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export function usePackingSessionDetailId(): string | null {
  return useRouteState().packingSessionId
}

function getPageSnapshot(): PageId {
  return routeState.page
}

function getServerPageSnapshot(): PageId {
  return 'scan'
}

function getSnapshot(): RouteState {
  return routeState
}

function getServerSnapshot(): RouteState {
  return { page: 'scan', packingSessionId: null }
}

function subscribe(listener: Listener) {
  listeners.add(listener)

  if (typeof window !== 'undefined' && listeners.size === 1) {
    window.addEventListener('popstate', handlePopState)
  }

  return () => {
    listeners.delete(listener)
    if (typeof window !== 'undefined' && listeners.size === 0) {
      window.removeEventListener('popstate', handlePopState)
    }
  }
}

function handlePopState() {
  setRouteState(readLocationRoute())
}

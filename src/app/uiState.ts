import { useSyncExternalStore } from 'react'
import type { PageId } from './navigation'

type Listener = () => void

const ACTIVE_PAGE_KEY = 'packcam:ui:activePage'

let activePage: PageId = readStoredPage()
const listeners = new Set<Listener>()

function readStoredPage(): PageId {
  if (typeof window === 'undefined') {
    return 'scan'
  }

  const stored = window.localStorage.getItem(ACTIVE_PAGE_KEY)
  return stored === 'scan' || stored === 'history' || stored === 'settings' || stored === 'users' || stored === 'health'
    ? stored
    : 'scan'
}

function emitChange() {
  for (const listener of listeners) {
    listener()
  }
}

function setStoredPage(page: PageId) {
  activePage = page
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(ACTIVE_PAGE_KEY, page)
  }
  emitChange()
}

export function navigateTo(page: PageId) {
  setStoredPage(page)
}

export function useActivePage(): PageId {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

function getSnapshot() {
  return activePage
}

function getServerSnapshot(): PageId {
  return 'scan'
}

function subscribe(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

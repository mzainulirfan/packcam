import { useSyncExternalStore } from 'react'
import type { PageId } from './navigation'

type Listener = () => void
const ACTIVE_PAGE_KEY = 'pakti.activePage'

function readStoredPage(): PageId {
  if (typeof window === 'undefined') {
    return 'scan'
  }

  const stored = window.sessionStorage.getItem(ACTIVE_PAGE_KEY)
  if (stored === 'scan' || stored === 'history' || stored === 'settings' || stored === 'users' || stored === 'health' || stored === 'admin') {
    return stored
  }

  return 'scan'
}

function writeStoredPage(page: PageId) {
  if (typeof window === 'undefined') {
    return
  }

  window.sessionStorage.setItem(ACTIVE_PAGE_KEY, page)
}

let activePage: PageId = readStoredPage()
const listeners = new Set<Listener>()

function emitChange() {
  for (const listener of listeners) {
    listener()
  }
}

function setStoredPage(page: PageId) {
  activePage = page
  writeStoredPage(page)
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

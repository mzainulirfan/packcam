import { createSQLiteStorageBackend, bootstrapSQLiteStorageBackend } from './backends/sqliteStorageBackend'
import { createWebStorageBackend } from './backends/webStorageBackend'
import type { StorageBackend } from './backends/types'
import { isDesktopRuntime } from '../platform/runtime'

const desktopRuntime = isDesktopRuntime()
let currentBackend: StorageBackend = desktopRuntime ? createSQLiteStorageBackend() : createWebStorageBackend()
let bootstrapPromise: Promise<void> | null = null

export function getStorageBackend() {
  return currentBackend
}

export function setStorageBackend(backend: StorageBackend) {
  currentBackend = backend
}

export function ensureStorageBackendReady() {
  if (!desktopRuntime) {
    return Promise.resolve()
  }

  if (!bootstrapPromise) {
    bootstrapPromise = bootstrapSQLiteStorageBackend()
  }

  return bootstrapPromise
}

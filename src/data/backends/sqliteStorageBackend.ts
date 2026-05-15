import { bootstrapDesktopCollections, removeDesktopCollections, removeTauriSqliteCollection, writeTauriSqliteCollection } from '../../platform/tauriBridge'
import { isDesktopRuntime } from '../../platform/runtime'
import type { StorageBackend, StorageCollectionKey } from './types'
import { createWebStorageBackend } from './webStorageBackend'
import { STORAGE_COLLECTION_KEYS } from './types'

const webBackend = createWebStorageBackend()
const desktopCache = new Map<StorageCollectionKey, unknown>()
let bootstrapPromise: Promise<void> | null = null

export function createSQLiteStorageBackend(): StorageBackend {
  return {
    readCollection<T>(collection: StorageCollectionKey, fallback: T) {
      if (desktopCache.has(collection)) {
        return desktopCache.get(collection) as T
      }

      return webBackend.readCollection(collection, fallback)
    },
    writeCollection<T>(collection: StorageCollectionKey, value: T) {
      desktopCache.set(collection, value)
      webBackend.writeCollection(collection, value)
      void writeTauriSqliteCollection(collection, value)
    },
    removeCollection(collection: StorageCollectionKey) {
      desktopCache.delete(collection)
      webBackend.removeCollection(collection)
      void removeTauriSqliteCollection(collection)
    },
    reportLastError(message: string) {
      desktopCache.set('lastError', {
        message,
        createdAt: new Date().toISOString(),
      })
      webBackend.reportLastError(message)
      void writeTauriSqliteCollection('lastError', {
        message,
        createdAt: new Date().toISOString(),
      })
    },
    readLastError() {
      if (desktopCache.has('lastError')) {
        return desktopCache.get('lastError') as { message: string; createdAt: string } | null
      }

      return webBackend.readLastError()
    },
    clearLastError() {
      desktopCache.delete('lastError')
      webBackend.clearLastError()
      void removeTauriSqliteCollection('lastError')
    },
    async clearAllPackcamStorage() {
      desktopCache.clear()
      await webBackend.clearAllPackcamStorage()
      await removeDesktopCollections(STORAGE_COLLECTION_KEYS)
    },
    async clearScanPackcamData() {
      desktopCache.delete('recordings')
      desktopCache.delete('scanLogs')
      desktopCache.delete('lastError')
      await webBackend.clearScanPackcamData()
      await removeDesktopCollections(['recordings', 'scanLogs', 'lastError'] as StorageCollectionKey[])
    },
  }
}

export async function bootstrapSQLiteStorageBackend() {
  if (!isDesktopRuntime()) {
    return
  }

  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const values = await bootstrapDesktopCollections(STORAGE_COLLECTION_KEYS)

      for (const key of STORAGE_COLLECTION_KEYS) {
        if (key in values) {
          desktopCache.set(key, values[key])
        }
      }
    })()
  }

  await bootstrapPromise
}

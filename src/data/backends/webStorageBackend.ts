import type { StorageBackend, StorageCollectionKey } from './types'

const STORAGE_PREFIX = 'packcam'
const KEYS: Record<StorageCollectionKey, string> = {
  operatorSession: `${STORAGE_PREFIX}:operator_session`,
  operatorProfiles: `${STORAGE_PREFIX}:operator_profiles`,
  settings: `${STORAGE_PREFIX}:app_settings`,
  systemConfig: `${STORAGE_PREFIX}:system_config`,
  recordings: `${STORAGE_PREFIX}:recordings`,
  scanLogs: `${STORAGE_PREFIX}:scan_logs`,
  lastError: `${STORAGE_PREFIX}:last_error`,
}

export const STORAGE_DB_NAME = 'packcam-recordings'

function hasLocalStorage() {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    return typeof window.localStorage !== 'undefined'
  } catch {
    return false
  }
}

function readJson<T>(key: string, fallback: T): T {
  try {
    if (!hasLocalStorage()) {
      return fallback
    }

    const raw = window.localStorage.getItem(key)
    if (!raw) {
      return fallback
    }

    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson<T>(key: string, value: T) {
  try {
    if (!hasLocalStorage()) {
      return
    }

    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    return
  }
}

async function deleteIndexedDb(name: string) {
  if (typeof indexedDB === 'undefined') {
    return
  }

  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name)

    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })
}

export function createWebStorageBackend(): StorageBackend {
  return {
    readCollection<T>(collection: StorageCollectionKey, fallback: T) {
      return readJson<T>(KEYS[collection], fallback)
    },
    writeCollection<T>(collection: StorageCollectionKey, value: T) {
      writeJson(KEYS[collection], value)
    },
    removeCollection(collection: StorageCollectionKey) {
      try {
        if (!hasLocalStorage()) {
          return
        }

        window.localStorage.removeItem(KEYS[collection])
      } catch {
        return
      }
    },
    reportLastError(message: string) {
      try {
        if (!hasLocalStorage()) {
          return
        }

        window.localStorage.setItem(
          KEYS.lastError,
          JSON.stringify({
            message,
            createdAt: new Date().toISOString(),
          }),
        )
      } catch {
        return
      }
    },
    readLastError() {
      return readJson<{ message: string; createdAt: string } | null>(KEYS.lastError, null)
    },
    clearLastError() {
      try {
        if (!hasLocalStorage()) {
          return
        }

        window.localStorage.removeItem(KEYS.lastError)
      } catch {
        return
      }
    },
    async clearAllPackcamStorage() {
      try {
        if (hasLocalStorage()) {
          window.localStorage.removeItem(KEYS.operatorSession)
          window.localStorage.removeItem(KEYS.operatorProfiles)
          window.localStorage.removeItem(KEYS.settings)
          window.localStorage.removeItem(KEYS.systemConfig)
          window.localStorage.removeItem(KEYS.recordings)
          window.localStorage.removeItem(KEYS.scanLogs)
          window.localStorage.removeItem(KEYS.lastError)
        }
      } catch {
        // ignore storage access errors during cleanup
      }

      await deleteIndexedDb(STORAGE_DB_NAME)
    },
    async clearScanPackcamData() {
      try {
        if (hasLocalStorage()) {
          window.localStorage.removeItem(KEYS.recordings)
          window.localStorage.removeItem(KEYS.scanLogs)
          window.localStorage.removeItem(KEYS.lastError)
        }
      } catch {
        // ignore storage access errors during cleanup
      }

      await deleteIndexedDb(STORAGE_DB_NAME)
    },
  }
}

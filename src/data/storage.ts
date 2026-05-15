import { getStorageBackend } from './storageBackend'
import type { StorageCollectionKey } from './backends/types'

export function readCollection<T>(collection: StorageCollectionKey, fallback: T) {
  return getStorageBackend().readCollection<T>(collection, fallback)
}

export function writeCollection<T>(collection: StorageCollectionKey, value: T) {
  getStorageBackend().writeCollection<T>(collection, value)
}

export function removeCollection(collection: StorageCollectionKey) {
  getStorageBackend().removeCollection(collection)
}

export function reportLastError(message: string) {
  getStorageBackend().reportLastError(message)
}

export function readLastError() {
  return getStorageBackend().readLastError()
}

export function clearLastError() {
  getStorageBackend().clearLastError()
}

export async function clearAllPackcamStorage() {
  await getStorageBackend().clearAllPackcamStorage()
}

export async function clearScanPackcamData() {
  await getStorageBackend().clearScanPackcamData()
}

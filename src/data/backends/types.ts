export type StorageCollectionKey =
  | 'operatorSession'
  | 'operatorProfiles'
  | 'settings'
  | 'systemConfig'
  | 'recordings'
  | 'scanLogs'
  | 'lastError'

export const STORAGE_COLLECTION_KEYS: StorageCollectionKey[] = [
  'operatorSession',
  'operatorProfiles',
  'settings',
  'systemConfig',
  'recordings',
  'scanLogs',
  'lastError',
]

export type StorageBackend = {
  readCollection<T>(collection: StorageCollectionKey, fallback: T): T
  writeCollection<T>(collection: StorageCollectionKey, value: T): void
  removeCollection(collection: StorageCollectionKey): void
  reportLastError(message: string): void
  readLastError(): { message: string; createdAt: string } | null
  clearLastError(): void
  clearAllPackcamStorage(): Promise<void>
  clearScanPackcamData(): Promise<void>
}

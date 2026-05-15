type TauriSqlDatabase = {
  execute(statement: string, values?: unknown[]): Promise<{ rowsAffected: number; lastInsertId?: number }>
  select<T>(statement: string, values?: unknown[]): Promise<T[]>
}

type TauriSqlApi = {
  Database: {
    get(path: string): TauriSqlDatabase
    load(path: string): Promise<TauriSqlDatabase>
  }
}

type TauriFsApi = {
  writeFile(path: string, contents: Uint8Array): Promise<void>
  readFile(path: string): Promise<Uint8Array>
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>
  remove(path: string, options?: { recursive?: boolean }): Promise<void>
}

type TauriDialogApi = {
  open(options: { directory?: boolean; multiple?: boolean }): Promise<string | string[] | null>
}

type TauriGlobal = {
  dialog?: TauriDialogApi
  fs?: TauriFsApi
  sql?: TauriSqlApi
}

declare global {
  interface Window {
    __TAURI__?: TauriGlobal
    __TAURI_INTERNALS__?: unknown
  }
}

export {}

declare module 'better-sqlite3' {
  export type RunResult = {
    changes: number
    lastInsertRowid: number
  }

  export interface Statement<T = unknown> {
    all(...params: unknown[]): T[]
    get(...params: unknown[]): T | undefined
    run(...params: unknown[]): RunResult
  }

  export default class Database {
    constructor(filename: string, options?: { readonly?: boolean; fileMustExist?: boolean })
    prepare<T = unknown>(sql: string): Statement<T>
    exec(sql: string): void
    pragma(sql: string): void
    close(): void
  }
}

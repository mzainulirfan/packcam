declare module 'sql.js' {
  export type SqlJsValue = string | number | null | Uint8Array | ArrayBuffer | Blob

  export class Database {
    constructor(data?: Uint8Array)
    exec(sql: string): unknown
    run(sql: string, params?: readonly SqlJsValue[]): unknown
    prepare(sql: string): Statement
    export(): Uint8Array
  }

  export interface Statement {
    bind(params?: readonly SqlJsValue[]): void
    step(): boolean
    getAsObject(): Record<string, unknown>
    free(): void
  }

  export interface SqlJsStatic {
    Database: new (data?: Uint8Array) => Database
  }

  export default function initSqlJs(options?: {
    locateFile?: (file: string) => string
  }): Promise<SqlJsStatic>
}

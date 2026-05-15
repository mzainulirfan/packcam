import { INITIAL_SCHEMA_SQL } from './schema'

export type Migration = {
  version: number
  name: string
  statements: string[]
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    statements: INITIAL_SCHEMA_SQL,
  },
]


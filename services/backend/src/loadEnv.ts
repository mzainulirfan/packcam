import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env.local')

if (fs.existsSync(envPath)) {
  const contents = fs.readFileSync(envPath, 'utf8')

  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!match) continue

    const [, key, rawValue] = match
    if (process.env[key] !== undefined) continue

    const value = rawValue.trim().replace(/^(['"])(.*)\1$/, '$2')
    process.env[key] = value
  }
}

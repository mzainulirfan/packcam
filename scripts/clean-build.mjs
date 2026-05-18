import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const targets = [
  resolve(root, 'dist'),
  resolve(root, 'src-tauri', 'gen'),
  resolve(root, 'src-tauri', 'target'),
]

for (const target of targets) {
  try {
    rmSync(target, { recursive: true, force: true })
  } catch {
    // Ignore cleanup errors so build can continue if a folder is already absent.
  }
}

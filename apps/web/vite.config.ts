import { fileURLToPath } from 'node:url'
import { mergeConfig } from 'vite'
import baseConfig from '../../vite.config'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

export default mergeConfig(baseConfig, {
  root: repoRoot,
})

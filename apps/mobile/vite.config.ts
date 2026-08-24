import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const httpsPfxPath = process.env.VITE_DEV_HTTPS_PFX
const httpsPfxPassword = process.env.VITE_DEV_HTTPS_PFX_PASSWORD ?? ''

function resolveHttpsConfig() {
  if (!httpsPfxPath || !fs.existsSync(httpsPfxPath)) {
    return undefined
  }

  return {
    pfx: fs.readFileSync(httpsPfxPath),
    passphrase: httpsPfxPassword,
  }
}

export default defineConfig({
  root: '.',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: '@pakti/shared/defaults', replacement: fileURLToPath(new URL('../../packages/shared/src/defaults.ts', import.meta.url)) },
      { find: '@pakti/shared/exporters', replacement: fileURLToPath(new URL('../../packages/shared/src/exporters.ts', import.meta.url)) },
      { find: '@pakti/shared/recordings', replacement: fileURLToPath(new URL('../../packages/shared/src/recordings.ts', import.meta.url)) },
      { find: '@pakti/shared/systemConfig', replacement: fileURLToPath(new URL('../../packages/shared/src/systemConfig.ts', import.meta.url)) },
      { find: '@pakti/shared/videoPath', replacement: fileURLToPath(new URL('../../packages/shared/src/videoPath.ts', import.meta.url)) },
      { find: '@pakti/api-client', replacement: fileURLToPath(new URL('../../packages/api-client/src/index.ts', import.meta.url)) },
      { find: '@pakti/shared', replacement: fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)) },
      { find: '@pakti/types', replacement: fileURLToPath(new URL('../../packages/types/src/index.ts', import.meta.url)) },
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
    ],
  },
  server: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
    allowedHosts: true,
    https: resolveHttpsConfig(),
    cors: {
      origin: true,
      credentials: true,
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/files': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4174,
    strictPort: true,
  },
  define: {
    __APP_ROOT__: JSON.stringify(repoRoot),
  },
})

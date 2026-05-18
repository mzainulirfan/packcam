import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
const packageJson = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string }

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: '@pakti/shared/defaults',
        replacement: resolve(fileURLToPath(new URL('.', import.meta.url)), 'packages/shared/src/defaults.ts'),
      },
      {
        find: '@pakti/shared/exporters',
        replacement: resolve(fileURLToPath(new URL('.', import.meta.url)), 'packages/shared/src/exporters.ts'),
      },
      {
        find: '@pakti/shared/recordings',
        replacement: resolve(fileURLToPath(new URL('.', import.meta.url)), 'packages/shared/src/recordings.ts'),
      },
      {
        find: '@pakti/shared/systemConfig',
        replacement: resolve(fileURLToPath(new URL('.', import.meta.url)), 'packages/shared/src/systemConfig.ts'),
      },
      {
        find: '@pakti/shared/videoPath',
        replacement: resolve(fileURLToPath(new URL('.', import.meta.url)), 'packages/shared/src/videoPath.ts'),
      },
      {
        find: '@pakti/api-client',
        replacement: resolve(fileURLToPath(new URL('.', import.meta.url)), 'packages/api-client/src/index.ts'),
      },
      {
        find: '@pakti/types',
        replacement: resolve(fileURLToPath(new URL('.', import.meta.url)), 'packages/types/src/index.ts'),
      },
      {
        find: '@pakti/shared',
        replacement: resolve(fileURLToPath(new URL('.', import.meta.url)), 'packages/shared/src/index.ts'),
      },
      {
        find: '@',
        replacement: resolve(fileURLToPath(new URL('.', import.meta.url)), 'apps/web/src'),
      },
    ],
  },
  build: {
    rollupOptions: {
      input: 'apps/web/index.html',
    },
  },
  server: {
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
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
})

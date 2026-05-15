import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ensureStorageBackendReady } from './data/storageBackend'
import { bootstrapDesktopNativePaths } from './platform/nativePaths'

async function bootstrap() {
  await bootstrapDesktopNativePaths()
  await ensureStorageBackendReady()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()

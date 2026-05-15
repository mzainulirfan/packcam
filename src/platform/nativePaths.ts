import { isDesktopRuntime } from './runtime'

type NativeBridge = {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: NativeBridge
  }
}

let desktopDefaultVideoRootPath: string | null = null
let bootstrapPromise: Promise<void> | null = null

export function isAbsoluteNativePath(path: string) {
  return /^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(path.trim())
}

export function getDesktopDefaultVideoRootPath() {
  return desktopDefaultVideoRootPath
}

export async function bootstrapDesktopNativePaths() {
  if (!isDesktopRuntime()) {
    return
  }

  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const resolved = await resolvePackcamDefaultVideoRoot()
      desktopDefaultVideoRootPath = resolved
    })()
  }

  await bootstrapPromise
}

export async function resolvePackcamDefaultVideoRoot() {
  if (!isDesktopRuntime()) {
    return null
  }

  const invoke = window.__TAURI_INTERNALS__?.invoke
  if (!invoke) {
    return null
  }

  try {
    const result = await invoke<string>('resolve_packcam_default_video_root')
    return result?.trim() ? result : null
  } catch {
    return null
  }
}

export function normalizeDesktopVideoRootPath(path: string) {
  const trimmed = path.trim()

  if (!trimmed) {
    return desktopDefaultVideoRootPath ?? null
  }

  if (!isDesktopRuntime()) {
    return trimmed
  }

  if (isAbsoluteNativePath(trimmed)) {
    return trimmed
  }

  return desktopDefaultVideoRootPath ?? trimmed
}

export function isDesktopRuntime() {
  if (typeof window === 'undefined') {
    return false
  }

  const tauriWindow = window as Window & {
    __TAURI_INTERNALS__?: unknown
    __TAURI__?: unknown
  }

  return Boolean(tauriWindow.__TAURI_INTERNALS__ || tauriWindow.__TAURI__ || window.location.protocol === 'tauri:')
}

export function isBrowserRuntime() {
  return !isDesktopRuntime()
}

const BOOTSTRAP_NEEDS_SETUP_KEY = 'pakti.bootstrapNeedsSetup'

export function readBootstrapNeedsSetupCache() {
  if (typeof window === 'undefined') {
    return null
  }

  const stored = window.sessionStorage.getItem(BOOTSTRAP_NEEDS_SETUP_KEY)
  if (stored === 'true') {
    return true
  }

  if (stored === 'false') {
    return false
  }

  return null
}

export function writeBootstrapNeedsSetupCache(value: boolean) {
  if (typeof window === 'undefined') {
    return
  }

  window.sessionStorage.setItem(BOOTSTRAP_NEEDS_SETUP_KEY, String(value))
}

import { useEffect, useState } from 'react'

import { DEFAULT_SYSTEM_CONFIG } from '@pakti/shared/defaults'
import { readServerSystemConfigApi } from '@pakti/api-client'
import type { SystemConfig } from '@pakti/types'

const SYSTEM_CONFIG_EVENT = 'pakti:system-config-change'

function hasWindow() {
  return typeof window !== 'undefined'
}

function normalizeConfig(nextConfig: SystemConfig): SystemConfig {
  const appName = nextConfig.appName.trim() || DEFAULT_SYSTEM_CONFIG.appName
  const tagline = nextConfig.tagline.trim() || DEFAULT_SYSTEM_CONFIG.tagline
  const brandMark = nextConfig.brandMark.trim() || appName.charAt(0).toUpperCase()

  return {
    appName,
    tagline,
    brandMark: brandMark.slice(0, 3),
  }
}

function emitSystemConfigChange() {
  if (!hasWindow()) {
    return
  }

  window.dispatchEvent(new Event(SYSTEM_CONFIG_EVENT))
}

export function notifySystemConfigChange() {
  emitSystemConfigChange()
}

export function useSystemConfig() {
  const [config, setConfig] = useState(() => DEFAULT_SYSTEM_CONFIG)

  useEffect(() => {
    function handleConfigChange() {
      void readServerSystemConfigApi()
        .then((nextConfig) => {
          setConfig(normalizeConfig(nextConfig))
        })
        .catch(() => {
          setConfig(DEFAULT_SYSTEM_CONFIG)
        })
    }

    handleConfigChange()
    window.addEventListener(SYSTEM_CONFIG_EVENT, handleConfigChange)
    window.addEventListener('storage', handleConfigChange)

    return () => {
      window.removeEventListener(SYSTEM_CONFIG_EVENT, handleConfigChange)
      window.removeEventListener('storage', handleConfigChange)
    }
  }, [])

  return config
}

export function getSystemConfigCssVars() {
  return {
    '--brand': '#111113',
    '--brand-soft': '#edeef0',
    '--brand-accent': '#4f46e5',
    '--brand-contrast': '#ffffff',
  } as const
}

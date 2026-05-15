import { useEffect, useState } from 'react'
import { DEFAULT_SYSTEM_CONFIG } from '../config/defaultSystemConfig'
import { readCollection, removeCollection, writeCollection } from './storage'
import type { SystemConfig } from './types'

const SYSTEM_CONFIG_EVENT = 'packcam:system-config-change'

function hasWindow() {
  return typeof window !== 'undefined'
}

function normalizeHexColor(value: string, fallback: string) {
  const trimmed = value.trim()

  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase()
  }

  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [r, g, b] = trimmed.slice(1).split('')
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }

  return fallback
}

function normalizeConfig(nextConfig: SystemConfig): SystemConfig {
  const appName = nextConfig.appName.trim() || DEFAULT_SYSTEM_CONFIG.appName
  const tagline = nextConfig.tagline.trim() || DEFAULT_SYSTEM_CONFIG.tagline
  const brandMark = nextConfig.brandMark.trim() || appName.charAt(0).toUpperCase()

  return {
    appName,
    tagline,
    brandMark: brandMark.slice(0, 3),
    primaryColor: normalizeHexColor(nextConfig.primaryColor, DEFAULT_SYSTEM_CONFIG.primaryColor),
    accentColor: normalizeHexColor(nextConfig.accentColor, DEFAULT_SYSTEM_CONFIG.accentColor),
  }
}

function emitSystemConfigChange() {
  if (!hasWindow()) {
    return
  }

  window.dispatchEvent(new Event(SYSTEM_CONFIG_EVENT))
}

export function getStoredSystemConfig() {
  const stored = readCollection<Partial<SystemConfig>>('systemConfig', {})

  return normalizeConfig({
    ...DEFAULT_SYSTEM_CONFIG,
    ...stored,
  })
}

export function saveSystemConfig(nextConfig: SystemConfig) {
  const normalized = normalizeConfig(nextConfig)
  writeCollection('systemConfig', normalized)
  emitSystemConfigChange()
  return normalized
}

export function resetSystemConfig() {
  removeCollection('systemConfig')
  emitSystemConfigChange()
  return DEFAULT_SYSTEM_CONFIG
}

export function useSystemConfig() {
  const [config, setConfig] = useState(() => getStoredSystemConfig())

  useEffect(() => {
    function handleConfigChange() {
      setConfig(getStoredSystemConfig())
    }

    window.addEventListener(SYSTEM_CONFIG_EVENT, handleConfigChange)
    window.addEventListener('storage', handleConfigChange)

    return () => {
      window.removeEventListener(SYSTEM_CONFIG_EVENT, handleConfigChange)
      window.removeEventListener('storage', handleConfigChange)
    }
  }, [])

  return config
}

export function getSystemConfigCssVars(config: SystemConfig) {
  const primaryColor = normalizeHexColor(config.primaryColor, DEFAULT_SYSTEM_CONFIG.primaryColor)
  const accentColor = normalizeHexColor(config.accentColor, DEFAULT_SYSTEM_CONFIG.accentColor)

  return {
    '--brand': primaryColor,
    '--brand-soft': mixWithWhite(primaryColor, 0.92),
    '--brand-accent': accentColor,
    '--brand-contrast': getReadableTextColor(primaryColor),
  } as const
}

function getReadableTextColor(hex: string) {
  const { r, g, b } = hexToRgb(hex)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.58 ? '#111113' : '#ffffff'
}

function mixWithWhite(hex: string, amount: number) {
  const { r, g, b } = hexToRgb(hex)
  const mix = (channel: number) => Math.round(channel + (255 - channel) * amount)
  return rgbToHex(mix(r), mix(g), mix(b))
}

function hexToRgb(hex: string) {
  const normalized = normalizeHexColor(hex, DEFAULT_SYSTEM_CONFIG.primaryColor).slice(1)
  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)
  return { r, g, b }
}

function rgbToHex(r: number, g: number, b: number) {
  return [r, g, b]
    .map((value) => {
      const next = Math.max(0, Math.min(255, Math.round(value)))
      return next.toString(16).padStart(2, '0')
    })
    .join('')
    .replace(/^/, '#')
}

import { DEFAULT_APP_SETTINGS, DEFAULT_SYSTEM_CONFIG } from '@pakti/shared/defaults'
import type { AppSettings, SystemConfig } from '@pakti/types'

import { getDb, ensureServerStorage } from '../db'
import { broadcastBackendEvent } from '../realtime'

const JSON_STATE_KEY = 'current'
const LEGACY_SYSTEM_TAGLINE = 'Aplikasi yang membantu UMKM merekam proses QC dan packing paket secara lebih rapi.'

function db() {
  ensureServerStorage()
  return getDb()
}

function readJsonRowMeta<T>(table: string, fallback: T) {
  const row = db()
    .prepare(`SELECT value, updated_at FROM ${table} WHERE key = ? LIMIT 1`)
    .get(JSON_STATE_KEY) as { value?: string; updated_at?: string } | undefined

  if (!row?.value) {
    return {
      value: fallback,
      updatedAt: null as string | null,
    }
  }

  try {
    return {
      value: JSON.parse(row.value) as T,
      updatedAt: row.updated_at ?? null,
    }
  } catch {
    return {
      value: fallback,
      updatedAt: row.updated_at ?? null,
    }
  }
}

function writeJsonRow(table: string, value: unknown) {
  const timestamp = new Date().toISOString()
  db().prepare(
    `INSERT INTO ${table} (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(JSON_STATE_KEY, JSON.stringify(value), timestamp)

  return timestamp
}

function assertValidVideoRootPath(value: string) {
  const normalized = value.trim().replace(/\\/g, '/')

  if (!normalized) {
    throw new Error('Folder video wajib diisi.')
  }

  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
    throw new Error('Folder video harus menggunakan path relatif, bukan path absolut.')
  }

  if (normalized.split('/').some((segment) => segment === '..')) {
    throw new Error('Folder video tidak boleh mengandung "..".')
  }

  if (/[<>:"|?*\0]/.test(normalized)) {
    throw new Error('Folder video mengandung karakter yang tidak valid.')
  }

  return normalized.replace(/\/+/g, '/').replace(/^\.\/+/, '')
}

function normalizeVideoRootPath(value: string | null | undefined, fallback = DEFAULT_APP_SETTINGS.videoRootPath) {
  try {
    return assertValidVideoRootPath(value ?? fallback)
  } catch {
    return fallback
  }
}

function sanitizeSystemConfig(value: Partial<SystemConfig> | null | undefined): SystemConfig {
  const next = value ?? {}
  const tagline = next.tagline?.trim()
  return {
    appName: next.appName?.trim() || DEFAULT_SYSTEM_CONFIG.appName,
    tagline: tagline && tagline !== LEGACY_SYSTEM_TAGLINE ? tagline : DEFAULT_SYSTEM_CONFIG.tagline,
    brandMark: next.brandMark?.trim() || DEFAULT_SYSTEM_CONFIG.brandMark,
  }
}

function sanitizeSettings(value: Partial<AppSettings> | null | undefined): AppSettings {
  const next = value ?? {}
  return {
    videoRootPath: normalizeVideoRootPath(next.videoRootPath),
    videoFormat: next.videoFormat === 'mp4' ? 'mp4' : 'webm',
    videoResolution: next.videoResolution?.trim() || DEFAULT_APP_SETTINGS.videoResolution,
    videoBitrate: next.videoBitrate?.trim() || DEFAULT_APP_SETTINGS.videoBitrate,
    cameraDeviceId: next.cameraDeviceId?.trim() || DEFAULT_APP_SETTINGS.cameraDeviceId,
    autoOpenFolder: Boolean(next.autoOpenFolder),
  }
}

export function readSystemConfig() {
  const { value: raw, updatedAt } = readJsonRowMeta<Partial<SystemConfig> | null>('system_config', null)
  const normalized = sanitizeSystemConfig(raw)

  if (raw && JSON.stringify(raw) !== JSON.stringify(normalized)) {
    writeJsonRow('system_config', normalized)
  }

  return {
    ...normalized,
    updatedAt,
  }
}

export function saveSystemConfig(nextConfig: SystemConfig) {
  const normalized = sanitizeSystemConfig(nextConfig)
  const updatedAt = writeJsonRow('system_config', normalized)
  broadcastBackendEvent('system-config-updated', { updatedAt })
  return {
    ...normalized,
    updatedAt,
  }
}

export function readSettings() {
  const { value: raw, updatedAt } = readJsonRowMeta<Partial<AppSettings> | null>('app_settings', null)
  return {
    ...sanitizeSettings(raw),
    updatedAt,
  }
}

export function saveSettings(nextSettings: AppSettings) {
  const normalized = {
    ...sanitizeSettings(nextSettings),
    videoRootPath: assertValidVideoRootPath(nextSettings.videoRootPath),
  }
  const updatedAt = writeJsonRow('app_settings', normalized)
  broadcastBackendEvent('settings-updated', { updatedAt })
  return {
    ...normalized,
    updatedAt,
  }
}

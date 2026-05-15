import { DEFAULT_APP_SETTINGS } from './defaultSettings'
import { normalizeDesktopVideoRootPath } from '../platform/nativePaths'
import { readCollection, removeCollection, writeCollection } from './storage'
import type { AppSettings } from './types'

const SETTINGS_FIELD_ORDER: Array<keyof AppSettings> = [
  'videoRootPath',
  'videoFormat',
  'videoResolution',
  'videoBitrate',
  'cameraDeviceId',
  'autoOpenFolder',
]

export function getStoredSettings() {
  const stored = readCollection<Partial<AppSettings>>('settings', {})
  const videoRootPath = normalizeDesktopVideoRootPath(
    stored.videoRootPath?.trim() || DEFAULT_APP_SETTINGS.videoRootPath,
  ) ?? DEFAULT_APP_SETTINGS.videoRootPath

  return {
    ...DEFAULT_APP_SETTINGS,
    ...stored,
    videoRootPath,
  }
}

export function saveSettings(nextSettings: AppSettings) {
  const normalizedVideoRootPath = normalizeDesktopVideoRootPath(nextSettings.videoRootPath) ?? DEFAULT_APP_SETTINGS.videoRootPath
  const normalized: AppSettings = {
    videoRootPath: normalizedVideoRootPath,
    videoFormat: nextSettings.videoFormat === 'mp4' ? 'mp4' : 'webm',
    videoResolution: nextSettings.videoResolution.trim() || DEFAULT_APP_SETTINGS.videoResolution,
    videoBitrate: nextSettings.videoBitrate.trim() || DEFAULT_APP_SETTINGS.videoBitrate,
    cameraDeviceId: nextSettings.cameraDeviceId.trim(),
    autoOpenFolder: Boolean(nextSettings.autoOpenFolder),
  }

  writeCollection('settings', normalized)
  return normalized
}

export function resetSettings() {
  removeCollection('settings')
  return {
    ...DEFAULT_APP_SETTINGS,
    videoRootPath: normalizeDesktopVideoRootPath(DEFAULT_APP_SETTINGS.videoRootPath) ?? DEFAULT_APP_SETTINGS.videoRootPath,
  }
}

export function getSettingsFieldOrder() {
  return [...SETTINGS_FIELD_ORDER]
}

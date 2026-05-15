import { DEFAULT_APP_SETTINGS } from './defaultSettings'
import type { AppSettings } from './types'
import { normalizeDesktopVideoRootPath } from '../platform/nativePaths'

const VIDEO_EXTENSIONS = new Set(['webm', 'mp4'])

function sanitizeSegment(segment: string) {
  return segment.trim().replace(/[\\/:*?"<>|]+/g, '_')
}

export function sanitizeVideoName(segment: string) {
  return sanitizeSegment(segment)
}

export function normalizeVideoFormat(value: string): AppSettings['videoFormat'] {
  return VIDEO_EXTENSIONS.has(value) ? value as AppSettings['videoFormat'] : DEFAULT_APP_SETTINGS.videoFormat
}

export function getDefaultVideoRootPath() {
  if (typeof navigator === 'undefined') {
    return DEFAULT_APP_SETTINGS.videoRootPath
  }

  const platform = `${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`.toLowerCase()

  if (platform.includes('win')) {
    return 'C:/Users/<user>/Documents/PackCam/videos'
  }

  if (platform.includes('mac')) {
    return '~/Documents/PackCam/videos'
  }

  return '~/PackCam/videos'
}

export function buildDailyVideoPath(settings: Pick<AppSettings, 'videoRootPath' | 'videoFormat'>, isoDate: string, resiNumber: string) {
  const [year, month, day] = isoDate.split('-')
  const safeResi = sanitizeSegment(resiNumber)
  const extension = normalizeVideoFormat(settings.videoFormat)
  const rootPath = (normalizeDesktopVideoRootPath(settings.videoRootPath) ?? settings.videoRootPath.trim())
    || DEFAULT_APP_SETTINGS.videoRootPath

  return `${rootPath}/${year}/${month}/${day}/${safeResi}.${extension}`
}

export function buildRecordingFileName(resiNumber: string, format: string) {
  const safeResi = sanitizeSegment(resiNumber)
  const extension = normalizeVideoFormat(format)
  return `${safeResi}.${extension}`
}

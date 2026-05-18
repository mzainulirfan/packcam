import { DEFAULT_APP_SETTINGS } from '@pakti/shared/defaults'
import type { AppSettings } from '@pakti/types'

const VIDEO_EXTENSIONS = new Set(['webm', 'mp4'])

function sanitizeSegment(segment: string) {
  return segment.trim().replace(/[\\/:*?"<>|]+/g, '_')
}

function normalizeTaskPrefix(taskType: 'qc' | 'packing') {
  return taskType === 'packing' ? 'packing' : 'qc'
}

function formatRecordingTimestamp(startedAt: Date) {
  const year = startedAt.getFullYear()
  const month = `${startedAt.getMonth() + 1}`.padStart(2, '0')
  const day = `${startedAt.getDate()}`.padStart(2, '0')
  const hours = `${startedAt.getHours()}`.padStart(2, '0')
  const minutes = `${startedAt.getMinutes()}`.padStart(2, '0')
  const seconds = `${startedAt.getSeconds()}`.padStart(2, '0')
  const milliseconds = `${startedAt.getMilliseconds()}`.padStart(3, '0')

  return `${year}${month}${day}_${hours}${minutes}${seconds}_${milliseconds}`
}

export function sanitizeVideoName(segment: string) {
  return sanitizeSegment(segment)
}

export function normalizeVideoFormat(value: string): AppSettings['videoFormat'] {
  return VIDEO_EXTENSIONS.has(value) ? (value as AppSettings['videoFormat']) : DEFAULT_APP_SETTINGS.videoFormat
}

export function getDefaultVideoRootPath() {
  if (typeof navigator === 'undefined') {
    return DEFAULT_APP_SETTINGS.videoRootPath
  }

  const platform = `${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`.toLowerCase()

  if (platform.includes('win')) {
    return 'C:/Users/<user>/Documents/Pakti/videos'
  }

  if (platform.includes('mac')) {
    return '~/Documents/Pakti/videos'
  }

  return '~/Pakti/videos'
}

export function buildDailyVideoPath(
  settings: Pick<AppSettings, 'videoRootPath' | 'videoFormat'>,
  resiNumber: string,
  taskType: 'qc' | 'packing',
  startedAt: Date,
) {
  const fileName = buildRecordingFileName(resiNumber, settings.videoFormat, taskType, startedAt)
  const rootPath = settings.videoRootPath.trim() || DEFAULT_APP_SETTINGS.videoRootPath

  return `${rootPath}/${fileName}`
}

export function buildRecordingFileName(
  resiNumber: string,
  format: string,
  taskType: 'qc' | 'packing',
  startedAt: Date,
) {
  const safeResi = sanitizeSegment(resiNumber)
  const extension = normalizeVideoFormat(format)
  const prefix = normalizeTaskPrefix(taskType)
  const timestamp = formatRecordingTimestamp(startedAt)
  return `${prefix}_${safeResi}_${timestamp}.${extension}`
}

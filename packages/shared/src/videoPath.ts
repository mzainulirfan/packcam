import { DEFAULT_APP_SETTINGS } from '@pakti/shared/defaults'
import type { AppSettings } from '@pakti/types'

const VIDEO_EXTENSIONS = new Set(['webm', 'mp4'])
const PHOTO_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp'])

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

export function normalizeMediaExtension(value: string, mediaType?: 'video' | 'photo'): string {
  const ext = value.toLowerCase().trim()
  if (mediaType === 'photo') {
    if (PHOTO_EXTENSIONS.has(ext)) return ext === 'jpeg' ? 'jpg' : ext
    return 'jpg'
  }
  return normalizeVideoFormat(ext)
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
  mediaType: 'video' | 'photo' = 'video',
) {
  const fileName = buildRecordingFileName(resiNumber, settings.videoFormat, taskType, startedAt, mediaType)
  const rootPath = mediaType === 'photo'
    ? getPhotoRootPath(settings.videoRootPath.trim() || DEFAULT_APP_SETTINGS.videoRootPath)
    : settings.videoRootPath.trim() || DEFAULT_APP_SETTINGS.videoRootPath

  return `${rootPath}/${fileName}`
}

export function getPhotoRootPath(videoRootPath: string) {
  const normalized = videoRootPath.trim().replaceAll('\\', '/') || DEFAULT_APP_SETTINGS.videoRootPath
  const segments = normalized.split('/').filter(Boolean)
  const last = segments.at(-1)?.toLowerCase()
  if (last === 'videos' || last === 'video') {
    const parent = segments.slice(0, -1).join('/')
    return parent ? `${parent}/photos` : 'photos'
  }
  return `${normalized}/photos`
}

export function buildRecordingFileName(
  resiNumber: string,
  format: string,
  taskType: 'qc' | 'packing',
  startedAt: Date,
  mediaType: 'video' | 'photo' = 'video',
) {
  const safeResi = sanitizeSegment(resiNumber)
  const prefix = normalizeTaskPrefix(taskType)
  const timestamp = formatRecordingTimestamp(startedAt)
  if (mediaType === 'photo') {
    return `${prefix}_${safeResi}_${timestamp}.jpg`
  }
  const extension = normalizeVideoFormat(format)
  return `${prefix}_${safeResi}_${timestamp}.${extension}`
}

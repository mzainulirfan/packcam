import type { AppSettings, SystemConfig } from '../../types/src/index'

export const DEFAULT_VIDEO_ROOT_PATH = 'Documents/Pakti/videos'
export const DEFAULT_VIDEO_FORMAT = 'webm'
export const DEFAULT_VIDEO_RESOLUTION = '1280x720'
export const DEFAULT_VIDEO_BITRATE = '2500000'
export const DEFAULT_CAMERA_DEVICE_ID = ''
export const DEFAULT_AUTO_OPEN_FOLDER = false

export const DEFAULT_APP_SETTINGS: AppSettings = {
  videoRootPath: DEFAULT_VIDEO_ROOT_PATH,
  videoFormat: DEFAULT_VIDEO_FORMAT,
  videoResolution: DEFAULT_VIDEO_RESOLUTION,
  videoBitrate: DEFAULT_VIDEO_BITRATE,
  cameraDeviceId: DEFAULT_CAMERA_DEVICE_ID,
  autoOpenFolder: DEFAULT_AUTO_OPEN_FOLDER,
}

export const DEFAULT_SYSTEM_CONFIG: SystemConfig = {
  appName: 'Pakti',
  tagline: 'Paket Tercatat, Bukti Terjaga',
  brandMark: 'PK',
}

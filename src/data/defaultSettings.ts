import type { AppSettings } from './types'

export const DEFAULT_APP_SETTINGS: AppSettings = {
  videoRootPath: 'Documents/PackCam/videos',
  videoFormat: 'webm',
  videoResolution: '1280x720',
  videoBitrate: '2500000',
  cameraDeviceId: '',
  autoOpenFolder: false,
}

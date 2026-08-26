export type VideoFormat = 'webm' | 'mp4'

export type RecordingStatus = 'recording' | 'completed' | 'error'

export type OperatorRole = 'admin' | 'operator'

export type WorkTask = 'qc' | 'packing'

export type SystemConfig = {
  appName: string
  tagline: string
  brandMark: string
}

export type AppSettings = {
  videoRootPath: string
  videoFormat: VideoFormat
  videoResolution: string
  videoBitrate: string
  cameraDeviceId: string
  autoOpenFolder: boolean
}

export type OperatorSession = {
  operatorName: string
  operatorCode: string
  role: OperatorRole
  taskType: WorkTask
  loggedInAt: string
}

export type OperatorProfile = {
  fullName: string | null
  operatorName: string
  operatorCode: string
  role: OperatorRole
  taskType: WorkTask
  lastUsedAt: string
  passwordSalt: string | null
  passwordHash: string | null
}

export type RecordingRow = {
  id: string
  resiNumber: string
  taskType: WorkTask
  operatorName: string | null
  operatorCode: string | null
  fileName: string
  filePath: string
  fileSizeBytes: number | null
  recordDate: string
  startTime: string
  endTime: string | null
  durationSeconds: number | null
  status: RecordingStatus
  note: string | null
  createdAt: string
  updatedAt: string
  blobKey?: string | null
  mimeType?: string | null
  shareFileName?: string | null
  shareFilePath?: string | null
  shareFileMimeType?: string | null
  shareFileReady?: boolean
}

export type ScanLogRow = {
  id: string
  resiNumber: string
  taskType: WorkTask
  operatorName: string | null
  operatorCode: string | null
  scanTime: string
  action: 'start' | 'stop' | 'duplicate' | 'invalid'
  message: string | null
}

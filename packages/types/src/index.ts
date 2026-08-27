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

export type ShopeeOrderItem = {
  id?: string
  sku: string | null
  productName: string
  variationName: string | null
  quantity: number
  imageUrl: string | null
}

export type ShopeeOrder = {
  id?: string
  source: 'shopee'
  orderNumber: string
  trackingNumber: string | null
  buyerUsername: string | null
  shippingChannel: string | null
  orderStatus: string | null
  rawPayload: unknown | null
  items: ShopeeOrderItem[]
  createdAt?: string
  updatedAt?: string
}

export type ChatSendStatus = 'pending' | 'prepared' | 'sent' | 'failed' | 'cancelled'

export type RecordingChatSend = {
  id: string
  recordingId: string
  resiNumber: string
  orderNumber: string | null
  buyerUsername: string
  taskType: WorkTask
  videoFilePath: string
  videoUrl?: string
  status: ChatSendStatus
  attempts: number
  messageTemplate: string | null
  errorMessage: string | null
  preparedAt: string | null
  sentAt: string | null
  createdAt: string
  updatedAt: string
}

export type ShippingChatSend = {
  id: string
  orderId: string
  orderNumber: string
  trackingNumber: string | null
  buyerUsername: string
  message: string
  status: ChatSendStatus
  attempts: number
  errorMessage: string | null
  preparedAt: string | null
  sentAt: string | null
  createdAt: string
  updatedAt: string
}

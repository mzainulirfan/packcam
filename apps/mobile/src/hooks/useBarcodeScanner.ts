import { useEffect, useRef } from 'react'

type BarcodeScannerOptions = {
  videoElement: HTMLVideoElement | null
  enabled: boolean
  onDetected: (value: string) => void
  onUnsupported?: () => void
  intervalMs?: number
  cooldownMs?: number
  maxScanWidth?: number
  resetToken?: number
}

type DetectorLike = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>
}

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => DetectorLike
  }
}

// Format barcode resi umum (J&T, JNE, SPX, GoSend, dsb): batasi agar detect() jauh lebih cepat.
const PREFERRED_BARCODE_FORMATS = [
  'code_128',
  'qr_code',
  'code_39',
  'ean_13',
  'ean_8',
  'itf',
  'codabar',
  'pdf417',
  'aztec',
  'data_matrix',
]

async function resolveScanFormats(): Promise<string[] | undefined> {
  try {
    const detectorWithFormats = window.BarcodeDetector as unknown as {
      getSupportedFormats?: () => Promise<string[]>
    }
    if (typeof detectorWithFormats.getSupportedFormats !== 'function') {
      return undefined
    }
    const supported = await detectorWithFormats.getSupportedFormats()
    const matched = PREFERRED_BARCODE_FORMATS.filter((format) => supported.includes(format))
    return matched.length > 0 ? matched : undefined
  } catch {
    return undefined
  }
}

function supportsBarcodeDetector() {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window
}

function createDetector(formats?: string[]): DetectorLike | null {
  if (!supportsBarcodeDetector()) {
    return null
  }

  const BarcodeDetectorCtor = window.BarcodeDetector as unknown as new (options?: { formats?: string[] }) => DetectorLike
  try {
    return formats ? new BarcodeDetectorCtor({ formats }) : new BarcodeDetectorCtor()
  } catch {
    try {
      return new BarcodeDetectorCtor()
    } catch {
      return null
    }
  }
}

export function useBarcodeScanner({
  videoElement,
  enabled,
  onDetected,
  onUnsupported,
  intervalMs = 700,
  cooldownMs = 2500,
  maxScanWidth = 640,
  resetToken = 0,
}: BarcodeScannerOptions) {
  const lastValueRef = useRef<string | null>(null)
  const lastEmittedAtRef = useRef<number>(0)
  const onDetectedRef = useRef(onDetected)
  const onUnsupportedRef = useRef(onUnsupported)

  useEffect(() => {
    onDetectedRef.current = onDetected
  }, [onDetected])

  useEffect(() => {
    onUnsupportedRef.current = onUnsupported
  }, [onUnsupported])

  useEffect(() => {
    lastValueRef.current = null
    lastEmittedAtRef.current = 0
  }, [resetToken])

  useEffect(() => {
    const element = videoElement

    if (!enabled || element === null) {
      return
    }

    const video = element

    let activeDetector: DetectorLike | null = null
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d', { willReadFrequently: true })
    let cancelled = false
    let timerId: number | null = null
    let scanning = false

    async function scanFrame() {
      if (cancelled || scanning || !activeDetector || !video.videoWidth || !video.videoHeight || !context) {
        return
      }

      scanning = true

      try {
        const scale = Math.min(1, maxScanWidth / video.videoWidth)
        const targetWidth = Math.max(1, Math.round(video.videoWidth * scale))
        const targetHeight = Math.max(1, Math.round(video.videoHeight * scale))

        if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
          canvas.width = targetWidth
          canvas.height = targetHeight
        }

        context.drawImage(video, 0, 0, targetWidth, targetHeight)

        const barcodes = await activeDetector.detect(canvas)
        const rawValue = barcodes[0]?.rawValue?.trim()

        if (!rawValue) {
          return
        }

        const now = Date.now()
        const shouldEmit = rawValue !== lastValueRef.current || now - lastEmittedAtRef.current >= cooldownMs

        if (shouldEmit) {
          lastValueRef.current = rawValue
          lastEmittedAtRef.current = now
          onDetectedRef.current(rawValue)
        }
      } catch {
        // Ignore transient detector errors and retry on the next interval.
      } finally {
        scanning = false
      }
    }

    timerId = window.setInterval(() => {
      void scanFrame()
    }, intervalMs)

    // Siapkan detector (batasi format resi) lalu langsung scan frame pertama tanpa tunggu interval.
    void (async () => {
      const formats = await resolveScanFormats()
      if (cancelled) return
      activeDetector = createDetector(formats)
      if (!activeDetector) {
        onUnsupportedRef.current?.()
        return
      }
      void scanFrame()
    })()

    return () => {
      cancelled = true
      if (timerId !== null) {
        window.clearInterval(timerId)
      }
    }
  }, [cooldownMs, enabled, intervalMs, maxScanWidth, videoElement, resetToken])
}

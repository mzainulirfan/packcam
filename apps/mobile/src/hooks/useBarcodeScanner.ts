import { useEffect, useRef } from 'react'

type BarcodeScannerOptions = {
  videoElement: HTMLVideoElement | null
  enabled: boolean
  onDetected: (value: string) => void
  onUnsupported?: () => void
  intervalMs?: number
  cooldownMs?: number
  resetToken?: number
}

type DetectorLike = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>
}

declare global {
  interface Window {
    BarcodeDetector?: new () => DetectorLike
  }
}

function supportsBarcodeDetector() {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window
}

function createDetector(): DetectorLike | null {
  if (!supportsBarcodeDetector()) {
    return null
  }

  const BarcodeDetectorCtor = window.BarcodeDetector as unknown as new () => DetectorLike
  return new BarcodeDetectorCtor()
}

export function useBarcodeScanner({
  videoElement,
  enabled,
  onDetected,
  onUnsupported,
  intervalMs = 700,
  cooldownMs = 2500,
  resetToken = 0,
}: BarcodeScannerOptions) {
  const lastValueRef = useRef<string | null>(null)
  const lastEmittedAtRef = useRef<number>(0)

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

    const detector = createDetector()
    if (!detector) {
      onUnsupported?.()
      return
    }

    const activeDetector = detector
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d', { willReadFrequently: true })
    let cancelled = false
    let timerId: number | null = null

    async function scanFrame() {
      if (cancelled || !video.videoWidth || !video.videoHeight || !context) {
        return
      }

      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      context.drawImage(video, 0, 0, canvas.width, canvas.height)

      try {
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
          onDetected(rawValue)
        }
      } catch {
        // Ignore transient detector errors and retry on the next interval.
      }
    }

    timerId = window.setInterval(() => {
      void scanFrame()
    }, intervalMs)

    void scanFrame()

    return () => {
      cancelled = true
      if (timerId !== null) {
        window.clearInterval(timerId)
      }
    }
  }, [cooldownMs, enabled, intervalMs, onDetected, onUnsupported, videoElement, resetToken])
}

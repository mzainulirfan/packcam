import { useCallback, useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'

import {
  DEFAULT_SCAN_AREA_RATIO,
  DEFAULT_SCAN_INTERVAL_MS,
  getScanAreaRatioForMode,
  getScanRegionRect,
  normalizeBarcodeValue,
  shouldAutoSwitchToFullFrame,
  type ScanMode,
} from './useVideoBarcodeScanner.logic'

type UseVideoBarcodeScannerOptions = {
  videoRef: RefObject<HTMLVideoElement | null>
  enabled: boolean
  onDetected: (value: string) => void
  onUnsupported?: () => void
  onAutoSwitchToFullFrame?: () => void
  scanIntervalMs?: number
  scanAreaRatio?: number
  scanMode?: ScanMode
}

type BarcodeDetectorInstance = {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue?: string }>>
}

type BarcodeDetectorConstructor = new (
  options?: { formats?: string[] },
) => BarcodeDetectorInstance

type ScannerControls = {
  stop: () => void
}

function getBarcodeDetector(): BarcodeDetectorConstructor | null {
  const detector = globalThis as typeof globalThis & {
    BarcodeDetector?: BarcodeDetectorConstructor
  }

  return detector.BarcodeDetector ?? null
}

function copyScanRegion(
  videoElement: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  scanAreaRatio: number,
) {
  const { sourceX, sourceY, sourceWidth, sourceHeight } = getScanRegionRect(
    videoElement.videoWidth,
    videoElement.videoHeight,
    scanAreaRatio,
  )

  canvas.width = sourceWidth
  canvas.height = sourceHeight
  context.drawImage(videoElement, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight)
}

export function useVideoBarcodeScanner({
  videoRef,
  enabled,
  onDetected,
  onUnsupported,
  onAutoSwitchToFullFrame,
  scanIntervalMs = DEFAULT_SCAN_INTERVAL_MS,
  scanAreaRatio = DEFAULT_SCAN_AREA_RATIO,
  scanMode = 'center-first',
}: UseVideoBarcodeScannerOptions) {
  const onDetectedRef = useRef(onDetected)
  const onUnsupportedRef = useRef(onUnsupported)
  const lastDetectedValueRef = useRef<string | null>(null)
  const missStreakRef = useRef(0)
  const scanAttemptRef = useRef(0)
  const activeControlsRef = useRef<ScannerControls | null>(null)

  const registerDetectedValue = useCallback((rawValue: string) => {
    const value = normalizeBarcodeValue(rawValue)

    if (!value) {
      return
    }

    missStreakRef.current = 0

    if (value === lastDetectedValueRef.current) {
      return
    }

    lastDetectedValueRef.current = value
    onDetectedRef.current(value)
  }, [])

  useEffect(() => {
    onDetectedRef.current = onDetected
  }, [onDetected])

  useEffect(() => {
    onUnsupportedRef.current = onUnsupported
  }, [onUnsupported])

  useEffect(() => {
    if (scanMode === 'full-frame') {
      missStreakRef.current = 0
    }
  }, [scanMode])

  useEffect(() => {
    if (!enabled) {
      lastDetectedValueRef.current = null
      missStreakRef.current = 0
      scanAttemptRef.current = 0
      activeControlsRef.current?.stop()
      activeControlsRef.current = null
      return
    }

    const BarcodeDetector = getBarcodeDetector()

    if (!BarcodeDetector) {
      let cancelled = false
      let timerId: number | null = null
      const reader = new BrowserMultiFormatReader()

      async function startZxingScanner() {
        if (cancelled) {
          return
        }

        const videoElement = videoRef.current

        if (!videoElement || videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          timerId = window.setTimeout(startZxingScanner, scanIntervalMs)
          return
        }

        try {
          const controls = await reader.decodeFromVideoElement(videoElement, (result, error, scannerControls) => {
            activeControlsRef.current = scannerControls

            if (error) {
              return
            }

            const value = result?.getText().trim()
            if (value) {
              registerDetectedValue(value)
            }
          })

          activeControlsRef.current = controls
        } catch {
          onUnsupportedRef.current?.()
        }
      }

      void startZxingScanner()

      return () => {
        cancelled = true
        if (timerId !== null) {
          window.clearTimeout(timerId)
        }
        activeControlsRef.current?.stop()
        activeControlsRef.current = null
      }
    }

    let cancelled = false
    let timerId: number | null = null
    const detector = new BarcodeDetector({
      formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'qr_code', 'upc_a', 'upc_e', 'itf'],
    })
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d', { willReadFrequently: true })

    async function scanFrame() {
      if (cancelled) {
        return
      }

      const videoElement = videoRef.current

      if (!videoElement || !context || videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        timerId = window.setTimeout(scanFrame, scanIntervalMs)
        return
      }

      try {
        const nextScanAreaRatio = getScanAreaRatioForMode(scanMode, scanAttemptRef.current, scanAreaRatio)
        scanAttemptRef.current += 1
        copyScanRegion(videoElement, canvas, context, nextScanAreaRatio)
        const barcodes = await detector.detect(canvas)
        const rawValue = barcodes[0]?.rawValue
        if (rawValue) {
          registerDetectedValue(rawValue)
        } else {
          missStreakRef.current += 1
          if (shouldAutoSwitchToFullFrame(scanMode, missStreakRef.current)) {
            onAutoSwitchToFullFrame?.()
            missStreakRef.current = 0
          }
          if (missStreakRef.current >= 2) {
            lastDetectedValueRef.current = null
          }
        }
      } catch {
        // Ignore transient decode failures and try again on the next tick.
        missStreakRef.current += 1
        if (shouldAutoSwitchToFullFrame(scanMode, missStreakRef.current)) {
          onAutoSwitchToFullFrame?.()
          missStreakRef.current = 0
        }
        if (missStreakRef.current >= 2) {
          lastDetectedValueRef.current = null
        }
      }

      if (!cancelled) {
        timerId = window.setTimeout(scanFrame, scanIntervalMs)
      }
    }

    timerId = window.setTimeout(scanFrame, scanIntervalMs)

    return () => {
      cancelled = true
      if (timerId !== null) {
        window.clearTimeout(timerId)
      }
      scanAttemptRef.current = 0
      activeControlsRef.current?.stop()
      activeControlsRef.current = null
    }
  }, [enabled, onAutoSwitchToFullFrame, registerDetectedValue, scanAreaRatio, scanIntervalMs, scanMode, videoRef])
}

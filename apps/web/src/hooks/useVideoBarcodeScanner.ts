import { useCallback, useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'

type UseVideoBarcodeScannerOptions = {
  videoRef: RefObject<HTMLVideoElement | null>
  enabled: boolean
  onDetected: (value: string) => void
  onUnsupported?: () => void
  scanIntervalMs?: number
}

type BarcodeDetectorInstance = {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue?: string }>>
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

function normalizeBarcodeValue(value: string) {
  return value.trim()
}

export function useVideoBarcodeScanner({
  videoRef,
  enabled,
  onDetected,
  onUnsupported,
  scanIntervalMs = 250,
}: UseVideoBarcodeScannerOptions) {
  const onDetectedRef = useRef(onDetected)
  const onUnsupportedRef = useRef(onUnsupported)
  const lastDetectedValueRef = useRef<string | null>(null)
  const candidateValueRef = useRef<string | null>(null)
  const candidateCountRef = useRef(0)
  const candidateTimerRef = useRef<number | null>(null)
  const activeControlsRef = useRef<ScannerControls | null>(null)

  const clearCandidate = useCallback(() => {
    candidateValueRef.current = null
    candidateCountRef.current = 0
    if (candidateTimerRef.current !== null) {
      window.clearTimeout(candidateTimerRef.current)
      candidateTimerRef.current = null
    }
  }, [])

  const registerDetectedValue = useCallback((rawValue: string) => {
    const value = normalizeBarcodeValue(rawValue)

    if (!value || value === lastDetectedValueRef.current) {
      clearCandidate()
      return
    }

    if (candidateValueRef.current !== value) {
      candidateValueRef.current = value
      candidateCountRef.current = 1
    } else {
      candidateCountRef.current += 1
    }

    if (candidateTimerRef.current !== null) {
      window.clearTimeout(candidateTimerRef.current)
    }

    candidateTimerRef.current = window.setTimeout(() => {
      clearCandidate()
    }, scanIntervalMs * 3)

    if (candidateCountRef.current < 2) {
      return
    }

    lastDetectedValueRef.current = value
    clearCandidate()
    onDetectedRef.current(value)
  }, [clearCandidate, scanIntervalMs])

  useEffect(() => {
    onDetectedRef.current = onDetected
  }, [onDetected])

  useEffect(() => {
    onUnsupportedRef.current = onUnsupported
  }, [onUnsupported])

  useEffect(() => {
    if (!enabled) {
      lastDetectedValueRef.current = null
      clearCandidate()
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

    async function scanFrame() {
      if (cancelled) {
        return
      }

      const videoElement = videoRef.current

      if (!videoElement || videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        timerId = window.setTimeout(scanFrame, scanIntervalMs)
        return
      }

      try {
        const barcodes = await detector.detect(videoElement)
        const rawValue = barcodes[0]?.rawValue
        if (rawValue) {
          registerDetectedValue(rawValue)
        }
      } catch {
        // Ignore transient decode failures and try again on the next tick.
      }

      if (!cancelled) {
        timerId = window.setTimeout(scanFrame, scanIntervalMs)
      }
    }

    timerId = window.setTimeout(scanFrame, scanIntervalMs)

    return () => {
      cancelled = true
      clearCandidate()
      if (timerId !== null) {
        window.clearTimeout(timerId)
      }
      activeControlsRef.current?.stop()
      activeControlsRef.current = null
    }
  }, [clearCandidate, enabled, registerDetectedValue, scanIntervalMs, videoRef])
}

import { useEffect, useRef } from 'react'
import type { ReactNode, RefObject } from 'react'

type CameraPreviewProps = {
  stream: MediaStream | null
  isLoading: boolean
  error: string | null
  emptyMessage?: string
  videoRef?: RefObject<HTMLVideoElement | null>
  scanGuide?: boolean
  scanGuideLabel?: string
  scanGuideDetail?: string
  topSlot?: ReactNode
  centerSlot?: ReactNode
  bottomSlot?: ReactNode
}

export function CameraPreview({
  stream,
  isLoading,
  error,
  emptyMessage = 'Kamera belum aktif.',
  videoRef,
  scanGuide = false,
  scanGuideLabel = 'Pusatkan barcode di area ini',
  scanGuideDetail = 'Scanner akan coba baca area tengah dulu, lalu seluruh frame jika belum terbaca.',
  topSlot,
  centerSlot,
  bottomSlot,
}: CameraPreviewProps) {
  const internalVideoRef = useRef<HTMLVideoElement | null>(null)
  const actualVideoRef = videoRef ?? internalVideoRef

  useEffect(() => {
    const videoElement = actualVideoRef.current

    if (!videoElement) {
      return
    }

    videoElement.srcObject = stream

    return () => {
      videoElement.srcObject = null
    }
  }, [actualVideoRef, stream])

  return (
    <div className="scan-opencode__camera-preview relative overflow-hidden">
      {topSlot ? <div className="absolute left-3 top-3 z-10 max-w-[calc(100%-1.5rem)]">{topSlot}</div> : null}
      <video ref={actualVideoRef} autoPlay muted playsInline className="h-[clamp(360px,64vh,700px)] w-full object-cover" />
      {scanGuide ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-4">
          <div className="scan-opencode__scan-guide relative h-[46%] min-h-48 w-[78%] max-w-[26rem]">
            <span className="absolute left-0 top-0 h-6 w-6 -translate-x-px -translate-y-px border-l border-t" />
            <span className="absolute right-0 top-0 h-6 w-6 translate-x-px -translate-y-px border-r border-t" />
            <span className="absolute bottom-0 left-0 h-6 w-6 -translate-x-px translate-y-px border-b border-l" />
            <span className="absolute bottom-0 right-0 h-6 w-6 translate-x-px translate-y-px border-b border-r" />
            <div className="scan-opencode__scan-guide-label absolute inset-x-3 bottom-3 grid gap-1 px-3 py-2 text-center">
              <div>{scanGuideLabel}</div>
              <div>{scanGuideDetail}</div>
            </div>
          </div>
        </div>
      ) : null}
      {bottomSlot ? <div className="absolute bottom-3 left-3 right-3 z-10">{bottomSlot}</div> : null}
      {centerSlot ? <div className="absolute inset-0 z-20 flex items-center justify-center p-4">{centerSlot}</div> : null}

      {isLoading ? (
        <Overlay tone="default">Mengaktifkan kamera...</Overlay>
      ) : null}

      {!isLoading && !stream && !error ? <Overlay tone="default">{emptyMessage}</Overlay> : null}

      {error ? <Overlay tone="error">{error}</Overlay> : null}
    </div>
  )
}

function Overlay({ children, tone }: { children: string; tone: 'default' | 'error' }) {
  return (
    <div
      className={
        tone === 'error'
          ? 'scan-opencode__camera-overlay absolute inset-x-3 bottom-3 z-10 is-error'
          : 'scan-opencode__camera-overlay absolute inset-x-3 bottom-3 z-10'
      }
    >
      {tone === 'error' ? '[!]' : '[~]'} {children}
    </div>
  )
}

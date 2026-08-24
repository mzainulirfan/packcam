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
    <div className="relative overflow-hidden rounded-[4px] border border-slate-300 bg-slate-950">
      {topSlot ? <div className="absolute left-3 top-3 z-10 max-w-[calc(100%-1.5rem)]">{topSlot}</div> : null}
      <video ref={actualVideoRef} autoPlay muted playsInline className="h-[clamp(360px,64vh,700px)] w-full object-cover" />
      {scanGuide ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-4">
          <div className="relative h-[46%] min-h-48 w-[78%] max-w-[26rem] rounded-[4px] border border-white bg-transparent">
            <span className="absolute left-0 top-0 h-6 w-6 -translate-x-px -translate-y-px border-l-4 border-t-4 border-amber-300" />
            <span className="absolute right-0 top-0 h-6 w-6 translate-x-px -translate-y-px border-r-4 border-t-4 border-amber-300" />
            <span className="absolute bottom-0 left-0 h-6 w-6 -translate-x-px translate-y-px border-b-4 border-l-4 border-amber-300" />
            <span className="absolute bottom-0 right-0 h-6 w-6 translate-x-px translate-y-px border-b-4 border-r-4 border-amber-300" />
            <div className="absolute inset-x-3 bottom-3 grid gap-1 rounded-[4px] border border-white bg-slate-950 px-3 py-2 text-center text-white">
              <div className="text-[0.68rem] uppercase tracking-[0.22em]">{scanGuideLabel}</div>
              <div className="text-[0.72rem] leading-5 text-white/80">{scanGuideDetail}</div>
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
          ? 'absolute inset-x-3 bottom-3 z-10 rounded-[4px] border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700'
          : 'absolute inset-x-3 bottom-3 z-10 rounded-[4px] border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700'
      }
    >
      {children}
    </div>
  )
}

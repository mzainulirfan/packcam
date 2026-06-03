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
    <div className="relative overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-2xl shadow-slate-900/20">
      {topSlot ? <div className="absolute left-4 top-4 z-10">{topSlot}</div> : null}
      <video ref={actualVideoRef} autoPlay muted playsInline className="h-[clamp(380px,66vh,720px)] w-full object-cover" />
      {scanGuide ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-5">
          <div className="relative h-[46%] min-h-48 w-[78%] max-w-[26rem] rounded-[2rem] border border-white/80 bg-white/5 shadow-[0_0_0_9999px_rgba(2,6,23,0.22)] backdrop-blur-[1px]">
            <span className="absolute left-0 top-0 h-5 w-5 -translate-x-1 -translate-y-1 rounded-tl-[1.75rem] border-l-[3px] border-t-[3px] border-amber-300" />
            <span className="absolute right-0 top-0 h-5 w-5 translate-x-1 -translate-y-1 rounded-tr-[1.75rem] border-r-[3px] border-t-[3px] border-amber-300" />
            <span className="absolute bottom-0 left-0 h-5 w-5 -translate-x-1 translate-y-1 rounded-bl-[1.75rem] border-b-[3px] border-l-[3px] border-amber-300" />
            <span className="absolute bottom-0 right-0 h-5 w-5 translate-x-1 translate-y-1 rounded-br-[1.75rem] border-b-[3px] border-r-[3px] border-amber-300" />
            <div className="absolute inset-x-4 bottom-4 grid gap-1 rounded-2xl border border-white/15 bg-slate-950/70 px-4 py-3 text-center text-white/90 shadow-lg backdrop-blur">
              <div className="text-[0.68rem] uppercase tracking-[0.22em]">{scanGuideLabel}</div>
              <div className="text-[0.72rem] leading-5 text-white/75">{scanGuideDetail}</div>
            </div>
          </div>
        </div>
      ) : null}
      {bottomSlot ? <div className="absolute bottom-4 left-4 right-4 z-10">{bottomSlot}</div> : null}
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
          ? 'absolute inset-x-4 bottom-4 z-10 rounded-2xl border border-rose-200 bg-rose-50/95 px-4 py-3 text-sm text-rose-700 shadow-lg backdrop-blur'
          : 'absolute inset-x-4 bottom-4 z-10 rounded-2xl border border-white/15 bg-white/95 px-4 py-3 text-sm text-slate-700 shadow-lg backdrop-blur'
      }
    >
      {children}
    </div>
  )
}

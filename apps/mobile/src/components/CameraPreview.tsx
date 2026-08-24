import { useEffect, useRef, type ReactNode } from 'react'
import { Card } from '@/components/ui/card'

type CameraPreviewProps = {
  stream: MediaStream | null
  isLoading: boolean
  error: string | null
  emptyMessage?: string
  onVideoElement?: (element: HTMLVideoElement | null) => void
  topSlot?: ReactNode
  centerSlot?: ReactNode
  bottomSlot?: ReactNode
}

export function CameraPreview({
  stream,
  isLoading,
  error,
  emptyMessage = 'Kamera belum aktif.',
  onVideoElement,
  topSlot,
  centerSlot,
  bottomSlot,
}: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const videoElement = videoRef.current

    if (!videoElement) {
      return
    }

    videoElement.srcObject = stream
    if (stream) {
      void videoElement.play().catch(() => undefined)
    }

    return () => {
      videoElement.srcObject = null
    }
  }, [stream])

  return (
    <div className="camera-preview">
      {topSlot ? <div className="absolute left-3 top-3 z-10">{topSlot}</div> : null}
      <video
        ref={(element) => {
          videoRef.current = element
          onVideoElement?.(element)
        }}
        autoPlay
        muted
        playsInline
        className="block h-full w-full object-cover"
      />
      {bottomSlot ? <div className="absolute left-3 right-3 bottom-3 z-10">{bottomSlot}</div> : null}
      {centerSlot ? <div className="absolute inset-x-2 top-10 bottom-24 z-0 flex items-center justify-center px-2 pointer-events-none">{centerSlot}</div> : null}
      {isLoading ? <Overlay tone="default">Mengaktifkan kamera...</Overlay> : null}
      {!isLoading && !stream && !error ? <Overlay tone="default">{emptyMessage}</Overlay> : null}
      {error ? <Overlay tone="error">{error}</Overlay> : null}
    </div>
  )
}

function Overlay({ children, tone }: { children: string; tone: 'default' | 'error' }) {
  return (
    <Card
      className={
        tone === 'error'
          ? 'absolute left-3 right-3 bottom-3 z-10 rounded-[4px] border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive'
          : 'absolute left-3 right-3 bottom-3 z-10 rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-canvas)] px-4 py-3 text-sm text-[var(--op-ink)]'
      }
    >
      {children}
    </Card>
  )
}

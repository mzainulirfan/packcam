import { useEffect, useRef, type ReactNode } from 'react'

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
      {topSlot ? <div className="camera-preview__top">{topSlot}</div> : null}
      <video
        ref={(element) => {
          videoRef.current = element
          onVideoElement?.(element)
        }}
        autoPlay
        muted
        playsInline
        className="camera-preview__video"
      />
      {bottomSlot ? <div className="camera-preview__bottom">{bottomSlot}</div> : null}
      {centerSlot ? <div className="camera-preview__center">{centerSlot}</div> : null}
      {isLoading ? <Overlay tone="default">Mengaktifkan kamera...</Overlay> : null}
      {!isLoading && !stream && !error ? <Overlay tone="default">{emptyMessage}</Overlay> : null}
      {error ? <Overlay tone="error">{error}</Overlay> : null}
    </div>
  )
}

function Overlay({ children, tone }: { children: string; tone: 'default' | 'error' }) {
  return <div className={tone === 'error' ? 'camera-preview__overlay camera-preview__overlay--error' : 'camera-preview__overlay'}>{children}</div>
}

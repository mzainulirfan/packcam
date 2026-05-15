import { useEffect, useRef } from 'react'

type CameraPreviewProps = {
  stream: MediaStream | null
  isLoading: boolean
  error: string | null
  emptyMessage?: string
}

export function CameraPreview({
  stream,
  isLoading,
  error,
  emptyMessage = 'Kamera belum aktif.',
}: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const videoElement = videoRef.current

    if (!videoElement) {
      return
    }

    videoElement.srcObject = stream

    return () => {
      videoElement.srcObject = null
    }
  }, [stream])

  return (
    <div className="camera-preview">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="camera-preview__video"
      />

      {isLoading ? <div className="camera-preview__overlay">Mengaktifkan kamera...</div> : null}
      {!isLoading && !stream && !error ? (
        <div className="camera-preview__overlay">{emptyMessage}</div>
      ) : null}
      {error ? (
        <div className="camera-preview__overlay camera-preview__overlay--error">
          {error}
        </div>
      ) : null}
    </div>
  )
}

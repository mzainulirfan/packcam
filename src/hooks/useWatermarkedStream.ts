import { useEffect, useRef, useState } from 'react'

type UseWatermarkedStreamOptions = {
  sourceStream: MediaStream | null
  watermarkResi: string | null
  watermarkTime: string | null
}

export function useWatermarkedStream({
  sourceStream,
  watermarkResi,
  watermarkTime,
}: UseWatermarkedStreamOptions) {
  const [watermarkedStream, setWatermarkedStream] = useState<MediaStream | null>(null)
  const watermarkResiRef = useRef<string | null>(watermarkResi)
  const watermarkTimeRef = useRef<string | null>(watermarkTime)

  useEffect(() => {
    watermarkResiRef.current = watermarkResi
  }, [watermarkResi])

  useEffect(() => {
    watermarkTimeRef.current = watermarkTime
  }, [watermarkTime])

  useEffect(() => {
    if (!sourceStream) {
      return
    }

    if (typeof document === 'undefined') {
      queueMicrotask(() => {
        setWatermarkedStream(sourceStream)
      })
      return
    }

    const video = document.createElement('video')
    video.autoplay = true
    video.muted = true
    video.playsInline = true
    video.srcObject = sourceStream

    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')

    if (!context || typeof canvas.captureStream !== 'function') {
      queueMicrotask(() => {
        setWatermarkedStream(sourceStream)
      })
      return
    }
    const drawingContext = context

    let cancelled = false
    let animationFrameId = 0
    let outputStream: MediaStream | null = null

    function ensureOutputStream() {
      if (outputStream) {
        return
      }

      outputStream = canvas.captureStream(30)
      setWatermarkedStream(outputStream)
    }

    function drawFrame() {
      if (cancelled) {
        return
      }

      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
        }

        drawingContext.drawImage(video, 0, 0, canvas.width, canvas.height)

        const watermarkWidth = Math.min(380, canvas.width - 24)
        const watermarkHeight = 72
        const watermarkX = Math.max(12, (canvas.width - watermarkWidth) / 2)
        const watermarkY = canvas.height - watermarkHeight - 92

        drawingContext.fillStyle = 'rgba(17, 17, 17, 0.62)'
        drawingContext.fillRect(watermarkX, watermarkY, watermarkWidth, watermarkHeight)

        drawingContext.fillStyle = '#ffffff'
        drawingContext.font = '600 22px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
        drawingContext.textBaseline = 'top'
        drawingContext.fillText(
          watermarkResiRef.current ? `RESI ${watermarkResiRef.current}` : 'RESI -',
          watermarkX + 12,
          watermarkY + 8,
        )

        drawingContext.font = '600 16px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
        drawingContext.fillText(watermarkTimeRef.current ?? '-', watermarkX + 12, watermarkY + 38)

        ensureOutputStream()
      }

      animationFrameId = window.requestAnimationFrame(drawFrame)
    }

    const start = async () => {
      try {
        await video.play()
      } catch {
        // Ignore autoplay failures; the next frame may still render once data is available.
      }

      drawFrame()
    }

    void start()

    return () => {
      cancelled = true
      window.cancelAnimationFrame(animationFrameId)
      video.pause()
      video.srcObject = null
      outputStream?.getTracks().forEach((track) => track.stop())
      setWatermarkedStream(null)
    }
  }, [sourceStream])

  return watermarkedStream
}

import { useEffect, useRef, useState } from 'react'

type UseWatermarkedStreamOptions = {
  sourceStream: MediaStream | null
  watermarkResi: string | null
  watermarkTask: string | null
  watermarkOperator: string | null
  watermarkTime: string | null
}

export function useWatermarkedStream({
  sourceStream,
  watermarkResi,
  watermarkTask,
  watermarkOperator,
  watermarkTime,
}: UseWatermarkedStreamOptions) {
  const [watermarkedStream, setWatermarkedStream] = useState<MediaStream | null>(null)
  const watermarkResiRef = useRef<string | null>(watermarkResi)
  const watermarkTaskRef = useRef<string | null>(watermarkTask)
  const watermarkOperatorRef = useRef<string | null>(watermarkOperator)
  const watermarkTimeRef = useRef<string | null>(watermarkTime)

  useEffect(() => {
    watermarkResiRef.current = watermarkResi
  }, [watermarkResi])

  useEffect(() => {
    watermarkTaskRef.current = watermarkTask
  }, [watermarkTask])

  useEffect(() => {
    watermarkOperatorRef.current = watermarkOperator
  }, [watermarkOperator])

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

        const watermarkWidth = Math.min(420, Math.max(280, Math.round(canvas.width * 0.36)))
        const watermarkHeight = 88
        const watermarkX = Math.max(16, Math.round((canvas.width - watermarkWidth) / 2))
        const watermarkY = Math.max(16, canvas.height - watermarkHeight - 20)
        const cornerRadius = 12

        drawingContext.save()
        drawRoundedRect(drawingContext, watermarkX, watermarkY, watermarkWidth, watermarkHeight, cornerRadius)
        drawingContext.fillStyle = 'rgba(2, 6, 23, 0.36)'
        drawingContext.fill()

        drawingContext.fillStyle = '#ffffff'
        drawingContext.font = '800 18px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
        drawingContext.textBaseline = 'top'
        drawingContext.fillText(
          watermarkResiRef.current ? `RESI ${watermarkResiRef.current}` : 'RESI -',
          watermarkX + 16,
          watermarkY + 10,
        )

        drawingContext.font = '700 13px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
        drawingContext.fillStyle = 'rgba(255, 255, 255, 0.92)'
        drawingContext.fillText(
          `${watermarkTaskRef.current?.toUpperCase() ?? 'QC'} | ${watermarkOperatorRef.current ?? '-'}`,
          watermarkX + 16,
          watermarkY + 38,
          watermarkWidth - 32,
        )

        drawingContext.font = '600 11px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
        drawingContext.fillStyle = 'rgba(255, 255, 255, 0.78)'
        drawingContext.fillText(watermarkTimeRef.current ?? '-', watermarkX + 16, watermarkY + 60)

        drawingContext.restore()

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

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const right = x + width
  const bottom = y + height
  const r = Math.min(radius, width / 2, height / 2)

  context.beginPath()
  context.moveTo(x + r, y)
  context.arcTo(right, y, right, bottom, r)
  context.arcTo(right, bottom, x, bottom, r)
  context.arcTo(x, bottom, x, y, r)
  context.arcTo(x, y, right, y, r)
  context.closePath()
}

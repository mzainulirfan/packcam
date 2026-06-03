import { useEffect, useState } from 'react'
import { reportServerLastErrorApi } from '@pakti/api-client'

type CameraStreamState = {
  stream: MediaStream | null
  loading: boolean
  error: string | null
}

function parseResolution(value: string) {
  const match = value.trim().match(/^(\d{3,5})x(\d{3,5})$/i)

  if (!match) {
    return null
  }

  const width = Number.parseInt(match[1], 10)
  const height = Number.parseInt(match[2], 10)

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null
  }

  return { width, height }
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop())
}

export function useCameraStream(deviceId: string, preferredResolution?: string) {
  const [state, setState] = useState<CameraStreamState>({
    stream: null,
    loading: false,
    error: null,
  })

  useEffect(() => {
    let cancelled = false

    async function startStream() {
      if (!window.isSecureContext) {
        const message = 'Kamera butuh HTTPS atau localhost. Buka web lewat HTTPS agar kamera bisa dipakai.'
        void reportServerLastErrorApi(message).catch(() => undefined)
        setState({
          stream: null,
          loading: false,
          error: message,
        })
        return
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        void reportServerLastErrorApi('Browser tidak mendukung akses kamera.').catch(() => undefined)
        setState({
          stream: null,
          loading: false,
          error: 'Browser tidak mendukung akses kamera.',
        })
        return
      }

      setState((current) => ({
        ...current,
        loading: true,
        error: null,
      }))

      try {
        const resolution = preferredResolution ? parseResolution(preferredResolution) : null
        const constraints: MediaStreamConstraints = {
          video: deviceId
            ? {
                deviceId: { exact: deviceId },
                width: resolution ? { ideal: resolution.width } : { ideal: 1920 },
                height: resolution ? { ideal: resolution.height } : { ideal: 1080 },
                frameRate: { ideal: 30, max: 60 },
              }
            : {
                facingMode: 'environment',
                width: resolution ? { ideal: resolution.width } : { ideal: 1920 },
                height: resolution ? { ideal: resolution.height } : { ideal: 1080 },
                frameRate: { ideal: 30, max: 60 },
              },
          audio: false,
        }

        const nextStream = await navigator.mediaDevices.getUserMedia(constraints)

        if (cancelled) {
          stopStream(nextStream)
          return
        }

        setState({
          stream: nextStream,
          loading: false,
          error: null,
        })
      } catch (error) {
        if (cancelled) {
          return
        }

        const message =
          error instanceof DOMException
            ? error.message
            : 'Tidak dapat mengakses kamera.'

        void reportServerLastErrorApi(message).catch(() => undefined)

        setState({
          stream: null,
          loading: false,
          error: message,
        })
      }
    }

    void startStream()

    return () => {
      cancelled = true
    }
  }, [deviceId, preferredResolution])

  useEffect(
    () => () => {
      stopStream(state.stream)
    },
    [state.stream],
  )

  return state
}

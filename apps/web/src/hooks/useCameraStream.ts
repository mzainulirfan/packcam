import { useEffect, useState } from 'react'
import { reportServerLastErrorApi } from '@pakti/api-client'

type CameraStreamState = {
  stream: MediaStream | null
  loading: boolean
  error: string | null
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop())
}

export function useCameraStream(deviceId: string) {
  const [state, setState] = useState<CameraStreamState>({
    stream: null,
    loading: false,
    error: null,
  })

  useEffect(() => {
    let cancelled = false

    async function startStream() {
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
        const constraints: MediaStreamConstraints = {
          video: deviceId
            ? { deviceId: { exact: deviceId } }
            : { facingMode: 'environment' },
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
  }, [deviceId])

  useEffect(
    () => () => {
      stopStream(state.stream)
    },
    [state.stream],
  )

  return state
}

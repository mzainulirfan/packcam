import { useEffect, useRef, useState } from 'react'
import { reportServerLastErrorApi } from '@pakti/api-client'

type CameraStreamState = {
  stream: MediaStream | null
  loading: boolean
  error: string | null
}

type FacingMode = 'environment' | 'user'

const CAMERA_VIDEO_BASE: MediaTrackConstraints = {
  width: { ideal: 1280, max: 1280 },
  height: { ideal: 720, max: 720 },
  frameRate: { ideal: 30, max: 30 },
}

function withCameraBase(constraints: MediaTrackConstraints): MediaTrackConstraints {
  return {
    ...CAMERA_VIDEO_BASE,
    ...constraints,
  }
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop())
}

export function useCameraStream(deviceId: string, enabled = true, preferredFacingMode: FacingMode = 'environment') {
  const [state, setState] = useState<CameraStreamState>({
    stream: null,
    loading: false,
    error: null,
  })
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    streamRef.current = state.stream
  }, [state.stream])

  useEffect(() => {
    let cancelled = false

    async function tryConstraints(constraints: MediaStreamConstraints) {
      return navigator.mediaDevices.getUserMedia(constraints)
    }

    async function startStream() {
      if (!enabled) {
        stopStream(streamRef.current)
        setState({
          stream: null,
          loading: false,
          error: null,
        })
        return
      }

      if (!window.isSecureContext) {
        const message = 'Kamera butuh HTTPS atau localhost. Buka mobile lewat HTTPS agar kamera bisa dipakai.'
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
        const secondaryFacingMode: FacingMode = preferredFacingMode === 'environment' ? 'user' : 'environment'
        const preferredConstraints: MediaStreamConstraints[] = deviceId
          ? [
              { video: withCameraBase({ facingMode: preferredFacingMode }), audio: false },
              { video: withCameraBase({ deviceId: { exact: deviceId } }), audio: false },
              { video: withCameraBase({ deviceId }), audio: false },
              { video: withCameraBase({ facingMode: secondaryFacingMode }), audio: false },
              { video: CAMERA_VIDEO_BASE, audio: false },
              { video: true, audio: false },
            ]
          : [
              { video: withCameraBase({ facingMode: preferredFacingMode }), audio: false },
              { video: withCameraBase({ facingMode: secondaryFacingMode }), audio: false },
              { video: CAMERA_VIDEO_BASE, audio: false },
              { video: true, audio: false },
            ]

        let nextStream: MediaStream | null = null
        let lastError: unknown = null

        for (const constraints of preferredConstraints) {
          try {
            nextStream = await tryConstraints(constraints)
            break
          } catch (error) {
            lastError = error
          }
        }

        if (!nextStream) {
          throw lastError instanceof Error ? lastError : new Error('Tidak dapat mengakses kamera.')
        }

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

        const message = error instanceof DOMException ? error.message : 'Tidak dapat mengakses kamera.'
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
  }, [deviceId, enabled, preferredFacingMode])

  useEffect(
    () => () => {
      stopStream(streamRef.current)
    },
    [],
  )

  return state
}

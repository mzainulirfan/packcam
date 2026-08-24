import { useEffect, useState } from 'react'

export type CameraDeviceOption = {
  deviceId: string
  label: string
}

function formatDeviceLabel(device: MediaDeviceInfo, index: number) {
  const label = device.label.trim()
  return label || `Camera ${index + 1}`
}

export function useCameraDevices(isActive: boolean) {
  const [devices, setDevices] = useState<CameraDeviceOption[]>([])

  useEffect(() => {
    if (!isActive) {
      return
    }

    let cancelled = false

    async function loadDevices() {
      try {
        const available = await navigator.mediaDevices.enumerateDevices()

        if (cancelled) {
          return
        }

        const videoDevices = available
          .filter((device) => device.kind === 'videoinput')
          .map((device, index) => ({
            deviceId: device.deviceId,
            label: formatDeviceLabel(device, index),
          }))
          .filter((device) => device.deviceId.trim() !== '')

        setDevices(videoDevices)
      } catch {
        if (!cancelled) {
          setDevices([])
        }
      }
    }

    void loadDevices()

    return () => {
      cancelled = true
    }
  }, [isActive])

  return devices
}

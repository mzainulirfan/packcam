import { useEffect, useState } from 'react'

export type StorageEstimateState = {
  usage: number | null
  quota: number | null
  available: number | null
  warning: string | null
}

const WARNING_THRESHOLD_BYTES = 5 * 1024 * 1024 * 1024

export function useStorageEstimate() {
  const [state, setState] = useState<StorageEstimateState>({
    usage: null,
    quota: null,
    available: null,
    warning: null,
  })

  useEffect(() => {
    let cancelled = false

    async function loadEstimate() {
      if (!navigator.storage?.estimate) {
        setState({
          usage: null,
          quota: null,
          available: null,
          warning: 'Storage estimate tidak tersedia di browser ini.',
        })
        return
      }

      try {
        const estimate = await navigator.storage.estimate()
        const usage = estimate.usage ?? null
        const quota = estimate.quota ?? null
        const available = usage !== null && quota !== null ? Math.max(0, quota - usage) : null
        const warning =
          available !== null && available < WARNING_THRESHOLD_BYTES
            ? 'Sisa storage browser di bawah 5 GB.'
            : null

        if (!cancelled) {
          setState({
            usage,
            quota,
            available,
            warning,
          })
        }
      } catch {
        if (!cancelled) {
          setState({
            usage: null,
            quota: null,
            available: null,
            warning: 'Gagal membaca perkiraan storage.',
          })
        }
      }
    }

    void loadEstimate()

    return () => {
      cancelled = true
    }
  }, [])

  return state
}

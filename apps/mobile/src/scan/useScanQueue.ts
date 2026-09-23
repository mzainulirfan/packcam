import { useCallback, useEffect, useRef } from 'react'

type StartScanRecordingFn = (
  resiInput: string,
  source?: 'manual' | 'camera',
) => Promise<'started' | 'duplicate' | 'queued' | 'busy' | 'error'>

type ScanQueueRecordingState = {
  mode: string
  activeResi?: string | null
}

type UseScanQueueParams = {
  active: boolean
  recordingState: ScanQueueRecordingState
  stopRecording: () => Promise<unknown>
}

async function waitForNextQueueTurn() {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0)
  })
}

export function useScanQueue({ active, recordingState, stopRecording }: UseScanQueueParams) {
  const pendingScanResiRef = useRef<string[]>([])
  const rejectedResiRef = useRef<string | null>(null)
  const scanQueueBusyRef = useRef(false)
  const scanQueueRetryTimerRef = useRef<number | null>(null)
  // Batas tunggu agar antrean tidak deadlock saat mode nyangkut di stopping/saving/error.
  const queueStuckSinceRef = useRef<number | null>(null)
  const QUEUE_STUCK_TIMEOUT_MS = 15_000
  const startScanRecordingRef = useRef<StartScanRecordingFn | null>(null)
  const processCameraScanQueueRef = useRef<(() => Promise<void>) | null>(null)
  const activeRef = useRef(active)
  const recordingStateRef = useRef(recordingState)

  useEffect(() => {
    activeRef.current = active
  }, [active])

  useEffect(() => {
    recordingStateRef.current = recordingState
  }, [recordingState])

  useEffect(
    () => () => {
      if (scanQueueRetryTimerRef.current !== null) {
        window.clearTimeout(scanQueueRetryTimerRef.current)
      }
    },
    [],
  )

  const setStartScanRecording = useCallback((startScanRecording: StartScanRecordingFn) => {
    startScanRecordingRef.current = startScanRecording
  }, [])

  const enqueueCameraScan = useCallback((resiNumber: string) => {
    if (pendingScanResiRef.current.includes(resiNumber)) {
      return
    }

    pendingScanResiRef.current.push(resiNumber)
  }, [])

  const isRejectedResi = useCallback((resiNumber: string) => rejectedResiRef.current === resiNumber, [])

  const rejectResi = useCallback((resiNumber: string) => {
    rejectedResiRef.current = resiNumber
    window.setTimeout(() => {
      if (rejectedResiRef.current === resiNumber) {
        rejectedResiRef.current = null
      }
    }, 4000)
  }, [])

  const clearRejectedResi = useCallback((resiNumber?: string) => {
    if (!resiNumber || rejectedResiRef.current === resiNumber) {
      rejectedResiRef.current = null
    }
  }, [])

  const processCameraScanQueue = useCallback(async () => {
    if (scanQueueBusyRef.current || !activeRef.current) {
      return
    }

    scanQueueBusyRef.current = true

    try {
      while (pendingScanResiRef.current.length > 0 && activeRef.current) {
        const nextResi = pendingScanResiRef.current[0]
        if (!nextResi) {
          pendingScanResiRef.current.shift()
          continue
        }

        if (rejectedResiRef.current === nextResi) {
          pendingScanResiRef.current.shift()
          continue
        }

        const currentRecordingState = recordingStateRef.current

        if (currentRecordingState.mode === 'recording') {
          if (currentRecordingState.activeResi === nextResi) {
            pendingScanResiRef.current.shift()
            continue
          }

          pendingScanResiRef.current.shift()
          const startScanRecording = startScanRecordingRef.current
          if (!startScanRecording) {
            return
          }

          const result = await startScanRecording(nextResi, 'camera')
          if (result === 'queued' || result === 'busy') {
            pendingScanResiRef.current.unshift(nextResi)
          } else {
            continue
          }

          if (result === 'queued') {
            await stopRecording()
          }
          await waitForNextQueueTurn()
          continue
        }

        if (currentRecordingState.mode !== 'idle') {
          const now = Date.now()
          if (queueStuckSinceRef.current === null) {
            queueStuckSinceRef.current = now
          } else if (now - queueStuckSinceRef.current > QUEUE_STUCK_TIMEOUT_MS) {
            // Mode nyangkut (mis. stopping/saving/error): lepas item agar scanner jalan lagi.
            queueStuckSinceRef.current = null
            pendingScanResiRef.current.shift()
            rejectResi(nextResi)
            continue
          }
          await waitForNextQueueTurn()
          continue
        }
        queueStuckSinceRef.current = null

        pendingScanResiRef.current.shift()
        const startScanRecording = startScanRecordingRef.current
        if (!startScanRecording) {
          return
        }

        const result = await startScanRecording(nextResi, 'camera')

        if (result === 'started') {
          return
        }
      }
    } finally {
      scanQueueBusyRef.current = false

      if (
        pendingScanResiRef.current.length > 0 &&
        activeRef.current &&
        scanQueueRetryTimerRef.current === null
      ) {
        scanQueueRetryTimerRef.current = window.setTimeout(() => {
          scanQueueRetryTimerRef.current = null
          void processCameraScanQueueRef.current?.()
        }, 0)
      }
    }
  }, [stopRecording, rejectResi])

  useEffect(() => {
    processCameraScanQueueRef.current = processCameraScanQueue
  }, [processCameraScanQueue])

  return {
    enqueueCameraScan,
    processCameraScanQueue,
    setStartScanRecording,
    isRejectedResi,
    rejectResi,
    clearRejectedResi,
  }
}

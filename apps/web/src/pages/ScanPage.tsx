import { useEffect, useRef, useState } from 'react'

import { updateOperatorSessionTask, useOperatorSession } from '../app/operatorSession'
import { BarcodeInput } from '../components/BarcodeInput'
import { CameraPreview } from '../components/CameraPreview'
import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Label } from '../components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { DEFAULT_APP_SETTINGS } from '@pakti/shared/defaults'
import {
  appendServerRecordingChunkApi,
  closePackingSessionApi,
  createPackingSessionApi,
  createServerRecordingDraftApi,
  deleteServerRecordingApi,
  finalizeServerRecordingApi,
  readActivePackingSessionApi,
  readPackingOperatorsApi,
  readPackingPreviewByResiApi,
  readServerSettingsApi,
  readShopeeOrderByResiApi,
  saveServerSettingsApi,
} from '@pakti/api-client'
import { getRecordingTaskProgress, refreshRecordingsFromServer } from '@pakti/shared/recordings'
import { logScanEvent } from '@pakti/shared'
import type { PackingWorkSession, ShopeeOrder } from '@pakti/types'
import { clearRepeatQcResi, readRepeatQcResi } from '../app/repeatQcState'
import { useBarcodeScanner } from '../hooks/useBarcodeScanner'
import { useCameraDevices } from '../hooks/useCameraDevices'
import { useCameraStream } from '../hooks/useCameraStream'
import { useRecordingSession } from '../hooks/useRecordingSession'
import { useWatermarkedStream } from '../hooks/useWatermarkedStream'
import { useVideoBarcodeScanner } from '../hooks/useVideoBarcodeScanner'
import {
  DEFAULT_SCAN_AREA_RATIO,
  DEFAULT_SCAN_INTERVAL_MS,
} from '../hooks/useVideoBarcodeScanner.logic'
import type { ScanMode } from '../hooks/useVideoBarcodeScanner.logic'

const SCAN_MODE_STORAGE_KEY = 'pakti.web.scanMode'

export function ScanPage() {
  const operatorSession = useOperatorSession()
  const activeTask = operatorSession?.taskType ?? 'qc'
  const canSwitchTask = operatorSession?.role === 'admin'
  const [settings, setSettings] = useState(() => DEFAULT_APP_SETTINGS)
  const [scanClockTick, setScanClockTick] = useState(() => Date.now())
  const [recordingCacheTick, setRecordingCacheTick] = useState(0)
  const [scanAlert, setScanAlert] = useState<
    { kind: 'info' | 'success' | 'warning' | 'error'; message: string } | null
  >(null)
  const [repeatQcResi, setRepeatQcResi] = useState(() => readRepeatQcResi())
  const [shopeeOrder, setShopeeOrder] = useState<ShopeeOrder | null>(null)
  const [shopeeOrderLoading, setShopeeOrderLoading] = useState(false)
  const [shopeeOrderMessage, setShopeeOrderMessage] = useState('Scan resi untuk cek data Shopee.')
  const [watermarkResi, setWatermarkResi] = useState<string | null>(null)
  const [clockText, setClockText] = useState(() => formatClock(new Date()))
  const [scanMode, setScanMode] = useState<ScanMode>(() => readScanMode())
  const [packingMediaType, setPackingMediaType] = useState<'video' | 'photo'>('video')
  const [packingOperators, setPackingOperators] = useState<Array<{ operatorName: string; operatorCode: string; fullName: string | null }>>([])
  const [activePackingSession, setActivePackingSession] = useState<PackingWorkSession | null>(null)
  const [packingSessionLoading, setPackingSessionLoading] = useState(false)
  const [selectedPackerKey, setSelectedPackerKey] = useState<string>('')
  const [packingPreview, setPackingPreview] = useState<{ order: ShopeeOrder; pay: { amount: number; quantity: number; breakdown: unknown } } | null>(null)
  const [packingPreviewLoading, setPackingPreviewLoading] = useState(false)
  const [packingCaptureLoading, setPackingCaptureLoading] = useState(false)
  const [lastPhotoResi, setLastPhotoResi] = useState<string | null>(null)
  const [lastPhotoId, setLastPhotoId] = useState<string | null>(null)
  const [photoStaging, setPhotoStaging] = useState<{ resi: string; blob: Blob; previewUrl: string; startedAt: Date } | null>(null)
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null)
  const currentProcessingResiRef = useRef<string | null>(null)
  const cameraDevices = useCameraDevices(true)
  const cameraState = useCameraStream(settings.cameraDeviceId, settings.videoResolution)
  const watermarkedStream = useWatermarkedStream({
    sourceStream: cameraState.stream,
    watermarkResi,
    watermarkTask: activeTask,
    watermarkOperator: operatorSession?.operatorName ?? operatorSession?.operatorCode ?? null,
    watermarkTime: clockText,
  })
  const recordingStream = watermarkedStream ?? cameraState.stream
  const recordingSession = useRecordingSession({
    stream: recordingStream,
    settings,
    operatorName: operatorSession?.operatorName ?? '',
    operatorCode: operatorSession?.operatorCode ?? '',
    taskType: activeTask,
    repeatQcResi,
    packingSessionId: activePackingSession?.id ?? null,
    mediaType: packingMediaType,
  })
  const isTaskSwitchLocked =
    recordingSession.state.mode === 'recording' ||
    recordingSession.state.mode === 'stopping' ||
    recordingSession.state.mode === 'saving' ||
    recordingSession.state.mode === 'ready_to_record_next'
  const isPackingTask = activeTask === 'packing'
  const packingSessionLabel = activePackingSession
    ? `${activePackingSession.packerNameSnapshot} (${activePackingSession.packerCodeSnapshot}) · ${activePackingSession.completedPackingCount} paket · ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(activePackingSession.totalPayAmount)}`
    : null

  useEffect(() => {
    if (!isPackingTask) return
    let active = true
    void (async () => {
      try {
        const [operators, session] = await Promise.all([
          readPackingOperatorsApi().catch(() => []),
          readActivePackingSessionApi().catch(() => null),
        ])
        if (!active) return
        setPackingOperators(operators as unknown as typeof packingOperators)
        setActivePackingSession(session as PackingWorkSession | null)
        if (!session && operators.length > 0) {
          const currentKey = `${operatorSession?.operatorName ?? ''}::${operatorSession?.operatorCode ?? ''}`
          const matched = (operators as unknown as Array<{ operatorName: string; operatorCode: string }>).find((op) => `${op.operatorName}::${op.operatorCode}` === currentKey)
          if (matched) setSelectedPackerKey(currentKey)
          else setSelectedPackerKey(`${(operators[0] as { operatorName: string; operatorCode: string }).operatorName}::${(operators[0] as { operatorName: string; operatorCode: string }).operatorCode}`)
        }
      } catch {
        // ignore
      }
    })()
    return () => {
      active = false
    }
  }, [isPackingTask, operatorSession?.operatorName, operatorSession?.operatorCode])

  useEffect(() => {
    let active = true

    void readServerSettingsApi()
      .then((nextSettings) => {
        if (!active) {
          return
        }

        setSettings(nextSettings)
      })
      .catch(() => {
        if (!active) {
          return
        }

        setScanAlert({
          kind: 'error',
          message: 'Sesi login diperlukan atau server belum aktif. Pengaturan scan belum bisa dimuat.',
        })
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      setWatermarkResi(recordingSession.state.activeResi)
    })
  }, [recordingSession.state.activeResi])

  useEffect(() => {
    function handleRecordingsUpdated() {
      void refreshRecordingsFromServer().then(() => {
        setRecordingCacheTick((current) => current + 1)
      })
    }

    window.addEventListener('pakti:recordings-updated', handleRecordingsUpdated)
    return () => {
      window.removeEventListener('pakti:recordings-updated', handleRecordingsUpdated)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.sessionStorage.setItem(SCAN_MODE_STORAGE_KEY, scanMode)
  }, [scanMode])

  useEffect(() => {
    if (!scanAlert) {
      return
    }

    const timeoutMs = scanAlert.kind === 'error' ? 3500 : 2500
    const timer = window.setTimeout(() => {
      setScanAlert(null)
    }, timeoutMs)

    return () => {
      window.clearTimeout(timer)
    }
  }, [scanAlert])

  function handleAutoSwitchToFullFrame() {
    if (scanMode === 'full-frame') {
      return
    }

    setScanMode('full-frame')
    setScanAlert({
      kind: 'warning',
      message: 'Scanner sulit membaca dari area tengah, jadi mode otomatis pindah ke full-frame.',
    })
  }

  const barcodeScanner = useBarcodeScanner({
    onValidScan: (value) => {
      const trimmed = value.trim()
      if (isPackingTask && !activePackingSession) {
        setScanAlert({ kind: 'error', message: 'Mulai sesi packing dulu sebelum scan. Pilih petugas di panel sesi packing.' })
        return
      }
      if (isPackingTask && packingMediaType === 'photo') {
        // foto: jangan mulai MediaRecorder, cukup siapkan resi untuk auto capture
        setScanAlert({ kind: 'success', message: `Resi ${trimmed} siap difoto — otomatis mengambil foto...` })
        if (repeatQcResi && trimmed === repeatQcResi) {
          clearRepeatQcResi()
          setRepeatQcResi(null)
        }
        return
      }
      void recordingSession.handleScan(value).then((outcome) => {
        const alert = mapScanOutcomeToAlert(outcome.action, outcome.message)
        setScanAlert(alert)
        if (outcome.action === 'started' && repeatQcResi && outcome.resiNumber === repeatQcResi) {
          clearRepeatQcResi()
          setRepeatQcResi(null)
        }
      })
    },
    onInvalidScan: (value, message) => {
      logScanEvent(value || 'INVALID', 'invalid', message, {
        operatorName: operatorSession?.operatorName ?? '',
        operatorCode: operatorSession?.operatorCode ?? '',
      }, operatorSession?.taskType ?? 'qc')
      setScanAlert({ kind: 'error', message })
    },
  })

  useVideoBarcodeScanner({
    videoRef: cameraVideoRef,
    enabled: Boolean(recordingStream),
    scanIntervalMs: DEFAULT_SCAN_INTERVAL_MS,
    scanAreaRatio: DEFAULT_SCAN_AREA_RATIO,
    scanMode,
    onAutoSwitchToFullFrame: handleAutoSwitchToFullFrame,
    onDetected: (value) => {
      barcodeScanner.setValue(value)
      barcodeScanner.submitBarcode(value)
    },
    onUnsupported: () => {
      setScanAlert({
        kind: 'warning',
        message: 'Browser ini belum mendukung scan barcode kamera otomatis. Gunakan input manual.',
      })
    },
  })

  const barcodeScannerRef = useRef(barcodeScanner)

  useEffect(() => {
    barcodeScannerRef.current = barcodeScanner
  }, [barcodeScanner])

  useEffect(() => {
    barcodeScannerRef.current.setValue(repeatQcResi ?? '')

    if (repeatQcResi) {
      queueMicrotask(() => {
        barcodeScannerRef.current.focusInput()
      })
    }
  }, [repeatQcResi])

  function handleCameraChange(deviceId: string) {
    const nextDeviceId = deviceId === '__default__' ? '' : deviceId

    void saveServerSettingsApi({
      ...settings,
      cameraDeviceId: nextDeviceId,
    })
      .then((nextSettings) => {
        setSettings(nextSettings)
      })
      .catch(() => {
        setScanAlert({
          kind: 'error',
          message: 'Sesi login diperlukan atau server belum aktif. Pengaturan kamera belum bisa disimpan.',
        })
      })
  }

  function handleTaskSwitch(nextTask: 'qc' | 'packing') {
    if (!canSwitchTask) {
      return
    }

    if (isTaskSwitchLocked) {
      setScanAlert({
        kind: 'warning',
        message: 'Task aktif hanya bisa diganti saat tidak ada proses recording berjalan.',
      })
      return
    }

    if (nextTask === activeTask) {
      setScanAlert({
        kind: 'info',
        message: `Task aktif sudah ${nextTask}.`,
      })
      return
    }

    void updateOperatorSessionTask(nextTask)
      .then(() => {
        setScanAlert({
          kind: 'success',
          message: `Task aktif diganti ke ${nextTask}.`,
        })
      })
      .catch((error) => {
        setScanAlert({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Gagal mengganti task aktif.',
        })
      })
  }

  async function handleCreatePackingSession() {
    if (!selectedPackerKey) {
      setScanAlert({ kind: 'error', message: 'Pilih petugas packing dulu.' })
      return
    }
    const [name, code] = selectedPackerKey.split('::')
    setPackingSessionLoading(true)
    try {
      const session = await createPackingSessionApi({ packerOperatorName: name, packerOperatorCode: code })
      setActivePackingSession(session)
      setScanAlert({ kind: 'success', message: `Sesi packing dimulai untuk ${session.packerNameSnapshot}.` })
      barcodeScanner.focusInput()
    } catch (e) {
      setScanAlert({ kind: 'error', message: e instanceof Error ? e.message : 'Gagal membuat sesi packing.' })
    } finally {
      setPackingSessionLoading(false)
    }
  }

  async function handleClosePackingSession() {
    if (!activePackingSession) return
    setPackingSessionLoading(true)
    try {
      await closePackingSessionApi(activePackingSession.id)
      setActivePackingSession(null)
      setPackingPreview(null)
      setScanAlert({ kind: 'info', message: 'Sesi packing diakhiri.' })
    } catch (e) {
      setScanAlert({ kind: 'error', message: e instanceof Error ? e.message : 'Gagal menutup sesi.' })
    } finally {
      setPackingSessionLoading(false)
    }
  }

  function clearPhotoStaging() {
    setPhotoStaging((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl)
      return null
    })
  }

  async function stagePhotoCapture(overrideResi?: string) {
    const resi = (overrideResi ?? currentProcessingResiRef.current ?? barcodeScanner.value).trim()
    if (!resi) {
      setScanAlert({ kind: 'error', message: 'Scan resi dulu sebelum capture foto.' })
      return
    }
    if (!activePackingSession) {
      setScanAlert({ kind: 'error', message: 'Mulai sesi packing dulu.' })
      return
    }
    const progress = getRecordingTaskProgress(resi)
    if (progress?.packing?.status === 'completed' && lastPhotoId && progress.packing.id !== lastPhotoId && lastPhotoResi !== resi) {
      setScanAlert({ kind: 'error', message: 'Resi ini sudah dipacking. Gunakan Foto ulang jika ingin mengganti.' })
      return
    }
    const videoEl = cameraVideoRef.current
    if (!videoEl || videoEl.videoWidth === 0) {
      setScanAlert({ kind: 'error', message: 'Kamera belum siap untuk capture foto.' })
      return
    }
    setPackingCaptureLoading(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = videoEl.videoWidth
      canvas.height = videoEl.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas tidak didukung.')
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height)
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
      if (!blob) throw new Error('Gagal membuat foto.')
      const previewUrl = URL.createObjectURL(blob)
      setPhotoStaging((prev) => {
        if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl)
        return { resi, blob, previewUrl, startedAt: new Date() }
      })
      setScanAlert({ kind: 'success', message: `Preview foto siap untuk ${resi} — cek lalu Gunakan foto.` })
    } catch (e) {
      setScanAlert({ kind: 'error', message: e instanceof Error ? e.message : 'Gagal mengambil foto.' })
    } finally {
      setPackingCaptureLoading(false)
    }
  }

  async function confirmPhotoStaging() {
    if (!photoStaging || !activePackingSession) return
    const { resi, blob, startedAt } = photoStaging
    const progress = getRecordingTaskProgress(resi)
    if (progress?.packing?.status === 'completed' && lastPhotoId && progress.packing.id === lastPhotoId) {
      try { await deleteServerRecordingApi(progress.packing.id); await refreshRecordingsFromServer(); setRecordingCacheTick((v) => v + 1) } catch { /* ignore */ }
    }
    setPackingCaptureLoading(true)
    try {
      const draft = await createServerRecordingDraftApi({
        resiNumber: resi,
        taskType: 'packing',
        operatorName: operatorSession?.operatorName ?? '',
        operatorCode: operatorSession?.operatorCode ?? '',
        startedAt: startedAt.toISOString(),
        fileName: `packing_${resi}_${startedAt.getTime()}.jpg`,
        filePath: `packing_${resi}_${startedAt.getTime()}.jpg`,
        mediaType: 'photo',
        mimeType: 'image/jpeg',
        packingSessionId: activePackingSession.id,
      })
      await appendServerRecordingChunkApi(draft.id, blob)
      const finalized = await finalizeServerRecordingApi(draft.id, { endTime: new Date().toISOString() })
      await refreshRecordingsFromServer()
      setRecordingCacheTick((v) => v + 1)
      const payInfo = (finalized as unknown as { packingPayAmount?: number }).packingPayAmount
      setScanAlert({ kind: 'success', message: `Foto packing tersimpan untuk ${resi}${payInfo ? ` · Rp${new Intl.NumberFormat('id-ID').format(payInfo)}` : ''}.` })
      setLastPhotoResi(resi)
      setLastPhotoId(finalized.id)
      barcodeScanner.setValue('')
      barcodeScanner.resetResult()
      // reload active session totals
      void readActivePackingSessionApi().then((s) => setActivePackingSession(s as PackingWorkSession | null)).catch(() => undefined)
      // refresh preview
      void readPackingPreviewByResiApi(resi).then((p) => setPackingPreview(p as unknown as typeof packingPreview)).catch(() => undefined)
    } catch (e) {
      setScanAlert({ kind: 'error', message: e instanceof Error ? e.message : 'Gagal menyimpan foto packing.' })
    } finally {
      setPackingCaptureLoading(false)
      clearPhotoStaging()
    }
  }

  async function handleCapturePhoto(overrideResi?: string) {
    return stagePhotoCapture(overrideResi)
  }

  function handleSubmitBarcode() {
    if (isPackingTask && !activePackingSession) {
      setScanAlert({ kind: 'error', message: 'Mulai sesi packing dulu sebelum scan.' })
      return
    }
    const result = barcodeScanner.submitBarcode(barcodeScanner.value)

    if (result.status === 'invalid') {
      setScanAlert({ kind: 'error', message: result.message })
    }
  }

  const currentProcessingResi =
    recordingSession.state.queuedResi ??
    recordingSession.state.activeResi ??
    (barcodeScanner.result?.status === 'valid'
      ? barcodeScanner.value.trim() || null
      : null)
  useEffect(() => {
    currentProcessingResiRef.current = currentProcessingResi
  }, [currentProcessingResi])
  const taskProgress = recordingCacheTick >= 0 && currentProcessingResi ? getRecordingTaskProgress(currentProcessingResi) : null

  useEffect(() => {
    if (!isPackingTask || !currentProcessingResi?.trim()) {
      setPackingPreview(null)
      return
    }
    const resi = currentProcessingResi.trim()
    setPackingPreviewLoading(true)
    void readPackingPreviewByResiApi(resi)
      .then((preview) => setPackingPreview(preview as unknown as typeof packingPreview))
      .catch(() => setPackingPreview(null))
      .finally(() => setPackingPreviewLoading(false))
  }, [currentProcessingResi, isPackingTask])

  useEffect(() => () => { if (photoStaging?.previewUrl) URL.revokeObjectURL(photoStaging.previewUrl) }, [photoStaging])

  // Otomatis stage foto ketika scan berhasil di mode foto, tetap sediakan opsi manual & foto ulang
  useEffect(() => {
    if (!isPackingTask || packingMediaType !== 'photo' || !currentProcessingResi?.trim() || packingCaptureLoading || !activePackingSession || !cameraVideoRef.current || photoStaging || lastPhotoResi === currentProcessingResi.trim()) return
    const resi = currentProcessingResi.trim()
    const timer = window.setTimeout(() => {
      void stagePhotoCapture(resi)
    }, 450)
    return () => window.clearTimeout(timer)
  }, [currentProcessingResi, isPackingTask, packingMediaType, packingCaptureLoading, activePackingSession, lastPhotoResi])

  useEffect(() => {
    let active = true
    const resi = currentProcessingResi?.trim()

    if (!resi) {
      queueMicrotask(() => {
        if (!active) {
          return
        }

        setShopeeOrder(null)
        setShopeeOrderLoading(false)
        setShopeeOrderMessage('Scan resi untuk cek data Shopee.')
      })
      return () => {
        active = false
      }
    }

    queueMicrotask(() => {
      if (!active) {
        return
      }

      setShopeeOrderLoading(true)
      setShopeeOrderMessage(`Mencari order Shopee untuk resi ${resi}...`)
    })

    void readShopeeOrderByResiApi(resi)
      .then((order) => {
        if (!active) {
          return
        }

        setShopeeOrder(order)
        setShopeeOrderMessage('Order Shopee ditemukan.')
      })
      .catch(() => {
        if (!active) {
          return
        }

        setShopeeOrder(null)
        setShopeeOrderMessage('Order Shopee belum ada di Pakti. Jalankan sync dari extension Shopee.')
      })
      .finally(() => {
        if (active) {
          setShopeeOrderLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [currentProcessingResi])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockText(formatClock(new Date()))
      setScanClockTick(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [])

  const recordingStartedAt = recordingSession.state.startedAt ? new Date(recordingSession.state.startedAt).getTime() : null
  const recordingElapsedSeconds =
    recordingStartedAt !== null ? Math.max(0, Math.floor((scanClockTick - recordingStartedAt) / 1000)) : null
  const recordingElapsedLabel =
    recordingElapsedSeconds !== null ? formatElapsedClock(recordingElapsedSeconds) : '00:00'
  const isRecordingActionVisible =
    recordingSession.state.mode === 'recording' || recordingSession.state.mode === 'stopping'
  const isSavingFlowVisible =
    recordingSession.state.mode === 'stopping' ||
    recordingSession.state.mode === 'saving' ||
    recordingSession.state.mode === 'ready_to_record_next'
  return (
    <div className="scan-opencode mx-auto grid w-full max-w-[1520px] gap-5 px-0 py-1">
      <section className="scan-opencode__hero flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-2">
          <div className="scan-opencode__section-label">[+] Scan</div>
          <h1 className="scan-opencode__title">Scan Resi</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="scan-opencode__badge">
            [x] {activeTask}
          </span>
          <span className="scan-opencode__badge">
            {operatorSession?.operatorName || operatorSession?.operatorCode || 'operator'}
          </span>
          <RecordModePill mode={recordingSession.state.mode} />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(300px,0.42fr)_minmax(0,1.58fr)]">
        <section className="grid gap-4 self-start">
          <Card className="scan-opencode__panel">
            <CardContent className="space-y-4 p-5">
              <BarcodeInput
                inputRef={barcodeScanner.inputRef}
                value={barcodeScanner.value}
                onValueChange={barcodeScanner.setValue}
                onKeyDown={barcodeScanner.handleKeyDown}
                onSubmit={handleSubmitBarcode}
                onClear={() => {
                  barcodeScanner.resetResult()
                  barcodeScanner.setValue('')
                  setScanAlert({ kind: 'info', message: 'Input dibersihkan.' })
                  barcodeScanner.focusInput()
                }}
              />
            </CardContent>
          </Card>

          <div className="scan-opencode__panel grid gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2>[+] Status</h2>
              <span className="scan-opencode__badge">{recordingElapsedLabel}</span>
            </div>
            <p>{recordingSession.state.message}</p>
            <p>
              {currentProcessingResi ? `Resi: ${currentProcessingResi}` : 'Belum ada resi aktif.'}
            </p>
            <p>
              Done: {taskProgress?.done.length ? taskProgress.done.join(', ') : '-'} / Next:{' '}
              {taskProgress?.pending.length ? taskProgress.pending.join(', ') : '-'}
            </p>

            {canSwitchTask ? (
              <div className="flex flex-wrap items-center gap-2 border-t border-[rgba(15,0,0,0.12)] pt-3">
                {(['qc', 'packing'] as const).map((taskType) => {
                  const isActive = activeTask === taskType
                  return (
                    <Button
                      key={taskType}
                      type="button"
                      variant={isActive ? 'default' : 'outline'}
                      className="scan-opencode__button"
                      disabled={isTaskSwitchLocked || isActive}
                      onClick={() => handleTaskSwitch(taskType)}
                    >
                      {isActive ? '[x]' : '[+]'} {taskType}
                    </Button>
                  )
                })}
              </div>
            ) : null}

            {repeatQcResi ? (
              <div className="scan-opencode__repeat-card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p>[!] Ulangi QC: {repeatQcResi}</p>
                <Button
                  type="button"
                  variant="outline"
                  className="scan-opencode__button"
                  onClick={() => {
                    clearRepeatQcResi()
                    setRepeatQcResi(null)
                    barcodeScanner.setValue('')
                    barcodeScanner.focusInput()
                  }}
                >
                  [cancel]
                </Button>
              </div>
            ) : null}
          </div>

          {scanAlert ? (
            <Alert
              variant={scanAlert.kind === 'error' ? 'destructive' : scanAlert.kind === 'success' ? 'success' : 'info'}
            >
              <p>{scanAlert.message}</p>
            </Alert>
          ) : null}

          {isPackingTask ? (
            <Card className="scan-opencode__panel">
              <CardHeader className="space-y-2">
                <CardTitle>Sesi Packing {activePackingSession ? '[aktif]' : '[perlu sesi]'}</CardTitle>
                {activePackingSession ? (
                  <p className="text-sm text-muted-foreground">{packingSessionLabel}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Scan packing diblokir sampai sesi dimulai.</p>
                )}
              </CardHeader>
              <CardContent className="grid gap-3 pt-0">
                {activePackingSession ? (
                  <div className="grid gap-2">
                    <Button type="button" variant="outline" className="scan-opencode__button" disabled={packingSessionLoading} onClick={() => void handleClosePackingSession()}>
                      {packingSessionLoading ? '[~] Proses...' : '[akhiri sesi]'}
                    </Button>
                    <div className="flex gap-2">
                      <Button type="button" variant={packingMediaType === 'video' ? 'default' : 'outline'} className="flex-1 scan-opencode__button" onClick={() => setPackingMediaType('video')}>
                        [video]
                      </Button>
                      <Button type="button" variant={packingMediaType === 'photo' ? 'default' : 'outline'} className="flex-1 scan-opencode__button" onClick={() => setPackingMediaType('photo')}>
                        [foto]
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    <Label>Petugas Packing</Label>
                    <Select value={selectedPackerKey} onValueChange={setSelectedPackerKey}>
                      <SelectTrigger className="scan-opencode__input w-full">
                        <SelectValue placeholder="Pilih petugas packing" />
                      </SelectTrigger>
                      <SelectContent>
                        {packingOperators.map((op) => {
                          const key = `${op.operatorName}::${op.operatorCode}`
                          const label = op.fullName ? `${op.fullName} (${op.operatorCode})` : `${op.operatorName} (${op.operatorCode})`
                          return (
                            <SelectItem key={key} value={key}>
                              {label}
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                    <Button type="button" className="scan-opencode__button" disabled={packingSessionLoading || !selectedPackerKey} onClick={() => void handleCreatePackingSession()}>
                      {packingSessionLoading ? '[~] Membuat...' : '[mulai sesi packing]'}
                    </Button>
                    <div className="flex gap-2">
                      <Button type="button" variant={packingMediaType === 'video' ? 'default' : 'outline'} className="flex-1 scan-opencode__button" onClick={() => setPackingMediaType('video')}>
                        [video]
                      </Button>
                      <Button type="button" variant={packingMediaType === 'photo' ? 'default' : 'outline'} className="flex-1 scan-opencode__button" onClick={() => setPackingMediaType('photo')}>
                        [foto]
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          <ShopeeOrderPanel
            order={isPackingTask && packingPreview ? packingPreview.order : shopeeOrder}
            loading={isPackingTask ? packingPreviewLoading : shopeeOrderLoading}
            message={isPackingTask && packingPreview ? `Estimasi upah: Rp${new Intl.NumberFormat('id-ID').format(packingPreview.pay.amount)} · ${packingPreview.pay.quantity} item` : shopeeOrderMessage}
            packingPreview={isPackingTask ? packingPreview : null}
          />
          {photoStaging ? (
            <Card className="scan-opencode__panel border-amber-200 bg-amber-50">
              <CardContent className="grid gap-2 p-4">
                <p className="text-sm font-bold">Preview foto — cek sebelum simpan</p>
                <div className="overflow-hidden rounded border bg-black">
                  <img src={photoStaging.previewUrl} alt={`Preview ${photoStaging.resi}`} className="block max-h-[32vh] w-full object-contain" />
                </div>
                <p className="text-xs text-muted-foreground">Resi {photoStaging.resi} · {packingPreview ? `Rp${new Intl.NumberFormat('id-ID').format(packingPreview.pay.amount)}` : ''}</p>
                <div className="flex gap-2">
                  <Button type="button" size="sm" className="flex-1 scan-opencode__button" disabled={packingCaptureLoading} onClick={() => void confirmPhotoStaging()}>
                    {packingCaptureLoading ? '[~] Menyimpan...' : '[Gunakan foto ✓]'}
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="flex-1 scan-opencode__button" disabled={packingCaptureLoading} onClick={() => clearPhotoStaging()}>
                    [Ulangi]
                  </Button>
                </div>
                <Button type="button" variant="ghost" size="sm" className="w-full text-xs" disabled={packingCaptureLoading} onClick={() => void stagePhotoCapture()}>
                  [Foto manual lagi]
                </Button>
              </CardContent>
            </Card>
          ) : isPackingTask && packingMediaType === 'photo' && lastPhotoResi ? (
            <Card className="scan-opencode__panel">
              <CardContent className="grid gap-2 p-4">
                <p className="text-sm">Foto terakhir: <strong className="font-mono">{lastPhotoResi}</strong> tersimpan</p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" className="flex-1 scan-opencode__button" disabled={packingCaptureLoading} onClick={() => { clearPhotoStaging(); barcodeScanner.setValue(lastPhotoResi ?? ''); setScanAlert({ kind: 'info', message: `Siap foto ulang ${lastPhotoResi} — posisikan paket lalu klik Foto manual.` }) }}>
                    {packingCaptureLoading ? '[~] Proses...' : '[foto ulang (manual)]'}
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="flex-1 scan-opencode__button" disabled={packingCaptureLoading || !currentProcessingResi} onClick={() => void stagePhotoCapture()}>
                    [foto manual]
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : isPackingTask && packingMediaType === 'photo' ? (
            <Card className="scan-opencode__panel">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Otomatis foto saat scan berhasil. Jika gagal, gunakan tombol di preview kamera atau [foto manual] di sini.</p>
                <Button type="button" variant="outline" size="sm" className="mt-2 w-full scan-opencode__button" disabled={packingCaptureLoading || !currentProcessingResi} onClick={() => void stagePhotoCapture()}>
                  {packingCaptureLoading ? '[~] Menyimpan...' : '[foto manual]'}
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </section>

        <Card className="scan-opencode__camera-panel overflow-hidden xl:sticky xl:top-4">
          <CardHeader className="scan-opencode__camera-header px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="grid gap-1">
                <CardTitle>Preview kamera</CardTitle>
              </div>
              <span className="scan-opencode__badge">
                {scanMode === 'full-frame' ? 'full-frame' : 'center-first'}
              </span>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 p-4 lg:p-5">
            <div className="scan-opencode__camera-controls grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="grid gap-2">
                <Label htmlFor="camera-device">
                  Kamera
                </Label>
                <Select value={settings.cameraDeviceId || '__default__'} onValueChange={handleCameraChange}>
                  <SelectTrigger id="camera-device" className="scan-opencode__input w-full">
                    <SelectValue placeholder="Default camera" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">Default camera</SelectItem>
                    {cameraDevices
                      .filter((device) => device.deviceId.trim() !== '')
                      .map((device) => (
                        <SelectItem key={device.deviceId} value={device.deviceId}>
                          {device.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Mode scan</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant={scanMode === 'center-first' ? 'default' : 'outline'}
                    className="scan-opencode__choice"
                    onClick={() => setScanMode('center-first')}
                  >
                    <span>{scanMode === 'center-first' ? '[x]' : '[+]'} cepat</span>
                  </Button>
                  <Button
                    type="button"
                    variant={scanMode === 'full-frame' ? 'default' : 'outline'}
                    className="scan-opencode__choice"
                    onClick={() => setScanMode('full-frame')}
                  >
                    <span>{scanMode === 'full-frame' ? '[x]' : '[+]'} longgar</span>
                  </Button>
                </div>
              </div>
            </div>

            <CameraPreview
              stream={recordingStream}
              isLoading={cameraState.loading}
              error={cameraState.error}
              videoRef={cameraVideoRef}
              scanGuide
              scanGuideLabel="Pusatkan resi di kotak ini"
              scanGuideDetail={
                scanMode === 'full-frame'
                  ? 'Seluruh frame dibaca.'
                  : 'Area tengah dibaca dulu.'
              }
              emptyMessage="Pilih kamera untuk memulai preview."
              topSlot={
                <div className="scan-opencode__camera-hud grid gap-2 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span>
                      [+] Countdown
                    </span>
                    <span>{recordingElapsedLabel}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>
                      Tugas: <strong>{activeTask}</strong>
                    </span>
                    <span>
                      Operator: <strong>{operatorSession?.operatorName || operatorSession?.operatorCode || '-'}</strong>
                    </span>
                  </div>
                </div>
              }
              centerSlot={
                isSavingFlowVisible ? (
                  <div className="scan-opencode__saving-card w-full max-w-md px-4 py-3">
                    {recordingSession.state.mode === 'ready_to_record_next' ? (
                      <div className="grid gap-1 text-center">
                        <p>[x] Penyimpanan selesai</p>
                        <p>Siap merekam resi berikutnya.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="min-w-0">
                            <p>
                              [~]{' '}
                              {recordingSession.state.mode === 'saving'
                                ? 'Menyimpan video lama...'
                                : 'Menghentikan rekaman...'}
                            </p>
                            <p className="truncate">
                              {recordingSession.state.mode === 'saving'
                                ? `Resi ${recordingSession.state.savingResi ?? recordingSession.state.activeResi ?? '-'} sedang diproses`
                                : 'Mohon tunggu sebentar'}
                            </p>
                          </div>
                        </div>
                        <progress className="scan-opencode__progress h-2 w-full overflow-hidden" />
                      </div>
                    )}
                  </div>
                ) : null
              }
              bottomSlot={
                isPackingTask && packingMediaType === 'photo' && activePackingSession ? (
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="lg"
                      className="scan-opencode__button px-5 py-6 text-base"
                      onClick={() => void handleCapturePhoto()}
                      disabled={packingCaptureLoading || !currentProcessingResi}
                    >
                      {packingCaptureLoading ? '[~] Menyimpan...' : '[capture foto]'}
                    </Button>
                  </div>
                ) : isRecordingActionVisible ? (
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="lg"
                      className="scan-opencode__button px-5 py-6 text-base"
                      onClick={() => {
                        void recordingSession.stopRecording().then((message) => {
                          setScanAlert({ kind: 'success', message })
                        })
                      }}
                      disabled={recordingSession.state.mode !== 'recording' && recordingSession.state.mode !== 'stopping'}
                    >
                      [stop-record]
                    </Button>
                  </div>
                ) : null
              }
            />

          </CardContent>
        </Card>
      </div>
    </div>
  )
}
function readScanMode(): ScanMode {
  if (typeof window === 'undefined') {
    return 'full-frame'
  }

  const stored = window.sessionStorage.getItem(SCAN_MODE_STORAGE_KEY)
  return stored === 'center-first' ? 'center-first' : 'full-frame'
}

function mapScanOutcomeToAlert(
  action: 'started' | 'continued' | 'queued' | 'already_processed' | 'stopped' | 'idle' | 'error',
  message: string,
) {
  if (action === 'already_processed' || action === 'error') {
    return { kind: 'error' as const, message }
  }

  if (action === 'queued') {
    return null
  }

  if (action === 'continued' || action === 'started' || action === 'stopped') {
    return { kind: 'success' as const, message }
  }

  return { kind: 'info' as const, message }
}

function formatClock(date: Date) {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date)
}

function formatElapsedClock(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function RecordModePill({ mode }: { mode: 'idle' | 'recording' | 'stopping' | 'saving' | 'ready_to_record_next' | 'error' }) {
  const label = {
    idle: 'idle',
    recording: 'recording',
    stopping: 'stopping',
    saving: 'saving',
    ready_to_record_next: 'ready',
    error: 'error',
  }[mode]

  const marker = {
    idle: '[-]',
    recording: '[x]',
    stopping: '[~]',
    saving: '[~]',
    ready_to_record_next: '[x]',
    error: '[!]',
  }[mode]

  return (
    <span className="scan-opencode__badge">
      {marker} {label}
    </span>
  )
}

function ShopeeOrderPanel({
  order,
  loading,
  message,
  packingPreview,
}: {
  order: ShopeeOrder | null
  loading: boolean
  message: string
  packingPreview?: { order: ShopeeOrder; pay: { amount: number; quantity: number; breakdown: unknown } } | null
}) {
  return (
    <Card className="scan-opencode__panel">
      <CardHeader className="space-y-2">
        <CardTitle>Order Shopee</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 pt-0">
        <div className="scan-opencode__repeat-card grid gap-2">
          <p>{loading ? '[~]' : order ? '[x]' : '[-]'} {message}</p>
        </div>

        {order ? (
          <div className="grid gap-3 text-sm">
            <div className="grid gap-2 rounded-2xl border border-[rgba(15,0,0,0.12)] bg-white/60 p-3">
              <InfoPair label="No. Pesanan" value={order.orderNumber} />
              <InfoPair label="No. Resi" value={order.trackingNumber ?? '-'} />
              <InfoPair label="Pembeli" value={order.buyerUsername ?? '-'} />
              <InfoPair label="Jasa kirim" value={order.shippingChannel ?? '-'} />
            </div>

            <div className="grid gap-2">
              <p className="font-semibold">Produk</p>
              {order.items.map((item) => (
                <div key={item.id ?? `${item.productName}-${item.variationName}-${item.sku}`} className="grid gap-1 rounded-xl border border-[rgba(15,0,0,0.1)] bg-white/50 px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 flex-1">{item.productName}</span>
                    <strong className="shrink-0">x{item.quantity}</strong>
                  </div>
                  {item.variationName ? <span className="text-xs text-muted-foreground">Variasi: {item.variationName}</span> : null}
                  {item.sku ? <span className="text-xs text-muted-foreground">SKU: {item.sku}</span> : null}
                </div>
              ))}
            </div>
            {packingPreview ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                <span className="font-semibold">Estimasi upah: </span>
                <span>Rp{new Intl.NumberFormat('id-ID').format(packingPreview.pay.amount)} · qty {packingPreview.pay.quantity} · {(packingPreview.pay.breakdown as unknown as { ruleName?: string })?.ruleName ?? '-'}</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function InfoPair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <strong className="text-right">{value}</strong>
    </div>
  )
}


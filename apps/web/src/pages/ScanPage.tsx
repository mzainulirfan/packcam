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
import { readServerSettingsApi, readShopeeOrderByResiApi, saveServerSettingsApi } from '@pakti/api-client'
import { getRecordingTaskProgress, refreshRecordingsFromServer } from '@pakti/shared/recordings'
import { logScanEvent } from '@pakti/shared'
import type { ShopeeOrder } from '@pakti/types'
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
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null)
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
  })
  const isTaskSwitchLocked =
    recordingSession.state.mode === 'recording' ||
    recordingSession.state.mode === 'stopping' ||
    recordingSession.state.mode === 'saving' ||
    recordingSession.state.mode === 'ready_to_record_next'

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

  function handleSubmitBarcode() {
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
  const taskProgress = recordingCacheTick >= 0 && currentProcessingResi ? getRecordingTaskProgress(currentProcessingResi) : null

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

          <ShopeeOrderPanel order={shopeeOrder} loading={shopeeOrderLoading} message={shopeeOrderMessage} />
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
                isRecordingActionVisible ? (
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
}: {
  order: ShopeeOrder | null
  loading: boolean
  message: string
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
                <div key={item.id ?? `${item.productName}-${item.quantity}`} className="flex items-start justify-between gap-3 rounded-xl border border-[rgba(15,0,0,0.1)] bg-white/50 px-3 py-2">
                  <span className="min-w-0 flex-1">{item.productName}</span>
                  <strong className="shrink-0">x{item.quantity}</strong>
                </div>
              ))}
            </div>
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


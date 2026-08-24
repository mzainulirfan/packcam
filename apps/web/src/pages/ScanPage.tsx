import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, ScanLine, StopCircle } from 'lucide-react'

import { updateOperatorSessionTask, useOperatorSession } from '../app/operatorSession'
import { BarcodeInput } from '../components/BarcodeInput'
import { CameraPreview } from '../components/CameraPreview'
import { StageCard } from '../components/StageCard'
import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Label } from '../components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { DEFAULT_APP_SETTINGS } from '@pakti/shared/defaults'
import { readServerSettingsApi, saveServerSettingsApi } from '@pakti/api-client'
import { getRecordingTaskProgress, refreshRecordingsFromServer } from '@pakti/shared/recordings'
import { logScanEvent } from '@pakti/shared'
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
    <StageCard title="Scan">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.62fr)_minmax(0,1.38fr)]">
        <section className="grid gap-4 self-start">
          <div className="rounded-[2rem] border border-slate-200/80 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[0.68rem] uppercase tracking-[0.24em] text-slate-500">
                <ScanLine className="size-3.5" />
                Scan
              </div>
              <RecordModePill mode={recordingSession.state.mode} />
            </div>

            <div className="mt-4 grid gap-2 text-sm text-slate-500">
              <div className="flex items-center justify-between gap-4">
                <span>Operator</span>
                <strong className="truncate text-right text-slate-950">{operatorSession?.operatorName || 'Belum login'}</strong>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span>Task aktif</span>
                <strong className="text-slate-950">{activeTask}</strong>
              </div>
            </div>

            {canSwitchTask ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[0.65rem] uppercase tracking-[0.2em] text-slate-400">Task admin</p>
                  <p className="text-xs leading-5 text-slate-500">
                    Switch sebelum scan. Terkunci saat recording aktif.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {(['qc', 'packing'] as const).map((taskType) => {
                    const isActive = activeTask === taskType
                    return (
                      <Button
                        key={taskType}
                        type="button"
                        variant={isActive ? 'default' : 'outline'}
                        className="h-8 rounded-full px-3 text-[0.65rem] uppercase tracking-[0.16em]"
                        disabled={isTaskSwitchLocked || isActive}
                        onClick={() => handleTaskSwitch(taskType)}
                      >
                        {taskType}
                      </Button>
                    )
                  })}
                </div>
              </div>
            ) : null}
          </div>

          {scanAlert ? (
            <Alert
              variant={scanAlert.kind === 'error' ? 'destructive' : scanAlert.kind === 'success' ? 'success' : 'info'}
            >
              <p className="text-sm leading-6">{scanAlert.message}</p>
            </Alert>
          ) : null}

          <Card className="border-slate-200/80 shadow-sm">
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

              <div className="grid gap-2 border-t border-slate-200 pt-4 text-sm text-slate-600">
                <p className="uppercase tracking-[0.18em] text-slate-400">Status</p>
                <p className="leading-6 text-slate-700">{recordingSession.state.message}</p>
                <p className="leading-6 text-slate-500">
                  {currentProcessingResi
                    ? `Sedang memproses resi ${currentProcessingResi}`
                    : 'Belum ada resi yang diproses.'}
                </p>
                <div className="grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-slate-700">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs uppercase tracking-[0.18em] text-slate-400">Tugas</span>
                    <strong className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-950">
                      {activeTask}
                    </strong>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <TaskProgressList
                      title="Sudah dikerjakan"
                      items={taskProgress?.done ?? []}
                      emptyLabel="Belum ada proses selesai."
                    />
                    <TaskProgressList
                      title="Akan dikerjakan"
                      items={taskProgress?.pending ?? []}
                      emptyLabel="Tidak ada task berikutnya."
                    />
                  </div>
                </div>
                {repeatQcResi ? (
                  <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-amber-800 sm:flex-row sm:items-center sm:justify-between">
                    <div className="grid gap-1">
                      <p className="text-xs uppercase tracking-[0.18em] text-amber-700">Mode ulangi QC aktif</p>
                      <p className="text-sm leading-6">
                        Resi {repeatQcResi} siap discan ulang. QC lama dan packing lama akan dibuat tidak valid.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-amber-200 bg-white text-amber-800 hover:bg-amber-50"
                      onClick={() => {
                        clearRepeatQcResi()
                        setRepeatQcResi(null)
                        barcodeScanner.setValue('')
                        barcodeScanner.focusInput()
                      }}
                    >
                      Batal
                    </Button>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </section>

        <Card className="overflow-hidden border-slate-200/80 bg-white shadow-2xl shadow-slate-900/10 xl:sticky xl:top-4">
          <CardHeader className="border-b border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="grid gap-2">
                <CardTitle className="text-lg text-slate-950">Preview kamera</CardTitle>
                <p className="text-xs leading-5 text-slate-500">
                  Mode scan aktif: <strong className="text-slate-950">{scanMode === 'full-frame' ? 'full-frame' : 'center-first'}</strong>
                </p>
              </div>
            </div>

          </CardHeader>

          <CardContent className="space-y-4 p-4 lg:p-5">
            <div className="grid gap-2">
              <Label htmlFor="camera-device" className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Device
              </Label>
              <Select value={settings.cameraDeviceId || '__default__'} onValueChange={handleCameraChange}>
                <SelectTrigger id="camera-device" className="h-12 w-full">
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
              <Label className="text-xs uppercase tracking-[0.18em] text-slate-500">Mode scan</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  variant={scanMode === 'center-first' ? 'default' : 'outline'}
                  className="h-auto justify-start rounded-2xl px-4 py-3 text-left"
                  onClick={() => setScanMode('center-first')}
                >
                  <div className="grid gap-1">
                    <span className="text-sm font-semibold">Mode cepat</span>
                    <span className="text-xs leading-5 opacity-80">
                      Prioritas area tengah, dengan fallback full-frame berkala.
                    </span>
                  </div>
                </Button>
                <Button
                  type="button"
                  variant={scanMode === 'full-frame' ? 'default' : 'outline'}
                  className="h-auto justify-start rounded-2xl px-4 py-3 text-left"
                  onClick={() => setScanMode('full-frame')}
                >
                  <div className="grid gap-1">
                    <span className="text-sm font-semibold">Mode longgar</span>
                    <span className="text-xs leading-5 opacity-80">
                      Scan seluruh frame terus-menerus untuk barcode yang sulit terbaca.
                    </span>
                  </div>
                </Button>
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
                  ? 'Mode longgar aktif. Pastikan barcode tetap terlihat jelas di seluruh layar.'
                  : 'Jika belum terbaca, geser perlahan sampai barcode masuk kotak penuh.'
              }
              emptyMessage="Pilih kamera untuk memulai preview."
              topSlot={
                <div className="grid gap-2 rounded-2xl border border-black/10 bg-white/90 px-4 py-3 text-slate-950 shadow-2xl backdrop-blur">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-slate-600">
                      Countdown
                    </span>
                    <span className="text-sm font-semibold tracking-tight text-slate-950">{recordingElapsedLabel}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                    <span>
                      Tugas: <strong className="text-slate-950">{activeTask}</strong>
                    </span>
                    <span>
                      Operator: <strong className="text-slate-950">{operatorSession?.operatorName || operatorSession?.operatorCode || '-'}</strong>
                    </span>
                  </div>
                </div>
              }
              centerSlot={
                isSavingFlowVisible ? (
                  <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white/95 px-5 py-4 shadow-2xl backdrop-blur">
                    {recordingSession.state.mode === 'ready_to_record_next' ? (
                      <div className="grid gap-1 text-center">
                        <p className="text-sm font-semibold text-emerald-700">Penyimpanan selesai</p>
                        <p className="text-xs text-emerald-600">Siap merekam resi berikutnya.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-center gap-3">
                          <LoaderCircle className="size-5 animate-spin text-slate-950" />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-950">
                              {recordingSession.state.mode === 'saving'
                                ? 'Menyimpan video lama...'
                                : 'Menghentikan rekaman...'}
                            </p>
                            <p className="truncate text-xs text-slate-500">
                              {recordingSession.state.mode === 'saving'
                                ? `Resi ${recordingSession.state.savingResi ?? recordingSession.state.activeResi ?? '-'} sedang diproses`
                                : 'Mohon tunggu sebentar'}
                            </p>
                          </div>
                        </div>
                        <progress className="h-2 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-slate-200 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-slate-950 [&::-moz-progress-bar]:bg-slate-950" />
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
                      className="rounded-full bg-rose-600 px-5 py-6 text-base shadow-2xl shadow-rose-950/25 hover:bg-rose-700"
                      onClick={() => {
                        void recordingSession.stopRecording().then((message) => {
                          setScanAlert({ kind: 'success', message })
                        })
                      }}
                      disabled={recordingSession.state.mode !== 'recording' && recordingSession.state.mode !== 'stopping'}
                    >
                      <StopCircle className="size-4" />
                      Stop rekam
                    </Button>
                  </div>
                ) : null
              }
            />

          </CardContent>
        </Card>
      </div>
    </StageCard>
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
  const className = {
    idle: 'border-slate-200 bg-slate-50 text-slate-600',
    recording: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    stopping: 'border-amber-200 bg-amber-50 text-amber-700',
    saving: 'border-blue-200 bg-blue-50 text-blue-700',
    ready_to_record_next: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    error: 'border-rose-200 bg-rose-50 text-rose-700',
  }[mode]

  const label = {
    idle: 'idle',
    recording: 'recording',
    stopping: 'stopping',
    saving: 'saving',
    ready_to_record_next: 'ready',
    error: 'error',
  }[mode]

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] ${className}`}>
      {label}
    </span>
  )
}

function TaskProgressList({
  title,
  items,
  emptyLabel,
}: {
  title: string
  items: Array<'qc' | 'packing'>
  emptyLabel: string
}) {
  return (
    <div className="grid gap-2 rounded-2xl border border-white/80 bg-white p-3">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{title}</p>
      {items.length ? (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <span
              key={item}
              className="inline-flex rounded-full border border-slate-200 bg-slate-950 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-white"
            >
              {item}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm leading-6 text-slate-500">{emptyLabel}</p>
      )}
    </div>
  )
}

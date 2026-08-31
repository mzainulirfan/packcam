import { useCallback, useEffect, useRef, useState } from 'react'

import { updateOperatorSessionTask, useOperatorSession } from '../app/operatorSession'
import { BarcodeInput } from '../components/BarcodeInput'
import { CameraPreview } from '../components/CameraPreview'
import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Label } from '../components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { HugeiconsIcon } from '@hugeicons/react'
import { Clock01Icon, QrCodeIcon, Search01Icon, UserGroupIcon } from '@hugeicons/core-free-icons'
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
  const [skipAutoPhoto, setSkipAutoPhoto] = useState(false)
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
  const isPhotoPackingMode = isPackingTask && packingMediaType === 'photo'
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
        if (!active) return
        setSettings(nextSettings)
      })
      .catch(() => {
        if (!active) return
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
    if (typeof window === 'undefined') return
    window.sessionStorage.setItem(SCAN_MODE_STORAGE_KEY, scanMode)
  }, [scanMode])

  useEffect(() => {
    if (!scanAlert) return
    const timeoutMs = scanAlert.kind === 'error' ? 3500 : 2500
    const timer = window.setTimeout(() => {
      setScanAlert(null)
    }, timeoutMs)
    return () => {
      window.clearTimeout(timer)
    }
  }, [scanAlert])

  function handleAutoSwitchToFullFrame() {
    if (scanMode === 'full-frame') return
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
    if (!canSwitchTask) return
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
      const session = await createPackingSessionApi({ packerOperatorName: name, packerOperatorCode: code, releaseActive: true })
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

  async function handleSwitchPackingSession() {
    if (!activePackingSession || !selectedPackerKey) {
      setScanAlert({ kind: 'error', message: 'Pilih petugas baru dulu.' })
      return
    }
    const [name, code] = selectedPackerKey.split('::')
    if (!name || !code) {
      setScanAlert({ kind: 'error', message: 'Pilih petugas valid.' })
      return
    }
    if (name === activePackingSession.packerOperatorName && code === activePackingSession.packerOperatorCode) {
      setScanAlert({ kind: 'warning', message: 'Pilih petugas lain untuk ganti sesi.' })
      return
    }
    setPackingSessionLoading(true)
    try {
      const next = await createPackingSessionApi({ packerOperatorName: name, packerOperatorCode: code, releaseActive: true })
      setActivePackingSession(next)
      setScanAlert({ kind: 'success', message: `Sesi diganti ke ${next.packerNameSnapshot} (${next.packerCodeSnapshot}); sesi lama belum diakhiri.` })
    } catch (e) {
      setScanAlert({ kind: 'error', message: e instanceof Error ? e.message : 'Gagal ganti sesi.' })
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

  const stagePhotoCapture = useCallback(async (overrideResi?: string) => {
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
  }, [activePackingSession, barcodeScanner.value, lastPhotoId, lastPhotoResi])

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
      void readActivePackingSessionApi().then((s) => setActivePackingSession(s as PackingWorkSession | null)).catch(() => undefined)
      void readPackingPreviewByResiApi(resi).then((p) => setPackingPreview(p as unknown as typeof packingPreview)).catch(() => undefined)
    } catch (e) {
      setScanAlert({ kind: 'error', message: e instanceof Error ? e.message : 'Gagal menyimpan foto packing.' })
    } finally {
      setPackingCaptureLoading(false)
      clearPhotoStaging()
    }
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
      queueMicrotask(() => setPackingPreview(null))
      return
    }
    const resi = currentProcessingResi.trim()
    queueMicrotask(() => {
      setPackingPreviewLoading(true)
      void readPackingPreviewByResiApi(resi)
        .then((preview) => setPackingPreview(preview as unknown as typeof packingPreview))
        .catch(() => setPackingPreview(null))
        .finally(() => setPackingPreviewLoading(false))
    })
  }, [currentProcessingResi, isPackingTask])

  useEffect(() => () => { if (photoStaging?.previewUrl) URL.revokeObjectURL(photoStaging.previewUrl) }, [photoStaging])

  useEffect(() => {
    if (skipAutoPhoto) { queueMicrotask(() => setSkipAutoPhoto(false)); return }
    if (!isPackingTask || packingMediaType !== 'photo' || !currentProcessingResi?.trim() || packingCaptureLoading || !activePackingSession || !cameraVideoRef.current || photoStaging || lastPhotoResi === currentProcessingResi.trim()) return
    const resi = currentProcessingResi.trim()
    const timer = window.setTimeout(() => {
      void stagePhotoCapture(resi)
    }, 450)
    return () => window.clearTimeout(timer)
  }, [currentProcessingResi, isPackingTask, packingMediaType, packingCaptureLoading, activePackingSession, lastPhotoResi, photoStaging, skipAutoPhoto, stagePhotoCapture])

  useEffect(() => {
    let active = true
    const resi = currentProcessingResi?.trim()
    if (!resi) {
      queueMicrotask(() => {
        if (!active) return
        setShopeeOrder(null)
        setShopeeOrderLoading(false)
        setShopeeOrderMessage('Scan resi untuk cek data Shopee.')
      })
      return () => {
        active = false
      }
    }
    queueMicrotask(() => {
      if (!active) return
      setShopeeOrderLoading(true)
      setShopeeOrderMessage(`Mencari order Shopee untuk resi ${resi}...`)
    })
    void readShopeeOrderByResiApi(resi)
      .then((order) => {
        if (!active) return
        setShopeeOrder(order)
        setShopeeOrderMessage('Order Shopee ditemukan.')
      })
      .catch(() => {
        if (!active) return
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
    <div className="scan-page mx-auto max-w-[1240px] bg-[#f6f5f4] px-4 py-8 font-['Inter'] sm:px-6 lg:py-8 xl:px-8">
      <section className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Operasional / Scan</div>
          <h1 className="mt-2 font-['Inter'] text-[32px] font-bold leading-[1.1] tracking-[-0.7px] text-[#000000] sm:text-[34px]">{isPackingTask && packingMediaType === 'photo' ? 'Scan Foto Packing' : 'Scan Resi'}</h1>
          <p className="mt-2 max-w-2xl font-['Inter'] text-[14px] leading-6 text-[#615d59]">{isPackingTask && packingMediaType === 'photo' ? 'Scan resi → auto foto 0.45s → cek preview → Gunakan / Ulangi. Posisikan paket & resi jelas di kamera.' : 'Pindai resi untuk merekam dokumentasi QC / Packing. Video tersimpan otomatis dengan watermark.'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-['Inter'] text-[12px] font-semibold ${isPackingTask ? 'border-[#e6e6e6] bg-white text-[#000000]' : 'border-[#0075de]/20 bg-[#0075de]/10 text-[#0075de]'}`}>{activeTask.toUpperCase()} {isPackingTask && packingMediaType === 'photo' ? '· Foto' : ''}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e6e6e6] bg-white px-3 py-1.5 font-['Inter'] text-[12px] font-medium text-[#31302e]"><HugeiconsIcon icon={UserGroupIcon} size={14} strokeWidth={1.9} />{operatorSession?.operatorName || operatorSession?.operatorCode || 'operator'}</span>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-['Inter'] text-[12px] font-semibold ${recordingSession.state.mode === 'recording' ? 'border-[#fecaca] bg-[#fee2e2] text-[#991b1b]' : recordingSession.state.mode === 'saving' ? 'border-[#fde68a] bg-[#fef3c7] text-[#92400e]' : 'border-[#e6e6e6] bg-white text-[#615d59]'}`}>{recordingSession.state.mode}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e6e6e6] bg-[#f6f5f4] px-3 py-1.5 font-['Inter'] text-[12px] font-medium tabular-nums text-[#000000]"><HugeiconsIcon icon={Clock01Icon} size={14} strokeWidth={1.9} />{recordingElapsedLabel}</span>
        </div>
      </section>

      {scanAlert ? <Alert variant={scanAlert.kind === 'error' ? 'destructive' : scanAlert.kind === 'success' ? 'success' : 'info'} className="mb-4 rounded-[8px] border-[#e6e6e6] bg-white font-['Inter'] text-[13px]"><p className={scanAlert.kind === 'error' ? 'text-[#991b1b]' : scanAlert.kind === 'success' ? 'text-[#065f46]' : 'text-[#31302e]'}>{scanAlert.message}</p></Alert> : null}
      {isPackingTask && packingMediaType === 'photo' && !activePackingSession ? <Alert variant="info" className="mb-4 rounded-[8px] border-[#e6e6e6] bg-[#fff7ed] font-['Inter'] text-[13px]"><p className="text-[#92400e]">Foto packing butuh sesi aktif. Pilih petugas di panel sesi packing.</p></Alert> : null}

      <div className={isPhotoPackingMode ? 'flex flex-col gap-4' : 'grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]'}>
        {!isPhotoPackingMode ? (
          <section className="grid gap-4 self-start">
            <div className="overflow-hidden rounded-xl border border-[#e6e6e6] bg-white">
              <div className="border-b border-[#e6e6e6] bg-[#fbfaf9] px-4 py-3">
                <h2 className="font-['Inter'] text-[13px] font-semibold text-[#000000]">Input resi</h2>
                <p className="mt-0.5 font-['Inter'] text-[12px] text-[#a39e98]">Scan barcode atau ketik manual lalu Enter</p>
              </div>
              <div className="p-4">
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
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-[#e6e6e6] bg-white">
              <div className="flex items-center justify-between gap-3 border-b border-[#e6e6e6] bg-[#fbfaf9] px-4 py-3">
                <h2 className="font-['Inter'] text-[13px] font-semibold text-[#000000]">Status</h2>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-black px-2.5 py-1 font-['Inter'] text-[11px] font-semibold tabular-nums text-white"><HugeiconsIcon icon={Clock01Icon} size={12} strokeWidth={1.9} />{recordingElapsedLabel}</span>
              </div>
              <div className="grid gap-3 p-4">
                <p className="rounded-[8px] border border-[#e6e6e6] bg-[#f6f5f4] px-3 py-2 font-['Inter'] text-[13px] leading-5 text-[#31302e]">{recordingSession.state.message}</p>
                <div className="grid gap-1 rounded-[8px] border border-[#e6e6e6] bg-white px-3 py-2.5">
                  <span className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.06em] text-[#a39e98]">Resi aktif</span>
                  <span className="truncate font-['Inter'] text-[13px] font-medium text-[#000000]">{currentProcessingResi ?? 'Belum ada resi aktif.'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-[8px] border border-[#e6e6e6] bg-[#f6f5f4] px-3 py-2">
                    <span className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.06em] text-[#a39e98]">Selesai</span>
                    <p className="mt-1 truncate font-['Inter'] text-[12px] font-medium text-[#000000]">{taskProgress?.done.length ? taskProgress.done.join(', ') : '-'}</p>
                  </div>
                  <div className="rounded-[8px] border border-[#e6e6e6] bg-[#f6f5f4] px-3 py-2">
                    <span className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.06em] text-[#a39e98]">Berikutnya</span>
                    <p className="mt-1 truncate font-['Inter'] text-[12px] font-medium text-[#000000]">{taskProgress?.pending.length ? taskProgress.pending.join(', ') : '-'}</p>
                  </div>
                </div>
                {canSwitchTask ? (
                  <div className="flex flex-wrap gap-1.5 border-t border-[#e6e6e6] pt-3">
                    {(['qc', 'packing'] as const).map((taskType) => {
                      const isActive = activeTask === taskType
                      return (
                        <Button key={taskType} type="button" variant={isActive ? 'default' : 'outline'} size="sm" className={`h-8 rounded-full px-4 font-['Inter'] text-[12px] font-medium ${isActive ? 'bg-black text-white hover:bg-black' : 'border-[#e6e6e6] bg-white text-[#615d59] hover:bg-[#f6f5f4]'}`} disabled={isTaskSwitchLocked || isActive} onClick={() => handleTaskSwitch(taskType)}>
                          {isActive ? '●' : '○'} {taskType.toUpperCase()}
                        </Button>
                      )
                    })}
                  </div>
                ) : null}
                {repeatQcResi ? (
                  <div className="flex items-center justify-between gap-3 rounded-[8px] border border-[#fde68a] bg-[#fef3c7] px-3 py-2">
                    <p className="font-['Inter'] text-[12px] font-semibold text-[#92400e]">Ulangi QC: {repeatQcResi}</p>
                    <Button type="button" variant="ghost" size="sm" className="h-7 rounded-full bg-white px-3 text-[12px] font-medium text-[#92400e] hover:bg-white" onClick={() => { clearRepeatQcResi(); setRepeatQcResi(null); barcodeScanner.setValue(''); barcodeScanner.focusInput() }}>Batal</Button>
                  </div>
                ) : null}
              </div>
            </div>

            {isPackingTask ? (
              <div className="overflow-hidden rounded-xl border border-[#e6e6e6] bg-white">
                <div className="border-b border-[#e6e6e6] bg-[#fbfaf9] px-4 py-3">
                  <h2 className="font-['Inter'] text-[13px] font-semibold text-[#000000]">Sesi Packing {activePackingSession ? '· Aktif' : '· Perlu sesi'}</h2>
                  <p className="mt-0.5 font-['Inter'] text-[12px] text-[#a39e98]">{activePackingSession ? packingSessionLabel : 'Scan packing diblokir sampai sesi dimulai.'}</p>
                </div>
                <div className="grid gap-3 p-4">
                  {activePackingSession ? (
                    <div className="grid gap-3">
                      <div className="grid gap-2">
                        <Button type="button" variant="outline" size="sm" className="h-8 rounded-full border-[#e6e6e6] bg-white font-['Inter'] text-[12px] font-medium text-[#615d59] hover:bg-[#f6f5f4]" disabled={packingSessionLoading} onClick={() => void handleClosePackingSession()}>
                          {packingSessionLoading ? 'Proses...' : 'Akhiri sesi'}
                        </Button>
                        <div className="flex gap-1 rounded-lg border border-[#e6e6e6] bg-[#f6f5f4] p-1">
                          <Button type="button" variant={packingMediaType === 'video' ? 'default' : 'ghost'} size="sm" className={`flex-1 h-7 rounded-md font-['Inter'] text-[12px] font-medium ${packingMediaType === 'video' ? 'bg-black text-white' : 'text-[#615d59]'}`} onClick={() => setPackingMediaType('video')}>Video</Button>
                          <Button type="button" variant={packingMediaType === 'photo' ? 'default' : 'ghost'} size="sm" className={`flex-1 h-7 rounded-md font-['Inter'] text-[12px] font-medium ${packingMediaType === 'photo' ? 'bg-black text-white' : 'text-[#615d59]'}`} onClick={() => setPackingMediaType('photo')}>Foto</Button>
                        </div>
                      </div>
                      <div className="grid gap-2 border-t border-dashed border-[#e6e6e6] pt-3">
                        <Label className="font-['Inter'] text-[12px] font-medium text-[#000000]">Ganti sesi</Label>
                        <div className="flex gap-2">
                          <Select value={selectedPackerKey} onValueChange={setSelectedPackerKey}>
                            <SelectTrigger className="h-8 flex-1 rounded-[8px] border-[#e6e6e6] bg-white font-['Inter'] text-[12px]">
                              <SelectValue placeholder="Pilih petugas baru" />
                            </SelectTrigger>
                            <SelectContent>
                              {packingOperators.filter((op) => !(activePackingSession && op.operatorName === activePackingSession.packerOperatorName && op.operatorCode === activePackingSession.packerOperatorCode)).map((op) => {
                                const key = `${op.operatorName}::${op.operatorCode}`
                                const label = op.fullName ? `${op.fullName} (${op.operatorCode})` : `${op.operatorName} (${op.operatorCode})`
                                return <SelectItem key={key} value={key}>{label}</SelectItem>
                              })}
                            </SelectContent>
                          </Select>
                          <Button type="button" size="sm" className="h-8 rounded-full bg-black px-4 font-['Inter'] text-[12px] font-medium text-white hover:bg-black" disabled={packingSessionLoading || !selectedPackerKey} onClick={() => void handleSwitchPackingSession()}>Ganti</Button>
                        </div>
                        <p className="font-['Inter'] text-[11px] text-[#a39e98]">Sesi lama otomatis ditutup.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      <Label className="font-['Inter'] text-[12px] font-medium text-[#000000]">Petugas Packing</Label>
                      <Select value={selectedPackerKey} onValueChange={setSelectedPackerKey}>
                        <SelectTrigger className="h-8 w-full rounded-[8px] border-[#e6e6e6] bg-white font-['Inter'] text-[12px]">
                          <SelectValue placeholder="Pilih petugas packing" />
                        </SelectTrigger>
                        <SelectContent>
                          {packingOperators.map((op) => {
                            const key = `${op.operatorName}::${op.operatorCode}`
                            const label = op.fullName ? `${op.fullName} (${op.operatorCode})` : `${op.operatorName} (${op.operatorCode})`
                            return <SelectItem key={key} value={key}>{label}</SelectItem>
                          })}
                        </SelectContent>
                      </Select>
                      <Button type="button" size="sm" className="h-9 rounded-full bg-[#0075de] font-['Inter'] text-[13px] font-medium text-white hover:bg-[#005bab]" disabled={packingSessionLoading || !selectedPackerKey} onClick={() => void handleCreatePackingSession()}>
                        {packingSessionLoading ? 'Membuat...' : 'Mulai sesi packing'}
                      </Button>
                      {!isPhotoPackingMode ? (
                        <div className="flex gap-1 rounded-lg border border-[#e6e6e6] bg-[#f6f5f4] p-1">
                          <Button type="button" size="sm" className={`flex-1 h-7 rounded-md font-['Inter'] text-[12px] font-medium ${packingMediaType === 'video' ? 'bg-black text-white' : 'bg-transparent text-[#615d59]'}`} onClick={() => setPackingMediaType('video')}>Video</Button>
                          <Button type="button" size="sm" className={`flex-1 h-7 rounded-md font-['Inter'] text-[12px] font-medium ${packingMediaType === 'photo' ? 'bg-black text-white' : 'bg-transparent text-[#615d59]'}`} onClick={() => setPackingMediaType('photo')}>Foto</Button>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            <ShopeeOrderPanel order={isPackingTask && packingPreview ? packingPreview.order : shopeeOrder} loading={isPackingTask ? packingPreviewLoading : shopeeOrderLoading} message={isPackingTask && packingPreview ? `Estimasi upah: Rp${new Intl.NumberFormat('id-ID').format(packingPreview.pay.amount)} · ${packingPreview.pay.quantity} item` : shopeeOrderMessage} packingPreview={isPackingTask ? packingPreview : null} />
            {photoStaging && !isPhotoPackingMode ? (
              <div className="overflow-hidden rounded-xl border border-[#fde68a] bg-[#fffbeb] p-3">
                <p className="font-['Inter'] text-[13px] font-semibold text-[#92400e]">Preview foto — cek sebelum simpan</p>
                <div className="mt-2 overflow-hidden rounded-lg border border-[#e6e6e6] bg-black">
                  <img src={photoStaging.previewUrl} alt={`Preview ${photoStaging.resi}`} className="block max-h-[28vh] w-full object-contain" />
                </div>
                <p className="mt-2 font-['Inter'] text-[12px] text-[#615d59]">Resi {photoStaging.resi} · {packingPreview ? `Rp${new Intl.NumberFormat('id-ID').format(packingPreview.pay.amount)}` : ''}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button type="button" size="sm" className="h-8 rounded-full bg-black font-['Inter'] text-[12px] font-medium text-white hover:bg-black" disabled={packingCaptureLoading} onClick={() => void confirmPhotoStaging()}>
                    {packingCaptureLoading ? 'Menyimpan...' : 'Gunakan foto ✓'}
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-8 rounded-full border-[#e6e6e6] bg-white font-['Inter'] text-[12px] font-medium text-[#615d59] hover:bg-[#f6f5f4]" disabled={packingCaptureLoading} onClick={() => { setSkipAutoPhoto(true); clearPhotoStaging(); setScanAlert({ kind: 'info', message: 'Ulangi foto — posisikan paket lalu klik Foto manual, tidak otomatis.' }) }}>
                    Ulangi
                  </Button>
                </div>
                <Button type="button" variant="ghost" size="sm" className="mt-1 h-7 w-full rounded-full font-['Inter'] text-[11px] text-[#615d59] hover:bg-[#f6f5f4]" disabled={packingCaptureLoading} onClick={() => void stagePhotoCapture()}>Foto manual lagi</Button>
              </div>
            ) : isPackingTask && packingMediaType === 'photo' && lastPhotoResi ? (
              <div className="overflow-hidden rounded-xl border border-[#e6e6e6] bg-white p-4">
                <p className="font-['Inter'] text-[13px] text-[#31302e]">Foto terakhir: <strong className="font-semibold text-[#000000]">{lastPhotoResi}</strong> tersimpan</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" size="sm" className="h-8 rounded-full border-[#e6e6e6] bg-white font-['Inter'] text-[12px] font-medium text-[#615d59] hover:bg-[#f6f5f4]" disabled={packingCaptureLoading} onClick={() => { setSkipAutoPhoto(true); clearPhotoStaging(); barcodeScanner.setValue(lastPhotoResi ?? ''); setScanAlert({ kind: 'info', message: `Siap foto ulang ${lastPhotoResi} — posisikan paket lalu klik Foto manual.` }) }}>
                    Foto ulang
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-8 rounded-full border-[#e6e6e6] bg-white font-['Inter'] text-[12px] font-medium text-[#615d59] hover:bg-[#f6f5f4]" disabled={packingCaptureLoading || !currentProcessingResi} onClick={() => void stagePhotoCapture()}>Foto manual</Button>
                </div>
              </div>
            ) : isPackingTask && packingMediaType === 'photo' ? (
              <div className="overflow-hidden rounded-xl border border-dashed border-[#e6e6e6] bg-white p-4">
                <p className="font-['Inter'] text-[12px] leading-5 text-[#615d59]">Otomatis foto saat scan berhasil. Jika gagal, gunakan tombol Foto manual di preview kamera atau di sini.</p>
                <Button type="button" variant="outline" size="sm" className="mt-3 h-8 w-full rounded-full border-[#e6e6e6] bg-white font-['Inter'] text-[12px] font-medium text-[#615d59] hover:bg-[#f6f5f4]" disabled={packingCaptureLoading || !currentProcessingResi} onClick={() => void stagePhotoCapture()}>Foto manual</Button>
              </div>
            ) : null}
          </section>
        ) : null}

        <div className={`overflow-hidden rounded-xl border border-[#e6e6e6] bg-black ${isPhotoPackingMode ? 'flex h-[calc(100vh-160px)] min-h-[480px] flex-col lg:h-[calc(100vh-180px)]' : 'lg:sticky lg:top-4'}`}>
          <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-black px-4 py-3">
            <h2 className="font-['Inter'] text-[13px] font-semibold text-white">Preview kamera</h2>
            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 font-['Inter'] text-[11px] font-semibold ${scanMode === 'full-frame' ? 'border-white/20 bg-white/10 text-white' : 'border-white/20 bg-white text-black'}`}>{scanMode === 'full-frame' ? 'Full-frame' : 'Center-first'}</span>
          </div>

          <div className="grid gap-3 bg-[#f6f5f4] p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label className="font-['Inter'] text-[11px] font-medium text-[#000000]">Kamera</Label>
                <Select value={settings.cameraDeviceId || '__default__'} onValueChange={handleCameraChange}>
                  <SelectTrigger className="h-8 rounded-[8px] border-[#e6e6e6] bg-white font-['Inter'] text-[12px]">
                    <SelectValue placeholder="Default camera" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">Default camera</SelectItem>
                    {cameraDevices.filter((d) => d.deviceId.trim() !== '').map((d) => <SelectItem key={d.deviceId} value={d.deviceId}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="font-['Inter'] text-[11px] font-medium text-[#000000]">Mode scan</Label>
                <div className="flex gap-1 rounded-lg border border-[#e6e6e6] bg-[#f6f5f4] p-1">
                  <Button type="button" variant={scanMode === 'center-first' ? 'default' : 'ghost'} size="sm" className={`flex-1 h-7 rounded-md font-['Inter'] text-[12px] font-medium ${scanMode === 'center-first' ? 'bg-black text-white' : 'text-[#615d59]'}`} onClick={() => setScanMode('center-first')}>Cepat</Button>
                  <Button type="button" variant={scanMode === 'full-frame' ? 'default' : 'ghost'} size="sm" className={`flex-1 h-7 rounded-md font-['Inter'] text-[12px] font-medium ${scanMode === 'full-frame' ? 'bg-black text-white' : 'text-[#615d59]'}`} onClick={() => setScanMode('full-frame')}>Longgar</Button>
                </div>
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
            scanGuideDetail={scanMode === 'full-frame' ? 'Seluruh frame dibaca.' : 'Area tengah dibaca dulu.'}
            emptyMessage="Pilih kamera untuk memulai preview."
            topSlot={
              <div className="grid gap-2 px-3 py-2">
                {isPhotoPackingMode ? (
                  <div className="flex items-center justify-between gap-2 rounded-xl bg-black/60 px-3 py-2 backdrop-blur">
                    <button type="button" onClick={() => { if (activePackingSession) { const el=document.getElementById('web-packing-switch'); el?.focus(); (el as unknown as {showPicker?:()=>void})?.showPicker?.() } }} disabled={!activePackingSession} className="grid flex-1 gap-0.5 text-left">
                      <span className="font-['Inter'] text-[11px] font-semibold tracking-wide text-white">Sesi Packing — tap untuk ganti</span>
                      <span className="font-['Inter'] text-[13px] font-bold text-white">{activePackingSession ? activePackingSession.packerNameSnapshot : 'Mulai sesi'}</span>
                      <span className="font-['Inter'] text-[11px] text-white/80">{activePackingSession ? `${activePackingSession.completedPackingCount} paket · ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(activePackingSession.totalPayAmount)}` : 'Tap untuk mulai sesi'}</span>
                    </button>
                    {activePackingSession ? <Button type="button" variant="outline" size="sm" className="h-7 shrink-0 rounded-full border-white/30 bg-black/40 px-3 font-['Inter'] text-[12px] font-medium text-white backdrop-blur hover:bg-black/60" disabled={packingSessionLoading} onClick={() => void handleClosePackingSession()}>Akhiri</Button> : null}
                  </div>
                ) : null}
                <div className="flex items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 backdrop-blur">
                  <span className="flex items-center gap-1.5 font-['Inter'] text-[11px] font-semibold text-white"><HugeiconsIcon icon={Clock01Icon} size={12} strokeWidth={1.9} />{recordingElapsedLabel}</span>
                  <span className="h-3 w-px bg-white/20" />
                  <span className="font-['Inter'] text-[11px] text-white/80">Tugas: <strong className="font-semibold text-white">{activeTask}</strong></span>
                  <span className="font-['Inter'] text-[11px] text-white/80">Operator: <strong className="font-semibold text-white">{operatorSession?.operatorName || operatorSession?.operatorCode || '-'}</strong></span>
                  {isPhotoPackingMode && activePackingSession ? (
                    <div className="ml-auto flex gap-1 rounded-full bg-black/40 p-1 backdrop-blur">
                      <button type="button" onClick={() => setPackingMediaType('video')} className="rounded-full px-2.5 py-1 font-['Inter'] text-[11px] text-white/70">Video</button>
                      <button type="button" onClick={() => setPackingMediaType('photo')} className="rounded-full bg-white px-2.5 py-1 font-['Inter'] text-[11px] font-bold text-black">Foto</button>
                    </div>
                  ) : null}
                </div>
              </div>
            }
            centerSlot={
              photoStaging ? (
                <div className="w-full max-w-md overflow-hidden rounded-xl border border-white/20 bg-black/80 p-2 backdrop-blur">
                  <img src={photoStaging.previewUrl} alt={`Preview ${photoStaging.resi}`} className="block max-h-[32vh] w-full rounded-lg object-contain" />
                  <p className="mt-2 truncate text-center font-['Inter'] text-[12px] font-medium text-white">{photoStaging.resi} · cek lalu Gunakan</p>
                </div>
              ) : isSavingFlowVisible ? (
                <div className="w-full max-w-md rounded-xl border border-white/20 bg-black/70 px-4 py-3 backdrop-blur">
                  {recordingSession.state.mode === 'ready_to_record_next' ? (
                    <div className="grid gap-1 text-center">
                      <p className="font-['Inter'] text-[13px] font-semibold text-white">Penyimpanan selesai</p>
                      <p className="font-['Inter'] text-[12px] text-white/70">Siap merekam resi berikutnya.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="min-w-0">
                          <p className="font-['Inter'] text-[13px] font-semibold text-white">{recordingSession.state.mode === 'saving' ? 'Menyimpan video...' : 'Menghentikan rekaman...'}</p>
                          <p className="truncate font-['Inter'] text-[12px] text-white/70">{recordingSession.state.mode === 'saving' ? `Resi ${recordingSession.state.savingResi ?? recordingSession.state.activeResi ?? '-'} diproses` : 'Mohon tunggu'}</p>
                        </div>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/20"><div className="h-full w-2/3 animate-pulse rounded-full bg-white" /></div>
                    </div>
                  )}
                </div>
              ) : null
            }
            bottomSlot={
              photoStaging ? (
                <div className="flex justify-center gap-2 p-3">
                  <Button type="button" size="sm" className="h-9 rounded-full bg-white px-6 font-['Inter'] text-[13px] font-semibold text-black hover:bg-white/90" onClick={() => void confirmPhotoStaging()} disabled={packingCaptureLoading}>
                    {packingCaptureLoading ? 'Menyimpan...' : 'Gunakan foto ✓'}
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-9 rounded-full border-white/30 bg-black/40 px-6 font-['Inter'] text-[13px] font-medium text-white backdrop-blur hover:bg-black/60" onClick={() => { setSkipAutoPhoto(true); clearPhotoStaging() }} disabled={packingCaptureLoading}>Ulangi</Button>
                </div>
              ) : isPackingTask && packingMediaType === 'photo' && activePackingSession ? (
                <div className="grid gap-2 bg-black/60 p-3 backdrop-blur">
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
                  {packingPreview ? (
                    <div className="grid gap-1 rounded-lg bg-white/10 p-2 font-['Inter'] text-[12px] text-white">
                      <div className="flex justify-between gap-2"><span className="text-white/60">Jasa kirim</span><strong className="text-white">{packingPreview.order.shippingChannel ?? '-'}</strong></div>
                      <div className="truncate text-white/80">{packingPreview.order.items.slice(0,2).map((it) => `${it.productName}${it.variationName ? ` · ${it.variationName}` : ''} x${it.quantity}`).join(', ')}{packingPreview.order.items.length>2 ? ` +${packingPreview.order.items.length-2} lain` : ''}</div>
                      <div className="flex justify-between"><span className="text-white/60">Upah</span><strong className="text-white">Rp{new Intl.NumberFormat('id-ID').format(packingPreview.pay.amount)}</strong></div>
                    </div>
                  ) : null}
                  <div className="flex flex-col items-center gap-1 pt-1">
                    <button type="button" onClick={() => void stagePhotoCapture()} disabled={packingCaptureLoading || !currentProcessingResi || !recordingStream} className="group grid h-[68px] w-[68px] place-items-center rounded-full border-4 border-white bg-white/10 shadow-[0_0_0_4px_rgba(0,0,0,0.2)] backdrop-blur transition hover:bg-white/20 disabled:opacity-40" aria-label="Ambil foto manual">
                      <span className="h-12 w-12 rounded-full bg-white shadow-inner transition group-active:scale-95" />
                    </button>
                    <span className="font-['Inter'] text-[11px] tracking-wide text-white/80">tap shutter — auto 0.45s</span>
                  </div>
                </div>
              ) : isRecordingActionVisible ? (
                <div className="flex justify-center p-3">
                  <Button type="button" size="lg" className="h-11 rounded-full bg-white px-6 font-['Inter'] text-[14px] font-semibold text-black hover:bg-white/90" onClick={() => { void recordingSession.stopRecording().then((message) => { setScanAlert({ kind: 'success', message }) }) }} disabled={recordingSession.state.mode !== 'recording' && recordingSession.state.mode !== 'stopping'}>
                    Stop rekam
                  </Button>
                </div>
              ) : null
            }
          />
        </div>
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
    <div className="overflow-hidden rounded-xl border border-[#e6e6e6] bg-white">
      <div className="border-b border-[#e6e6e6] bg-[#fbfaf9] px-4 py-3">
        <h2 className="font-['Inter'] text-[13px] font-semibold text-[#000000]">Order Shopee</h2>
        <p className="mt-0.5 font-['Inter'] text-[12px] text-[#a39e98]">{loading ? 'Memuat...' : message}</p>
      </div>
      <div className="grid gap-3 p-4">
        <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 font-['Inter'] text-[12px] font-medium ${order ? 'border-[#dcfce7] bg-[#f0fdf4] text-[#166534]' : 'border-[#e6e6e6] bg-[#f6f5f4] text-[#615d59]'}`}>
          <HugeiconsIcon icon={order ? QrCodeIcon : Search01Icon} size={14} strokeWidth={1.9} />{loading ? 'Mencari...' : order ? 'Ditemukan' : 'Belum ada'}
        </div>
        {order ? (
          <div className="grid gap-3">
            <div className="grid gap-2 rounded-xl border border-[#e6e6e6] bg-[#f6f5f4] p-3">
              <InfoPair label="No. Pesanan" value={order.orderNumber} />
              <InfoPair label="No. Resi" value={order.trackingNumber ?? '-'} />
              <InfoPair label="Pembeli" value={order.buyerUsername ?? '-'} />
              <InfoPair label="Jasa kirim" value={order.shippingChannel ?? '-'} />
            </div>
            <div className="grid gap-2">
              <p className="font-['Inter'] text-[12px] font-semibold text-[#000000]">Produk</p>
              {order.items.map((item) => (
                <div key={item.id ?? `${item.productName}-${item.variationName}-${item.sku}`} className="grid gap-1 rounded-xl border border-[#e6e6e6] bg-white px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 flex-1 font-['Inter'] text-[13px] font-medium leading-snug text-[#000000] line-clamp-2">{item.productName}</span>
                    <strong className="shrink-0 rounded-full bg-[#f6f5f4] px-2 py-0.5 font-['Inter'] text-[11px] font-semibold text-[#000000] ring-1 ring-[#e6e6e6]">×{item.quantity}</strong>
                  </div>
                  {item.variationName ? <span className="truncate font-['Inter'] text-[11px] text-[#615d59]">{item.variationName}</span> : null}
                  {item.sku ? <span className="truncate font-['Inter'] text-[11px] text-[#a39e98]">SKU: {item.sku}</span> : null}
                </div>
              ))}
            </div>
            {packingPreview ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-[#fde68a] bg-[#fef3c7] px-3 py-2.5">
                <span className="font-['Inter'] text-[12px] font-medium text-[#92400e]">Estimasi upah</span>
                <span className="font-['Inter'] text-[13px] font-bold text-[#92400e]">Rp{new Intl.NumberFormat('id-ID').format(packingPreview.pay.amount)} · {packingPreview.pay.quantity} item</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function InfoPair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="font-['Inter'] text-[12px] text-[#a39e98]">{label}</span>
      <strong className="max-w-[60%] truncate text-right font-['Inter'] text-[13px] font-medium text-[#000000]">{value}</strong>
    </div>
  )
}

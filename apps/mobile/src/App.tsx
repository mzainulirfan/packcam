import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Camera01Icon,
  CheckmarkCircle01Icon,
  Copy01Icon,
  EyeIcon,
  EyeOffIcon,
  HistoryIcon,
  Logout02Icon,
  Moon02Icon,
  ScanIcon,
  SearchAreaIcon,
  ShieldAlertIcon,
  Sun03Icon,
} from '@hugeicons/core-free-icons'
import {
  closePackingSessionApi,
  createPackingSessionApi,
  readPackingPreviewByResiApi,
  createServerRecordingDraftApi,
  appendServerRecordingChunkApi,
  finalizeServerRecordingApi,
  deleteServerRecordingApi,
  readRecentShopeeOrdersApi,
  readServerSettingsApi,
  loginServerOperatorApi,
  logoutServerOperatorApi,
  readServerRecordingsByResiApi,
  readServerRecordingsApi,
  readServerSessionApi,
  readServerSystemConfigApi,
  updateServerSessionTaskApi,
  buildApiUrl,
  prepareShopeeChatSendApi,
  readActivePackingSessionApi,
  readPackingOperatorsApi,
  readPackingSessionApi,
  readShopeeChatSendsByRecordingIdsApi,
} from '@pakti/api-client'
import { DEFAULT_APP_SETTINGS } from '@pakti/shared/defaults'
import type { AppSettings, OperatorProfile, OperatorSession, PackingWorkSession, RecordingRow, ShopeeOrder, SystemConfig, WorkTask } from '@pakti/types'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { CameraPreview } from './components/CameraPreview'
import { BottomNav } from './components/BottomNav'
import { useBarcodeScanner } from './hooks/useBarcodeScanner'
import { useCameraStream } from './hooks/useCameraStream'
import { useMobileRecordingSession } from './hooks/useRecordingSession'
import {
  formatDateTime,
  formatSectionDate,
  formatStatus,
  formatTask,
  getDocStatus,
  getGroupShareStatus,
  getGroupShareStatusClassName,
  getShareStatusClassName,
  getShareStatusDescription,
  getShareStatusLabel,
  type HistoryDateFilter,
  type HistorySortOrder,
  type HistoryTaskFilter,
} from './history/historyUtils'
import { useMobileHistoryFilters } from './history/useMobileHistoryFilters'
import { useSharePreparation } from './history/useSharePreparation'
import { getDuplicateScanNotice, getPackingQcMessage } from './scan/scanCopy'
import { useScanQueue } from './scan/useScanQueue'
import { HistoryDeleteDialog } from './tabs/HistoryDeleteDialog'
import { HistoryDetailSheet } from './tabs/HistoryDetailSheet'
import { SessionTab } from './tabs/SessionTab'
import './App.css'

type TabKey = 'scan' | 'history' | 'session'

type LoginFormState = {
  operatorName: string
  password: string
}

const initialLoginForm: LoginFormState = {
  operatorName: '',
  password: '',
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return 'Terjadi kesalahan.'
}

type ScanNotice = {
  kind: 'success' | 'warning'
  title: string
  message: string
}

type ScanProgressTone = 'success' | 'warning' | 'neutral'

type ScanProgressState = {
  tone: ScanProgressTone
  title: string
  message: string
}

function makePackerKey(operatorName: string, operatorCode: string) {
  return `${operatorName}|||${operatorCode}`
}

function parsePackerKey(value: string) {
  const [operatorName = '', operatorCode = ''] = value.split('|||')
  return { operatorName, operatorCode }
}

function formatRupiah(value: number | null | undefined) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value ?? 0)
}

const ACTIVE_TAB_STORAGE_KEY = 'pakti_mobile_active_tab'
const THEME_STORAGE_KEY = 'pakti_mobile_theme'

type ThemeMode = 'light' | 'dark'

function isTabKey(value: string | null): value is TabKey {
  return value === 'scan' || value === 'history' || value === 'session'
}

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark'
}

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'dark'
  }

  try {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (isThemeMode(savedTheme)) {
      return savedTheme
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'dark'
  }
}

function App() {
  const [booting, setBooting] = useState(true)
  const [bootError, setBootError] = useState<string | null>(null)
  const [systemConfig, setSystemConfig] = useState<SystemConfig | null>(null)
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS)
  const [session, setSession] = useState<OperatorSession | null>(null)
  const [packingOperators, setPackingOperators] = useState<OperatorProfile[]>([])
  const [activePackingSession, setActivePackingSession] = useState<PackingWorkSession | null>(null)
  const [selectedPackerKey, setSelectedPackerKey] = useState('')
  const [packingSessionBusy, setPackingSessionBusy] = useState(false)
  const [packingMediaType, setPackingMediaType] = useState<'video' | 'photo'>('video')
  const [packingPreview, setPackingPreview] = useState<{ order: ShopeeOrder; pay: { amount: number; quantity: number; breakdown: unknown; rule: import('@pakti/types').PackingPayRule } } | null>(null)
  const [packingPreviewBusy, setPackingPreviewBusy] = useState(false)
  const [photoCaptureBusy, setPhotoCaptureBusy] = useState(false)
  const [lastPhotoResi, setLastPhotoResi] = useState<string | null>(null)
  const [lastPhotoId, setLastPhotoId] = useState<string | null>(null)
  const [photoStaging, setPhotoStaging] = useState<{ resi: string; blob: Blob; previewUrl: string; startedAt: Date } | null>(null)
  const [skipAutoPhoto, setSkipAutoPhoto] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    if (typeof window === 'undefined') {
      return 'scan'
    }

    try {
      const savedTab = window.sessionStorage.getItem(ACTIVE_TAB_STORAGE_KEY)
      return isTabKey(savedTab) ? savedTab : 'scan'
    } catch {
      return 'scan'
    }
  })
  const [loginForm, setLoginForm] = useState<LoginFormState>(initialLoginForm)
  const [loginBusy, setLoginBusy] = useState(false)
  const [showLoginPassword, setShowLoginPassword] = useState(false)
  const [taskBusy, setTaskBusy] = useState(false)
  const [scanResi, setScanResi] = useState('')
  const [scanBusy, setScanBusy] = useState(false)
  const [scanNotice, setScanNotice] = useState<ScanNotice | null>(null)
  const [historyBusy, setHistoryBusy] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [recordings, setRecordings] = useState<RecordingRow[]>([])
  const [shopeeOrders, setShopeeOrders] = useState<ShopeeOrder[]>([])
  const [historyTaskFilter, setHistoryTaskFilter] = useState<HistoryTaskFilter>('all')
  const [historyResiQuery, setHistoryResiQuery] = useState('')
  const [historyAllAccounts, setHistoryAllAccounts] = useState(false)
  const [historyScanOpen, setHistoryScanOpen] = useState(false)
  const [historyScanError, setHistoryScanError] = useState<string | null>(null)
  const [historyScanVideoElement, setHistoryScanVideoElement] = useState<HTMLVideoElement | null>(null)
  const [historyScanResetToken, setHistoryScanResetToken] = useState(0)
  const [historyHighlightedResi, setHistoryHighlightedResi] = useState<string | null>(null)
  const [historyDetailTarget, setHistoryDetailTarget] = useState<null | { resiNumber: string; rows: RecordingRow[] }>(null)
  const [historyDeleteConfirm, setHistoryDeleteConfirm] = useState<RecordingRow | null>(null)
  const [historyFilterOpen, setHistoryFilterOpen] = useState(false)
  const [historyDocStatusFilter, setHistoryDocStatusFilter] = useState<'all' | 'lengkap' | 'belum-lengkap'>('all')
  const [historyDateFilter, setHistoryDateFilter] = useState<HistoryDateFilter>('all')
  const [historySortOrder, setHistorySortOrder] = useState<HistorySortOrder>('newest')
  const historyPullStartYRef = useRef<number | null>(null)
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null)
  const [preparingChatSendId, setPreparingChatSendId] = useState<string | null>(null)
  const [chatSendByRecordingId, setChatSendByRecordingId] = useState<Map<string, import('@pakti/types').RecordingChatSend>>(new Map())
  const [watermarkResi, setWatermarkResi] = useState<string | null>(null)
  const [scanClockTick, setScanClockTick] = useState(() => Date.now())
  const [, setMenuOpen] = useState(false)
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme)
  const [scanVideoElement, setScanVideoElement] = useState<HTMLVideoElement | null>(null)
  const [scannerResetToken, setScannerResetToken] = useState(0)
  const scanNoticeTimerRef = useRef<number | null>(null)
  const previousRecordingModeRef = useRef<string>('idle')
  const scanFeedbackContextRef = useRef<AudioContext | null>(null)

  const appName = systemConfig?.appName ?? 'Pakti'
  const tagline = systemConfig?.tagline ?? 'Paket Tercatat, Bukti Terjaga'
  const brandMark = systemConfig?.brandMark ?? 'PK'
  const isDarkTheme = theme === 'dark'
  const currentTaskType: WorkTask = session?.taskType ?? 'qc'
  const isPackingMode = String(currentTaskType) === 'packing'
  const canUsePackingFlow = !isPackingMode || Boolean(activePackingSession)
  const cameraState = useCameraStream(settings.cameraDeviceId, Boolean(session) && activeTab === 'scan', 'environment', true)
  const historyCameraState = useCameraStream(settings.cameraDeviceId, historyScanOpen, 'environment')
  const watermarkOverlayTime = new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(scanClockTick))
  const recordingSession = useMobileRecordingSession({
    stream: cameraState.stream,
    settings: {
      videoRootPath: settings.videoRootPath,
      videoFormat: settings.videoFormat,
    },
    operatorName: session?.operatorName ?? '',
    operatorCode: session?.operatorCode ?? '',
    taskType: session?.taskType ?? 'qc',
    packingSessionId: activePackingSession?.id ?? null,
  })
  const activeRecordingResi =
    recordingSession.state.mode === 'recording'
      ? recordingSession.state.activeResi ?? watermarkResi ?? (scanResi.trim() || null)
      : null
  const currentRecordingResi = activeRecordingResi ?? recordingSession.state.savingResi
  const scannerIntervalMs = recordingSession.state.mode === 'recording' ? 700 : 360
  const scanModeLabel = isPackingMode ? 'Packing' : 'QC'
  const scanStatusLabel = cameraState.error
    ? 'Kamera error'
    : recordingSession.state.mode === 'recording'
      ? 'Merekam'
      : recordingSession.state.mode === 'stopping' || recordingSession.state.mode === 'saving'
        ? 'Menyimpan'
        : scanBusy
          ? 'Memproses'
          : recordingSession.state.lastSavedResi
            ? 'Video tersimpan'
            : `Siap scan ${scanModeLabel}`
  const scanStatusDescription = recordingSession.state.mode === 'recording'
    ? 'Tekan stop setelah paket selesai direkam.'
    : recordingSession.state.mode === 'stopping' || recordingSession.state.mode === 'saving'
      ? 'Jangan tutup halaman sampai video tersimpan.'
      : recordingSession.state.lastSavedResi
        ? 'File share akan disiapkan otomatis.'
        : isPackingMode
          ? activePackingSession
            ? 'Packing hanya bisa dimulai setelah QC selesai.'
            : 'Mulai sesi packing terlebih dahulu.'
          : 'Scan barcode atau ketik resi untuk mulai rekaman QC.'
  const scanPrimaryActionLabel = scanBusy || recordingSession.state.mode === 'stopping' || recordingSession.state.mode === 'saving'
    ? 'Menyimpan video...'
    : recordingSession.state.mode === 'recording'
      ? 'Stop & simpan'
      : 'Mulai rekam'

  const {
    enqueueCameraScan,
    processCameraScanQueue,
    setStartScanRecording,
    isRejectedResi,
    rejectResi,
    clearRejectedResi,
  } = useScanQueue({
    active: Boolean(session) && activeTab === 'scan' && canUsePackingFlow,
    recordingState: recordingSession.state,
    stopRecording: recordingSession.stopRecording,
  })

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    try {
      window.sessionStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab)
    } catch {
      // Ignore storage failures. The tab state will still work during this session.
    }
  }, [activeTab])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setScanClockTick(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [])

  const primeScanFeedbackAudio = useCallback(async () => {
    if (typeof window === 'undefined') {
      return
    }

    const AudioContextCtor =
      window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextCtor) {
      return
    }

    const existingContext = scanFeedbackContextRef.current
    const context =
      existingContext && existingContext.state !== 'closed' ? existingContext : new AudioContextCtor()

    scanFeedbackContextRef.current = context

    if (context.state === 'suspended') {
      try {
        await context.resume()
      } catch {
        // Ignore resume failures. Vibration can still provide feedback on supported devices.
      }
    }
  }, [])

  const playScanFeedback = useCallback(async (kind: 'success' | 'warning', mode: 'default' | 'history' = 'default') => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(kind === 'success' ? 55 : [70, 40, 90])
    }

    if (typeof window === 'undefined') {
      return
    }

    const context = scanFeedbackContextRef.current
    if (!context) {
      return
    }

    if (context.state === 'suspended') {
      try {
        await context.resume()
      } catch {
        return
      }
    }

    if (context.state !== 'running') {
      return
    }

    try {
      const compressor = context.createDynamicsCompressor()
      compressor.threshold.value = -24
      compressor.knee.value = 18
      compressor.ratio.value = 16
      compressor.attack.value = 0.003
      compressor.release.value = 0.12

      compressor.connect(context.destination)

      const playTone = (
        frequency: number,
        duration: number,
        startTime: number,
        gainValue: number,
        type: OscillatorType,
      ) => {
        const oscillator = context.createOscillator()
        const gainNode = context.createGain()

        oscillator.type = type
        oscillator.frequency.value = frequency
        gainNode.gain.value = gainValue

        oscillator.connect(gainNode)
        gainNode.connect(compressor)
        oscillator.start(startTime)
        oscillator.stop(startTime + duration)
      }

      if (kind === 'success') {
        if (mode === 'history') {
          playTone(1080, 0.08, context.currentTime, 0.3, 'square')
          playTone(1380, 0.08, context.currentTime + 0.09, 0.26, 'square')
        } else {
          playTone(1560, 0.11, context.currentTime, 0.42, 'square')
          playTone(1980, 0.09, context.currentTime + 0.12, 0.38, 'square')
        }
      } else {
        playTone(680, 0.13, context.currentTime, 0.24, 'triangle')
        playTone(520, 0.16, context.currentTime + 0.12, 0.22, 'triangle')
      }
    } catch {
      // Ignore audio failures. Vibration still provides feedback when supported.
    }
  }, [])

  useBarcodeScanner({
    videoElement: scanVideoElement,
    enabled: Boolean(session) && activeTab === 'scan',
    resetToken: scannerResetToken,
    intervalMs: scannerIntervalMs,
    cooldownMs: 1100,
    maxScanWidth: 640,
    onDetected: (value) => {
      if (!session || activeTab !== 'scan') {
        return
      }

      const normalizedValue = value.trim()
      if (!normalizedValue || isRejectedResi(normalizedValue)) {
        return
      }

      setScanResi(normalizedValue)
      enqueueCameraScan(normalizedValue)
      void processCameraScanQueue()
    },
    onUnsupported: () => {
      setBootError('Browser ini belum mendukung scan barcode otomatis.')
    },
  })

  useBarcodeScanner({
    videoElement: historyScanVideoElement,
    enabled: historyScanOpen,
    resetToken: historyScanResetToken,
    intervalMs: 420,
    cooldownMs: 1400,
    onDetected: (value) => {
      const normalizedValue = value.trim()
      if (!normalizedValue) {
        return
      }

      void primeScanFeedbackAudio()
      void playScanFeedback('success', 'history')
      setHistoryResiQuery(normalizedValue)
      setHistoryHighlightedResi(normalizedValue)
      setHistoryScanOpen(false)
      setHistoryScanError(null)
      setHistoryScanResetToken((current) => current + 1)
    },
    onUnsupported: () => {
      setHistoryScanError('Browser ini belum mendukung scan barcode otomatis.')
    },
  })

  useEffect(
    () => () => {
      if (scanNoticeTimerRef.current !== null) {
        window.clearTimeout(scanNoticeTimerRef.current)
      }

      if (scanFeedbackContextRef.current) {
        scanFeedbackContextRef.current.close().catch(() => undefined)
        scanFeedbackContextRef.current = null
      }
    },
    [],
  )

  useEffect(() => {
    const previousMode = previousRecordingModeRef.current
    previousRecordingModeRef.current = recordingSession.state.mode

    if (previousMode !== 'idle' && recordingSession.state.mode === 'idle') {
      setScannerResetToken((current) => current + 1)
      clearRejectedResi()
      setWatermarkResi(null)
      void processCameraScanQueue()
    }
  }, [clearRejectedResi, processCameraScanQueue, recordingSession.state.mode])

  const {
    groupedRecordings,
    groupedByDate,
    hasHistoryFilters,
    historyFilterSheetActive,
    historyEmptyState,
  } = useMobileHistoryFilters({
    recordings,
    shopeeOrders,
    operatorName: session?.operatorName,
    operatorCode: session?.operatorCode,
    historyTaskFilter,
    historyResiQuery,
    historyAllAccounts,
    historyDateFilter,
    historySortOrder,
    historyDocStatusFilter,
  })

  useEffect(() => {
    if (!historyHighlightedResi) {
      return
    }

    const timer = window.setTimeout(() => {
      setHistoryHighlightedResi(null)
    }, 4000)

    return () => {
      window.clearTimeout(timer)
    }
  }, [historyHighlightedResi])

  const resolvedHistoryDetailTarget = useMemo(() => {
    if (!historyDetailTarget) {
      return null
    }

    const rows = recordings.filter((record) => record.resiNumber.trim() === historyDetailTarget.resiNumber)
    if (rows.length === 0) {
      return historyDetailTarget
    }

    return {
      ...historyDetailTarget,
      rows,
    }
  }, [historyDetailTarget, recordings])

  const scanProgressState = useMemo<ScanProgressState | null>(() => {
    const resiNumber = scanResi.trim()

    if (!resiNumber) {
      return null
    }

    const normalizedResi = resiNumber.toLowerCase()
    const qc = recordings.find(
      (record) => record.resiNumber.trim().toLowerCase() === normalizedResi && record.taskType === 'qc',
    )
    const packing = recordings.find(
      (record) => record.resiNumber.trim().toLowerCase() === normalizedResi && record.taskType === 'packing',
    )

    if (isPackingMode) {
      if (qc?.status === 'completed') {
        if (packing?.status === 'completed') {
          return {
            tone: 'success',
            title: 'QC selesai',
            message: 'Packing juga sudah selesai.',
          }
        }

        if (packing?.status === 'recording') {
          return {
            tone: 'success',
            title: 'QC selesai',
            message: 'Resi siap untuk packing.',
          }
        }

        return {
          tone: 'success',
          title: 'QC selesai',
          message: 'Resi siap untuk packing.',
        }
      }

      if (qc?.status === 'recording') {
        return {
          tone: 'warning',
          title: 'QC masih berjalan',
          message: 'Coba lagi setelah QC selesai.',
        }
      }

      return {
        tone: 'warning',
        title: 'QC belum selesai',
        message: 'Resi ini belum punya QC selesai.',
      }
    }

    if (qc?.status === 'completed') {
      if (packing?.status === 'completed') {
        return {
          tone: 'success',
          title: 'Sudah lengkap',
          message: 'QC dan Packing sudah selesai.',
        }
      }

      return {
        tone: 'success',
        title: 'QC selesai',
        message: 'Resi siap untuk packing.',
      }
    }

    if (qc?.status === 'recording') {
      return {
        tone: 'warning',
        title: 'QC masih berjalan',
        message: 'Coba lagi setelah QC selesai.',
      }
    }

    if (packing?.status === 'completed') {
      return {
        tone: 'warning',
        title: 'Packing sudah ada',
        message: 'QC untuk resi ini belum tercatat.',
      }
    }

    return {
      tone: 'neutral',
      title: isPackingMode ? 'Packing aktif' : 'Siap scan QC',
      message: isPackingMode ? 'Packing menunggu QC selesai.' : 'Scan resi untuk mulai rekaman QC.',
    }
  }, [isPackingMode, recordings, scanResi])
  const visibleChatSendByRecordingId = recordings.length === 0
    ? new Map<string, import('@pakti/types').RecordingChatSend>()
    : chatSendByRecordingId

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      setBooting(true)
      setBootError(null)

      try {
        const [sessionPayload, config, appSettings] = await Promise.all([
          readServerSessionApi(),
          readServerSystemConfigApi(),
          readServerSettingsApi().catch(() => DEFAULT_APP_SETTINGS),
        ])

        if (cancelled) {
          return
        }

        setSession(sessionPayload.session)
        setSystemConfig(config)
        setSettings(appSettings)
      } catch (error) {
        if (cancelled) {
          return
        }

        setBootError(normalizeError(error))
      } finally {
        if (!cancelled) {
          setBooting(false)
        }
      }
    }

    void bootstrap()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!session) {
      setPackingOperators([])
      setActivePackingSession(null)
      setSelectedPackerKey('')
      return
    }

    let cancelled = false
    void Promise.all([
      readPackingOperatorsApi().catch(() => []),
      readActivePackingSessionApi().catch(() => null),
    ]).then(([operators, packingSession]) => {
      if (cancelled) return
      setPackingOperators(operators)
      setActivePackingSession(packingSession)
      const ownProfile = operators.find((operator) =>
        operator.operatorName === session.operatorName && operator.operatorCode === session.operatorCode,
      )
      const selected = packingSession
        ? makePackerKey(packingSession.packerOperatorName, packingSession.packerOperatorCode)
        : ownProfile
          ? makePackerKey(ownProfile.operatorName, ownProfile.operatorCode)
          : operators[0]
            ? makePackerKey(operators[0].operatorName, operators[0].operatorCode)
            : ''
      setSelectedPackerKey(selected)
    })

    return () => {
      cancelled = true
    }
  }, [session])

  useEffect(() => {
    if (!session) {
      return
    }

    let cancelled = false

    async function loadHistory() {
      setHistoryBusy(true)
      setHistoryError(null)

      try {
        const rows = await readServerRecordingsApi()
        if (cancelled) {
          return
        }

        setRecordings(rows)

        try {
          const orders = await readRecentShopeeOrdersApi(500)
          if (!cancelled) {
            setShopeeOrders(orders)
          }
        } catch {
          if (!cancelled) {
            setShopeeOrders([])
          }
        }
      } catch (error) {
        if (!cancelled) {
          setHistoryError(normalizeError(error))
        }
      } finally {
        if (!cancelled) {
          setHistoryBusy(false)
        }
      }
    }

    void loadHistory()

    return () => {
      cancelled = true
    }
  }, [session])

  useEffect(() => {
    if (recordings.length === 0) {
      return
    }

    let cancelled = false
    void readShopeeChatSendsByRecordingIdsApi(recordings.map((r) => r.id))
      .then((sends) => {
        if (cancelled) return
        const map = new Map<string, import('@pakti/types').RecordingChatSend>()
        for (const s of sends) map.set(s.recordingId, s)
        setChatSendByRecordingId(map)
      })
      .catch(() => {
        if (!cancelled) setChatSendByRecordingId(new Map())
      })
    return () => {
      cancelled = true
    }
  }, [recordings])

  const isAdmin = session?.role === 'admin'

  useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }

    const root = document.documentElement
    root.classList.toggle('dark', isDarkTheme)
    root.style.colorScheme = isDarkTheme ? 'dark' : 'light'

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // Ignore storage failures.
    }
  }, [isDarkTheme, theme])

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }, [])

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoginBusy(true)
    setBootError(null)

    try {
      const result = await loginServerOperatorApi({
        operatorName: loginForm.operatorName.trim(),
        password: loginForm.password,
      })

      setSession(result.session)
      void primeScanFeedbackAudio()
      setLoginForm((current) => ({ ...current, password: '' }))
      setActiveTab('scan')
      setMenuOpen(false)
    } catch (error) {
      setBootError(normalizeError(error))
    } finally {
      setLoginBusy(false)
    }
  }

  async function handleLogout() {
    try {
      await logoutServerOperatorApi()
    } catch {
      // Logout should still clear the local session.
    } finally {
      setSession(null)
      setActivePackingSession(null)
      setPackingOperators([])
      setSelectedPackerKey('')
      setRecordings([])
      setShopeeOrders([])
      setHistoryAllAccounts(false)
      setHistoryTaskFilter('all')
      setHistoryResiQuery('')
      setHistoryHighlightedResi(null)
      setActiveTab('scan')
      setMenuOpen(false)
      try {
        window.sessionStorage.clear()
        window.localStorage.removeItem('pakti.operatorStore')
        window.localStorage.removeItem('pakti-mobile-session')
      } catch {
        // Ignore storage failures on logout.
      }
      try {
        window.sessionStorage.removeItem(ACTIVE_TAB_STORAGE_KEY)
      } catch {
        // Ignore storage failures on logout.
      }
    }
  }

  async function handleTaskChange(nextTask: WorkTask) {
    if (!session || !isAdmin || taskBusy || session.taskType === nextTask) {
      return
    }

    setTaskBusy(true)
    void primeScanFeedbackAudio()

    try {
      const payload = await updateServerSessionTaskApi(nextTask)
      setSession(payload.session)
    } catch (error) {
      setBootError(normalizeError(error))
    } finally {
      setTaskBusy(false)
    }
  }

  const showScanNotice = useCallback((nextNotice: ScanNotice) => {
    setScanNotice(nextNotice)

    if (scanNoticeTimerRef.current !== null) {
      window.clearTimeout(scanNoticeTimerRef.current)
    }

    scanNoticeTimerRef.current = window.setTimeout(() => {
      setScanNotice(null)
      scanNoticeTimerRef.current = null
    }, 2800)
  }, [])

  const mergeRecordingsForResi = useCallback((resiNumber: string, rows: RecordingRow[]) => {
    const normalizedResi = resiNumber.trim()
    setRecordings((current) => [
      ...rows,
      ...current.filter((record) => record.resiNumber.trim() !== normalizedResi),
    ])
  }, [])

  const findRecordingByResi = useCallback(async (resiNumber: string, taskType?: WorkTask) => {
    const normalizedResi = resiNumber.trim()
    const localMatch =
      recordings.find(
        (record) =>
          record.resiNumber.trim() === normalizedResi && (taskType ? record.taskType === taskType : true),
      ) ?? null

    if (localMatch) {
      return localMatch
    }

    try {
      const rows = await readServerRecordingsByResiApi(normalizedResi)
      mergeRecordingsForResi(normalizedResi, rows)
      return (
        rows.find(
          (record) => record.resiNumber.trim() === normalizedResi && (taskType ? record.taskType === taskType : true),
        ) ?? null
      )
    } catch {
      return null
    }
  }, [mergeRecordingsForResi, recordings])

  const handlePrepareShopeeChat = useCallback(async (record: RecordingRow) => {
    if (preparingChatSendId) {
      return
    }

    setPreparingChatSendId(record.id)
    try {
      const job = await prepareShopeeChatSendApi(record.id)
      setChatSendByRecordingId((prev) => {
        const next = new Map(prev)
        next.set(record.id, job)
        return next
      })
      showScanNotice({
        kind: 'success',
        title: 'Job Shopee Chat siap',
        message: `Lanjutkan di desktop Chrome Extension untuk ${job.buyerUsername}.`,
      })
    } catch (error) {
      showScanNotice({
        kind: 'warning',
        title: 'Gagal siapkan Shopee Chat',
        message: normalizeError(error),
      })
    } finally {
      setPreparingChatSendId(null)
    }
  }, [preparingChatSendId, showScanNotice])

  const resolveLatestTaskProgress = useCallback(
    async (resiNumber: string) => {
      try {
        const rows = await readServerRecordingsByResiApi(resiNumber)
        mergeRecordingsForResi(resiNumber, rows)

        const qc = rows.find((record) => record.resiNumber.trim() === resiNumber.trim() && record.taskType === 'qc')
        const packing = rows.find(
          (record) => record.resiNumber.trim() === resiNumber.trim() && record.taskType === 'packing',
        )

        return { qc, packing }
      } catch {
        const qc = recordings.find((record) => record.resiNumber.trim() === resiNumber.trim() && record.taskType === 'qc')
        const packing = recordings.find(
          (record) => record.resiNumber.trim() === resiNumber.trim() && record.taskType === 'packing',
        )

        return { qc: qc ?? null, packing: packing ?? null }
      }
    },
    [mergeRecordingsForResi, recordings],
  )

  const refreshHistory = useCallback(async () => {
    if (!session) {
      return
    }

    setHistoryBusy(true)
    setHistoryError(null)

    try {
      const rows = await readServerRecordingsApi()
      setRecordings(rows)

      try {
        const orders = await readRecentShopeeOrdersApi(500)
        setShopeeOrders(orders)
      } catch {
        setShopeeOrders([])
      }
    } catch (error) {
      setHistoryError(normalizeError(error))
    } finally {
      setHistoryBusy(false)
    }
  }, [session])

  const {
    sharingRecordId,
    preparingShareFileIds,
    shareProgressByRecordingId,
    sharePreparationErrors,
    queuedShareFileIds,
    preparedShareFileIds,
    handleShareRecording,
  } = useSharePreparation({
    active: Boolean(session),
    recordings,
    setRecordings,
    refreshHistory,
    setBootError,
    showScanNotice,
    formatTask,
    normalizeError,
  })

  useEffect(() => {
    if (!session || typeof window === 'undefined' || typeof EventSource === 'undefined') {
      return
    }

    let refreshTimer: number | null = null
    const source = new EventSource(buildApiUrl('/api/events'), { withCredentials: true })

    const scheduleRefresh = () => {
      if (refreshTimer !== null) {
        return
      }

      refreshTimer = window.setTimeout(() => {
        refreshTimer = null
        void refreshHistory()
      }, 600)
    }

    source.addEventListener('recordings-updated', scheduleRefresh)
    source.addEventListener('share-file-progress', (event) => {
      if (!(event instanceof MessageEvent)) {
        return
      }

      try {
        window.dispatchEvent(new CustomEvent('pakti:share-file-progress', { detail: JSON.parse(event.data) }))
      } catch {
        // Ignore malformed progress events and keep the share request running.
      }
    })

    return () => {
      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer)
      }
      source.close()
    }
  }, [refreshHistory, session])

  useEffect(() => {
    if (!session || !historyDetailTarget) {
      return
    }

    const hasPendingShareFile = historyDetailTarget.rows.some(
      (record) => record.status === 'completed' && Boolean(record.filePath) && !record.shareFileReady,
    )

    if (!hasPendingShareFile) {
      return
    }

    const timer = window.setInterval(() => {
      void refreshHistory()
    }, 5000)

    return () => {
      window.clearInterval(timer)
    }
  }, [historyDetailTarget, refreshHistory, session])

  const startScanRecording = useCallback(
    async (resiInput: string, source: 'manual' | 'camera' = 'manual'): Promise<'started' | 'duplicate' | 'queued' | 'error'> => {
      if (!session) {
        return 'error'
      }

      if (session.taskType === 'packing' && !activePackingSession) {
        playScanFeedback('warning')
        showScanNotice({
          kind: 'warning',
          title: 'Sesi packing belum aktif',
          message: 'Mulai sesi packing sebelum scan paket.',
        })
        return 'error'
      }

      const resiNumber = resiInput.trim()
      if (!resiNumber) {
        if (source === 'manual') {
          setBootError('Isi nomor resi dulu.')
        }
        return 'error'
      }

      const taskProgress = session.taskType === 'packing' ? await resolveLatestTaskProgress(resiNumber) : null
      if (session.taskType === 'packing' && taskProgress?.qc?.status !== 'completed') {
        playScanFeedback('warning')
        showScanNotice({
          kind: 'warning',
          title: 'QC belum selesai',
          message: getPackingQcMessage(taskProgress?.qc?.status),
        })
        setScanResi('')
        return 'error'
      }

      // Foto packing tidak memakai MediaRecorder - cukup siapkan resi untuk tombol Ambil foto & simpan
      if (session.taskType === 'packing' && packingMediaType === 'photo') {
        setScanBusy(true)
        void primeScanFeedbackAudio()
        try {
          const existingPhoto = await findRecordingByResi(resiNumber, session.taskType)
          if (existingPhoto) {
            playScanFeedback('warning')
            rejectResi(resiNumber)
            const duplicateNotice = getDuplicateScanNotice({
              existing: existingPhoto,
              taskType: session.taskType,
              taskProgressQcStatus: taskProgress?.qc?.status,
              formatTask,
            })
            showScanNotice({
              kind: 'warning',
              title: duplicateNotice.title,
              message: duplicateNotice.message,
            })
            setWatermarkResi((current) => (current === resiNumber ? null : current))
            setScanResi('')
            return 'duplicate'
          }
          clearRejectedResi()
          setWatermarkResi(resiNumber)
          setScanResi(resiNumber)
          playScanFeedback('success')
          showScanNotice({
            kind: 'success',
            title: 'Resi siap difoto',
            message: `Resi ${resiNumber} akan difoto otomatis...`,
          })
          return 'started'
        } catch (error) {
          setWatermarkResi((current) => (current === resiNumber ? null : current))
          setBootError(normalizeError(error))
          return 'error'
        } finally {
          setScanBusy(false)
        }
      }

      setScanBusy(true)
      void primeScanFeedbackAudio()

      try {
        const existing = await findRecordingByResi(resiNumber, session.taskType)
        if (existing) {
          playScanFeedback('warning')
          rejectResi(resiNumber)
          const duplicateNotice = getDuplicateScanNotice({
            existing,
            taskType: session.taskType,
            taskProgressQcStatus: taskProgress?.qc?.status,
            formatTask,
          })

          showScanNotice({
            kind: 'warning',
            title: duplicateNotice.title,
            message: duplicateNotice.message,
          })
          setWatermarkResi((current) => (current === resiNumber ? null : current))
          setScanResi('')
          return 'duplicate'
        }

        clearRejectedResi()
        if (recordingSession.state.mode === 'recording' && recordingSession.state.activeResi !== resiNumber) {
          return 'queued'
        }

        setWatermarkResi(resiNumber)
        await recordingSession.startRecording(resiNumber)

        playScanFeedback('success')

        if (source === 'camera') {
          showScanNotice({
            kind: 'success',
            title: 'Scan berhasil',
            message: `Resi ${resiNumber} masuk ke ${formatTask(session.taskType)}.`,
          })
        }

        setScanResi('')
        return 'started'
      } catch (error) {
        setWatermarkResi((current) => (current === resiNumber ? null : current))
        setBootError(normalizeError(error))
        return 'error'
      } finally {
        setScanBusy(false)
      }
    },
    [
      findRecordingByResi,
      activePackingSession,
      primeScanFeedbackAudio,
      playScanFeedback,
      clearRejectedResi,
      packingMediaType,
      recordingSession,
      rejectResi,
      resolveLatestTaskProgress,
      session,
      showScanNotice,
    ],
  )

  useEffect(() => {
    setStartScanRecording(startScanRecording)
  }, [setStartScanRecording, startScanRecording])

  const stopScanRecording = useCallback(async () => {
    if (scanBusy || !session) {
      return
    }

    setScanBusy(true)
    void primeScanFeedbackAudio()

    try {
      await recordingSession.stopRecording()
      if (session.taskType === 'packing' && activePackingSession) {
        void readPackingSessionApi(activePackingSession.id).then(setActivePackingSession).catch(() => void refreshActivePackingSession())
      }
      void refreshHistory()
    } catch (error) {
      setBootError(normalizeError(error))
    } finally {
      setScanBusy(false)
    }
  }, [activePackingSession, primeScanFeedbackAudio, refreshActivePackingSession, refreshHistory, scanBusy, session, recordingSession])

  async function handleCopyResi(resiNumber: string) {
    try {
      await navigator.clipboard.writeText(resiNumber)
      showScanNotice({
        kind: 'success',
        title: 'Resi disalin',
        message: resiNumber,
      })
    } catch {
      setBootError('Browser ini belum mengizinkan salin resi.')
    }
  }

  async function refreshActivePackingSession() {
    try {
      const packingSession = await readActivePackingSessionApi()
      setActivePackingSession(packingSession)
      return packingSession
    } catch {
      setActivePackingSession(null)
      return null
    }
  }

  async function handleStartPackingSession() {
    if (packingSessionBusy || !selectedPackerKey) return
    const selected = parsePackerKey(selectedPackerKey)
    setPackingSessionBusy(true)
    try {
      const packingSession = await createPackingSessionApi({
        packerOperatorName: selected.operatorName,
        packerOperatorCode: selected.operatorCode,
      })
      setActivePackingSession(packingSession)
      showScanNotice({
        kind: 'success',
        title: 'Sesi packing aktif',
        message: `${packingSession.packerNameSnapshot} mulai packing.`,
      })
    } catch (error) {
      showScanNotice({
        kind: 'warning',
        title: 'Gagal mulai sesi',
        message: normalizeError(error),
      })
    } finally {
      setPackingSessionBusy(false)
    }
  }

  async function handleClosePackingSession() {
    if (packingSessionBusy || !activePackingSession) return
    setPackingSessionBusy(true)
    try {
      const closed = await closePackingSessionApi(activePackingSession.id)
      setActivePackingSession(null)
      showScanNotice({
        kind: 'success',
        title: 'Sesi packing ditutup',
        message: `${closed.completedPackingCount} paket · ${formatRupiah(closed.totalPayAmount)}.`,
      })
    } catch (error) {
      showScanNotice({
        kind: 'warning',
        title: 'Gagal tutup sesi',
        message: normalizeError(error),
      })
    } finally {
      setPackingSessionBusy(false)
    }
  }

  useEffect(() => {
    if (!isPackingMode || !activePackingSession || !scanResi.trim() || recordingSession.state.mode !== 'idle') {
      setPackingPreview(null)
      return
    }
    let cancelled = false
    const resi = scanResi.trim()
    const timer = window.setTimeout(() => {
      setPackingPreviewBusy(true)
      readPackingPreviewByResiApi(resi)
        .then((data) => {
          if (!cancelled) setPackingPreview(data)
        })
        .catch(() => {
          if (!cancelled) setPackingPreview(null)
        })
        .finally(() => {
          if (!cancelled) setPackingPreviewBusy(false)
        })
    }, 320)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [isPackingMode, activePackingSession, scanResi, recordingSession.state.mode])

  function clearPhotoStaging() {
    setPhotoStaging((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl)
      return null
    })
  }

  async function stagePhotoCapture(overrideResi?: string) {
    const rawResi = (overrideResi ?? scanResi).trim()
    if (!session || packingMediaType !== 'photo' || !canUsePackingFlow || photoCaptureBusy || !scanVideoElement || !rawResi) return
    const resiNumber = rawResi
    if (session.taskType === 'packing') {
      const progress = await resolveLatestTaskProgress(resiNumber)
      if (progress?.qc?.status !== 'completed') {
        playScanFeedback('warning')
        showScanNotice({ kind: 'warning', title: 'QC belum selesai', message: getPackingQcMessage(progress?.qc?.status) })
        return
      }
      const existing = await findRecordingByResi(resiNumber, 'packing')
      if (existing && !(lastPhotoId && existing.id === lastPhotoId)) {
        playScanFeedback('warning')
        const notice = getDuplicateScanNotice({ existing, taskType: 'packing', taskProgressQcStatus: progress?.qc?.status, formatTask })
        showScanNotice({ kind: 'warning', title: notice.title, message: notice.message })
        return
      }
    }
    setPhotoCaptureBusy(true)
    try {
      const video = scanVideoElement
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth || 1280
      canvas.height = video.videoHeight || 720
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas tidak tersedia.')
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
      if (!blob) throw new Error('Gagal mengambil foto.')
      const previewUrl = URL.createObjectURL(blob)
      setPhotoStaging((prev) => {
        if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl)
        return { resi: resiNumber, blob, previewUrl, startedAt: new Date() }
      })
      playScanFeedback('success')
      showScanNotice({ kind: 'success', title: 'Preview foto siap', message: `Resi ${resiNumber} — cek preview lalu Gunakan foto.` })
    } catch (error) {
      showScanNotice({ kind: 'warning', title: 'Gagal ambil foto', message: normalizeError(error) })
    } finally {
      setPhotoCaptureBusy(false)
    }
  }

  async function confirmPhotoStaging() {
    if (!photoStaging || !session) return
    const { resi: resiNumber, blob, startedAt } = photoStaging
    setPhotoCaptureBusy(true)
    try {
      const existing = await findRecordingByResi(resiNumber, 'packing')
      if (existing && lastPhotoId && existing.id === lastPhotoId) {
        try { await deleteServerRecordingApi(existing.id) } catch { /* ignore */ }
      }
      const fileName = `packing_${resiNumber.replace(/[^\w-]+/g, '_')}_${startedAt.toISOString().replace(/[:.]/g, '-')}.jpg`
      const draft = await createServerRecordingDraftApi({
        resiNumber,
        taskType: 'packing',
        operatorName: session.operatorName,
        operatorCode: session.operatorCode,
        startedAt: startedAt.toISOString(),
        fileName,
        filePath: fileName,
        mediaType: 'photo',
        packingSessionId: activePackingSession?.id ?? null,
      })
      await appendServerRecordingChunkApi(draft.id, blob)
      await finalizeServerRecordingApi(draft.id, { endTime: new Date().toISOString() })
      playScanFeedback('success')
      showScanNotice({ kind: 'success', title: 'Foto packing tersimpan', message: `Resi ${resiNumber} · ${packingPreview ? formatRupiah((packingPreview.pay as unknown as { amount: number }).amount) : formatRupiah(1500)}` })
      setLastPhotoResi(resiNumber)
      setLastPhotoId(draft.id)
      clearPhotoStaging()
      setScanResi('')
      setPackingPreview(null)
      if (activePackingSession) void readPackingSessionApi(activePackingSession.id).then(setActivePackingSession).catch(() => void refreshActivePackingSession())
      void refreshHistory()
    } catch (error) {
      showScanNotice({ kind: 'warning', title: 'Gagal simpan foto', message: normalizeError(error) })
    } finally {
      setPhotoCaptureBusy(false)
    }
  }

  // keep legacy manual alias for retake button
  async function handleCapturePhoto(overrideResi?: string) {
    return stagePhotoCapture(overrideResi)
  }

  // Otomatis stage foto ketika scan berhasil di mode foto, tetap sediakan opsi manual & foto ulang
  useEffect(() => {
    if (skipAutoPhoto) { setSkipAutoPhoto(false); return }
    if (!isPackingMode || packingMediaType !== 'photo' || !scanResi.trim() || photoCaptureBusy || scanBusy || !canUsePackingFlow || recordingSession.state.mode !== 'idle' || !scanVideoElement || photoStaging) return
    const resi = scanResi.trim()
    if (lastPhotoResi === resi && lastPhotoId) return
    const timer = window.setTimeout(() => {
      void stagePhotoCapture(resi)
    }, 450)
    return () => window.clearTimeout(timer)
  }, [scanResi, packingMediaType, isPackingMode, photoCaptureBusy, scanBusy, canUsePackingFlow, recordingSession.state.mode, scanVideoElement, lastPhotoId, lastPhotoResi, photoStaging, skipAutoPhoto])

  useEffect(() => () => { if (photoStaging?.previewUrl) URL.revokeObjectURL(photoStaging.previewUrl) }, [photoStaging])

  async function handleDeleteRecording(record: RecordingRow) {
    if (deletingRecordId) {
      return
    }

    setDeletingRecordId(record.id)
    setHistoryError(null)

    try {
      await deleteServerRecordingApi(record.id)
      setRecordings((current) => current.filter((item) => item.id !== record.id))
      await refreshHistory()
      showScanNotice({
        kind: 'success',
        title: 'Recording dihapus',
        message: `Resi ${record.resiNumber} bisa direkam ulang.`,
      })
    } catch (error) {
      setHistoryError(normalizeError(error))
    } finally {
      setDeletingRecordId(null)
    }
  }

  function openTab(tab: TabKey) {
    setActiveTab(tab)
    setMenuOpen(false)
  }

  if (booting) {
    return (
      <main
        className="mobile-app mobile-app--boot"
        onPointerDownCapture={() => {
          void primeScanFeedbackAudio()
        }}
      >
        <div className="mobile-boot-card">
          <span className="brand-badge">{brandMark}</span>
          <h1>{appName}</h1>
          <p>{tagline}</p>
          <div className="mobile-boot-state">Mempersiapkan sesi mobile...</div>
        </div>
      </main>
    )
  }

  if (!session) {
    return (
      <main
        className="mobile-app mobile-app--auth"
        style={{ fontFamily: 'JetBrains Mono, monospace' }}
        onPointerDownCapture={() => {
          void primeScanFeedbackAudio()
        }}
      >
        <section className="grid gap-4 border border-[var(--op-hairline)] bg-[var(--op-canvas)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-[4px] bg-[var(--op-ink)] text-sm font-bold text-[var(--op-canvas)]">
                {brandMark}
              </span>
              <div className="min-w-0">
                <p className="text-[12px] font-bold tracking-wide">[ Pakti Mobile ]</p>
                <h1 className="m-0 truncate text-[20px] font-bold leading-none tracking-tight">{appName}</h1>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="rounded-[4px] border-[var(--op-hairline)]"
              onClick={toggleTheme}
              aria-label={isDarkTheme ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
            >
              {isDarkTheme ? <HugeiconsIcon icon={Sun03Icon} size={16} /> : <HugeiconsIcon icon={Moon02Icon} size={16} />}
            </Button>
          </div>
          <div className="grid gap-0 border-t border-[var(--op-hairline)] text-[13px]">
            <div className="grid grid-cols-[88px_1fr] gap-3 border-b border-[var(--op-hairline)] py-2">
              <span className="text-[var(--op-mute)]">Sistem</span>
              <strong className="truncate font-medium">{tagline}</strong>
            </div>
            <div className="grid grid-cols-[88px_1fr] gap-3 py-2">
              <span className="text-[var(--op-mute)]">Status</span>
              <strong className="font-medium">Menunggu login operator</strong>
            </div>
          </div>
        </section>

        <section className="grid gap-3 border border-[var(--op-hairline)] bg-[var(--op-surface-soft)] p-4">
          <div className="grid gap-1 border-b border-[var(--op-hairline)] pb-3">
            <p className="text-[12px] font-bold tracking-wide">[ Login ]</p>
            <h2 className="text-[16px] font-bold leading-none">Mulai sesi scan</h2>
            <p className="text-[14px] leading-relaxed text-[var(--op-mute)]">Masukkan username dan password operator.</p>
          </div>

          <form className="grid gap-3" onSubmit={handleLogin}>
            <div className="grid gap-2">
              <Label htmlFor="mobile-operator-name" className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--op-mute)]">Username</Label>
                <Input
                  id="mobile-operator-name"
                  value={loginForm.operatorName}
                  onChange={(event) => setLoginForm((current) => ({ ...current, operatorName: event.target.value }))}
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="Masukkan username"
                  className="h-11 rounded-[4px] border-[var(--op-hairline)] bg-[var(--op-canvas)]"
                  required
                />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="mobile-password" className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--op-mute)]">Password</Label>
              <div className="relative">
                <Input
                  id="mobile-password"
                  type={showLoginPassword ? 'text' : 'password'}
                  value={loginForm.password}
                  onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                  autoComplete="current-password"
                  placeholder="Masukkan password"
                  className="h-11 rounded-[4px] border-[var(--op-hairline)] bg-[var(--op-canvas)] pr-12"
                  required
                />
                <button
                  type="button"
                  className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-[4px] border border-transparent bg-transparent text-[var(--op-mute)] outline-none hover:border-[var(--op-hairline)] hover:bg-[var(--op-surface-card)] focus-visible:border-[var(--op-ink)]"
                  onClick={() => setShowLoginPassword((current) => !current)}
                  aria-label={showLoginPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                >
                  {showLoginPassword ? <HugeiconsIcon icon={EyeOffIcon} size={16} /> : <HugeiconsIcon icon={EyeIcon} size={16} />}
                </button>
              </div>
            </div>

            {bootError ? (
              <Alert variant="destructive" className="rounded-[4px]">
                <AlertTitle>Gagal masuk</AlertTitle>
                <AlertDescription>{bootError}</AlertDescription>
              </Alert>
            ) : null}

            <Button
              type="submit"
              className="h-11 w-full rounded-[4px] bg-[var(--op-ink)] text-[var(--op-canvas)]"
              disabled={loginBusy || !loginForm.operatorName.trim() || !loginForm.password}
            >
              {loginBusy ? 'Memverifikasi...' : 'Masuk'}
            </Button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main
      className="mobile-app"
      onPointerDownCapture={() => {
        void primeScanFeedbackAudio()
      }}
    >
      {/* ——— Minimal header ——— */}
      <header className="flex items-center justify-between gap-3 py-2">
        <div className="flex items-center gap-3">
          <span className="brand-badge">{brandMark}</span>
          <div className="leading-tight">
            <p className="eyebrow">Pakti Mobile</p>
            <h1 className="m-0 text-[1.18rem] font-semibold tracking-[-0.03em]">{appName}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-canvas)]"
            onClick={toggleTheme}
            aria-label={isDarkTheme ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
          >
            {isDarkTheme ? <HugeiconsIcon icon={Sun03Icon} size={16} /> : <HugeiconsIcon icon={Moon02Icon} size={16} />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-canvas)]"
            onClick={() => setLogoutConfirmOpen(true)}
            aria-label="Keluar"
          >
            <HugeiconsIcon icon={Logout02Icon} size={16} />
          </Button>
        </div>
      </header>

      <Dialog open={logoutConfirmOpen} onOpenChange={setLogoutConfirmOpen}>
        <DialogContent className="rounded-[4px] border-border bg-popover text-popover-foreground">
          <DialogHeader>
            <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-[4px] border border-destructive/30 bg-[var(--op-canvas)] text-destructive">
              <HugeiconsIcon icon={ShieldAlertIcon} size={18} />
            </div>
            <DialogTitle>Keluar sekarang?</DialogTitle>
            <DialogDescription>Sesi ini akan ditutup dan perlu login kembali.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-0 bg-transparent pt-2">
            <Button type="button" variant="ghost" className="rounded-[4px]" onClick={() => setLogoutConfirmOpen(false)}>
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="gap-2 rounded-[4px]"
              onClick={() => {
                setLogoutConfirmOpen(false)
                void handleLogout()
              }}
            >
              <HugeiconsIcon icon={Logout02Icon} size={16} />
              Keluar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ——— SCAN TAB ——— */}
      {activeTab === 'scan' ? (
        <section className="grid gap-3">
          {isPackingMode ? (
            <section className="grid gap-3 rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-surface-soft)] p-3" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              <div className="flex items-start justify-between gap-3">
                <div className="grid gap-1">
                  <p className="text-[12px] font-bold tracking-wide">[ Sesi Packing ]</p>
                  <h2 className="text-[15px] font-bold leading-none">
                    {activePackingSession ? activePackingSession.packerNameSnapshot : 'Mulai sesi sebelum scan'}
                  </h2>
                  <p className="text-[12px] leading-snug text-[var(--op-mute)]">
                    {activePackingSession
                      ? `${activePackingSession.completedPackingCount} paket · ${formatRupiah(activePackingSession.totalPayAmount)}`
                      : 'Pilih petugas packing dari user management.'}
                  </p>
                </div>
                {activePackingSession ? (
                  <span className="inline-flex items-center gap-1 rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-canvas)] px-2 py-1 text-[12px] font-semibold">
                    <HugeiconsIcon icon={CheckmarkCircle01Icon} size={14} /> aktif
                  </span>
                ) : null}
              </div>

              {activePackingSession ? (
                <div className="grid grid-cols-[1fr_auto] items-center gap-2 border-t border-[var(--op-hairline)] pt-3">
                  <div className="min-w-0 text-[12px] text-[var(--op-mute)]">
                    <span className="block truncate">Kode: {activePackingSession.packerCodeSnapshot}</span>
                    <span className="block truncate">Mulai: {formatDateTime(activePackingSession.startedAt)}</span>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="rounded-[4px]" disabled={packingSessionBusy || recordingSession.state.mode !== 'idle'} onClick={() => void handleClosePackingSession()}>
                    {packingSessionBusy ? 'Menutup...' : 'Akhiri'}
                  </Button>
                </div>
              ) : (
                <div className="grid gap-2 border-t border-[var(--op-hairline)] pt-3">
                  <Label htmlFor="mobile-packing-operator" className="text-[0.68rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Petugas packing
                  </Label>
                  <select
                    id="mobile-packing-operator"
                    value={selectedPackerKey}
                    onChange={(event) => setSelectedPackerKey(event.target.value)}
                    className="h-11 rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-canvas)] px-3 text-[0.9rem] text-[var(--op-ink)] outline-none"
                    disabled={packingSessionBusy || packingOperators.length === 0}
                  >
                    {packingOperators.length === 0 ? <option value="">Belum ada operator packing</option> : null}
                    {packingOperators.map((operator) => (
                      <option key={makePackerKey(operator.operatorName, operator.operatorCode)} value={makePackerKey(operator.operatorName, operator.operatorCode)}>
                        {operator.fullName || operator.operatorName} ({operator.operatorCode})
                      </option>
                    ))}
                  </select>
                  <Button type="button" className="h-11 w-full rounded-[4px]" disabled={packingSessionBusy || !selectedPackerKey} onClick={() => void handleStartPackingSession()}>
                    {packingSessionBusy ? 'Memulai sesi...' : 'Mulai Sesi Packing'}
                  </Button>
                </div>
              )}
            </section>
            ) : null}
          {isPackingMode && activePackingSession ? (
            <section className="grid gap-2 rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-canvas)] p-3" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              <div className="flex gap-2">
                {(['video','photo'] as const).map((v) => (
                  <Button key={v} type="button" variant={packingMediaType===v ? 'secondary' : 'outline'} size="sm" className="flex-1 rounded-[4px]" onClick={() => setPackingMediaType(v)} disabled={recordingSession.state.mode==='recording' || photoCaptureBusy}>
                    {v==='video' ? 'Video' : 'Foto'}
                  </Button>
                ))}
              </div>
              {packingPreviewBusy ? <p className="text-[12px] text-[var(--op-mute)]">Memuat preview order...</p> : null}
              {packingPreview ? (
                <div className="grid gap-2 rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-surface-soft)] p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-bold">Jasa kirim: {packingPreview.order.shippingChannel ?? '-'}</span>
                    <span className="rounded-[4px] bg-[var(--op-ink)] px-2 py-0.5 text-[11px] font-semibold text-[var(--op-canvas)]">{formatRupiah(packingPreview.pay.amount)}</span>
                  </div>
                  <div className="grid gap-1">
                    {packingPreview.order.items.slice(0,4).map((it, idx) => (
                      <div key={idx} className="flex justify-between gap-2 text-[12px]">
                        <span className="min-w-0 truncate">{it.productName}{it.variationName ? ` · ${it.variationName}` : ''}</span>
                        <span className="shrink-0">x{it.quantity}</span>
                      </div>
                    ))}
                    {packingPreview.order.items.length > 4 ? <span className="text-[11px] text-[var(--op-mute)]">+{packingPreview.order.items.length - 4} item lain</span> : null}
                  </div>
                  <p className="text-[11px] text-[var(--op-mute)]">No. Pesanan {packingPreview.order.orderNumber} · Buyer {packingPreview.order.buyerUsername ?? '-'}</p>
                </div>
              ) : scanResi.trim() ? <p className="text-[11px] text-amber-600">Order belum ditemukan atau butuh sync Shopee.</p> : null}
              {photoStaging && !isPackingMode ? (
                <div className="mt-2 grid gap-2 rounded-[4px] border border-amber-200 bg-amber-50 p-2">
                  <p className="text-[12px] font-bold">Preview foto — cek sebelum simpan</p>
                  <div className="overflow-hidden rounded-[4px] border border-[var(--op-hairline)] bg-black">
                    <img src={photoStaging.previewUrl} alt={`Preview ${photoStaging.resi}`} className="block max-h-[32vh] w-full object-contain" />
                  </div>
                  <p className="text-[11px] text-muted-foreground">Resi {photoStaging.resi} · {packingPreview ? formatRupiah((packingPreview.pay as unknown as { amount: number }).amount) : ''}</p>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" className="flex-1 rounded-[4px] bg-[var(--op-ink)] text-[var(--op-canvas)]" disabled={photoCaptureBusy} onClick={() => void confirmPhotoStaging()}>
                      {photoCaptureBusy ? 'Menyimpan...' : 'Gunakan foto ✓'}
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="flex-1 rounded-[4px]" disabled={photoCaptureBusy} onClick={() => { setSkipAutoPhoto(true); clearPhotoStaging(); showScanNotice({ kind: 'success', title: 'Ulangi foto', message: 'Posisikan paket lalu klik Foto manual — tidak otomatis.' }) }}>
                      Ulangi (manual)
                    </Button>
                  </div>
                  <Button type="button" variant="ghost" size="sm" className="rounded-[4px] text-[11px]" disabled={photoCaptureBusy} onClick={() => void stagePhotoCapture()}>
                    Foto manual lagi
                  </Button>
                </div>
              ) : null}
              {isPackingMode && packingMediaType === 'photo' && lastPhotoResi ? (
                <div className="mt-2 grid gap-2 rounded-[4px] border border-dashed border-[var(--op-hairline)] bg-[var(--op-surface-soft)] p-2">
                  <p className="text-[11px] text-muted-foreground">Foto terakhir: <strong>{lastPhotoResi}</strong> tersimpan</p>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" className="flex-1 rounded-[4px]" disabled={photoCaptureBusy} onClick={() => { setSkipAutoPhoto(true); clearPhotoStaging(); setScanResi(lastPhotoResi ?? ''); showScanNotice({ kind: 'success', title: 'Siap foto ulang', message: `Posisikan paket ${lastPhotoResi} lalu klik Foto manual.` }) }}>
                      {photoCaptureBusy ? '...' : 'Foto ulang (manual)'}
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="flex-1 rounded-[4px]" disabled={photoCaptureBusy || !scanResi.trim() || !scanVideoElement} onClick={() => void stagePhotoCapture()}>
                      Foto manual
                    </Button>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          <div className="relative">
            {scanNotice ? (
              <div
                className={
                  scanNotice.kind === 'success'
                    ? 'scan-notice scan-notice--success'
                    : 'scan-notice scan-notice--warning'
                }
              >
                <div className="grid gap-0.5">
                  <strong className="text-[0.75rem] font-semibold leading-none text-foreground">
                    {scanNotice.title}
                  </strong>
                  <span className="text-[0.66rem] leading-snug text-muted-foreground">{scanNotice.message}</span>
                </div>
              </div>
            ) : null}

            <CameraPreview
              onVideoElement={setScanVideoElement}
              stream={cameraState.stream}
              isLoading={cameraState.loading}
              error={cameraState.error}
              emptyMessage="Arahkan kamera ke area kerja."
              topSlot={
                <div className="flex w-full max-w-full flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex min-w-0 flex-1 items-center gap-2 truncate rounded-[4px] border border-[rgba(253,252,252,0.36)] bg-[#201d1d] px-2.5 py-1 text-[0.7rem] font-semibold text-[#fdfcfc]">
                      <HugeiconsIcon icon={Camera01Icon} size={14} className="shrink-0" />
                      <span className="min-w-0 flex-1 truncate">
                        {currentRecordingResi ? `Resi ${currentRecordingResi}` : scanStatusLabel}
                      </span>
                    </span>
                    {isAdmin ? (
                      <Button
                        type="button"
                        variant={session.taskType === 'qc' ? 'secondary' : 'outline'}
                        size="xs"
                        className="h-7 shrink-0 rounded-[4px] !border-[#fdfcfc] !bg-[#fdfcfc] px-2.5 text-xs font-medium !text-[#201d1d] hover:!bg-[#fdfcfc] dark:!border-[#fdfcfc] dark:!bg-[#fdfcfc] dark:!text-[#201d1d]"
                        onClick={() => void handleTaskChange(session.taskType === 'qc' ? 'packing' : 'qc')}
                        disabled={taskBusy}
                      >
                        {formatTask(session.taskType)}
                      </Button>
                    ) : (
                      <span className="inline-flex shrink-0 items-center rounded-[4px] border border-[#fdfcfc] bg-[#fdfcfc] px-2.5 py-1 text-[0.68rem] font-semibold text-[#201d1d]">
                        {formatTask(session.taskType)}
                      </span>
                    )}
                  </div>
                  {currentRecordingResi ? (
                    <div className="w-fit rounded-[4px] border border-[rgba(253,252,252,0.36)] bg-[#201d1d] px-3 py-2">
                      <strong className="block text-[0.68rem] font-bold tracking-wide text-white">
                        {recordingSession.state.mode === 'recording' ? 'SEDANG MEREKAM' : 'MENYIMPAN VIDEO'}
                      </strong>
                      <span className="block text-[0.62rem] font-medium leading-tight text-[#d8d4d4]">
                        {formatTask(currentTaskType)} · {session.operatorName || session.operatorCode || '-'} · {watermarkOverlayTime}
                      </span>
                    </div>
                  ) : null}
                </div>
              }
              centerSlot={
                photoStaging ? (
                  <div className="w-full max-w-[92%] overflow-hidden rounded-[8px] border border-white/20 bg-black/80 p-2 backdrop-blur">
                    <img src={photoStaging.previewUrl} alt={`Preview ${photoStaging.resi}`} className="block max-h-[28vh] w-full rounded object-contain" />
                    <p className="mt-1 truncate text-center text-xs font-mono text-white">{photoStaging.resi} · cek lalu Gunakan</p>
                  </div>
                ) : (
                  <div className="scan-guide-simple" aria-hidden="true">
                    <div className="scan-guide-simple__frame" />
                    <div className="scan-guide-simple__label">
                      <span>{isPackingMode && packingMediaType==='photo' ? 'Posisikan paket & resi jelas' : 'Pusatkan barcode di kotak ini'}</span>
                    </div>
                  </div>
                )
              }
              bottomSlot={
                  <div
                  className={
                    recordingSession.state.mode === 'recording'
                      ? 'scan-control-panel scan-control-panel--recording rounded-[4px]'
                      : 'scan-control-panel rounded-[4px]'
                  }
                >
                  <div className="h-px w-full bg-[var(--op-hairline)]" aria-hidden="true" />
                  {scanProgressState ? (
                    <div className={`scan-progress-note scan-progress-note--${scanProgressState.tone} rounded-[4px]`}>
                      <strong>{scanProgressState.title}</strong>
                      <span>{scanProgressState.message}</span>
                    </div>
                  ) : null}

                  <div className="grid gap-2">
                    <Label htmlFor="mobile-scan-resi" className="text-[0.68rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      Nomor resi {isPackingMode && packingMediaType==='photo' ? '(foto)' : ''}
                    </Label>
                    <div className="relative">
                      <HugeiconsIcon icon={ScanIcon} className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="mobile-scan-resi"
                        value={scanResi}
                        onChange={(event) => setScanResi(event.target.value)}
                        placeholder={isPackingMode && packingMediaType==='photo' ? 'Scan resi → auto foto' : 'Scan barcode atau ketik resi'}
                        inputMode="text"
                        autoCapitalize="characters"
                        className="h-12 rounded-[4px] border-[var(--op-hairline)] bg-[var(--op-canvas)] pl-10 text-[0.95rem] shadow-none"
                        disabled={!canUsePackingFlow}
                      />
                    </div>
                    <p className="text-[0.68rem] leading-snug text-muted-foreground">{scanStatusDescription}</p>
                  </div>

                  {photoStaging ? (
                    <div className="grid gap-2">
                      <Button type="button" className="h-12 w-full rounded-[4px] bg-black text-[0.95rem] font-semibold text-white" disabled={photoCaptureBusy} onClick={() => void confirmPhotoStaging()}>
                        <HugeiconsIcon icon={Camera01Icon} size={16} /> {photoCaptureBusy ? 'Menyimpan...' : 'Gunakan foto ✓'}
                      </Button>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" className="flex-1 rounded-[4px]" disabled={photoCaptureBusy} onClick={() => { setSkipAutoPhoto(true); clearPhotoStaging() }}>
                          Ulangi (manual)
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="flex-1 rounded-[4px] text-[11px]" disabled={photoCaptureBusy} onClick={() => void stagePhotoCapture()}>
                          Foto manual
                        </Button>
                      </div>
                    </div>
                  ) : isPackingMode && packingMediaType==='photo' ? (
                    <div className="flex flex-col items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void stagePhotoCapture()}
                        disabled={!canUsePackingFlow || photoCaptureBusy || !scanResi.trim() || !scanVideoElement}
                        className="grid h-[68px] w-[68px] place-items-center rounded-full border-4 border-white bg-white/10 shadow-[0_0_0_4px_rgba(0,0,0,0.15)] backdrop-blur transition active:scale-95 disabled:opacity-40"
                        aria-label="Ambil foto manual"
                      >
                        <span className="h-12 w-12 rounded-full bg-white shadow-inner" />
                      </button>
                      <span className="text-[11px] font-mono tracking-wide text-muted-foreground">tap shutter untuk foto manual</span>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      className="h-12 w-full rounded-[4px] text-[0.95rem] font-semibold"
                      disabled={
                        scanBusy ||
                        !canUsePackingFlow ||
                        recordingSession.state.mode === 'stopping' ||
                        recordingSession.state.mode === 'saving' ||
                        (recordingSession.state.mode === 'idle' && !scanResi.trim())
                      }
                      onClick={() =>
                        void (recordingSession.state.mode === 'recording' ? stopScanRecording() : startScanRecording(scanResi, 'manual'))
                      }
                    >
                      <HugeiconsIcon icon={ScanIcon} size={16} />
                      {scanPrimaryActionLabel}
                    </Button>
                  )}
                </div>
              }
            />
          </div>
        </section>
      ) : null}

      {/* ——— HISTORY TAB ——— */}
      {activeTab === 'history' ? (
        <div className="grid gap-3 pt-1" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          <div className="flex items-start justify-between gap-3 border-b border-[var(--op-hairline)] pb-3">
            <div className="grid gap-1">
              <p className="text-[12px] font-bold tracking-wide">[ History ]</p>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[16px] font-bold leading-none">{groupedRecordings.length} dokumentasi paket</h2>
                <span className="rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-surface-soft)] px-2 py-0.5 text-[12px]">
                  {historyAllAccounts && isAdmin ? 'semua akun' : `akun ${session?.operatorCode || '-'}`}
                </span>
              </div>
            </div>
            <Button variant="outline" size="sm" type="button" className="rounded-[4px] border-[var(--op-hairline)]" onClick={() => void refreshHistory()} disabled={historyBusy}>
              {historyBusy ? '…' : '↻'}
            </Button>
          </div>

          <div
            className="sticky top-0 z-10 grid gap-3 bg-[var(--op-canvas)] py-2"
            onTouchStart={(event) => {
              if (window.scrollY <= 0) {
                historyPullStartYRef.current = event.touches[0]?.clientY ?? null
              }
            }}
            onTouchEnd={(event) => {
              const startY = historyPullStartYRef.current
              historyPullStartYRef.current = null
              if (startY === null || historyBusy) return

              const endY = event.changedTouches[0]?.clientY ?? startY
              if (endY - startY > 72 && window.scrollY <= 4) {
                void refreshHistory()
              }
            }}
          >
            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label htmlFor="history-resi-search" className="text-[0.68rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Cari resi / no. pesanan
                </Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <HugeiconsIcon icon={HistoryIcon} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="history-resi-search"
                      value={historyResiQuery}
                      onChange={(event) => {
                        setHistoryResiQuery(event.target.value)
                        setHistoryHighlightedResi(null)
                      }}
                      placeholder="Cari resi atau no. pesanan..."
                      inputMode="text"
                      autoCapitalize="characters"
                      className="h-11 rounded-[4px] border-border bg-card pl-10"
                    />
                  </div>
                  <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0 rounded-[4px]" onClick={() => setHistoryScanOpen(true)}>
                    <HugeiconsIcon icon={SearchAreaIcon} size={16} />
                  </Button>
                </div>
              </div>

              <div className="flex gap-2">
                {(['all','qc','packing'] as const).map((v) => (
                  <Button
                    key={v}
                    type="button"
                    variant={historyTaskFilter === v ? 'secondary' : 'outline'}
                    size="sm"
                    className="rounded-[4px] px-3"
                    onClick={() => setHistoryTaskFilter(v)}
                  >
                    {v === 'all' ? 'Semua' : v === 'qc' ? 'QC' : 'Packing'}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={
                    historyFilterSheetActive
                      ? 'ml-auto rounded-[4px] border-[var(--op-hairline-strong)] bg-[var(--op-surface-card)]'
                      : 'ml-auto rounded-[4px] border-[var(--op-hairline)]'
                  }
                  onClick={() => setHistoryFilterOpen(true)}
                >
                  Filter {historyFilterSheetActive ? '[+]' : '[-]'}
                </Button>
              </div>
            </div>

            <Sheet open={historyFilterOpen} onOpenChange={(open) => { if (!open) setHistoryFilterOpen(false) }}>
              <SheetContent side="bottom" className="w-full rounded-t-[4px] border-border bg-popover p-0" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                <SheetHeader className="px-4 pt-5">
                  <SheetTitle className="text-left">Filter history</SheetTitle>
                  <SheetDescription className="text-left">Saring dokumentasi sesuai kebutuhan.</SheetDescription>
                </SheetHeader>
                <div className="grid gap-5 px-4 pb-6 pt-2">
                  {isAdmin ? (
                    <div className="grid gap-2">
                      <span className="text-[12px] font-bold tracking-wide text-[var(--op-mute)]">Akun</span>
                      <Button
                        type="button"
                        variant={historyAllAccounts ? 'secondary' : 'outline'}
                        size="sm"
                        className="w-full justify-between rounded-[4px]"
                        onClick={() => setHistoryAllAccounts((current) => !current)}
                      >
                        {historyAllAccounts ? 'Semua akun' : `Akun ${session?.operatorCode || '-'}`}
                        <span>{historyAllAccounts ? '✓' : '▼'}</span>
                      </Button>
                    </div>
                  ) : null}

                  <div className="grid gap-2">
                    <span className="text-[12px] font-bold tracking-wide text-[var(--op-mute)]">Status dokumentasi</span>
                    <div className="grid gap-1.5">
                      {([
                        { key: 'all', label: 'Semua' },
                        { key: 'lengkap', label: '✓ Lengkap' },
                        { key: 'belum-lengkap', label: '! Belum lengkap' },
                      ] as const).map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          className={
                            historyDocStatusFilter === opt.key
                              ? 'flex items-center justify-between rounded-[4px] border border-[var(--op-hairline-strong)] bg-[var(--op-surface-card)] px-3 py-2 text-left text-sm font-medium'
                              : 'flex items-center justify-between rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-canvas)] px-3 py-2 text-left text-sm'
                          }
                          onClick={() => setHistoryDocStatusFilter(opt.key)}
                        >
                          <span>{opt.label}</span>
                          <span>{historyDocStatusFilter === opt.key ? '●' : '○'}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <span className="text-[12px] font-bold tracking-wide text-[var(--op-mute)]">Tanggal</span>
                    <div className="grid gap-1.5">
                      {([
                        { key: 'all', label: 'Semua waktu' },
                        { key: 'today', label: 'Hari ini' },
                        { key: 'yesterday', label: 'Kemarin' },
                        { key: 'week', label: '7 hari terakhir' },
                      ] as const).map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          className={
                            historyDateFilter === opt.key
                              ? 'flex items-center justify-between rounded-[4px] border border-[var(--op-hairline-strong)] bg-[var(--op-surface-card)] px-3 py-2 text-left text-sm font-medium'
                              : 'flex items-center justify-between rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-canvas)] px-3 py-2 text-left text-sm'
                          }
                          onClick={() => setHistoryDateFilter(opt.key)}
                        >
                          <span>{opt.label}</span>
                          <span>{historyDateFilter === opt.key ? '●' : '○'}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <span className="text-[12px] font-bold tracking-wide text-[var(--op-mute)]">Urutan</span>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { key: 'newest', label: 'Terbaru' },
                        { key: 'oldest', label: 'Terlama' },
                      ] as const).map((opt) => (
                        <Button
                          key={opt.key}
                          type="button"
                          variant={historySortOrder === opt.key ? 'secondary' : 'outline'}
                          size="sm"
                          className="rounded-[4px]"
                          onClick={() => setHistorySortOrder(opt.key)}
                        >
                          {historySortOrder === opt.key ? `[ ${opt.label} ]` : opt.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="rounded-[4px]"
                      onClick={() => {
                        setHistoryTaskFilter('all')
                        setHistoryResiQuery('')
                        setHistoryHighlightedResi(null)
                        setHistoryAllAccounts(false)
                        setHistoryDocStatusFilter('all')
                        setHistoryDateFilter('all')
                        setHistorySortOrder('newest')
                      }}
                      disabled={!hasHistoryFilters && historyDocStatusFilter === 'all' && historyDateFilter === 'all' && historySortOrder === 'newest'}
                    >
                      Reset
                    </Button>
                    <Button type="button" size="sm" className="rounded-[4px]" onClick={() => setHistoryFilterOpen(false)}>
                      Terapkan
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            <Sheet
              open={historyScanOpen}
              onOpenChange={(open) => {
                setHistoryScanOpen(open)
                if (!open) {
                  setHistoryScanError(null)
                  setHistoryScanResetToken((current) => current + 1)
                }
              }}
            >
              <SheetContent side="bottom" className="w-full rounded-t-[4px] border-border bg-popover p-0">
                <SheetHeader className="px-5 pt-6 text-left">
                  <SheetTitle>Scan resi untuk cari history</SheetTitle>
                  <SheetDescription>Arahkan barcode ke kamera agar langsung masuk ke pencarian.</SheetDescription>
                </SheetHeader>
                <div className="grid gap-3 px-4 pb-5 pt-3">
                  {historyScanError ? (
                    <Alert variant="destructive" className="rounded-[4px]">
                      <AlertTitle>Gagal membuka kamera</AlertTitle>
                      <AlertDescription>{historyScanError}</AlertDescription>
                    </Alert>
                  ) : null}
                  <CameraPreview
                    onVideoElement={setHistoryScanVideoElement}
                    stream={historyCameraState.stream}
                    isLoading={historyCameraState.loading}
                    error={historyCameraState.error}
                    emptyMessage="Arahkan barcode untuk mengisi pencarian."
                    topSlot={
                      <span className="inline-flex items-center gap-2 rounded-[4px] border border-[rgba(253,252,252,0.36)] bg-[#201d1d] px-3 py-1.5 text-[0.7rem] font-semibold text-[#fdfcfc]">
                        <HugeiconsIcon icon={SearchAreaIcon} size={15} />
                        Scan pencarian
                      </span>
                    }
                    centerSlot={
                      <div className="scan-guide-simple" aria-hidden="true">
                        <div className="scan-guide-simple__frame" />
                        <div className="scan-guide-simple__label">
                          <span>Pusatkan barcode di kotak ini</span>
                        </div>
                      </div>
                    }
                    bottomSlot={
                      <Button type="button" className="w-full rounded-[4px]" variant="outline" onClick={() => setHistoryScanOpen(false)}>
                        Tutup
                      </Button>
                    }
                  />
                </div>
              </SheetContent>
            </Sheet>

            {historyError ? (
              <Alert variant="destructive" className="rounded-[4px]">
                <AlertTitle>Gagal memuat history</AlertTitle>
                <AlertDescription>{historyError}</AlertDescription>
              </Alert>
            ) : null}

            <div className="grid gap-4">
              {groupedByDate.length > 0 ? (
                groupedByDate.map(([dateKey, groups]) => (
                  <section key={dateKey} className="grid gap-2">
                    <p className="text-[12px] font-bold tracking-wide text-[var(--op-mute)]">{formatSectionDate(dateKey)}</p>
                    <div className="grid gap-2">
                    {groups.map((group) => {
                      const status = getDocStatus(group)
                      const statusLabel = status === 'lengkap' ? '✓ Lengkap' : status === 'belum-lengkap' ? '! Belum lengkap' : '— Belum ada'
                      const qcRow = group.rows.find((r: RecordingRow) => r.taskType === 'qc')
                      const packingRow = group.rows.find((r: RecordingRow) => r.taskType === 'packing')
                      const latest = group.latestRow
                      const shareStatus = getGroupShareStatus(group.rows)
                      const sharePreparing = group.rows.some((record) => preparingShareFileIds.has(record.id))
                      const shareFailed = !sharePreparing && group.rows.some((record) => sharePreparationErrors.has(record.id))
                      const shareQueued = !sharePreparing && !shareFailed && group.rows.some((record) => queuedShareFileIds.has(record.id))
                      const activeShareRecord = group.rows.find((record) => preparingShareFileIds.has(record.id))
                      const shareProgress = activeShareRecord ? shareProgressByRecordingId.get(activeShareRecord.id) ?? 0 : null
                      const groupChatSend = group.rows.map((r) => visibleChatSendByRecordingId.get(r.id)).find(Boolean)
                      return (
                      <div
                        key={group.resiNumber}
                        role="button"
                        tabIndex={0}
                        onClick={() => setHistoryDetailTarget(group)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            setHistoryDetailTarget(group)
                          }
                        }}
                        className={
                          historyHighlightedResi === group.resiNumber
                            ? 'grid cursor-pointer gap-3 rounded-[4px] border border-[var(--op-hairline-strong)] bg-[var(--op-surface-card)] p-3 text-left'
                            : 'grid cursor-pointer gap-3 rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-canvas)] p-3 text-left'
                        }
                        style={{ fontFamily: 'JetBrains Mono, monospace' }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <div className="grid min-w-0 gap-0.5">
                              <strong className="min-w-0 truncate text-[16px] font-bold leading-none tracking-tight">{group.resiNumber}</strong>
                              {shopeeOrders.find((o) => o.trackingNumber?.trim().toLowerCase() === group.resiNumber.trim().toLowerCase())?.orderNumber ? (
                                <span className="truncate text-[11px] opacity-80">No. Pesanan {shopeeOrders.find((o) => o.trackingNumber?.trim().toLowerCase() === group.resiNumber.trim().toLowerCase())!.orderNumber}</span>
                              ) : null}
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-7 shrink-0 rounded-[4px] text-[var(--op-mute)]"
                              onClick={(event) => {
                                event.stopPropagation()
                                void handleCopyResi(group.resiNumber)
                              }}
                              aria-label={`Salin resi ${group.resiNumber}`}
                            >
                              <HugeiconsIcon icon={Copy01Icon} size={14} />
                            </Button>
                          </div>
                          <span className={
                            status === 'lengkap'
                              ? 'shrink-0 rounded-[4px] bg-[var(--op-ink)] px-2 py-0.5 text-[12px] font-medium text-[var(--op-canvas)]'
                              : status === 'belum-lengkap'
                                ? 'shrink-0 rounded-[4px] border border-[var(--op-warning,#ff9f0a)] px-2 py-0.5 text-[12px] text-[var(--op-warning,#ff9f0a)]'
                                : 'shrink-0 rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-surface-soft)] px-2 py-0.5 text-[12px] text-[var(--op-mute)]'
                          }>
                            {statusLabel}
                          </span>
                        </div>

                        {latest?.status === 'completed' && latest.filePath ? (
                          <div className="flex gap-3">
                            <div className="relative grid h-[100px] w-[130px] shrink-0 place-items-center overflow-hidden rounded-[4px] border border-[var(--op-hairline)] bg-black text-[11px] font-medium text-white/70">
                              Video
                              <span className="pointer-events-none absolute bottom-1 right-1 rounded-[4px] bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">▶</span>
                            </div>
                            <div className="grid min-w-0 flex-1 content-start gap-0.5">
                              {qcRow ? (
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[14px] font-semibold">QC</span>
                                  <span className={qcRow.status === 'completed' ? 'text-[13px]' : 'text-[13px] text-[var(--op-mute)]'}>
                                    {qcRow.status === 'completed' ? '✓ Selesai' : qcRow.status === 'recording' ? '… Rekam' : '× Error'}
                                  </span>
                                </div>
                              ) : null}
                              {packingRow ? (
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[14px] font-semibold">Packing {(packingRow as unknown as { mediaType?: string }).mediaType === 'photo' ? '[foto]' : '[video]'}</span>
                                  <span className={packingRow.status === 'completed' ? 'text-[13px]' : 'text-[13px] text-[var(--op-mute)]'}>
                                    {packingRow.status === 'completed' ? '✓ Selesai' : packingRow.status === 'recording' ? '… Rekam' : '× Error'} {(packingRow as unknown as { packingPayAmount?: number | null }).packingPayAmount != null ? `· Rp${new Intl.NumberFormat('id-ID').format((packingRow as unknown as { packingPayAmount: number }).packingPayAmount)}` : ''} {(packingRow as unknown as { packingPayStatus?: string | null }).packingPayStatus === 'needs_review' ? ' [!]' : ''}
                                  </span>
                                </div>
                              ) : null}
                              {packingRow && (packingRow as unknown as { packerOperatorName?: string | null }).packerOperatorName ? (
                                <div className="text-[11px] text-[var(--op-mute)]">Packer: {(packingRow as unknown as { packerOperatorName: string }).packerOperatorName}{(packingRow as unknown as { packerOperatorCode?: string | null }).packerOperatorCode ? ` · ${(packingRow as unknown as { packerOperatorCode: string }).packerOperatorCode}` : ''}</div>
                              ) : null}
                              {!packingRow && !qcRow ? <span className="text-[13px] text-[var(--op-mute)]">{group.rows.length} dokumentasi</span> : null}
                              <div className="mt-auto flex min-w-0 flex-wrap items-center gap-1.5 pt-1">
                                <span className={sharePreparing
                                  ? 'shrink-0 rounded-[4px] border border-[var(--op-warning,#ff9f0a)] bg-[var(--op-warning,#ff9f0a)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--op-warning,#ff9f0a)] animate-pulse'
                                  : shareFailed
                                    ? 'shrink-0 rounded-[4px] border border-destructive/50 px-2 py-0.5 text-[11px] text-destructive'
                                  : shareQueued
                                    ? 'shrink-0 rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-surface-soft)] px-2 py-0.5 text-[11px] text-[var(--op-mute)]'
                                    : getGroupShareStatusClassName(shareStatus.ready)}>
                                  {sharePreparing ? `Menyiapkan share ${shareProgress}%` : shareFailed ? 'Gagal menyiapkan' : shareQueued ? 'Antri share' : shareStatus.label}
                                </span>
                                {groupChatSend ? (
                                  <span className="rounded-[4px] bg-[var(--op-ink)] px-2 py-0.5 text-[11px] font-medium text-[var(--op-canvas)]">
                                    {groupChatSend.status === 'sent' ? `✓ Terkirim ke ${groupChatSend.buyerUsername}` : groupChatSend.status === 'prepared' ? `~ Siap kirim ke ${groupChatSend.buyerUsername}` : `… ${groupChatSend.status} ke ${groupChatSend.buyerUsername}`}
                                  </span>
                                ) : null}
                                <span className="min-w-0 truncate text-[12px] text-[var(--op-mute)]">
                                  {formatDateTime(latest.updatedAt)} · oleh {latest.operatorName || '-'}
                                </span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="grid gap-0.5">
                            {group.rows.some((r: RecordingRow) => r.taskType === 'qc') ? (
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[14px] font-semibold">QC</span>
                                <span className="text-[13px] text-[var(--op-mute)]">{formatStatus(qcRow?.status ?? 'error')}</span>
                              </div>
                            ) : null}
                            {group.rows.some((r: RecordingRow) => r.taskType === 'packing') ? (
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[14px] font-semibold">Packing {(packingRow as unknown as { mediaType?: string })?.mediaType === 'photo' ? '[foto]' : '[video]'}</span>
                                <span className="text-[13px] text-[var(--op-mute)]">{formatStatus(packingRow?.status ?? 'error')}{(packingRow as unknown as { packingPayAmount?: number | null })?.packingPayAmount != null ? ` · Rp${new Intl.NumberFormat('id-ID').format((packingRow as unknown as { packingPayAmount: number }).packingPayAmount)}` : ''}</span>
                              </div>
                            ) : null}
                            {packingRow && (packingRow as unknown as { packerOperatorName?: string | null }).packerOperatorName ? (
                              <div className="text-[11px] text-[var(--op-mute)]">Packer: {(packingRow as unknown as { packerOperatorName: string }).packerOperatorName}</div>
                            ) : null}
                            <span className="text-[12px] text-[var(--op-mute)]">
                              {formatDateTime(latest?.updatedAt ?? '')} · oleh {latest?.operatorName || '-'}
                            </span>
                          </div>
                        )}

                        <span className="justify-self-end text-[12px] font-medium text-[var(--op-mute)]">Lihat ›</span>
                      </div>
                      )
                    })}
                    </div>
                  </section>
                ))
              ) : (
                <div
                  className={
                    historyEmptyState?.tone === 'warning'
                      ? 'grid gap-3 rounded-[4px] border border-amber-200/50 bg-amber-500/10 px-5 py-6 text-center'
                      : 'grid gap-3 rounded-[4px] border border-dashed border-border px-5 py-6 text-center'
                  }
                >
                  <div className="flex justify-center">
                    {historyEmptyState?.tone === 'warning' ? (
                      <span className="inline-flex items-center gap-1.5 rounded-[4px] bg-amber-500/15 px-3 py-1 text-[0.7rem] font-semibold text-amber-700 dark:text-amber-200">
                        Sudah diproses{historyEmptyState.taskType ? ` · ${formatTask(historyEmptyState.taskType)}` : ''}
                      </span>
                    ) : (
                      <span className="inline-flex rounded-[4px] border border-border bg-muted/50 px-3 py-1 text-[0.7rem] font-semibold">
                        {historyEmptyState?.title ?? 'History'}
                      </span>
                    )}
                  </div>
                  <div className="grid gap-1">
                    <p className="text-sm font-medium">{historyEmptyState?.message ?? 'Belum ada history untuk akun ini.'}</p>
                    <p className="text-sm leading-relaxed text-muted-foreground">{historyEmptyState?.detail ?? 'Coba ubah filter atau scan resi lain.'}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* ——— SESSION TAB ——— */}
      {activeTab === 'session' ? (
        <SessionTab
          session={session}
          isAdmin={isAdmin}
          taskBusy={taskBusy}
          formatDateTime={formatDateTime}
          formatTask={formatTask}
          onTaskChange={(taskType) => void handleTaskChange(taskType)}
          onLogoutClick={() => setLogoutConfirmOpen(true)}
        />
      ) : null}

      <HistoryDetailSheet
        target={resolvedHistoryDetailTarget}
        sharingRecordId={sharingRecordId}
        preparingChatSendId={preparingChatSendId}
        deletingRecordId={deletingRecordId}
        preparingShareFileIds={preparingShareFileIds}
        shareProgressByRecordingId={shareProgressByRecordingId}
        sharePreparationErrors={sharePreparationErrors}
        queuedShareFileIds={queuedShareFileIds}
        preparedShareFileIds={preparedShareFileIds}
        chatSendByRecordingId={visibleChatSendByRecordingId}
        formatDateTime={formatDateTime}
        formatTask={formatTask}
        formatStatus={formatStatus}
        getGroupShareStatus={getGroupShareStatus}
        getGroupShareStatusClassName={getGroupShareStatusClassName}
        getShareStatusClassName={getShareStatusClassName}
        getShareStatusLabel={getShareStatusLabel}
        getShareStatusDescription={getShareStatusDescription}
        onOpenChange={(open) => { if (!open) setHistoryDetailTarget(null) }}
        onCopyResi={(resiNumber) => void handleCopyResi(resiNumber)}
        onShareRecording={(record, target) => void handleShareRecording(record, target)}
        onPrepareShopeeChat={(record) => void handlePrepareShopeeChat(record)}
        onDeleteClick={(record) => {
          setHistoryDeleteConfirm(record)
          setHistoryDetailTarget(null)
        }}
      />

      <HistoryDeleteDialog
        record={historyDeleteConfirm}
        deletingRecordId={deletingRecordId}
        formatTask={formatTask}
        onOpenChange={(open) => { if (!open) setHistoryDeleteConfirm(null) }}
        onConfirm={(record) => {
          void handleDeleteRecording(record)
          setHistoryDeleteConfirm(null)
        }}
      />

      {bootError ? (
        <Alert variant="destructive" className="rounded-[4px]">
          <AlertTitle>Terjadi kesalahan</AlertTitle>
          <AlertDescription>{bootError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="h-14" aria-hidden="true" />
      <BottomNav activeTab={activeTab} onChange={(tab) => openTab(tab)} />
    </main>
  )
}

export default App


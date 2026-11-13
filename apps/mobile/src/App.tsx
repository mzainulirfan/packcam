import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowDataTransferVerticalIcon,
  Copy01Icon,
  EyeIcon,
  EyeOffIcon,
  FlashlightIcon,
  FlashlightOffIcon,
  HistoryIcon,
  Logout02Icon,
  Moon02Icon,
  ScanIcon,
  SearchAreaIcon,
  ShieldAlertIcon,
  Sun03Icon,
  UserSwitchIcon,
} from '@hugeicons/core-free-icons'
import {
  closePackingSessionApi,
  createPackingSessionApi,
  reopenPackingSessionApi,
  uploadPackingPhotoApi,
  deleteServerRecordingApi,
  readRecentShopeeOrdersApi,
  readServerSettingsApi,
  loginServerOperatorApi,
  logoutServerOperatorApi,
  readServerRecordingsByResiApi,
  readServerTaskProgressByResiApi,
  readServerHistoryRecordingsApi,
  readServerSessionApi,
  readServerSystemConfigApi,
  setSessionToken,
  updateServerSessionTaskApi,
  buildApiUrl,
  prepareShopeeChatSendApi,
  readActivePackingSessionApi,
  readMyPackingSessionsApi,
  readPackingSessionApi,
  readShopeeChatSendsByRecordingIdsApi,
} from '@pakti/api-client'
import { DEFAULT_APP_SETTINGS } from '@pakti/shared/defaults'
import type { AppSettings, OperatorSession, PackingWorkSession, RecordingRow, ShopeeOrder, SystemConfig, WorkTask } from '@pakti/types'
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
  getHistorySince,
  getLatestTaskRecord,
  formatDateTime,
  formatSectionDate,
  formatStatus,
  formatTask,
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
import { getDuplicateScanNotice, getPackingQcMessage, isStopSaveBarcode, STOP_SAVE_BARCODE } from './scan/scanCopy'
import { useScanQueue } from './scan/useScanQueue'
import { HistoryDeleteDialog } from './tabs/HistoryDeleteDialog'
import { HistoryDetailSheet } from './tabs/HistoryDetailSheet'
import { SessionTab } from './tabs/SessionTab'
import packingSuccessSoundUrl from './assets/correct.mp3'
import './App.css'
import './components/MobileNavigation.css'
import './Login.css'
import './history/History.css'

type TabKey = 'scan' | 'history' | 'session'

type LoginFormState = {
  operatorName: string
  password: string
  rememberMe: boolean
}

const initialLoginForm: LoginFormState = {
  operatorName: '',
  password: '',
  rememberMe: false,
}

let packingSuccessAudio: HTMLAudioElement | null = null

function getPackingSuccessAudio() {
  if (!packingSuccessAudio && typeof window !== 'undefined' && typeof window.Audio !== 'undefined') {
    packingSuccessAudio = new window.Audio(packingSuccessSoundUrl)
    packingSuccessAudio.preload = 'auto'
  }

  return packingSuccessAudio
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

function isSameOperatorIdentity(
  left: Pick<OperatorSession, 'operatorName' | 'operatorCode'>,
  right: Pick<OperatorSession, 'operatorName' | 'operatorCode'>,
) {
  return (
    left.operatorName.trim().toLowerCase() === right.operatorName.trim().toLowerCase() &&
    left.operatorCode.trim().toLowerCase() === right.operatorCode.trim().toLowerCase()
  )
}

function formatRupiah(value: number | null | undefined) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value ?? 0)
}

function historyDateLabel(filter: HistoryDateFilter) {
  return filter === 'today' ? 'Hari ini' : filter === 'yesterday' ? 'Kemarin' : filter === 'week' ? '7 hari terakhir' : 'Semua waktu'
}

const ACTIVE_TAB_STORAGE_KEY = 'pakti_mobile_active_tab'
const THEME_STORAGE_KEY = 'pakti_mobile_theme'
const PENDING_PHOTO_RESI_KEY = 'pakti_mobile_pending_photo_resi'
const MIN_PHOTO_BYTES = 20 * 1024
const MAX_PHOTO_DIMENSION = 1600

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
  const [activePackingSession, setActivePackingSession] = useState<PackingWorkSession | null>(null)
  const [recentPackingSessions, setRecentPackingSessions] = useState<PackingWorkSession[]>([])
  const [packingSessionBusy, setPackingSessionBusy] = useState(false)
  const [packingMediaType, setPackingMediaType] = useState<'video' | 'photo'>('photo')
  const [photoCaptureBusy, setPhotoCaptureBusy] = useState(false)
  const [lastPhotoResi, setLastPhotoResi] = useState<string | null>(null)
  const [lastPhotoId, setLastPhotoId] = useState<string | null>(null)
  const [showSwitchDialog, setShowSwitchDialog] = useState(false)
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
  const [historyDateFilter, setHistoryDateFilter] = useState<HistoryDateFilter>('today')
  const historyDateFilterRef = useRef<HistoryDateFilter>('today')
  const historyRequestRef = useRef(0)
  const [historySortOrder, setHistorySortOrder] = useState<HistorySortOrder>('newest')
  const historyPullStartYRef = useRef<number | null>(null)
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null)
  const [preparingChatSendId, setPreparingChatSendId] = useState<string | null>(null)
  const [chatSendByRecordingId, setChatSendByRecordingId] = useState<Map<string, import('@pakti/types').RecordingChatSend>>(new Map())
  const [watermarkResi, setWatermarkResi] = useState<string | null>(null)
  const [, setMenuOpen] = useState(false)
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)
  const [logoutIntent, setLogoutIntent] = useState<'logout' | 'switch-account'>('logout')
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme)
  const [scanVideoElement, setScanVideoElement] = useState<HTMLVideoElement | null>(null)
  const [scannerResetToken, setScannerResetToken] = useState(0)
  const scanNoticeTimerRef = useRef<number | null>(null)
  const previousRecordingModeRef = useRef<string>('idle')
  const scanFeedbackContextRef = useRef<AudioContext | null>(null)

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
  // Lock sinkron anti double-submit (tap/scan cepat) + resi foto tertunda.
  const scanStartBusyRef = useRef(false)
  const stopScanRecordingBusyRef = useRef(false)
  const stopSaveBarcodeBusyRef = useRef(false)
  const photoBusyRef = useRef(false)
  const scannerTransitionBusyRef = useRef(false)

  const appName = systemConfig?.appName ?? 'Pakti'
  const tagline = systemConfig?.tagline ?? 'Paket Tercatat, Bukti Terjaga'
  const brandMark = systemConfig?.brandMark ?? 'PK'
  const isDarkTheme = theme === 'dark'
  const currentTaskType: WorkTask = session?.taskType ?? 'qc'
  const isPackingMode = String(currentTaskType) === 'packing'
  const isAdmin = session?.role === 'admin'
  const historyShowsAllAccounts = Boolean(isAdmin && historyAllAccounts)
  const canUsePackingFlow = !isPackingMode || Boolean(activePackingSession)
  const resumablePackingSessions = useMemo(
    () => recentPackingSessions.filter((packingSession) => {
      if (packingSession.status !== 'active' || packingSession.id === activePackingSession?.id) return false
      return session
        ? isSameOperatorIdentity(
            { operatorName: packingSession.packerOperatorName, operatorCode: packingSession.packerOperatorCode },
            session,
          )
        : false
    }),
    [activePackingSession?.id, recentPackingSessions, session],
  )
  const cameraState = useCameraStream(settings.cameraDeviceId, Boolean(session) && activeTab === 'scan', 'environment', true)
  const historyCameraState = useCameraStream(settings.cameraDeviceId, historyScanOpen, 'environment')
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
  const scannerIntervalMs = recordingSession.state.mode === 'recording' ? 700 : 180
  const scannerCanDetect =
    Boolean(session) &&
    activeTab === 'scan' &&
    canUsePackingFlow &&
    !taskBusy &&
    (recordingSession.state.mode === 'idle' || recordingSession.state.mode === 'recording')
  const scanModeLabel = isPackingMode ? 'Packing' : 'QC'
  const scanStatusLabel = cameraState.error
    ? 'Kamera error'
    : recordingSession.state.mode === 'recording'
      ? 'Merekam'
      : recordingSession.state.mode === 'stopping' || recordingSession.state.mode === 'saving'
        ? 'Menyimpan'
        : scanBusy
          ? 'Memproses'
          : isPackingMode && packingMediaType === 'photo'
            ? lastPhotoResi
              ? `Foto tersimpan: ${lastPhotoResi}`
              : `Siap scan ${scanModeLabel}`
            : recordingSession.state.lastSavedResi
              ? 'Video tersimpan'
              : `Siap scan ${scanModeLabel}`
  const scanStatusDescription = recordingSession.state.mode === 'recording'
    ? `Tekan Stop & simpan atau scan barcode ${STOP_SAVE_BARCODE}.`
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
  const scanCanStart = canUsePackingFlow && Boolean(scanResi.trim()) && Boolean(cameraState.stream) && !cameraState.error

  const {
    enqueueCameraScan,
    clearPendingCameraScans,
    processCameraScanQueue,
    stopCurrentRecording,
    setStartScanRecording,
    isRejectedResi,
    rejectResi,
    clearRejectedResi,
  } = useScanQueue({
    active: Boolean(session) && activeTab === 'scan' && canUsePackingFlow,
    recordingState: recordingSession.state,
    stopRecording: recordingSession.stopRecording,
    onStuckDrop: (resiNumber) => {
      showScanNotice({ kind: 'warning', title: 'Antrean dibuang', message: `Resi ${resiNumber} dilepas karena penyimpanan sebelumnya macet. Scan ulang.` })
    },
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

    try {
      getPackingSuccessAudio()?.load()
    } catch {
      // Ignore preload failures. The sound will load on first play.
    }
  }, [])

  const playScanFeedback = useCallback(async (kind: 'success' | 'warning', mode: 'default' | 'history' = 'default') => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(kind === 'success' ? 55 : [70, 40, 90])
    }

    if (typeof window === 'undefined') {
      return
    }

    if (kind === 'success' && mode !== 'history') {
      try {
        const audio = getPackingSuccessAudio()
        if (audio) {
          // Jangan restart bunyi yang masih berjalan agar tidak terpotong.
          // Sukses baru saat bunyi aktif diabaikan (1 bunyi per paket).
          if (!audio.paused && !audio.ended) {
            return
          }
          audio.currentTime = 0
          await audio.play()
          return
        }
      } catch {
        // Fall through to synthesized beeps below.
      }
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

  useEffect(() => {
    if (!taskBusy) {
      scannerTransitionBusyRef.current = false
    }
  }, [currentTaskType, taskBusy])

  useBarcodeScanner({
    videoElement: scanVideoElement,
    // Jangan menerima hasil detector saat task berganti atau video sedang
    // stopping/saving. Frame terakhir QC bisa masih berada di pipeline browser.
    enabled: scannerCanDetect,
    resetToken: scannerResetToken,
    resetValue: recordingSession.state.lastSavedResi,
    intervalMs: scannerIntervalMs,
    cooldownMs: 1100,
    maxScanWidth: 640,
    onDetected: (value) => {
      if (
        !session ||
        activeTab !== 'scan' ||
        taskBusy ||
        scannerTransitionBusyRef.current ||
        stopScanRecordingBusyRef.current ||
        !canUsePackingFlow ||
        (recordingSession.state.mode !== 'idle' && recordingSession.state.mode !== 'recording')
      ) {
        return
      }

      const normalizedValue = value.trim()
      if (!normalizedValue || isRejectedResi(normalizedValue)) {
        return
      }

      if (isStopSaveBarcode(normalizedValue)) {
        if (recordingSession.state.mode !== 'recording' || stopSaveBarcodeBusyRef.current) {
          return
        }

        stopSaveBarcodeBusyRef.current = true
        rejectResi(normalizedValue)
        clearPendingCameraScans()
        void stopScanRecording().finally(() => {
          stopSaveBarcodeBusyRef.current = false
        })
        return
      }

      // Bunyi deteksi khusus mode QC (packing tetap hening sampai simpan).
      if (session.taskType === 'qc') {
        void primeScanFeedbackAudio()
        void playScanFeedback('success', 'history')
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

    // Bunyi + notice sekali saat video benar-benar tersimpan (finalize sukses).
    if (previousMode === 'saving' && recordingSession.state.mode === 'idle') {
      const savedResi = recordingSession.state.lastSavedResi
      queueMicrotask(() => {
        playScanFeedback('success')
        showScanNotice({
          kind: 'success',
          title: 'Video tersimpan',
          message: savedResi ? `Resi ${savedResi} sudah tersimpan.` : 'Rekaman sudah tersimpan.',
        })
      })
    }
  }, [clearRejectedResi, processCameraScanQueue, playScanFeedback, showScanNotice, recordingSession.state.mode, recordingSession.state.lastSavedResi])

  const {
    groupedByDate,
    historyResultCount,
    historyScopeRecordings,
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
    historyAllAccounts: historyShowsAllAccounts,
    historyDateFilter,
    historySortOrder,
    historyDocStatusFilter,
  })

  const historySummaryLabels = [
    historyTaskFilter !== 'all' ? (historyTaskFilter === 'qc' ? 'QC' : 'Packing') : '',
    historyResiQuery.trim() ? `Pencarian: ${historyResiQuery.trim()}` : '',
    historyDocStatusFilter !== 'all' ? (historyDocStatusFilter === 'lengkap' ? 'Lengkap' : 'Belum lengkap') : '',
    historySortOrder !== 'newest' ? 'Terlama' : '',
    historyShowsAllAccounts ? 'Semua akun' : '',
  ].filter(Boolean)

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

    const normalizedResi = historyDetailTarget.resiNumber.trim().toLowerCase()
    const rows = historyScopeRecordings.filter((record) => record.resiNumber.trim().toLowerCase() === normalizedResi)
    if (rows.length === 0) {
      return historyDetailTarget
    }

    return {
      ...historyDetailTarget,
      rows,
    }
  }, [historyDetailTarget, historyScopeRecordings])

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
        if (!sessionPayload.session) {
          setSessionToken(null)
        }
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
      queueMicrotask(() => {
        setActivePackingSession(null)
        setRecentPackingSessions([])
      })
      return
    }

    let cancelled = false
    void Promise.all([
      readActivePackingSessionApi().catch(() => null),
      readMyPackingSessionsApi(20).catch(() => []),
    ]).then(([packingSession, sessions]) => {
      if (cancelled) return
      setActivePackingSession(packingSession)
      setRecentPackingSessions(sessions)
    })

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
        for (const s of sends) {
          map.set(s.recordingId, s)
          for (const record of recordings) {
            if (record.resiNumber.trim().toLowerCase() === s.resiNumber.trim().toLowerCase()) {
              map.set(record.id, s)
            }
          }
        }
        setChatSendByRecordingId(map)
      })
      .catch(() => {
        if (!cancelled) setChatSendByRecordingId(new Map())
      })
    return () => {
      cancelled = true
    }
  }, [recordings])

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
        rememberMe: loginForm.rememberMe,
      })

      setSession(result.session)
      setSessionToken(loginForm.rememberMe ? (result.session.sessionId ?? null) : null)
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
      setSessionToken(null)
      setActivePackingSession(null)
      setRecentPackingSessions([])
      setShowSwitchDialog(false)
      setRecordings([])
      setShopeeOrders([])
      setHistoryAllAccounts(false)
      setHistoryTaskFilter('all')
      setHistoryDateFilter('today')
      historyDateFilterRef.current = 'today'
      setHistoryResiQuery('')
      setHistoryHighlightedResi(null)
      setActiveTab('scan')
      setMenuOpen(false)
      setLogoutIntent('logout')
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
    if (blockSessionChangeWhileCapturing()) return

    setTaskBusy(true)
    scannerTransitionBusyRef.current = true
    // Antrean/input scan milik task lama tidak boleh ikut ke task baru. Token
    // juga membatalkan detector lama dan menahan barcode yang masih ada di frame
    // sampai kamera sempat melihat frame kosong.
    clearPendingCameraScans()
    clearRejectedResi()
    setScanResi('')
    setWatermarkResi(null)
    setScannerResetToken((current) => current + 1)
    try {
      window.sessionStorage.removeItem(PENDING_PHOTO_RESI_KEY)
    } catch {
      // Abaikan kegagalan storage; state in-memory tetap sudah dibersihkan.
    }
    void primeScanFeedbackAudio()

    try {
      const payload = await updateServerSessionTaskApi(nextTask)
      setSession(payload.session)
      if (nextTask === 'packing' && !activePackingSession) {
        setShowSwitchDialog(true)
      }
    } catch (error) {
      setBootError(normalizeError(error))
    } finally {
      setTaskBusy(false)
    }
  }

  const readPendingPhotoResi = useCallback(() => {
    try {
      return window.sessionStorage.getItem(PENDING_PHOTO_RESI_KEY)?.trim() || null
    } catch {
      return null
    }
  }, [])

  const writePendingPhotoResi = useCallback((resiNumber: string | null) => {
    try {
      if (resiNumber && resiNumber.trim()) {
        window.sessionStorage.setItem(PENDING_PHOTO_RESI_KEY, resiNumber.trim())
      } else {
        window.sessionStorage.removeItem(PENDING_PHOTO_RESI_KEY)
      }
    } catch {
      // Abaikan kegagalan storage; alur tetap jalan tanpa pemulihan.
    }
  }, [])

  /** Bersihkan status foto agar efek auto-capture tidak loop. Hanya hapus jika input masih resi ini. */
  const clearPendingPhotoState = useCallback((resiNumber?: string) => {
    if (resiNumber) {
      const normalized = resiNumber.trim()
      setScanResi((current) => (current.trim() === normalized ? '' : current))
    } else {
      setScanResi('')
    }
    try {
      window.sessionStorage.removeItem(PENDING_PHOTO_RESI_KEY)
    } catch {
      // Abaikan.
    }
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
      let job: import('@pakti/types').RecordingChatSend
      try {
        job = await prepareShopeeChatSendApi(record.id)
      } catch (error) {
        const message = normalizeError(error)
        if (!message.includes('Isi username pembeli Shopee')) {
          throw error
        }
        const buyerUsername = typeof window !== 'undefined'
          ? window.prompt(`Order ${record.resiNumber} belum ada/username kosong di Pakti. Isi username pembeli Shopee untuk kirim manual:`)?.trim()
          : ''
        if (!buyerUsername) {
          throw error
        }
        job = await prepareShopeeChatSendApi(record.id, null, { buyerUsername })
      }
      setChatSendByRecordingId((prev) => {
        const next = new Map(prev)
        next.set(job.recordingId, job)
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
        const progress = await readServerTaskProgressByResiApi(resiNumber)
        return progress
      } catch {
        // Fallback lama tetap dipakai bila backend belum menyediakan endpoint progress.
      }

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

  const fetchHistory = useCallback(async (date: HistoryDateFilter) => {
    if (!session) return
    const request = ++historyRequestRef.current
    setHistoryBusy(true)
    setHistoryError(null)
    try {
      const [payload, orders] = await Promise.all([
        readServerHistoryRecordingsApi({ updatedSince: getHistorySince(date) }),
        readRecentShopeeOrdersApi(100).catch(() => [] as ShopeeOrder[]),
      ])
      if (request !== historyRequestRef.current) return
      setRecordings(payload.records)
      setShopeeOrders(orders)
    } catch (error) {
      if (request === historyRequestRef.current) setHistoryError(normalizeError(error))
    } finally {
      if (request === historyRequestRef.current) setHistoryBusy(false)
    }
  }, [session])

  const refreshHistory = useCallback(async () => {
    await fetchHistory(historyDateFilterRef.current)
  }, [fetchHistory])

  const handleHistoryDateChange = useCallback((date: HistoryDateFilter) => {
    historyDateFilterRef.current = date
    setHistoryDateFilter(date)
    void fetchHistory(date)
  }, [fetchHistory])

  useEffect(() => {
    void refreshHistory()
    return () => { historyRequestRef.current += 1 }
  }, [refreshHistory])

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
    async (resiInput: string, source: 'manual' | 'camera' = 'manual'): Promise<'started' | 'duplicate' | 'queued' | 'busy' | 'error'> => {
      if (!session) {
        return 'error'
      }

      if (scanStartBusyRef.current) {
        return 'busy'
      }
      scanStartBusyRef.current = true

      if (session.taskType === 'packing' && !activePackingSession) {
        playScanFeedback('warning')
        showScanNotice({
          kind: 'warning',
          title: 'Sesi packing belum aktif',
          message: 'Mulai sesi packing sebelum scan paket.',
        })
        scanStartBusyRef.current = false
        return 'error'
      }

      const resiNumber = resiInput.trim()
      if (!resiNumber) {
        if (source === 'manual') {
          setBootError('Isi nomor resi dulu.')
        }
        scanStartBusyRef.current = false
        return 'error'
      }

      if (isStopSaveBarcode(resiNumber)) {
        if (source === 'manual') {
          showScanNotice({
            kind: 'warning',
            title: 'Barcode perintah',
            message: `Scan ${STOP_SAVE_BARCODE} saat rekaman berjalan untuk menghentikan dan menyimpan video.`,
          })
          setScanResi('')
        }
        scanStartBusyRef.current = false
        return 'error'
      }

      // Foto packing: terima langsung tanpa round-trip server. Satu-satunya validasi
      // (QC + duplikat) dikerjakan sekali di stagePhotoCapture tepat sebelum simpan.
      const isPhotoPacking = session.taskType === 'packing' && packingMediaType === 'photo'
      const taskProgress = !isPhotoPacking && session.taskType === 'packing' ? await resolveLatestTaskProgress(resiNumber) : null
      if (!isPhotoPacking && session.taskType === 'packing' && taskProgress?.qc?.status !== 'completed') {
        playScanFeedback('warning')
        showScanNotice({
          kind: 'warning',
          title: 'QC belum selesai',
          message: getPackingQcMessage(taskProgress?.qc?.status),
        })
        setScanResi('')
        scanStartBusyRef.current = false
        return 'error'
      }

      // Foto packing tidak memakai MediaRecorder: scan resi langsung memicu capture dan simpan.
      if (isPhotoPacking) {
        setScanBusy(true)
        void primeScanFeedbackAudio()
        try {
          clearRejectedResi()
          setWatermarkResi(resiNumber)
          setScanResi(resiNumber)
          writePendingPhotoResi(resiNumber)
          return 'started'
        } catch (error) {
          setWatermarkResi((current) => (current === resiNumber ? null : current))
          setBootError(normalizeError(error))
          return 'error'
        } finally {
          setScanBusy(false)
          scanStartBusyRef.current = false
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
          scanStartBusyRef.current = false
          return 'queued'
        }

        setWatermarkResi(resiNumber)
        await recordingSession.startRecording(resiNumber)

        if (source === 'camera') {
          showScanNotice({
            kind: 'success',
            title: 'Merekam',
            message: `Resi ${resiNumber} masuk ke ${formatTask(session.taskType)}. Tekan stop setelah selesai.`,
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
        scanStartBusyRef.current = false
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
      writePendingPhotoResi,
    ],
  )

  useEffect(() => {
    setStartScanRecording(startScanRecording)
  }, [setStartScanRecording, startScanRecording])

  const refreshActivePackingSession = useCallback(async () => {
    try {
      const [packingSession, sessions] = await Promise.all([
        readActivePackingSessionApi(),
        readMyPackingSessionsApi(20).catch(() => []),
      ])
      setActivePackingSession(packingSession)
      setRecentPackingSessions(sessions)
      return packingSession
    } catch {
      setActivePackingSession(null)
      return null
    }
  }, [])

  const [discardErrorBusy, setDiscardErrorBusy] = useState(false)

  async function handleDiscardRecordingError() {
    if (discardErrorBusy || recordingSession.state.mode !== 'error') return
    setDiscardErrorBusy(true)
    try {
      await recordingSession.discardErrorDraft()
      clearRejectedResi()
      setScannerResetToken((current) => current + 1)
      showScanNotice({ kind: 'success', title: 'Siap lagi', message: 'Draft gagal dibuang. Scan ulang untuk mulai rekaman baru.' })
    } finally {
      setDiscardErrorBusy(false)
    }
  }

  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)
  const [cancelRecordingBusy, setCancelRecordingBusy] = useState(false)

  /** Batalkan rekaman yang sedang jalan: video dibuang, kamera tetap aktif. */
  async function handleCancelRecording() {
    if (cancelRecordingBusy || recordingSession.state.mode !== 'recording') {
      setCancelConfirmOpen(false)
      return
    }
    setCancelConfirmOpen(false)
    setCancelRecordingBusy(true)
    setScanBusy(true)
    try {
      await recordingSession.cancelRecording()
      setScanResi('')
      playScanFeedback('warning')
      showScanNotice({
        kind: 'warning',
        title: 'Rekaman dibatalkan',
        message: 'Video tidak disimpan. Scan resi untuk mulai rekaman baru.',
      })
    } catch (error) {
      setBootError(normalizeError(error))
    } finally {
      setScanBusy(false)
      setCancelRecordingBusy(false)
    }
  }

  const stopScanRecording = useCallback(async () => {
    if (!session) {
      return
    }
    if (stopScanRecordingBusyRef.current) {
      return
    }
    // Saat recording, tombol stop harus langsung responsif walau scanBusy masih true.
    if (scanBusy && recordingSession.state.mode !== 'recording') {
      return
    }

    stopScanRecordingBusyRef.current = true
    setScanBusy(true)
    void primeScanFeedbackAudio()

    try {
      const stoppedResi = recordingSession.state.activeResi ?? recordingSession.state.savingResi
      await stopCurrentRecording()
      if (stoppedResi) {
        // Merge lokal per resi saja, tanpa unduh ulang seluruh history.
        readServerRecordingsByResiApi(stoppedResi)
          .then((rows) => mergeRecordingsForResi(stoppedResi, rows))
          .catch(() => undefined)
      }
      if (session.taskType === 'packing' && activePackingSession) {
        void readPackingSessionApi(activePackingSession.id).then(setActivePackingSession).catch(() => void refreshActivePackingSession())
      }
    } catch (error) {
      setBootError(normalizeError(error))
    } finally {
      setScanBusy(false)
      stopScanRecordingBusyRef.current = false
    }
  }, [activePackingSession, mergeRecordingsForResi, primeScanFeedbackAudio, refreshActivePackingSession, scanBusy, session, stopCurrentRecording])

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

  async function handleStartPackingSession() {
    if (packingSessionBusy || !session) return
    if (session.taskType !== 'packing') {
      showScanNotice({ kind: 'warning', title: 'Mode packing diperlukan', message: 'Ubah task ke packing sebelum memulai sesi.' })
      return
    }
    setPackingSessionBusy(true)
    try {
      const packingSession = await createPackingSessionApi()
      setActivePackingSession(packingSession)
      setShowSwitchDialog(false)
      void readMyPackingSessionsApi(20).then(setRecentPackingSessions).catch(() => undefined)
      showScanNotice({
        kind: 'success',
        title: 'Sesi packing aktif',
        message: `${packingSession.packerNameSnapshot} mulai packing dengan akun sendiri.`,
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

  /** True saat ada rekam/capture/simpan berjalan — sesi tidak boleh diganti/ditutup. */
  function isCaptureActive() {
    return (
      recordingSession.state.mode !== 'idle' ||
      scanBusy ||
      scanStartBusyRef.current ||
      photoCaptureBusy ||
      photoBusyRef.current
    )
  }

  function blockSessionChangeWhileCapturing() {
    if (!isCaptureActive()) return false
    showScanNotice({ kind: 'warning', title: 'Proses scan berjalan', message: 'Tunggu proses rekaman/foto/scan selesai sebelum ganti sesi.' })
    return true
  }

  function requestAccountSwitch() {
    if (blockSessionChangeWhileCapturing()) return
    setShowSwitchDialog(false)
    setLogoutIntent('switch-account')
    setLogoutConfirmOpen(true)
  }

  async function handleClosePackingSession() {
    if (packingSessionBusy || !activePackingSession) return
    if (blockSessionChangeWhileCapturing()) return
    setPackingSessionBusy(true)
    try {
      const closed = await closePackingSessionApi(activePackingSession.id)
      setActivePackingSession(null)
      void readMyPackingSessionsApi(20).then(setRecentPackingSessions).catch(() => undefined)
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

  async function handleReopenPackingSession(sessionToReopen: PackingWorkSession) {
    if (packingSessionBusy || !session) return
    if (blockSessionChangeWhileCapturing()) return
    if (!isSameOperatorIdentity({ operatorName: sessionToReopen.packerOperatorName, operatorCode: sessionToReopen.packerOperatorCode }, session)) {
      showScanNotice({ kind: 'warning', title: 'Akses dibatasi', message: 'Sesi ini bukan milik akun yang sedang login.' })
      return
    }
    if (activePackingSession?.id === sessionToReopen.id) {
      setShowSwitchDialog(false)
      return
    }

    const shouldReleaseActive = true
    if (shouldReleaseActive) {
      const confirmed = activePackingSession && activePackingSession.id !== sessionToReopen.id
        ? window.confirm(`Lepas sesi ${activePackingSession.packerNameSnapshot} dari device ini dan lanjutkan sesi ${sessionToReopen.packerNameSnapshot}? Sesi lama tidak diakhiri.`)
        : true
      if (!confirmed) return
    }

    setPackingSessionBusy(true)
    try {
      const reopened = await reopenPackingSessionApi(sessionToReopen.id, { releaseActive: shouldReleaseActive })
      setActivePackingSession(reopened)
      setShowSwitchDialog(false)
      showScanNotice({ kind: 'success', title: 'Sesi dilanjutkan', message: `${reopened.packerNameSnapshot} · ${reopened.completedPackingCount} paket · ${formatRupiah(reopened.totalPayAmount)}.` })
      void readMyPackingSessionsApi(20).then(setRecentPackingSessions).catch(() => undefined)
    } catch (error) {
      showScanNotice({ kind: 'warning', title: 'Gagal lanjutkan sesi', message: normalizeError(error) })
      void refreshActivePackingSession()
    } finally {
      setPackingSessionBusy(false)
    }
  }

  const stagePhotoCapture = useCallback(async (overrideResi?: string) => {
    const rawResi = (overrideResi ?? scanResi).trim()
    if (!session || packingMediaType !== 'photo' || !canUsePackingFlow || photoCaptureBusy || photoBusyRef.current || !scanVideoElement || !rawResi) return
    photoBusyRef.current = true
    const resiNumber = rawResi
    if (session.taskType === 'packing') {
      // Tolak instan yang jelas-jelas duplikat dari cache lokal (gratis).
      // Validasi otoritatif (QC + duplikat) dikerjakan server dalam 1 request simpan.
      const localDuplicate = recordings.find(
        (r) => r.resiNumber.trim() === resiNumber && r.taskType === 'packing' && !(lastPhotoId && r.id === lastPhotoId),
      )
      if (localDuplicate) {
        photoBusyRef.current = false
        playScanFeedback('warning')
        rejectResi(resiNumber)
        const notice = getDuplicateScanNotice({ existing: localDuplicate, taskType: 'packing', taskProgressQcStatus: undefined, formatTask })
        showScanNotice({ kind: 'warning', title: notice.title, message: notice.message })
        clearPendingPhotoState(resiNumber)
        return
      }
    }
    // Kunci sesi packing saat scan diterima agar tersimpan ke sesi yang benar.
    const lockedPackingSessionId = session.taskType === 'packing' ? (activePackingSession?.id ?? null) : null
    setPhotoCaptureBusy(true)
    try {
      const video = scanVideoElement
      if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
        throw new Error('Kamera belum siap. Tunggu gambar muncul lalu coba lagi.')
      }
      // Downscale agar upload kecil (maks 1600px, q0.85): simpan sekali tembak jadi cepat.
      const scale = Math.min(1, MAX_PHOTO_DIMENSION / Math.max(video.videoWidth, video.videoHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas tidak tersedia.')
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
      if (!blob) throw new Error('Gagal mengambil foto.')
      if (blob.size < MIN_PHOTO_BYTES) {
        throw new Error('Foto tidak valid (terlalu kecil/gelap). Arahkan kamera ke paket lalu coba lagi.')
      }
      // Sekali tembak: validasi QC + duplikat + simpan di server dalam 1 round-trip.
      const saved = await uploadPackingPhotoApi({ resiNumber, packingSessionId: lockedPackingSessionId ?? '', photo: blob })
      playScanFeedback('success')
      const savedPay = (saved as unknown as { packingPayAmount?: number | null }).packingPayAmount
      showScanNotice({
        kind: 'success',
        title: 'Foto packing tersimpan',
        message: savedPay != null ? `Resi ${resiNumber} · ${formatRupiah(savedPay)}` : `Resi ${resiNumber} sudah tersimpan.`,
      })
      setLastPhotoResi(resiNumber)
      setLastPhotoId(saved.id)
      // Hapus input hanya jika masih resi ini (bisa sudah tertimpa scan berikutnya).
      setScanResi((current) => (current.trim() === resiNumber ? '' : current))
      if (readPendingPhotoResi() === resiNumber) writePendingPhotoResi(null)
      mergeRecordingsForResi(resiNumber, [saved])
      if (activePackingSession) void readPackingSessionApi(activePackingSession.id).then(setActivePackingSession).catch(() => void refreshActivePackingSession())
    } catch (error) {
      playScanFeedback('warning')
      showScanNotice({ kind: 'warning', title: 'Gagal simpan foto', message: normalizeError(error) })
      clearPendingPhotoState(resiNumber)
    } finally {
      photoBusyRef.current = false
      setPhotoCaptureBusy(false)
    }
  }, [activePackingSession, canUsePackingFlow, clearPendingPhotoState, lastPhotoId, mergeRecordingsForResi, packingMediaType, photoCaptureBusy, playScanFeedback, readPendingPhotoResi, recordings, refreshActivePackingSession, rejectResi, scanResi, scanVideoElement, session, showScanNotice, writePendingPhotoResi])

  // Otomatis ambil dan simpan foto ketika scan berhasil di mode foto.
  useEffect(() => {
    if (!isPackingMode || packingMediaType !== 'photo' || !scanResi.trim() || photoCaptureBusy || scanBusy || !canUsePackingFlow || recordingSession.state.mode !== 'idle' || !scanVideoElement) return
    const resi = scanResi.trim()
    if (lastPhotoResi === resi && lastPhotoId) {
      const stillExists = recordings.some((r) => r.id === lastPhotoId && r.resiNumber.trim() === resi)
      if (stillExists) return
      setLastPhotoResi(null)
      setLastPhotoId(null)
    }
    const timer = window.setTimeout(() => {
      void stagePhotoCapture(resi)
    }, 120)
    return () => window.clearTimeout(timer)
  }, [scanResi, packingMediaType, isPackingMode, photoCaptureBusy, scanBusy, canUsePackingFlow, recordingSession.state.mode, scanVideoElement, lastPhotoId, lastPhotoResi, stagePhotoCapture, recordings])

  const pendingPhotoRestoredRef = useRef(false)
  // Pulihkan foto tertunda (HP di-background/dimuat ulang sebelum capture jalan).
  useEffect(() => {
    if (!session || pendingPhotoRestoredRef.current) return
    pendingPhotoRestoredRef.current = true
    queueMicrotask(() => {
      const pending = readPendingPhotoResi()
      if (!pending || session.taskType !== 'packing' || packingMediaType !== 'photo') return
      void findRecordingByResi(pending, 'packing').then((existing) => {
        if (existing) {
          writePendingPhotoResi(null)
          return
        }
        setScanResi(pending)
        showScanNotice({ kind: 'warning', title: 'Lanjutkan foto tertunda', message: `Resi ${pending} belum tersimpan. Foto otomatis diambil ulang.` })
      }).catch(() => undefined)
    })
  }, [session, packingMediaType, findRecordingByResi, readPendingPhotoResi, writePendingPhotoResi, showScanNotice])

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible' || !session || session.taskType !== 'packing' || packingMediaType !== 'photo') return
      if (scanResi.trim()) return
      const pending = readPendingPhotoResi()
      if (!pending) return
      void findRecordingByResi(pending, 'packing').then((existing) => {
        if (existing) {
          writePendingPhotoResi(null)
          return
        }
        setScanResi(pending)
        showScanNotice({ kind: 'warning', title: 'Lanjutkan foto tertunda', message: `Resi ${pending} belum tersimpan. Foto otomatis diambil ulang.` })
      }).catch(() => undefined)
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [session, packingMediaType, scanResi, findRecordingByResi, readPendingPhotoResi, writePendingPhotoResi, showScanNotice])

  async function handleDeleteRecording(record: RecordingRow) {
    if (deletingRecordId) {
      return
    }

    setDeletingRecordId(record.id)
    setHistoryError(null)

    try {
      await deleteServerRecordingApi(record.id)
      setRecordings((current) => current.filter((item) => item.id !== record.id))
      if (record.resiNumber.trim() === lastPhotoResi?.trim()) {
        setLastPhotoResi(null)
        setLastPhotoId(null)
      }
      if (record.resiNumber.trim() === scanResi.trim()) {
        setScanResi('')
      }
      setWatermarkResi((current) => (current === record.resiNumber ? null : current))
      clearRejectedResi(record.resiNumber)
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
        className="mobile-app mobile-app--auth login-page"
        onPointerDownCapture={() => {
          void primeScanFeedbackAudio()
        }}
      >
        <header className="login-brand">
          <div className="login-brand-identity">
            <span className="brand-badge">{brandMark}</span>
            <div><h1>{appName}</h1><p>Pakti Mobile</p></div>
          </div>
          <Button type="button" variant="outline" size="icon" onClick={toggleTheme} aria-label={isDarkTheme ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}>
            <HugeiconsIcon icon={isDarkTheme ? Sun03Icon : Moon02Icon} size={18} />
          </Button>
        </header>
        <section className="login-panel" aria-labelledby="login-title">
          <div className="login-intro">
            <h2 id="login-title">Masuk ke akun Anda</h2>
            <p>Gunakan akun operator untuk mulai bekerja.</p>
          </div>

          <form className="login-form" aria-busy={loginBusy} onSubmit={handleLogin}>
            <div className="grid gap-2">
              <Label htmlFor="mobile-operator-name" className="login-label">Username</Label>
                <Input
                  id="mobile-operator-name"
                  value={loginForm.operatorName}
                  onChange={(event) => {
                    setLoginForm((current) => ({ ...current, operatorName: event.target.value }))
                    if (bootError) setBootError(null)
                  }}
                  name="username"
                  disabled={loginBusy}
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="Masukkan username"
                  className="h-11 rounded-[4px] border-[var(--op-hairline)] bg-[var(--op-canvas)]"
                  required
                />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="mobile-password" className="login-label">Password</Label>
              <div className="relative">
                <Input
                  id="mobile-password"
                  type={showLoginPassword ? 'text' : 'password'}
                  value={loginForm.password}
                  onChange={(event) => {
                    setLoginForm((current) => ({ ...current, password: event.target.value }))
                    if (bootError) setBootError(null)
                  }}
                  name="password"
                  disabled={loginBusy}
                  autoComplete="current-password"
                  placeholder="Masukkan password"
                  className="h-11 rounded-[4px] border-[var(--op-hairline)] bg-[var(--op-canvas)] pr-12"
                  required
                />
                <button
                  type="button"
                  className="login-password-toggle"
                  disabled={loginBusy}
                  aria-pressed={showLoginPassword}
                  onClick={() => setShowLoginPassword((current) => !current)}
                  aria-label={showLoginPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                >
                  {showLoginPassword ? <HugeiconsIcon icon={EyeOffIcon} size={16} /> : <HugeiconsIcon icon={EyeIcon} size={16} />}
                </button>
              </div>
            </div>

            <label htmlFor="mobile-remember" className="login-remember">
              <input
                id="mobile-remember"
                type="checkbox"
                disabled={loginBusy}
                checked={loginForm.rememberMe}
                onChange={(event) => {
                  setLoginForm((current) => ({ ...current, rememberMe: event.target.checked }))
                }}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-black"
              />
              <span className="grid gap-0.5">
                <span className="text-[13px] font-bold">Tetap masuk</span>
                <span className="text-[12px] leading-relaxed text-[var(--op-mute)]">Gunakan hanya di perangkat pribadi.</span>
              </span>
            </label>

            {bootError ? (
              <Alert variant="destructive" className="login-error" role="alert">
                <AlertTitle>Gagal masuk</AlertTitle>
                <AlertDescription>{bootError}</AlertDescription>
              </Alert>
            ) : null}

            <Button
              type="submit"
              className="login-submit"
              disabled={loginBusy || !loginForm.operatorName.trim() || !loginForm.password}
            >
              {loginBusy ? 'Memverifikasi...' : 'Masuk'}
            </Button>
          </form>
          <p className="login-help">Belum punya akun atau lupa password?<br />Hubungi admin untuk bantuan akses.</p>
        </section>
        <p className="login-tagline">{tagline}</p>
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
      <header className="mobile-topbar">
        <div className="mobile-topbar-brand">
          <span className="mobile-topbar-mark" aria-hidden="true">{brandMark}</span>
          <div className="mobile-topbar-identity">
            <h1>{appName}</h1>
            <span>Mobile</span>
          </div>
        </div>
        <div className="mobile-topbar-actions">
          <Button type="button" variant="ghost" size="icon" onClick={toggleTheme}
            aria-label={isDarkTheme ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}>
            <HugeiconsIcon icon={isDarkTheme ? Sun03Icon : Moon02Icon} size={18} />
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={() => {
            setLogoutIntent('logout')
            setLogoutConfirmOpen(true)
          }} aria-label="Keluar">
            <HugeiconsIcon icon={Logout02Icon} size={18} />
          </Button>
        </div>
      </header>

      <Dialog open={logoutConfirmOpen} onOpenChange={setLogoutConfirmOpen}>
        <DialogContent className="account-logout-dialog rounded-[4px] border-border bg-popover text-popover-foreground">
          <DialogHeader>
            <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-[4px] border border-destructive/30 bg-[var(--op-canvas)] text-destructive">
              <HugeiconsIcon icon={ShieldAlertIcon} size={18} />
            </div>
            <DialogTitle>{logoutIntent === 'switch-account' ? 'Ganti akun sekarang?' : 'Keluar sekarang?'}</DialogTitle>
            <DialogDescription>
              {logoutIntent === 'switch-account'
                ? 'Sesi packing tetap tersimpan dan dapat dilanjutkan kembali. Akun berikutnya wajib login dengan passwordnya sendiri.'
                : 'Sesi login akan ditutup. Sesi packing aktif tetap tersimpan untuk dilanjutkan kembali.'}
            </DialogDescription>
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
              {logoutIntent === 'switch-account' ? 'Keluar & ganti akun' : 'Keluar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
        <DialogContent className="rounded-[4px] border-border bg-popover text-popover-foreground">
          <DialogHeader>
            <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-[4px] border border-destructive/30 bg-[var(--op-canvas)] text-destructive">
              <HugeiconsIcon icon={ShieldAlertIcon} size={18} />
            </div>
            <DialogTitle>Batalkan rekaman?</DialogTitle>
            <DialogDescription>
              Video {recordingSession.state.activeResi ? `resi ${recordingSession.state.activeResi}` : 'yang sedang direkam'} dibuang dan tidak masuk history. Kamera tetap menyala.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-0 bg-transparent pt-2">
            <Button type="button" variant="ghost" className="rounded-[4px]" onClick={() => setCancelConfirmOpen(false)}>
              Lanjut rekam
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="rounded-[4px]"
              disabled={cancelRecordingBusy || recordingSession.state.mode !== 'recording'}
              onClick={() => void handleCancelRecording()}
            >
              {cancelRecordingBusy ? 'Membatalkan...' : 'Buang rekaman'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ——— SCAN TAB ——— */}
      {activeTab === 'scan' ? (
        <section className={isPackingMode ? 'packing-scan-layout is-packing' : 'packing-scan-layout'}>

            <Dialog open={showSwitchDialog} onOpenChange={setShowSwitchDialog}>
              <DialogContent className="flex max-h-[72vh] max-w-sm flex-col overflow-hidden rounded-[4px] border-[var(--op-hairline)] bg-[var(--op-canvas)] p-0 text-[var(--op-ink)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                <DialogHeader className="shrink-0 border-b border-[var(--op-hairline)] px-4 pb-3 pt-4">
                  <DialogTitle className="text-[var(--op-ink)]">Sesi Packing Saya</DialogTitle>
                  <DialogDescription className="text-[12px] leading-snug text-muted-foreground">
                    Semua hasil packing dicatat ke akun login {session.operatorName} ({session.operatorCode}).
                  </DialogDescription>
                </DialogHeader>

                {activePackingSession ? (
                  <div className="shrink-0 border-b border-[var(--op-hairline)] bg-[var(--op-surface-soft)] px-4 py-3">
                    <div className="flex items-start gap-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-[4px] bg-[var(--op-ink)] font-mono text-xs font-bold text-[var(--op-canvas)]" aria-hidden>
                        {activePackingSession.packerNameSnapshot.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="m-0 truncate text-sm font-bold leading-none">{activePackingSession.packerNameSnapshot}</p>
                        <p className="m-0 mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                          <span>{activePackingSession.packerCodeSnapshot}</span>
                          <span className="rounded bg-[var(--op-ink)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--op-canvas)]">Aktif</span>
                        </p>
                        <p className="m-0 mt-1 text-xs text-muted-foreground">{activePackingSession.completedPackingCount} paket · {formatRupiah(activePackingSession.totalPayAmount)} · {formatDateTime(activePackingSession.startedAt)}</p>
                      </div>
                      <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 rounded-[4px] px-2 text-xs text-muted-foreground hover:text-destructive" disabled={packingSessionBusy} onClick={() => void handleClosePackingSession()}>
                        Akhiri
                      </Button>
                    </div>
                  </div>
                ) : null}

                <div className="flex-1 overflow-y-auto px-4 py-3">
                  <div className="grid gap-2">
                    <p className="m-0 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Sesi aktif saya yang lain</p>
                    {resumablePackingSessions.length === 0 ? (
                      <div className="rounded-[4px] border border-dashed border-[var(--op-hairline)] bg-[var(--op-surface-soft)] px-3 py-5 text-center">
                        <p className="m-0 text-sm font-medium text-muted-foreground">Belum ada sesi untuk dilanjutkan</p>
                      </div>
                    ) : resumablePackingSessions.map((packingSession) => (
                      <button
                        key={packingSession.id}
                        type="button"
                        className="rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-canvas)] px-3 py-3 text-left text-[var(--op-ink)] hover:bg-[var(--op-surface-soft)] disabled:opacity-45"
                        disabled={packingSessionBusy}
                        onClick={() => void handleReopenPackingSession(packingSession)}
                      >
                        <span className="flex items-center justify-between gap-2 text-sm font-bold leading-tight">
                          <span className="truncate">Mulai {formatDateTime(packingSession.startedAt)}</span>
                          <span className="shrink-0 rounded bg-[var(--op-ink)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--op-canvas)]">Lanjutkan</span>
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {packingSession.completedPackingCount} paket · {formatRupiah(packingSession.totalPayAmount)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid shrink-0 gap-2 border-t border-[var(--op-hairline)] bg-[var(--op-canvas)] px-4 py-3">
                  {!activePackingSession ? (
                    <Button type="button" className="h-9 w-full rounded-[4px] text-xs" disabled={packingSessionBusy} onClick={() => void handleStartPackingSession()}>
                      {packingSessionBusy ? 'Memulai...' : 'Mulai sesi saya'}
                    </Button>
                  ) : null}
                  <Button type="button" variant="outline" className="h-9 w-full gap-2 rounded-[4px] text-xs" disabled={packingSessionBusy} onClick={requestAccountSwitch}>
                    <HugeiconsIcon icon={UserSwitchIcon} size={15} />
                    Ganti akun
                  </Button>
                  <Button type="button" variant="ghost" className="h-8 w-full rounded-[4px] text-xs" onClick={() => setShowSwitchDialog(false)} disabled={packingSessionBusy}>
                    Tutup
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

          <div className="packing-scan-manifest">
            <div className="flex w-full items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="packing-scan-eyebrow">{isPackingMode ? 'Sedang packing' : 'Sedang QC'}</p>
                <div className="packing-scan-title-row">
                  {isPackingMode ? (
                    activePackingSession ? (
                      <button
                        type="button"
                        className="packing-scan-packer-button"
                        onClick={() => setShowSwitchDialog(true)}
                        aria-label="Kelola sesi packing saya"
                      >
                        <span className="packing-scan-packer-icon" aria-hidden="true">
                          <HugeiconsIcon icon={UserSwitchIcon} size={14} strokeWidth={1.9} />
                        </span>
                        <span className="packing-scan-packer-name">{activePackingSession.packerNameSnapshot}</span>
                        <span className="packing-scan-packer-chevron" aria-hidden="true">
                          <HugeiconsIcon icon={ArrowDataTransferVerticalIcon} size={14} strokeWidth={1.9} />
                        </span>
                      </button>
                    ) : (
                      <p className="packing-scan-title">Belum ada sesi</p>
                    )
                  ) : (
                    <p className="packing-scan-title">{session.operatorName || session.operatorCode || '-'}</p>
                  )}
                </div>
                <p className="packing-scan-meta">
                  {isPackingMode
                    ? activePackingSession
                      ? `${activePackingSession.completedPackingCount} paket · ${formatRupiah(activePackingSession.totalPayAmount)}`
                      : 'Mulai sesi sebelum scan'
                    : recordingSession.state.lastSavedResi
                      ? `Terakhir: ${recordingSession.state.lastSavedResi}`
                      : 'Scan resi untuk mulai QC'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {isPackingMode ? (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={packingMediaType === 'photo'}
                    aria-label="Toggle foto atau video"
                    title={activePackingSession ? 'Ganti mode bukti' : 'Mulai sesi dulu untuk ganti mode'}
                    disabled={!activePackingSession || recordingSession.state.mode !== 'idle' || photoCaptureBusy}
                    className={packingMediaType === 'photo' ? 'packing-scan-toggle is-photo' : 'packing-scan-toggle'}
                    onClick={() => setPackingMediaType((prev) => (prev === 'photo' ? 'video' : 'photo'))}
                  >
                    <span className={packingMediaType === 'video' ? 'packing-scan-toggle__option is-active' : 'packing-scan-toggle__option'}>Video</span>
                    <span className={packingMediaType === 'photo' ? 'packing-scan-toggle__option is-active' : 'packing-scan-toggle__option'}>Foto</span>
                    <span className="packing-scan-toggle__thumb" aria-hidden="true" />
                  </button>
                ) : null}
                {isPackingMode && cameraState.torch.supported ? (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={cameraState.torch.on}
                    aria-label={cameraState.torch.on ? 'Matikan senter' : 'Nyalakan senter'}
                    title={cameraState.torch.on ? 'Matikan senter' : 'Nyalakan senter'}
                    disabled={!cameraState.stream || Boolean(cameraState.error) || cameraState.torch.busy}
                    className={cameraState.torch.on ? 'packing-scan-chip packing-scan-chip--active' : 'packing-scan-chip'}
                    onClick={() => void cameraState.torch.toggle()}
                  >
                    <HugeiconsIcon icon={cameraState.torch.on ? FlashlightIcon : FlashlightOffIcon} size={14} />
                  </button>
                ) : null}
                {isAdmin ? (
                  <div className="grid h-[30px] w-[82px] shrink-0 grid-cols-2 gap-0 rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-canvas)] p-[2px]">
                    <button
                      type="button"
                      onClick={() => void handleTaskChange('qc')}
                      disabled={taskBusy || session.taskType === 'qc'}
                      className={session.taskType === 'qc' ? 'grid place-items-center rounded-[3px] bg-[var(--op-ink)] text-[10px] font-bold text-[var(--op-canvas)]' : 'grid place-items-center text-[10px] font-bold text-[var(--op-mute)]'}
                    >
                      QC
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleTaskChange('packing')}
                      disabled={taskBusy || session.taskType === 'packing'}
                      className={session.taskType === 'packing' ? 'grid place-items-center rounded-[3px] bg-[var(--op-ink)] text-[10px] font-bold text-[var(--op-canvas)]' : 'grid place-items-center text-[10px] font-bold text-[var(--op-mute)]'}
                    >
                      Pack
                    </button>
                  </div>
                ) : null}
                {isPackingMode && activePackingSession ? (
                  <button type="button" className="packing-scan-chip" disabled={packingSessionBusy} onClick={() => void handleClosePackingSession()} aria-label="Akhiri sesi packing">
                    <HugeiconsIcon icon={Logout02Icon} size={14} />
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          {isPackingMode && !activePackingSession ? (
            <div className="rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-canvas)] p-4 text-[var(--op-ink)]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              <p className="m-0 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">[ Sesi Packing ]</p>
              <p className="m-0 mt-1 text-sm font-bold leading-tight text-[var(--op-ink)]">Packing sebagai {session.operatorName}</p>
              <p className="m-0 mt-1 text-xs leading-snug text-muted-foreground">Hasil dan upah packing selalu dicatat ke akun yang sedang login.</p>
              <div className="mt-3 grid gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="h-9 w-full rounded-[4px] text-xs"
                  onClick={() => {
                    if (resumablePackingSessions.length > 0) setShowSwitchDialog(true)
                    else void handleStartPackingSession()
                  }}
                  disabled={packingSessionBusy}
                >
                  {packingSessionBusy ? 'Memproses...' : resumablePackingSessions.length > 0 ? 'Lanjutkan sesi saya' : 'Mulai sesi saya'}
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-9 w-full gap-2 rounded-[4px] text-xs" onClick={requestAccountSwitch} disabled={packingSessionBusy}>
                  <HugeiconsIcon icon={UserSwitchIcon} size={15} />
                  Ganti akun
                </Button>
              </div>
            </div>
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
              topSlot={null}
              centerSlot={
                <div className="packing-scan-viewfinder-status">
                  <div className="packing-scan-dot" />
                  <p className="packing-scan-viewfinder-title">{currentRecordingResi ? `Resi ${currentRecordingResi}` : scanStatusLabel}</p>
                  <p className="packing-scan-viewfinder-sub">{scanStatusDescription}</p>
                </div>
              }
              bottomSlot={null}
            />
          </div>

          <div className="packing-scan-sheet">
            <Label htmlFor="mobile-scan-resi-flow" className="packing-scan-sheet__label">Nomor resi</Label>
            <div className="packing-scan-input-wrap">
              <HugeiconsIcon icon={ScanIcon} className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
              <Input
                id="mobile-scan-resi-flow"
                value={scanResi}
                onChange={(event) => setScanResi(event.target.value)}
                placeholder={isPackingMode && packingMediaType === 'photo' ? 'Scan resi -> auto foto' : 'Scan barcode atau ketik resi'}
                inputMode="text"
                autoCapitalize="characters"
                className="packing-scan-input"
                disabled={!canUsePackingFlow}
              />
            </div>
            <p className="packing-scan-helper">{scanCanStart || recordingSession.state.mode === 'recording' ? `Bukti ${formatTask(currentTaskType)} siap direkam.` : isPackingMode ? 'Terkunci - mulai sesi, scan resi, dan pastikan kamera aktif.' : 'Scan resi dan pastikan kamera aktif untuk mulai rekam.'}</p>
            {recordingSession.state.mode === 'error' ? (
              <div className="rounded-[4px] border border-red-300 bg-red-50 p-3">
                <p className="m-0 text-xs font-bold text-red-800">Rekaman gagal: {recordingSession.state.message}</p>
                <p className="m-0 mt-1 text-[11px] leading-snug text-red-700">Scanner berhenti agar tidak nyangkut. Buang draft gagal lalu scan ulang.</p>
                <Button type="button" className="mt-2 h-9 w-full rounded-[4px] text-xs" disabled={discardErrorBusy} onClick={() => void handleDiscardRecordingError()}>
                  {discardErrorBusy ? 'Membuang...' : 'Buang draft & coba lagi'}
                </Button>
              </div>
            ) : null}
            {isPackingMode && packingMediaType === 'photo' ? (
              <div className="rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-canvas)] p-3" aria-live="polite">
                <p className="m-0 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Foto otomatis</p>
                <p className="m-0 mt-1 text-sm font-bold leading-tight text-[var(--op-ink)]">
                  {photoCaptureBusy
                    ? `Menyimpan foto ${scanResi.trim() || '…'}…`
                    : scanResi.trim()
                      ? `Resi ${scanResi.trim()} — foto jalan otomatis…`
                      : 'Scan resi, foto tersimpan sendiri'}
                </p>
              </div>
            ) : (
              <>
                <Button
                  type="button"
                  className="packing-scan-cta"
                  disabled={
                    scanBusy ||
                    !canUsePackingFlow ||
                    !cameraState.stream ||
                    Boolean(cameraState.error) ||
                    recordingSession.state.mode === 'stopping' ||
                    recordingSession.state.mode === 'saving' ||
                    recordingSession.state.mode === 'error' ||
                    (recordingSession.state.mode === 'idle' && !scanResi.trim())
                  }
                  onClick={() => {
                    if (recordingSession.state.mode === 'recording') {
                      void stopScanRecording()
                      return
                    }
                    void startScanRecording(scanResi, 'manual').then((result) => {
                      if (result === 'busy') {
                        showScanNotice({ kind: 'warning', title: 'Sedang memproses', message: 'Tunggu sebentar lalu coba lagi.' })
                      }
                    })
                  }}
                >
                  <HugeiconsIcon icon={ScanIcon} size={16} />
                  {recordingSession.state.mode === 'recording' ? 'Stop & simpan' : scanPrimaryActionLabel}
                </Button>
                {recordingSession.state.mode === 'recording' ? (
                  <Button
                    type="button"
                    variant="destructive"
                    className="mt-2 h-11 w-full rounded-[4px] text-xs font-bold"
                    disabled={cancelRecordingBusy}
                    onClick={() => setCancelConfirmOpen(true)}
                  >
                    {cancelRecordingBusy ? 'Membatalkan...' : 'Batalkan rekam'}
                  </Button>
                ) : null}
              </>
            )}
          </div>

        </section>
      ) : null}

      {/* ——— HISTORY TAB ——— */}
      {activeTab === 'history' ? (
        <div className="history-page">
          <header className="history-heading">
            <div><h2>History</h2>
              <p className="history-scope">{historyShowsAllAccounts ? 'Semua akun / Audit admin' : `Akun ${session.operatorName}`}</p>
            </div>
            <Button variant="outline" size="icon" type="button" onClick={() => void refreshHistory()} disabled={historyBusy} aria-label="Perbarui history">
              <span aria-hidden="true">{historyBusy ? '...' : '↻'}</span>
            </Button>
          </header>
          <div
            className="history-content"
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
            <div className="history-controls">
              <div className="grid gap-2">
                <div className="flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <HugeiconsIcon icon={HistoryIcon} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="history-resi-search"
                      aria-label="Cari nomor resi atau nomor pesanan"
                      value={historyResiQuery}
                      onChange={(event) => {
                        setHistoryResiQuery(event.target.value)
                        setHistoryHighlightedResi(null)
                      }}
                      placeholder="Cari resi atau pesanan"
                      inputMode="text"
                      autoCapitalize="characters"
                      className="h-11 rounded-[4px] border-border bg-card pl-10"
                    />
                  </div>
                  <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0 rounded-[4px]" onClick={() => setHistoryScanOpen(true)} aria-label="Scan barcode untuk mencari history">
                    <HugeiconsIcon icon={SearchAreaIcon} size={16} />
                  </Button>
                </div>
              </div>

              <div className="history-toolbar">
                <div className="history-task-tabs" role="group" aria-label="Filter tugas">
                {(['all','qc','packing'] as const).map((v) => (
                  <Button
                    key={v}
                    aria-pressed={historyTaskFilter === v}
                    type="button"
                    variant={historyTaskFilter === v ? 'secondary' : 'outline'}
                    size="sm"
                    className="rounded-[4px] px-3"
                    onClick={() => setHistoryTaskFilter(v)}
                  >
                    {v === 'all' ? 'Semua' : v === 'qc' ? 'QC' : 'Packing'}
                  </Button>
                ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={
                    historyFilterSheetActive
                      ? 'ml-auto rounded-[4px] border-[var(--op-hairline-strong)] bg-[var(--op-surface-card)]'
                      : 'ml-auto rounded-[4px] border-[var(--op-hairline)]'
                  }
                  aria-expanded={historyFilterOpen}
                  onClick={() => setHistoryFilterOpen(true)}
                >
                  Filter {historyFilterSheetActive ? <span className="history-filter-dot" aria-label="Filter aktif" /> : null}
                </Button>
              </div>
            </div>

            {historySummaryLabels.length > 0 ? (
              <div className="history-active-filters">
                <p>{historySummaryLabels.join(' / ')}</p>
                <Button type="button" variant="ghost" onClick={() => {
                  setHistoryTaskFilter('all'); setHistoryResiQuery(''); setHistoryHighlightedResi(null)
                  setHistoryAllAccounts(false); setHistoryDocStatusFilter('all'); handleHistoryDateChange('today'); setHistorySortOrder('newest')
                }}>Reset</Button>
              </div>
            ) : null}
            <Sheet open={historyFilterOpen} onOpenChange={(open) => { if (!open) setHistoryFilterOpen(false) }}>
              <SheetContent side="bottom" className="history-sheet history-filter-sheet w-full border-border bg-popover p-0">
                <div className="history-filter-handle" aria-hidden="true" />
                <SheetHeader className="history-filter-header">
                  <SheetTitle>Filter history</SheetTitle>
                  <SheetDescription className="sr-only">Temukan dokumentasi yang Anda butuhkan.</SheetDescription>
                </SheetHeader>
                <div className="history-filter-body">
                  {isAdmin ? (
                    <fieldset className="history-filter-section">
                      <legend>Cakupan akun</legend>
                      <div className="history-filter-segment" role="group" aria-label="Cakupan akun history">
                        <button type="button" aria-pressed={!historyShowsAllAccounts} onClick={() => setHistoryAllAccounts(false)}>Akun saya</button>
                        <button type="button" aria-pressed={historyShowsAllAccounts} onClick={() => setHistoryAllAccounts(true)}>Semua akun</button>
                      </div>
                      {historyShowsAllAccounts ? <p className="history-filter-hint">Semua akun hanya untuk audit admin.</p> : null}
                    </fieldset>
                  ) : null}
                  <fieldset className="history-filter-section">
                    <legend>Status dokumentasi</legend>
                    <div className="history-filter-status" role="group" aria-label="Status dokumentasi">
                      {([
                        { key: 'all', label: 'Semua' },
                        { key: 'lengkap', label: 'Lengkap' },
                        { key: 'belum-lengkap', label: 'Belum lengkap' },
                      ] as const).map((opt) => (
                        <button key={opt.key} type="button" aria-pressed={historyDocStatusFilter === opt.key} onClick={() => setHistoryDocStatusFilter(opt.key)}>
                          <span className="history-filter-check" aria-hidden="true">{historyDocStatusFilter === opt.key ? '✓' : ''}</span>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset className="history-filter-section">
                    <legend>Tanggal dokumentasi</legend>
                    <div className="history-filter-dates" role="group" aria-label="Tanggal dokumentasi">
                      {([
                        { key: 'all', label: 'Semua waktu' },
                        { key: 'today', label: 'Hari ini' },
                        { key: 'yesterday', label: 'Kemarin' },
                        { key: 'week', label: '7 hari terakhir' },
                      ] as const).map((opt) => (
                        <button key={opt.key} type="button" aria-pressed={historyDateFilter === opt.key} onClick={() => handleHistoryDateChange(opt.key)}>
                          <span>{opt.label}</span>
                          <span className="history-filter-check" aria-hidden="true">{historyDateFilter === opt.key ? '✓' : ''}</span>
                        </button>
                      ))}
                    </div>
                    <p className="history-filter-hint">Tanggal mengikuti waktu Jakarta (WIB).</p>
                  </fieldset>
                  <fieldset className="history-filter-section">
                    <legend>Urutkan</legend>
                    <div className="history-filter-segment" role="group" aria-label="Urutan history">
                      {([
                        { key: 'newest', label: 'Terbaru dulu' },
                        { key: 'oldest', label: 'Terlama dulu' },
                      ] as const).map((opt) => (
                        <button key={opt.key} type="button" aria-pressed={historySortOrder === opt.key} onClick={() => setHistorySortOrder(opt.key)}>{opt.label}</button>
                      ))}
                    </div>
                  </fieldset>
                </div>
                <div className="history-filter-footer">
                  <p aria-live="polite">{historyResultCount} resi sesuai filter </p>
                  <div className="history-filter-actions">
                    <Button type="button" variant="outline" onClick={() => {
                      setHistoryTaskFilter('all'); setHistoryResiQuery(''); setHistoryHighlightedResi(null)
                      setHistoryAllAccounts(false); setHistoryDocStatusFilter('all'); handleHistoryDateChange('today'); setHistorySortOrder('newest')
                    }} disabled={!hasHistoryFilters}>Reset</Button>
                    <Button type="button" onClick={() => setHistoryFilterOpen(false)}>Lihat hasil</Button>
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
              <SheetContent side="bottom" className="history-sheet history-scan-sheet w-full border-border bg-popover p-0">
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

            <div className="history-results-summary" aria-live="polite" aria-atomic="true">
              <p><strong>{historyResultCount}</strong> resi{historyResiQuery ? ' ditemukan' : ' ditampilkan'}</p>
              <span>{historyBusy ? 'Memperbarui...' : historyDateLabel(historyDateFilter)}</span>
            </div>
            <div className="history-results grid gap-4" aria-busy={historyBusy}>
              {historyBusy && groupedByDate.length === 0 ? (
                <div className="history-loading" role="status">Memuat dokumentasi...</div>
              ) : historyError && groupedByDate.length === 0 ? null : groupedByDate.length > 0 ? (
                groupedByDate.map(([dateKey, groups]) => (
                  <section key={dateKey} className="history-date-group grid gap-2">
                    <p className="text-[12px] font-bold tracking-wide text-[var(--op-mute)]">{formatSectionDate(dateKey)}</p>
                    <div className="grid gap-2">
                    {groups.map((group) => {
                      const normalizedGroupResi = group.resiNumber.trim().toLowerCase()
                      const scopedRowsForResi = historyScopeRecordings.filter(
                        (record) => record.resiNumber.trim().toLowerCase() === normalizedGroupResi,
                      )
                      const rowsForSummary = scopedRowsForResi.length > 0 ? scopedRowsForResi : group.rows
                      const qcRow = getLatestTaskRecord(rowsForSummary, 'qc')
                      const packingRow = getLatestTaskRecord(rowsForSummary, 'packing')
                      const qcDone = qcRow?.status === 'completed'
                      const packingDone = packingRow?.status === 'completed'
                      const progress = (Number(qcDone) + Number(packingDone)) * 50


                      const latest = group.latestRow
                      const orderNumber = rowsForSummary.find(record => record.orderNumber)?.orderNumber ?? shopeeOrders.find((o) => o.trackingNumber?.trim().toLowerCase() === group.resiNumber.trim().toLowerCase())?.orderNumber

                      const shareStatus = getGroupShareStatus(rowsForSummary)
                      const sharePreparing = rowsForSummary.some((record) => preparingShareFileIds.has(record.id))
                      const shareFailed = !sharePreparing && rowsForSummary.some((record) => sharePreparationErrors.has(record.id))
                      const shareQueued = !sharePreparing && !shareFailed && rowsForSummary.some((record) => queuedShareFileIds.has(record.id))
                      const activeShareRecord = rowsForSummary.find((record) => preparingShareFileIds.has(record.id))
                      const shareProgress = activeShareRecord ? shareProgressByRecordingId.get(activeShareRecord.id) ?? 0 : null
                      return (
                      <article key={group.resiNumber} className={`history-card ${historyHighlightedResi === group.resiNumber ? 'history-card-highlighted' : ''}`}>
                        <button type="button" className="history-card-open" onClick={() => setHistoryDetailTarget(group)} aria-haspopup="dialog" aria-label={`Buka detail resi ${group.resiNumber}`} />
                        <div className="history-card-top">
                          <div className="history-card-identity">
                            <h3>{group.resiNumber}</h3>
                            {orderNumber ? <p>Pesanan <span className="history-machine">{orderNumber}</span></p> : null}
                          </div>
                          <Button type="button" variant="ghost" size="icon" className="history-card-copy" onClick={() => void handleCopyResi(group.resiNumber)} aria-label={`Salin resi ${group.resiNumber}`}>
                            <HugeiconsIcon icon={Copy01Icon} size={17} />
                          </Button>
                        </div>
                        <div className="history-progress" role="progressbar" aria-label="Progres dokumentasi" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}
                          aria-valuetext={`QC ${qcDone ? 'selesai' : 'belum selesai'}, Packing ${packingDone ? 'selesai' : 'belum selesai'}${progress === 100 ? ', dokumentasi lengkap' : ''}`}>
                          <div className="history-progress-track" aria-hidden="true">
                            <span className={qcDone ? 'is-done' : ''} />
                            <span className={packingDone ? 'is-done' : ''} />
                          </div>
                          <div className="history-progress-labels" aria-hidden="true">
                            <span className={qcDone ? 'is-done' : ''}><span>QC</span><span>{qcDone ? '✓' : '—'}</span></span>
                            <span className={packingDone ? 'is-done' : ''}><span>Packing</span><span>{packingDone ? '✓' : '—'}</span></span>
                          </div>
                          <span className="history-progress-value" aria-hidden="true">{progress}<span>%</span></span>
                        </div>
                        {sharePreparing || shareFailed || shareQueued ? <div className="history-card-share" role="status">
                          {sharePreparing ? `Menyiapkan file berbagi ${shareProgress}%` : shareFailed ? 'Gagal menyiapkan file berbagi' : shareQueued ? 'File berbagi dalam antrean' : shareStatus.label}
                        </div> : null}
                        <div className="history-card-footer">
                          <p>{latest ? <time dateTime={latest.updatedAt}>{formatDateTime(latest.updatedAt)}</time> : `${group.rows.length} dokumentasi`}</p>
                          <span className="history-card-detail-label" aria-hidden="true">Detail <span>›</span></span>
                        </div>
                      </article>
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
                        {historyResiQuery ? 'Resi tidak ditemukan' : hasHistoryFilters ? 'Tidak ada hasil' : 'Belum ada dokumentasi'}
                      </span>
                    )}
                  </div>
                  <div className="grid gap-1">
                    <p className="text-sm font-medium">{historyResiQuery ? 'Tidak ada resi atau pesanan yang cocok.' : 'Tidak ada dokumentasi sesuai tanggal dan filter ini.'}</p>
                    <p className="text-sm leading-relaxed text-muted-foreground">Coba ubah tanggal, kata pencarian, atau reset filter.</p>
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

      <div className="mobile-nav-spacer" aria-hidden="true" />
      <BottomNav activeTab={activeTab} onChange={(tab) => openTab(tab)} />
    </main>
  )
}

export default App


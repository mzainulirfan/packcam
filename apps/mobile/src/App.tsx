import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  AlertCircleIcon,
  Camera01Icon,
  Copy01Icon,
  EyeIcon,
  EyeOffIcon,
  HistoryIcon,
  Logout02Icon,
  Menu02Icon,
  Mic01Icon,
  Moon02Icon,
  PlayCircleIcon,
  ScanIcon,
  SearchAreaIcon,
  SentIcon,
  ShieldAlertIcon,
  Share08Icon,
  Sun03Icon,
  TrashIcon,
  UserIcon,
} from '@hugeicons/core-free-icons'
import {
  deleteServerRecordingApi,
  readServerSettingsApi,
  loginServerOperatorApi,
  logoutServerOperatorApi,
  readServerRecordingsByResiApi,
  readServerRecordingsApi,
  readServerSessionApi,
  readServerSystemConfigApi,
  prepareServerRecordingShareFileApi,
  updateServerSessionTaskApi,
  buildServerFileUrl,
} from '@pakti/api-client'
import { DEFAULT_APP_SETTINGS } from '@pakti/shared/defaults'
import type { AppSettings, OperatorSession, RecordingRow, SystemConfig, WorkTask } from '@pakti/types'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { CameraPreview } from './components/CameraPreview'
import { BottomNav } from './components/BottomNav'
import { useBarcodeScanner } from './hooks/useBarcodeScanner'
import { useCameraStream } from './hooks/useCameraStream'
import { useMobileRecordingSession } from './hooks/useRecordingSession'
import './App.css'

type TabKey = 'scan' | 'history' | 'session'
type HistoryTaskFilter = 'all' | WorkTask

type LoginFormState = {
  operatorName: string
  password: string
}

const initialLoginForm: LoginFormState = {
  operatorName: '',
  password: '',
}

const tabOptions: Array<{ key: TabKey; label: string; icon: typeof ScanIcon }> = [
  { key: 'scan', label: 'Scan', icon: ScanIcon },
  { key: 'history', label: 'History', icon: HistoryIcon },
  { key: 'session', label: 'Session', icon: UserIcon },
]

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return '-'
  }

  try {
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function formatTask(taskType: WorkTask) {
  return taskType === 'qc' ? 'QC' : 'Packing'
}

function formatOperatorIdentity(operatorName?: string | null, operatorCode?: string | null) {
  const name = operatorName?.trim() ?? ''
  const code = operatorCode?.trim() ?? ''

  if (name && code) {
    return `${name} (${code})`
  }

  return name || code || 'operator lain'
}

type HistoryEmptyState = {
  tone: 'neutral' | 'warning'
  title: string
  message: string
  detail: string
  taskType?: WorkTask
}

function formatStatus(status: RecordingRow['status']) {
  if (status === 'completed') return 'Selesai'
  if (status === 'recording') return 'Rekam'
  return 'Error'
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

type StartScanRecordingFn = (
  resiInput: string,
  source?: 'manual' | 'camera',
) => Promise<'started' | 'duplicate' | 'queued' | 'error'>

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
  const [sharingRecordId, setSharingRecordId] = useState<string | null>(null)
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null)
  const [watermarkResi, setWatermarkResi] = useState<string | null>(null)
  const [scanClockTick, setScanClockTick] = useState(() => Date.now())
  const [menuOpen, setMenuOpen] = useState(false)
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme)
  const [scanVideoElement, setScanVideoElement] = useState<HTMLVideoElement | null>(null)
  const [scannerResetToken, setScannerResetToken] = useState(0)
  const scanNoticeTimerRef = useRef<number | null>(null)
  const pendingScanResiRef = useRef<string[]>([])
  const rejectedResiRef = useRef<string | null>(null)
  const previousRecordingModeRef = useRef<string>('idle')
  const scanQueueBusyRef = useRef(false)
  const scanQueueRetryTimerRef = useRef<number | null>(null)
  const scanFeedbackContextRef = useRef<AudioContext | null>(null)
  const startScanRecordingRef = useRef<StartScanRecordingFn | null>(null)
  const processCameraScanQueueRef = useRef<(() => Promise<void>) | null>(null)

  const appName = systemConfig?.appName ?? 'Pakti'
  const tagline = systemConfig?.tagline ?? 'Paket Tercatat, Bukti Terjaga'
  const brandMark = systemConfig?.brandMark ?? 'PK'
  const isDarkTheme = theme === 'dark'
  const currentTaskType: WorkTask = session?.taskType ?? 'qc'
  const isPackingMode = String(currentTaskType) === 'packing'
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
  })
  const activeRecordingResi =
    recordingSession.state.mode === 'recording'
      ? recordingSession.state.activeResi ?? watermarkResi ?? (scanResi.trim() || null)
      : null
  const recordingHasAudio = Boolean(cameraState.stream?.getAudioTracks().some((track) => track.readyState === 'live'))
  const scannerIntervalMs = recordingSession.state.mode === 'recording' ? 700 : 360

  const recordingStateRef = useRef(recordingSession.state)
  const sessionRef = useRef(session)
  const activeTabRef = useRef(activeTab)

  useEffect(() => {
    recordingStateRef.current = recordingSession.state
  }, [recordingSession.state])

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(() => {
    activeTabRef.current = activeTab
  }, [activeTab])

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

  function enqueueCameraScan(resiNumber: string) {
    if (pendingScanResiRef.current.includes(resiNumber)) {
      return
    }

    pendingScanResiRef.current.push(resiNumber)
  }

  async function waitForNextQueueTurn() {
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 0)
    })
  }

  const processCameraScanQueue = useCallback(async () => {
    if (scanQueueBusyRef.current || !sessionRef.current || activeTabRef.current !== 'scan') {
      return
    }

    scanQueueBusyRef.current = true

    try {
      while (pendingScanResiRef.current.length > 0 && sessionRef.current && activeTabRef.current === 'scan') {
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
          if (result === 'queued') {
            pendingScanResiRef.current.unshift(nextResi)
          } else {
            continue
          }

          await recordingSession.stopRecording()
          await waitForNextQueueTurn()
          continue
        }

        if (currentRecordingState.mode !== 'idle') {
          await waitForNextQueueTurn()
          continue
        }

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
        sessionRef.current &&
        activeTabRef.current === 'scan' &&
        scanQueueRetryTimerRef.current === null
      ) {
        scanQueueRetryTimerRef.current = window.setTimeout(() => {
          scanQueueRetryTimerRef.current = null
          void processCameraScanQueueRef.current?.()
        }, 0)
      }
    }
  }, [recordingSession])

  useEffect(() => {
    processCameraScanQueueRef.current = processCameraScanQueue
  }, [processCameraScanQueue])
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
      if (!normalizedValue || rejectedResiRef.current === normalizedValue) {
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

      if (scanQueueRetryTimerRef.current !== null) {
        window.clearTimeout(scanQueueRetryTimerRef.current)
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
      rejectedResiRef.current = null
      setWatermarkResi(null)
      void processCameraScanQueue()
    }
  }, [processCameraScanQueue, recordingSession.state.mode])

  const visibleRecordings = useMemo(() => recordings.slice(0, 10), [recordings])
  const currentOperatorName = session?.operatorName.trim().toLowerCase() ?? ''
  const currentOperatorCode = session?.operatorCode.trim().toLowerCase() ?? ''
  const historyQuery = historyResiQuery.trim()
  const normalizedHistoryQuery = historyQuery.toLowerCase()
  const historySourceRecordings = historyQuery ? recordings : visibleRecordings
  const filteredRecordings = useMemo(() => {
    return historySourceRecordings.filter((record) => {
      const recordOperatorName = record.operatorName?.trim().toLowerCase() ?? ''
      const recordOperatorCode = record.operatorCode?.trim().toLowerCase() ?? ''
      const matchesTask = historyTaskFilter === 'all' ? true : record.taskType === historyTaskFilter
      const matchesQuery = normalizedHistoryQuery
        ? record.resiNumber.trim().toLowerCase().includes(normalizedHistoryQuery)
        : true
      const matchesAccount = historyAllAccounts
        ? true
        : currentOperatorCode
          ? recordOperatorCode === currentOperatorCode ||
            (recordOperatorName === currentOperatorName && recordOperatorCode === '')
          : recordOperatorName === currentOperatorName

      return matchesTask && matchesQuery && matchesAccount
    })
  }, [
    currentOperatorCode,
    currentOperatorName,
    historyAllAccounts,
    historyTaskFilter,
    historySourceRecordings,
    normalizedHistoryQuery,
  ])
  const hasHistoryFilters = historyTaskFilter !== 'all' || Boolean(historyQuery) || historyAllAccounts
  const matchingResiRecords = useMemo(() => {
    if (!normalizedHistoryQuery) {
      return []
    }

    return recordings.filter((record) => record.resiNumber.trim().toLowerCase().includes(normalizedHistoryQuery))
  }, [normalizedHistoryQuery, recordings])
  const latestMatchingResiRecord = useMemo(() => {
    if (!historyQuery || matchingResiRecords.length === 0) {
      return null
    }

    return [...matchingResiRecords].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] ?? null
  }, [historyQuery, matchingResiRecords])

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

  const groupedRecordings = useMemo(() => {
    const groups = new Map<string, RecordingRow[]>()
    const order: string[] = []

    for (const record of filteredRecordings) {
      const key = record.resiNumber.trim()

      if (!groups.has(key)) {
        groups.set(key, [])
        order.push(key)
      }

      groups.get(key)?.push(record)
    }

    return order.map((resiNumber) => {
      const rows = groups.get(resiNumber) ?? []
      const sortedRows = [...rows].sort((a, b) => {
        if (a.taskType !== b.taskType) {
          return a.taskType === 'qc' ? -1 : 1
        }

        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      })

      return {
        resiNumber,
        rows: sortedRows,
        latestRow: sortedRows[0] ?? null,
      }
    })
  }, [filteredRecordings])

  const docStatus = (group: { rows: RecordingRow[] }) => {
    const qc = group.rows.find((r: RecordingRow) => r.taskType === 'qc')
    const packing = group.rows.find((r: RecordingRow) => r.taskType === 'packing')
    const qcDone = qc?.status === 'completed'
    const packingDone = packing?.status === 'completed'

    if (qcDone && packingDone) return 'lengkap' as const
    if (qcDone || packingDone) return 'belum-lengkap' as const
    return 'kosong' as const
  }

  const historyFilterSheetActive = historyDocStatusFilter !== 'all' || historyAllAccounts

  // Group by date for history sections
  const groupedByDate = useMemo(() => {
    const sections = new Map<string, Array<{ resiNumber: string; rows: RecordingRow[]; latestRow: RecordingRow | null }>>()
    const filteredByDocStatus = historyDocStatusFilter === 'all'
      ? groupedRecordings
      : groupedRecordings.filter((group) => docStatus(group) === historyDocStatusFilter)
    for (const group of filteredByDocStatus) {
      const dateKey = group.latestRow?.updatedAt ? new Date(group.latestRow.updatedAt).toDateString() : '-'
      if (!sections.has(dateKey)) sections.set(dateKey, [])
      sections.get(dateKey)?.push(group)
    }
    return [...sections.entries()]
  }, [groupedRecordings, historyDocStatusFilter])

  function formatSectionDate(dateKey: string) {
    if (dateKey === '-') return ''
    const d = new Date(dateKey)
    const today = new Date().toDateString()
    const yesterday = new Date(Date.now() - 86400000).toDateString()
    if (dateKey === today) return 'Hari ini'
    if (dateKey === yesterday) return 'Kemarin'
    return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(d)
  }
  const historyEmptyState = useMemo<HistoryEmptyState | null>(() => {
    if (groupedRecordings.length > 0) {
      return null
    }

    if (!historyQuery) {
      return {
        tone: 'neutral',
        title: 'Belum ada history',
        message: 'Belum ada history untuk akun ini.',
        detail: 'Coba scan resi atau ubah filter untuk melihat data lain.',
      }
    }

    if (matchingResiRecords.length === 0) {
      return {
        tone: 'neutral',
        title: 'Resi tidak ada',
        message: 'Resi tidak ada.',
        detail: 'Nomor resi ini belum masuk ke server.',
      }
    }

    const hasCurrentAccountMatch = matchingResiRecords.some((record) => {
      const recordOperatorName = record.operatorName?.trim().toLowerCase() ?? ''
      const recordOperatorCode = record.operatorCode?.trim().toLowerCase() ?? ''

      return historyAllAccounts
        ? true
        : currentOperatorCode
          ? recordOperatorCode === currentOperatorCode ||
            (recordOperatorName === currentOperatorName && recordOperatorCode === '')
          : recordOperatorName === currentOperatorName
    })

    if (!hasCurrentAccountMatch && !historyAllAccounts) {
      return {
        tone: 'warning',
        title: 'Sudah diproses',
        message: `Resi ini sudah diproses oleh ${formatOperatorIdentity(
          latestMatchingResiRecord?.operatorName,
          latestMatchingResiRecord?.operatorCode,
        )}.`,
        detail: 'Aktifkan mode semua akun bila ingin melihat riwayat lengkapnya.',
        taskType: latestMatchingResiRecord?.taskType,
      }
    }

    return {
      tone: 'neutral',
      title: 'Belum ada hasil',
      message: 'Belum ada history yang cocok dengan filter ini.',
      detail: 'Coba ubah filter task atau pencarian resi.',
    }
  }, [
    currentOperatorCode,
    currentOperatorName,
    groupedRecordings.length,
    historyAllAccounts,
    historyQuery,
    matchingResiRecords,
    latestMatchingResiRecord,
  ])

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
            message: 'Resi siap packing.',
          }
        }

        return {
          tone: 'success',
          title: 'QC selesai',
          message: 'Resi siap dipacking.',
        }
      }

      if (qc?.status === 'recording') {
        return {
          tone: 'warning',
          title: 'QC sedang jalan',
          message: 'Tunggu QC selesai dulu.',
        }
      }

      return {
        tone: 'warning',
        title: 'QC belum selesai',
        message: 'Resi ini belum masuk QC. Packing belum bisa jalan.',
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
        message: 'Resi siap packing.',
      }
    }

    if (qc?.status === 'recording') {
      return {
        tone: 'warning',
        title: 'QC sedang jalan',
        message: 'Tunggu proses QC selesai.',
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
      title: isPackingMode ? 'Mode packing' : 'Mode QC',
      message: isPackingMode ? 'Resi harus QC dulu.' : 'Siapkan resi untuk QC.',
    }
  }, [isPackingMode, recordings, scanResi])

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
      return
    }

    let cancelled = false

    async function loadHistory() {
      setHistoryBusy(true)
      setHistoryError(null)

      try {
        const rows = await readServerRecordingsApi()
        if (!cancelled) {
          setRecordings(rows)
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
      setRecordings([])
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
    } catch (error) {
      setHistoryError(normalizeError(error))
    } finally {
      setHistoryBusy(false)
    }
  }, [session])

  const startScanRecording = useCallback(
    async (resiInput: string, source: 'manual' | 'camera' = 'manual'): Promise<'started' | 'duplicate' | 'queued' | 'error'> => {
      if (!session) {
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
        const qcMessage =
          taskProgress?.qc?.status === 'recording'
            ? 'Resi ini masih di QC. Tunggu selesai dulu.'
            : 'Resi ini belum masuk QC. Packing belum bisa jalan.'

        playScanFeedback('warning')
        showScanNotice({
          kind: 'warning',
          title: 'QC belum selesai',
          message: qcMessage,
        })
        setScanResi('')
        return 'error'
      }

      setScanBusy(true)
      void primeScanFeedbackAudio()

      try {
        const existing = await findRecordingByResi(resiNumber, session.taskType)
        if (existing) {
          playScanFeedback('warning')
          rejectedResiRef.current = resiNumber
          window.setTimeout(() => {
            if (rejectedResiRef.current === resiNumber) {
              rejectedResiRef.current = null
            }
          }, 4000)
          const currentTaskName = formatTask(session.taskType)
          const duplicateTitle =
            existing.status === 'completed'
              ? session.taskType === 'packing' && taskProgress?.qc?.status === 'completed'
                ? 'Sudah lengkap'
                : `${currentTaskName} selesai`
              : `${currentTaskName} sedang jalan`

          const duplicateMessage =
            existing.status === 'completed'
              ? session.taskType === 'packing' && taskProgress?.qc?.status === 'completed'
                ? 'QC dan Packing sudah selesai.'
                : `Resi ini sudah diproses di ${currentTaskName}.`
              : existing.status === 'recording'
                ? `Resi ini sedang diproses di ${currentTaskName}.`
                : `Resi ini sudah tercatat di ${currentTaskName}.`

          showScanNotice({
            kind: 'warning',
            title: duplicateTitle,
            message: duplicateMessage,
          })
          setWatermarkResi((current) => (current === resiNumber ? null : current))
          setScanResi('')
          return 'duplicate'
        }

        rejectedResiRef.current = null
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
      primeScanFeedbackAudio,
      playScanFeedback,
      recordingSession,
      resolveLatestTaskProgress,
      session,
      showScanNotice,
    ],
  )

  useEffect(() => {
    startScanRecordingRef.current = startScanRecording
  }, [startScanRecording])

  const stopScanRecording = useCallback(async () => {
    if (scanBusy || !session) {
      return
    }

    setScanBusy(true)
    void primeScanFeedbackAudio()

    try {
      await recordingSession.stopRecording()
      void refreshHistory()
    } catch (error) {
      setBootError(normalizeError(error))
    } finally {
      setScanBusy(false)
    }
  }, [primeScanFeedbackAudio, refreshHistory, scanBusy, session, recordingSession])

  async function handleShareRecording(record: RecordingRow, target: 'native' | 'whatsapp') {
    if (!record.filePath) {
      setBootError('File video belum tersedia untuk dibagikan.')
      return
    }

    const shareText = `Video ${formatTask(record.taskType)} resi ${record.resiNumber}`

    if (!navigator.share) {
      setBootError('Browser ini belum mendukung share file ke aplikasi.')
      return
    }

    setSharingRecordId(record.id)

    try {
      const shareFile = await prepareServerRecordingShareFileApi(record.id)
      const videoUrl = buildServerFileUrl(shareFile.filePath)
      const response = await fetch(videoUrl, { credentials: 'include' })
      if (!response.ok) {
        throw new Error('Video belum bisa diambil untuk dibagikan.')
      }

      const blob = await response.blob()
      const file = new File([blob], shareFile.fileName, {
        type: shareFile.mimeType || blob.type || 'video/mp4',
      })
      const shareData: ShareData = {
        title: shareText,
        text: shareText,
        files: [file],
      }

      if (navigator.canShare?.(shareData)) {
        await navigator.share(shareData)
      } else {
        const targetName = target === 'whatsapp' ? 'WhatsApp' : 'aplikasi lain'
        throw new Error(`Browser ini belum mendukung share file video ke ${targetName}.`)
      }
    } catch (error) {
      setBootError(normalizeError(error))
    } finally {
      setSharingRecordId(null)
    }
  }

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
        <section className="grid gap-3 border border-[var(--op-hairline)] bg-[var(--op-canvas)] p-4" style={{ borderRadius: '4px' }}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-[4px] bg-[var(--op-ink)] text-[var(--op-canvas)] text-sm font-bold">
                {brandMark}
              </span>
              <div className="grid gap-0.5">
                <p className="text-[12px] font-bold tracking-wide">[ Pakti Mobile ]</p>
                <p className="text-[14px] font-bold leading-none">{appName}</p>
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
          <p className="text-[14px] leading-relaxed text-[var(--op-mute)]">{tagline}</p>
        </section>

        <div className="grid gap-3 rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-canvas)] p-4">
          <div className="grid gap-1 border-b border-[var(--op-hairline)] pb-3">
            <p className="text-[12px] font-bold tracking-wide">[ Login ]</p>
            <h2 className="text-[16px] font-bold leading-none">Masuk ke sesi mobile</h2>
            <p className="text-[14px] leading-relaxed text-[var(--op-mute)]">Gunakan akun operator untuk memulai scan.</p>
          </div>
          <div>
            <form className="grid gap-4" onSubmit={handleLogin}>
              <div className="grid gap-2">
                <Label htmlFor="mobile-operator-name">Username</Label>
                <Input
                  id="mobile-operator-name"
                  value={loginForm.operatorName}
                  onChange={(event) => setLoginForm((current) => ({ ...current, operatorName: event.target.value }))}
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="Masukkan username"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="mobile-password">Password</Label>
                <div className="relative">
                  <Input
                    id="mobile-password"
                    type={showLoginPassword ? 'text' : 'password'}
                    value={loginForm.password}
                    onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                    autoComplete="current-password"
                    placeholder="Masukkan password"
                    className="pr-12"
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-[min(var(--radius-md),12px)] border border-transparent bg-transparent text-slate-500 transition-colors outline-none hover:bg-muted hover:text-slate-950 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    onClick={() => setShowLoginPassword((current) => !current)}
                    aria-label={showLoginPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  >
                    {showLoginPassword ? <HugeiconsIcon icon={EyeOffIcon} size={16} /> : <HugeiconsIcon icon={EyeIcon} size={16} />}
                  </button>
                </div>
              </div>

      {bootError ? (
                <Alert variant="destructive">
                  <AlertTitle>Gagal masuk</AlertTitle>
                  <AlertDescription>{bootError}</AlertDescription>
                </Alert>
              ) : null}

              <Button
                type="submit"
                className="w-full rounded-[4px]"
                disabled={loginBusy || !loginForm.operatorName.trim() || !loginForm.password}
                >
                {loginBusy ? 'Masuk...' : 'Masuk'}
              </Button>
            </form>
          </div>
        </div>
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
            className="rounded-full border border-border/60 bg-card/70 backdrop-blur"
            onClick={toggleTheme}
            aria-label={isDarkTheme ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
          >
            {isDarkTheme ? <HugeiconsIcon icon={Sun03Icon} size={16} /> : <HugeiconsIcon icon={Moon02Icon} size={16} />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="rounded-full border border-border/60 bg-card/70 backdrop-blur"
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
            <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <HugeiconsIcon icon={ShieldAlertIcon} size={18} />
            </div>
            <DialogTitle>Keluar sekarang?</DialogTitle>
            <DialogDescription>Sesi ini akan ditutup dan perlu login kembali.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-0 bg-transparent pt-2">
            <Button type="button" variant="ghost" className="rounded-full" onClick={() => setLogoutConfirmOpen(false)}>
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="gap-2 rounded-full"
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
                    <span className="flex min-w-0 flex-1 items-center gap-2 truncate rounded-[4px] border border-white/15 bg-black/55 px-2.5 py-1 text-[0.7rem] font-semibold text-white backdrop-blur">
                      <HugeiconsIcon icon={Camera01Icon} size={14} className="shrink-0" />
                      <span className="min-w-0 flex-1 truncate">
                        {activeRecordingResi ? `${formatTask(currentTaskType)}: ${activeRecordingResi}` : 'Scan resi'}
                      </span>
                    </span>
                    {isAdmin ? (
                      <Button
                        type="button"
                        variant={session.taskType === 'qc' ? 'secondary' : 'outline'}
                        size="xs"
                        className="h-7 shrink-0 rounded-[4px] bg-white px-2.5 text-xs font-medium text-slate-900 hover:bg-white"
                        onClick={() => void handleTaskChange(session.taskType === 'qc' ? 'packing' : 'qc')}
                        disabled={taskBusy}
                      >
                        {formatTask(session.taskType)}
                      </Button>
                    ) : (
                      <span className="inline-flex shrink-0 items-center rounded-[4px] bg-white px-2.5 py-1 text-[0.68rem] font-semibold text-slate-900">
                        {formatTask(session.taskType)}
                      </span>
                    )}
                  </div>
                  {recordingHasAudio ? (
                    <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-white/15 bg-black/55 px-2.5 py-1 text-[0.68rem] font-medium text-emerald-100 backdrop-blur">
                      <HugeiconsIcon icon={Mic01Icon} size={12} />
                      Audio aktif
                    </span>
                  ) : null}
                  {activeRecordingResi ? (
                      <div className="w-fit rounded-[4px] bg-black/45 px-3 py-2 backdrop-blur">
                      <strong className="block text-[0.68rem] font-bold tracking-wide text-white">RESI {activeRecordingResi}</strong>
                      <span className="block text-[0.62rem] font-medium leading-tight text-white/80">
                        {formatTask(currentTaskType)} · {session.operatorName || session.operatorCode || '-'} · {watermarkOverlayTime}
                      </span>
                    </div>
                  ) : null}
                </div>
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
                  <div
                  className={
                    recordingSession.state.mode === 'recording'
                      ? 'scan-control-panel scan-control-panel--recording rounded-[4px]'
                      : 'scan-control-panel rounded-[4px]'
                  }
                >
                  <div className="mx-auto h-1 w-8 rounded-full bg-border/70" aria-hidden="true" />
                  {scanProgressState ? (
                    <div className={`scan-progress-note scan-progress-note--${scanProgressState.tone} rounded-[4px]`}>
                      <strong>{scanProgressState.title}</strong>
                      <span>{scanProgressState.message}</span>
                    </div>
                  ) : null}

                  <div className="grid gap-2">
                    <Label htmlFor="mobile-scan-resi" className="text-[0.68rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      Nomor resi
                    </Label>
                    <div className="relative">
                      <HugeiconsIcon icon={ScanIcon} className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="mobile-scan-resi"
                        value={scanResi}
                        onChange={(event) => setScanResi(event.target.value)}
                        placeholder="Ketik atau scan otomatis"
                        inputMode="text"
                        autoCapitalize="characters"
                        className="h-12 rounded-[4px] border-border bg-card pl-10 text-[0.95rem] shadow-sm"
                      />
                    </div>
                    <p className="text-[0.68rem] leading-none text-muted-foreground">Arahkan barcode ke kotak atau ketik manual</p>
                  </div>

                  <Button
                    type="button"
                    className="h-12 w-full rounded-[4px] text-[0.95rem] font-semibold"
                    disabled={
                      scanBusy ||
                      recordingSession.state.mode === 'stopping' ||
                      recordingSession.state.mode === 'saving' ||
                      (recordingSession.state.mode === 'idle' && !scanResi.trim())
                    }
                    onClick={() =>
                      void (recordingSession.state.mode === 'recording' ? stopScanRecording() : startScanRecording(scanResi, 'manual'))
                    }
                  >
                    <HugeiconsIcon icon={ScanIcon} size={16} />
                    {scanBusy || recordingSession.state.mode === 'stopping' || recordingSession.state.mode === 'saving'
                      ? 'Memproses...'
                      : recordingSession.state.mode === 'recording'
                        ? 'Hentikan Rekaman'
                        : 'Scan & Rekam'}
                  </Button>
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

          <div className="sticky top-0 z-10 grid gap-3 bg-[var(--op-canvas)] py-2">
            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label htmlFor="history-resi-search" className="text-[0.68rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Cari resi
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
                      placeholder="Cari resi..."
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
                  Filter ⚙
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
                      }}
                      disabled={!hasHistoryFilters && historyDocStatusFilter === 'all'}
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
                      <span className="inline-flex items-center gap-2 rounded-[4px] bg-black/60 px-3 py-1.5 text-[0.7rem] font-semibold text-white backdrop-blur">
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
                      const status = docStatus(group)
                      const statusLabel = status === 'lengkap' ? '✓ Lengkap' : status === 'belum-lengkap' ? '! Belum lengkap' : '— Belum ada'
                      const qcRow = group.rows.find((r: RecordingRow) => r.taskType === 'qc')
                      const packingRow = group.rows.find((r: RecordingRow) => r.taskType === 'packing')
                      const latest = group.latestRow
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
                            <strong className="min-w-0 truncate text-[16px] font-bold leading-none tracking-tight">{group.resiNumber}</strong>
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
                            <div className="relative h-[100px] w-[130px] shrink-0 overflow-hidden rounded-[4px] border border-[var(--op-hairline)] bg-black">
                              <video
                                className="block h-full w-full bg-black object-cover"
                                src={buildServerFileUrl(latest.filePath)}
                                preload="metadata"
                                muted
                                crossOrigin="use-credentials"
                              />
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
                                  <span className="text-[14px] font-semibold">Packing</span>
                                  <span className={packingRow.status === 'completed' ? 'text-[13px]' : 'text-[13px] text-[var(--op-mute)]'}>
                                    {packingRow.status === 'completed' ? '✓ Selesai' : packingRow.status === 'recording' ? '… Rekam' : '× Error'}
                                  </span>
                                </div>
                              ) : null}
                              {!packingRow && !qcRow ? <span className="text-[13px] text-[var(--op-mute)]">{group.rows.length} dokumentasi</span> : null}
                              <span className="mt-auto truncate text-[12px] text-[var(--op-mute)]">
                                {formatDateTime(latest.updatedAt)} · oleh {latest.operatorName || '-'}
                              </span>
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
                                <span className="text-[14px] font-semibold">Packing</span>
                                <span className="text-[13px] text-[var(--op-mute)]">{formatStatus(packingRow?.status ?? 'error')}</span>
                              </div>
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
        <div className="grid gap-4 pt-1" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          <div className="flex items-start justify-between gap-3 border-b border-[var(--op-hairline)] pb-3">
            <div className="grid gap-1">
              <p className="text-[12px] font-bold tracking-wide">[ Session ]</p>
              <h2 className="text-[16px] font-bold leading-none">Akun — {session.operatorName}</h2>
              <p className="text-[14px] leading-relaxed text-[var(--op-mute)]">Status login dan task aktif.</p>
            </div>
            <span className="grid size-9 place-items-center rounded-[4px] bg-[var(--op-ink)] text-[var(--op-canvas)]">
              <HugeiconsIcon icon={UserIcon} size={16} />
            </span>
          </div>

          <div className="grid gap-4">
            <div className="rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-surface-soft)] p-3">
              <div className="flex items-start gap-3">
                <div className="grid size-11 shrink-0 place-items-center rounded-[4px] bg-[var(--op-ink)] text-sm font-bold text-[var(--op-canvas)]">
                  {session.operatorName
                    .split(' ')
                    .map((part) => part[0])
                    .filter(Boolean)
                    .slice(0, 2)
                    .join('')
                    .toUpperCase() || 'OP'}
                </div>
                <div className="grid gap-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {session.role === 'admin' ? 'Admin' : 'Operator'}
                    </span>
                    <span className={session.role === 'admin' ? 'rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.68rem] font-medium text-amber-700 dark:text-amber-200' : 'rounded-full bg-sky-500/10 px-2 py-0.5 text-[0.68rem] font-medium text-sky-700 dark:text-sky-200'}>
                      {session.role === 'admin' ? 'Akses penuh' : 'Akses operasional'}
                    </span>
                  </div>
                  <strong className="text-[1.05rem] leading-tight tracking-tight">{session.operatorName}</strong>
                  <span className="text-sm text-muted-foreground">{session.operatorCode || 'Kode operator tidak tersedia'}</span>
                </div>
                <span className="ml-auto shrink-0 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[0.7rem] font-medium text-emerald-700 dark:text-emerald-200">
                  Login aktif
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2.5">
                <div className="rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-surface-soft)] px-3 py-3">
                  <span className="block text-[12px] font-medium uppercase tracking-[0.14em] text-[var(--op-mute)]">Task aktif</span>
                  <strong className="mt-1 block text-sm tracking-tight">[+] {formatTask(session.taskType)}</strong>
                </div>
                <div className="rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-surface-soft)] px-3 py-3">
                  <span className="block text-[12px] font-medium uppercase tracking-[0.14em] text-[var(--op-mute)]">Login sejak</span>
                  <strong className="mt-1 block text-xs leading-tight">{formatDateTime(session.loggedInAt)}</strong>
                </div>
              </div>
            </div>

            {isAdmin ? (
              <div className="rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-surface-soft)] p-3">
                <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-[var(--op-mute)]">[+] Kontrol task</p>
                <p className="mt-1 text-sm text-[var(--op-mute)]">Admin dapat mengganti task aktif.</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                      type="button"
                      variant={session.taskType === 'qc' ? 'secondary' : 'outline'}
                      className="rounded-[4px]"
                      onClick={() => void handleTaskChange('qc')}
                      disabled={taskBusy}
                    >
                      QC
                    </Button>
                    <Button
                      type="button"
                      variant={session.taskType === 'packing' ? 'secondary' : 'outline'}
                      className="rounded-[4px]"
                      onClick={() => void handleTaskChange('packing')}
                      disabled={taskBusy}
                    >
                      Packing
                    </Button>
                </div>
              </div>
              ) : (
                <div className="rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-surface-soft)] p-4">
                  <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-[var(--op-mute)]">[+] Status task</p>
                <p className="mt-1 text-sm text-muted-foreground">Hanya informasi. Task tidak bisa diubah dari role operator.</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className={session.taskType === 'qc' ? 'rounded-[4px] bg-[var(--op-ink)] px-3 py-3 text-center text-sm font-medium text-[var(--op-canvas)]' : 'rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-canvas)] px-3 py-3 text-center text-sm text-[var(--op-mute)]'}>
                    {session.taskType === 'qc' ? '[ QC aktif ]' : 'QC nonaktif'}
                  </div>
                  <div className={session.taskType === 'packing' ? 'rounded-[4px] bg-[var(--op-ink)] px-3 py-3 text-center text-sm font-medium text-[var(--op-canvas)]' : 'rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-canvas)] px-3 py-3 text-center text-sm text-[var(--op-mute)]'}>
                    {session.taskType === 'packing' ? '[ Packing aktif ]' : 'Packing nonaktif'}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {historyDetailTarget ? (
        <Sheet open onOpenChange={(open) => { if (!open) setHistoryDetailTarget(null) }}>
          <SheetContent side="bottom" className="w-full rounded-t-[4px] border-border bg-popover p-0" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            <SheetHeader className="px-4 pt-5">
              <SheetTitle className="text-left text-base">{historyDetailTarget.resiNumber}</SheetTitle>
              <SheetDescription className="text-left">{historyDetailTarget.rows.length} dokumentasi</SheetDescription>
            </SheetHeader>
            <div className="grid max-h-[70vh] gap-4 overflow-y-auto px-4 pb-6 pt-2">
              {historyDetailTarget.rows.map((record) => (
                <div key={record.id} className="grid gap-2 rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-surface-soft)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[14px] font-semibold">{formatTask(record.taskType)}</span>
                    <span className={record.status === 'completed' ? 'text-[12px]' : 'text-[12px] text-[var(--op-mute)]'}>
                      {formatStatus(record.status)}
                    </span>
                  </div>
                  <span className="text-[12px] text-[var(--op-mute)]">
                    {formatDateTime(record.updatedAt)} · oleh {record.operatorName || '-'}
                  </span>
                  {record.status === 'completed' && record.filePath ? (
                    <>
                      <div className="overflow-hidden rounded-[4px] border border-[var(--op-hairline)] bg-black">
                        <video
                          className="block max-h-[50vh] w-full bg-black object-contain"
                          src={buildServerFileUrl(record.filePath)}
                          controls
                          playsInline
                          preload="metadata"
                          crossOrigin="use-credentials"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-[4px] border-[var(--op-hairline-strong)]"
                          onClick={() => void handleShareRecording(record, 'native')}
                          disabled={sharingRecordId === record.id || deletingRecordId !== null}
                        >
                          <HugeiconsIcon icon={Share08Icon} size={14} />
                          {sharingRecordId === record.id ? 'Menyiapkan...' : 'Bagikan'}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-[4px] border-[var(--op-hairline-strong)]"
                          onClick={() => void handleShareRecording(record, 'whatsapp')}
                          disabled={sharingRecordId === record.id || deletingRecordId !== null}
                        >
                          <HugeiconsIcon icon={SentIcon} size={14} />
                          WhatsApp
                        </Button>
                      </div>
                    </>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="rounded-[4px] border border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => {
                      setHistoryDeleteConfirm(record)
                      setHistoryDetailTarget(null)
                    }}
                    disabled={deletingRecordId !== null || sharingRecordId !== null}
                  >
                    <HugeiconsIcon icon={TrashIcon} size={14} />
                    Hapus dokumentasi
                  </Button>
                </div>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      ) : null}

      <Dialog open={Boolean(historyDeleteConfirm)} onOpenChange={(open) => { if (!open) setHistoryDeleteConfirm(null) }}>
        <DialogContent className="rounded-[4px] border-border bg-popover text-popover-foreground" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          <DialogHeader>
            <DialogTitle>Hapus dokumentasi?</DialogTitle>
            <DialogDescription>
              Video {historyDeleteConfirm ? formatTask(historyDeleteConfirm.taskType) : ''} untuk resi{' '}
              <strong>{historyDeleteConfirm?.resiNumber}</strong> akan dihapus. Tindakan ini tidak dapat dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-[4px]" onClick={() => setHistoryDeleteConfirm(null)}>
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="gap-2 rounded-[4px]"
              disabled={deletingRecordId !== null || !historyDeleteConfirm}
              onClick={() => {
                if (!historyDeleteConfirm) return
                void handleDeleteRecording(historyDeleteConfirm)
                setHistoryDeleteConfirm(null)
              }}
            >
              <HugeiconsIcon icon={TrashIcon} size={14} />
              {deletingRecordId ? 'Menghapus...' : 'Hapus'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {bootError ? (
        <Alert variant="destructive" className="rounded-2xl">
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


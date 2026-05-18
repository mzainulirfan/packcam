import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Camera, CheckCircle2, History, LogOut, Menu, RefreshCw, ScanLine, Shield, UserRound } from 'lucide-react'
import {
  readServerSettingsApi,
  loginServerOperatorApi,
  logoutServerOperatorApi,
  readServerRecordingsApi,
  readServerSessionApi,
  readServerSystemConfigApi,
  updateServerSessionTaskApi,
} from '@pakti/api-client'
import { DEFAULT_APP_SETTINGS } from '@pakti/shared/defaults'
import type { AppSettings, OperatorSession, RecordingRow, SystemConfig, WorkTask } from '@pakti/types'
import { CameraPreview } from './components/CameraPreview'
import { useBarcodeScanner } from './hooks/useBarcodeScanner'
import { useCameraStream } from './hooks/useCameraStream'
import { useMobileRecordingSession } from './hooks/useRecordingSession'
import { useWatermarkedStream } from './hooks/useWatermarkedStream'
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

const tabOptions: Array<{ key: TabKey; label: string; icon: typeof ScanLine }> = [
  { key: 'scan', label: 'Scan', icon: ScanLine },
  { key: 'history', label: 'History', icon: History },
  { key: 'session', label: 'Session', icon: UserRound },
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
) => Promise<'started' | 'duplicate' | 'error'>

const ACTIVE_TAB_STORAGE_KEY = 'pakti_mobile_active_tab'

function isTabKey(value: string | null): value is TabKey {
  return value === 'scan' || value === 'history' || value === 'session'
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
  const [taskBusy, setTaskBusy] = useState(false)
  const [scanResi, setScanResi] = useState('')
  const [scanBusy, setScanBusy] = useState(false)
  const [scanNotice, setScanNotice] = useState<ScanNotice | null>(null)
  const [historyBusy, setHistoryBusy] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [recordings, setRecordings] = useState<RecordingRow[]>([])
  const [watermarkResi, setWatermarkResi] = useState<string | null>(null)
  const [scanClockTick, setScanClockTick] = useState(() => Date.now())
  const [menuOpen, setMenuOpen] = useState(false)
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
  const currentTaskType: WorkTask = session?.taskType ?? 'qc'
  const isPackingMode = String(currentTaskType) === 'packing'
  const cameraState = useCameraStream(settings.cameraDeviceId, Boolean(session) && activeTab === 'scan', 'environment')
  const watermarkedStream = useWatermarkedStream({
    sourceStream: cameraState.stream,
    watermarkResi,
    watermarkTask: session?.taskType ?? null,
    watermarkOperator: session?.operatorName ?? session?.operatorCode ?? null,
    watermarkTime: new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(scanClockTick)),
  })
  const { stream: watermarkedVideoStream, commitWatermarkFrame } = watermarkedStream
  const recordingSession = useMobileRecordingSession({
    stream: watermarkedVideoStream ?? cameraState.stream,
    settings: {
      videoRootPath: settings.videoRootPath,
      videoFormat: settings.videoFormat,
    },
    operatorName: session?.operatorName ?? '',
    operatorCode: session?.operatorCode ?? '',
    taskType: session?.taskType ?? 'qc',
  })

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

  const playScanFeedback = useCallback(async (kind: 'success' | 'warning') => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(kind === 'success' ? 40 : [60, 35, 60])
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
      const oscillator = context.createOscillator()
      const gainNode = context.createGain()

      oscillator.type = 'sine'
      oscillator.frequency.value = kind === 'success' ? 1320 : 620
      gainNode.gain.value = kind === 'success' ? 0.055 : 0.075

      oscillator.connect(gainNode)
      gainNode.connect(context.destination)
      oscillator.start()
      oscillator.stop(context.currentTime + (kind === 'success' ? 0.08 : 0.14))
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
            message: 'Packing sedang direkam.',
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
          title: 'QC sedang direkam',
          message: 'Tunggu QC selesai dulu.',
        }
      }

      return {
        tone: 'warning',
        title: 'QC belum selesai',
        message: 'Resi ini harus QC dulu sebelum packing.',
      }
    }

    if (qc?.status === 'completed') {
      if (packing?.status === 'completed') {
        return {
          tone: 'success',
          title: 'QC & Packing selesai',
          message: 'Resi ini sudah lengkap.',
        }
      }

      return {
        tone: 'success',
        title: 'QC selesai',
        message: 'Resi ini siap lanjut packing.',
      }
    }

    if (qc?.status === 'recording') {
      return {
        tone: 'warning',
        title: 'QC sedang direkam',
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
      setActiveTab('scan')
      setMenuOpen(false)
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
      const rows = await readServerRecordingsApi()
      setRecordings(rows)
      return (
        rows.find(
          (record) => record.resiNumber.trim() === normalizedResi && (taskType ? record.taskType === taskType : true),
        ) ?? null
      )
    } catch {
      return null
    }
  }, [recordings])

  const resolveLatestTaskProgress = useCallback(
    async (resiNumber: string) => {
      try {
        const rows = await readServerRecordingsApi()
        setRecordings(rows)

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
    [recordings],
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
    async (resiInput: string, source: 'manual' | 'camera' = 'manual'): Promise<'started' | 'duplicate' | 'error'> => {
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
      playScanFeedback('warning')
      showScanNotice({
        kind: 'warning',
        title: 'QC belum selesai',
        message: `Resi ${resiNumber} harus diproses QC dulu sebelum packing.`,
      })
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
        showScanNotice({
          kind: 'warning',
          title: existing.status === 'completed' ? 'Resi sudah diproses' : 'Resi terdeteksi ganda',
          message:
            existing.status === 'completed'
              ? `Resi ${resiNumber} sudah diproses.`
              : existing.status === 'recording'
                ? `Resi ${resiNumber} sedang diproses.`
                : `Resi ${resiNumber} sudah ada di database.`,
        })
        setWatermarkResi((current) => (current === resiNumber ? null : current))
        return 'duplicate'
      }

      rejectedResiRef.current = null
      setWatermarkResi(resiNumber)
      commitWatermarkFrame(resiNumber)
      await recordingSession.startRecording(resiNumber)

      if (source === 'camera') {
        playScanFeedback('success')
        showScanNotice({
          kind: 'success',
          title: 'Scan berhasil',
          message: `Resi ${resiNumber} masuk ke rekaman.`,
        })
      }

      setScanResi('')
      void refreshHistory()
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
      refreshHistory,
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

  function openTab(tab: TabKey) {
    setActiveTab(tab)
    setMenuOpen(false)
  }

  if (booting) {
    return (
      <main className="mobile-app mobile-app--boot">
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
      <main className="mobile-app mobile-app--auth">
        <section className="hero-card">
          <div className="brand-row">
            <span className="brand-badge">{brandMark}</span>
            <div>
              <p className="eyebrow">Pakti Mobile</p>
              <h1>{appName}</h1>
            </div>
          </div>
          <p className="tagline">{tagline}</p>
        </section>

        <section className="panel-card">
          <div className="panel-card__header">
            <div>
              <p className="section-label">Login operator</p>
              <h2>Masuk ke sesi mobile</h2>
            </div>
            <Shield className="panel-card__icon" />
          </div>

          <form className="form-grid" onSubmit={handleLogin}>
            <label className="field">
              <span>Username</span>
              <input
                value={loginForm.operatorName}
                onChange={(event) => setLoginForm((current) => ({ ...current, operatorName: event.target.value }))}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="Masukkan username"
                required
              />
            </label>

            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={loginForm.password}
                onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                autoComplete="current-password"
                placeholder="Masukkan password"
                required
              />
            </label>

            {bootError ? <div className="status status--error">{bootError}</div> : null}

            <button
              className="primary-button"
              type="submit"
              disabled={loginBusy || !loginForm.operatorName.trim() || !loginForm.password}
            >
              {loginBusy ? 'Masuk...' : 'Masuk'}
            </button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="mobile-app" onPointerDownCapture={() => void primeScanFeedbackAudio()}>
      <header className="topbar">
        <div className="brand-row">
          <span className="brand-badge">{brandMark}</span>
          <div>
            <p className="eyebrow">Pakti Mobile</p>
            <h1>{appName}</h1>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="ghost-button ghost-button--icon" type="button" onClick={() => setMenuOpen((current) => !current)}>
            <Menu size={16} />
          </button>
          <button className="ghost-button" type="button" onClick={() => void handleLogout()}>
            <LogOut size={16} />
            Keluar
          </button>
        </div>
      </header>

      {menuOpen ? (
        <section className="mobile-menu" aria-label="Navigasi mobile">
          {tabOptions.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.key

            return (
              <button
                key={tab.key}
                type="button"
                className={isActive ? 'mobile-menu__button mobile-menu__button--active' : 'mobile-menu__button'}
                onClick={() => openTab(tab.key)}
              >
                <Icon size={15} />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </section>
      ) : null}

      {activeTab === 'scan' ? (
        <section className="panel-card panel-card--dense panel-card--scan">
          {scanNotice ? (
            <div
              className={
                scanNotice.kind === 'success'
                  ? 'scan-toast scan-toast--success'
                  : 'scan-toast scan-toast--warning'
              }
            >
              <strong>{scanNotice.title}</strong>
              <span>{scanNotice.message}</span>
            </div>
          ) : null}

          <CameraPreview
            onVideoElement={setScanVideoElement}
            stream={watermarkedVideoStream ?? cameraState.stream}
            isLoading={cameraState.loading}
            error={cameraState.error}
            emptyMessage="Arahkan kamera ke area kerja."
            topSlot={
              <div className="scan-top-overlay">
                <span className="preview-pill">
                  <Camera size={14} />
                  {recordingSession.state.mode === 'recording' ? 'Recording aktif' : 'Preview kamera'}
                </span>
                <div className="scan-top-overlay__actions">
                  {isAdmin ? (
                    <button
                      type="button"
                      className={session.taskType === 'qc' ? 'task-switch__button task-switch__button--active' : 'task-switch__button'}
                      onClick={() => void handleTaskChange(session.taskType === 'qc' ? 'packing' : 'qc')}
                      disabled={taskBusy}
                      aria-label={`Ganti task aktif ke ${session.taskType === 'qc' ? 'Packing' : 'QC'}`}
                    >
                      {formatTask(session.taskType)}
                    </button>
                  ) : null}
                </div>
              </div>
            }
            centerSlot={
              <div className="scan-guide" aria-hidden="true">
                <div className="scan-guide__frame">
                  <span className="scan-guide__corner scan-guide__corner--tl" />
                  <span className="scan-guide__corner scan-guide__corner--tr" />
                  <span className="scan-guide__corner scan-guide__corner--bl" />
                  <span className="scan-guide__corner scan-guide__corner--br" />
                </div>
                <div className="scan-guide__label">
                  <span>Pusatkan barcode di kotak ini</span>
                </div>
              </div>
            }
            bottomSlot={
              <div className="scan-dock">
                {scanProgressState ? (
                  <div className={scanProgressState.tone === 'success' ? 'scan-progress scan-progress--success' : scanProgressState.tone === 'warning' ? 'scan-progress scan-progress--warning' : 'scan-progress'}>
                    <strong>{scanProgressState.title}</strong>
                    <span>{scanProgressState.message}</span>
                  </div>
                ) : null}

                <label className="field field--compact">
                  <span>Nomor resi</span>
                  <input
                    value={scanResi}
                    onChange={(event) => setScanResi(event.target.value)}
                    placeholder="Ketik atau scan barcode"
                    inputMode="text"
                    autoCapitalize="characters"
                  />
                </label>

                <button
                  className="primary-button"
                  type="button"
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
                  {scanBusy || recordingSession.state.mode === 'stopping' || recordingSession.state.mode === 'saving'
                    ? 'Memproses...'
                    : recordingSession.state.mode === 'recording'
                      ? 'Hentikan Rekaman'
                      : 'Scan & Rekam'}
                </button>
              </div>
            }
          />
        </section>
      ) : null}

      {activeTab === 'history' ? (
        <section className="panel-card panel-card--dense">
          <div className="panel-card__header">
            <div>
              <p className="section-label">History ringkas</p>
              <h2>Rekaman terbaru</h2>
            </div>
            <button className="ghost-button" type="button" onClick={() => void refreshHistory()} disabled={historyBusy}>
              <RefreshCw size={16} />
              {historyBusy ? 'Memuat...' : 'Refresh'}
            </button>
          </div>

          {historyError ? <div className="status status--error">{historyError}</div> : null}

          <div className="history-list">
            {visibleRecordings.length > 0 ? (
              visibleRecordings.map((record) => (
                <article key={record.id} className="history-item">
                  <div className="history-item__main">
                    <strong>{record.resiNumber}</strong>
                    <span>
                      {formatTask(record.taskType)} · {formatStatus(record.status)}
                    </span>
                  </div>
                  <div className="history-item__meta">
                    <span>{formatDateTime(record.updatedAt)}</span>
                    <span>{record.operatorName || '-'}</span>
                  </div>
                </article>
              ))
            ) : (
              <div className="empty-state">
                <CheckCircle2 size={18} />
                <p>Belum ada history yang ditampilkan.</p>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {activeTab === 'session' ? (
        <section className="panel-card panel-card--dense">
          <div className="panel-card__header">
            <div>
              <p className="section-label">Session detail</p>
              <h2>Informasi akun aktif</h2>
            </div>
            <UserRound className="panel-card__icon" />
          </div>

          <div className="detail-grid">
            <div className="detail-row">
              <span>Nama</span>
              <strong>{session.operatorName}</strong>
            </div>
            <div className="detail-row">
              <span>Kode</span>
              <strong>{session.operatorCode || '-'}</strong>
            </div>
            <div className="detail-row">
              <span>Role</span>
              <strong>{session.role}</strong>
            </div>
            <div className="detail-row">
              <span>Task</span>
              <strong>{formatTask(session.taskType)}</strong>
            </div>
            <div className="detail-row">
              <span>Login</span>
              <strong>{formatDateTime(session.loggedInAt)}</strong>
            </div>
          </div>

          <div className="session-actions">
            {isAdmin ? (
              <>
                <button
                  type="button"
                  className={session.taskType === 'qc' ? 'ghost-button ghost-button--active' : 'ghost-button'}
                  onClick={() => void handleTaskChange('qc')}
                  disabled={taskBusy}
                >
                  QC
                </button>
                <button
                  type="button"
                  className={session.taskType === 'packing' ? 'ghost-button ghost-button--active' : 'ghost-button'}
                  onClick={() => void handleTaskChange('packing')}
                  disabled={taskBusy}
                >
                  Packing
                </button>
              </>
            ) : null}
          </div>
        </section>
      ) : null}

      {bootError ? (
        <section className="panel-card panel-card--error">
          <div className="status status--error">{bootError}</div>
        </section>
      ) : null}
    </main>
  )
}

export default App


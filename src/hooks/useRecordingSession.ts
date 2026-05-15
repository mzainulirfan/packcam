import { useEffect, useMemo, useRef, useState } from 'react'
import { clearRecordingChunks, createRecordingDraft, findLatestRecordingByResi, findRecordingById, recoverIncompleteRecordings, saveRecordingArtifact, saveRecordingChunk, setRecordingError } from '../data/recordings'
import type { AppSettings } from '../data/types'
import { logScanEvent } from '../data/scanLogs'
import { reportLastError } from '../data/storage'

type RecordingMode = 'idle' | 'recording' | 'stopping' | 'error'

type RecordingSessionState = {
  mode: RecordingMode
  activeResi: string | null
  queuedResi: string | null
  lastSavedResi: string | null
  lastSavedPath: string | null
  backgroundSaveCount: number
  backgroundSaveMessage: string | null
  backgroundSaveNotice: string | null
  backgroundSaveNoticeKind: 'success' | 'error' | null
  backgroundSaveEventId: number
  message: string
  startedAt: string | null
  recoveryMessage: string | null
}

type RecordingSessionOptions = {
  stream: MediaStream | null
  settings: AppSettings
  operatorName: string
  operatorCode: string
}

type RecordingSessionRef = {
  draftId: string
  resiNumber: string
  startedAt: Date
  fileName: string
  chunks: BlobPart[]
  mimeType: string
} | null

type RecordingSnapshot = {
  draftId: string
  resiNumber: string
  startedAt: Date
  fileName: string
  chunks: BlobPart[]
  mimeType: string
}

type ScanOutcome = {
  accepted: boolean
  action: 'started' | 'continued' | 'queued' | 'already_processed' | 'stopped' | 'idle' | 'error'
  message: string
  resiNumber: string | null
}

function pickRecorderMimeType() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ]

  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? ''
}

export function useRecordingSession({ stream, settings, operatorName, operatorCode }: RecordingSessionOptions) {
  const operatorIdentity = useMemo(
    () => ({
      operatorName: operatorName.trim(),
      operatorCode: operatorCode.trim(),
    }),
    [operatorCode, operatorName],
  )
  const [state, setState] = useState<RecordingSessionState>({
    mode: 'idle',
    activeResi: null,
    queuedResi: null,
    lastSavedResi: null,
    lastSavedPath: null,
    backgroundSaveCount: 0,
    backgroundSaveMessage: null,
    backgroundSaveNotice: null,
    backgroundSaveNoticeKind: null,
    backgroundSaveEventId: 0,
    message: 'Rekaman belum dimulai.',
    startedAt: null,
    recoveryMessage: null,
  })
  const recorderRef = useRef<MediaRecorder | null>(null)
  const sessionRef = useRef<RecordingSessionRef>(null)
  const queuedResiRef = useRef<string | null>(null)
  const stopPromiseResolverRef = useRef<((message: string) => void) | null>(null)

  const supportsRecorder = useMemo(() => typeof MediaRecorder !== 'undefined', [])

  useEffect(() => {
    if (!stream) {
      reportLastError('Kamera belum aktif.')
      recorderRef.current = null
      sessionRef.current = null
      queueMicrotask(() => {
        setState((current) => ({
          ...current,
          mode: 'idle',
          activeResi: null,
          queuedResi: null,
          message: 'Kamera belum siap untuk rekaman.',
          startedAt: null,
        }))
      })
      return
    }

    if (!supportsRecorder) {
      reportLastError('Browser tidak mendukung MediaRecorder.')
      queueMicrotask(() => {
        setState((current) => ({
          ...current,
          mode: 'error',
          message: 'Browser tidak mendukung MediaRecorder.',
        }))
      })
    }
  }, [stream, supportsRecorder])

  useEffect(() => {
    function handlePageExit() {
      if (recorderRef.current) {
        recorderRef.current.requestData?.()
        recorderRef.current.stop()
      }
    }

    window.addEventListener('beforeunload', handlePageExit)
    window.addEventListener('pagehide', handlePageExit)

    return () => {
      window.removeEventListener('beforeunload', handlePageExit)
      window.removeEventListener('pagehide', handlePageExit)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function recover() {
      const recovered = await recoverIncompleteRecordings()
      if (cancelled || !recovered.length) {
        return
      }

      setState((current) => ({
        ...current,
        recoveryMessage: recovered.map((entry) => entry.message).join(' '),
        message: recovered[recovered.length - 1]?.message ?? current.message,
      }))
    }

    void recover()

    return () => {
      cancelled = true
    }
  }, [])

  async function runBackgroundSave(snapshot: RecordingSnapshot, blob: Blob) {
    setState((current) => ({
      ...current,
      backgroundSaveCount: current.backgroundSaveCount + 1,
      backgroundSaveMessage: `Menyimpan data/video ${snapshot.resiNumber} di background...`,
    }))

    try {
      const storedRecord = findRecordingById(snapshot.draftId)

      if (!storedRecord) {
        throw new Error('Rekaman draft tidak ditemukan.')
      }

      const completed = await saveRecordingArtifact(
        storedRecord,
        blob,
      )

      await clearRecordingChunks(snapshot.draftId)
      logScanEvent(
        snapshot.resiNumber,
        'stop',
        `Rekaman selesai untuk ${snapshot.resiNumber}.`,
        {
          operatorName: operatorIdentity.operatorName,
          operatorCode: operatorIdentity.operatorCode,
        },
      )

      setState((current) => ({
        ...current,
        lastSavedResi: completed?.resiNumber ?? snapshot.resiNumber,
        lastSavedPath: completed?.filePath ?? null,
        backgroundSaveCount: Math.max(0, current.backgroundSaveCount - 1),
        backgroundSaveMessage:
          current.backgroundSaveCount - 1 > 0
            ? `Masih ada ${current.backgroundSaveCount - 1} penyimpanan di background.`
            : null,
        backgroundSaveNotice: `Resi ${completed?.resiNumber ?? snapshot.resiNumber} tersimpan.`,
        backgroundSaveNoticeKind: 'success',
        backgroundSaveEventId: current.backgroundSaveEventId + 1,
        message:
          current.activeResi && current.mode === 'recording'
            ? current.message
            : `Rekaman tersimpan: ${snapshot.resiNumber}`,
      }))

      return `Rekaman tersimpan: ${snapshot.resiNumber}`
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal menyimpan rekaman.'
      reportLastError(message)
      setRecordingError(snapshot.draftId, message)
      setState((current) => ({
        ...current,
        mode: current.activeResi && current.mode === 'recording' ? current.mode : 'error',
        backgroundSaveCount: Math.max(0, current.backgroundSaveCount - 1),
        backgroundSaveMessage:
          current.backgroundSaveCount - 1 > 0
            ? `Masih ada ${current.backgroundSaveCount - 1} penyimpanan di background.`
            : null,
        backgroundSaveNotice: `Gagal menyimpan resi ${snapshot.resiNumber}.`,
        backgroundSaveNoticeKind: 'error',
        backgroundSaveEventId: current.backgroundSaveEventId + 1,
        message: current.activeResi && current.mode === 'recording' ? current.message : message,
      }))
      return message
    }
  }

  async function finalizeCurrentRecording(nextResi: string | null = null) {
    const recorder = recorderRef.current
    const session = sessionRef.current

    if (!recorder || !session) {
      return 'Tidak ada rekaman aktif.'
    }

    const snapshot: RecordingSnapshot = {
      draftId: session.draftId,
      resiNumber: session.resiNumber,
      startedAt: session.startedAt,
      fileName: session.fileName,
      chunks: [...session.chunks],
      mimeType: recorder.mimeType || session.mimeType || 'video/webm',
    }

    const blob = new Blob(snapshot.chunks, {
      type: snapshot.mimeType,
    })

    recorderRef.current = null
    sessionRef.current = null

    if (nextResi) {
      setState((current) => ({
        ...current,
        mode: 'recording',
        activeResi: nextResi,
        queuedResi: null,
        startedAt: null,
        message: `Merekam resi ${nextResi}`,
      }))

      startRecording(nextResi)
    } else {
      setState((current) => ({
        ...current,
        mode: 'idle',
        activeResi: null,
        queuedResi: null,
        startedAt: null,
        message: `Rekaman dihentikan. Penyimpanan data/video ${snapshot.resiNumber} berjalan di background.`,
      }))
    }

    const backgroundSave = runBackgroundSave(snapshot, blob)

    stopPromiseResolverRef.current?.(`Rekaman dihentikan. Penyimpanan ${snapshot.resiNumber} berjalan di background.`)
    stopPromiseResolverRef.current = null

    return backgroundSave.then(() => `Rekaman dihentikan. Penyimpanan ${snapshot.resiNumber} berjalan di background.`)
  }

  function startRecording(resiNumber: string) {
    if (!stream) {
      reportLastError('Kamera belum aktif.')
      setState((current) => ({
        ...current,
        mode: 'error',
        message: 'Kamera belum aktif.',
      }))
      return
    }

    if (!supportsRecorder) {
      reportLastError('Browser tidak mendukung MediaRecorder.')
      setState((current) => ({
        ...current,
        mode: 'error',
        message: 'Browser tidak mendukung MediaRecorder.',
      }))
      return
    }

    const mimeType = pickRecorderMimeType()
    const recorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType } : undefined,
    )
    const startedAt = new Date()
    const fileName = `${resiNumber}.${settings.videoFormat}`
    const draft = createRecordingDraft({
      resiNumber,
      startedAt,
      settings,
      operatorName: operatorIdentity.operatorName,
      operatorCode: operatorIdentity.operatorCode,
      mimeType: mimeType || recorder.mimeType || 'video/webm',
    })

    logScanEvent(
      resiNumber,
      'start',
      `Rekaman dimulai untuk ${resiNumber}.`,
      {
        operatorName: operatorIdentity.operatorName,
        operatorCode: operatorIdentity.operatorCode,
      },
    )

    const session: NonNullable<RecordingSessionRef> = {
      draftId: draft.id,
      resiNumber,
      startedAt,
      fileName,
      chunks: [],
      mimeType: mimeType || recorder.mimeType || 'video/webm',
    }

    sessionRef.current = session
    recorderRef.current = recorder
    queuedResiRef.current = null

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0 && sessionRef.current?.draftId === session.draftId) {
        sessionRef.current.chunks.push(event.data)
        void saveRecordingChunk(session.draftId, sessionRef.current.chunks.length - 1, event.data)
      }
    }

    recorder.onerror = () => {
      setState((current) => ({
        ...current,
        mode: 'error',
        message: 'Recorder mengalami error.',
      }))
    }

    recorder.onstop = () => {
      const nextResi = queuedResiRef.current
      queuedResiRef.current = null
      void finalizeCurrentRecording(nextResi)
    }

    try {
      recorder.start(1000)
      setState((current) => ({
        ...current,
        mode: 'recording',
        activeResi: resiNumber,
        queuedResi: null,
        message: `Merekam resi ${resiNumber}`,
        startedAt: startedAt.toISOString(),
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal memulai rekaman.'
      reportLastError(message)
      setState((current) => ({
        ...current,
        mode: 'error',
        message,
      }))
    }
  }

  async function stopCurrentRecording() {
    const recorder = recorderRef.current

    if (!recorder) {
      return 'Tidak ada rekaman aktif.'
    }

    if (state.mode === 'stopping') {
      return new Promise<string>((resolve) => {
        stopPromiseResolverRef.current = resolve
      })
    }

    setState((current) => ({
      ...current,
      mode: 'stopping',
      message: 'Menyimpan data/video...',
    }))

    const pending = new Promise<string>((resolve) => {
      stopPromiseResolverRef.current = resolve
    })

    recorder.stop()
    return pending
  }

  async function handleScan(rawResiNumber: string): Promise<ScanOutcome> {
    const resiNumber = rawResiNumber.trim()

    if (!resiNumber) {
      return {
        accepted: false,
        action: 'error',
        message: 'Resi tidak boleh kosong.',
        resiNumber: null,
      }
    }

    if (resiNumber === state.activeResi && recorderRef.current && state.mode !== 'idle') {
      const message = `Resi ini sedang diproses.`
      logScanEvent(
        resiNumber,
        'duplicate',
        'Resi yang sama discan ulang saat recording aktif.',
        {
          operatorName: operatorIdentity.operatorName,
          operatorCode: operatorIdentity.operatorCode,
        },
      )
      setState((current) => ({
        ...current,
        message,
      }))
      return {
        accepted: true,
        action: 'continued',
        message,
        resiNumber,
      }
    }

    const latestRecording = findLatestRecordingByResi(resiNumber)
    if (latestRecording?.status === 'completed' && resiNumber !== state.activeResi) {
      const message = 'Resi ini sudah diproses.'
      logScanEvent(
        resiNumber,
        'duplicate',
        'Resi yang sudah pernah diproses discan ulang.',
        {
          operatorName: operatorIdentity.operatorName,
          operatorCode: operatorIdentity.operatorCode,
        },
      )
      setState((current) => ({
        ...current,
        message,
      }))
      return {
        accepted: false,
        action: 'already_processed',
        message,
        resiNumber,
      }
    }

    if (state.mode === 'idle' || !recorderRef.current) {
      startRecording(resiNumber)
      return {
        accepted: true,
        action: 'started',
        message: `Merekam resi ${resiNumber}.`,
        resiNumber,
      }
    }

    queuedResiRef.current = resiNumber
    setState((current) => ({
      ...current,
      queuedResi: resiNumber,
      mode: current.mode === 'stopping' ? current.mode : 'stopping',
      message: 'Menyimpan data/video...',
    }))

    if (state.mode !== 'stopping') {
      void stopCurrentRecording()
    }

    return {
      accepted: true,
      action: 'queued',
      message: `Resi ${resiNumber} menunggu giliran diproses. Penyimpanan data/video resi aktif berjalan di background.`,
      resiNumber,
    }
  }

  function clearError() {
    setState((current) => ({
      ...current,
      mode: 'idle',
      message: 'Rekaman siap.',
    }))
  }

  return {
    state,
    handleScan,
    stopRecording: stopCurrentRecording,
    clearError,
  }
}

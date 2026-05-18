import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createRecordingDraft,
  findLatestRecordingByResiAndTask,
  findRecordingById,
  hydrateRecordings,
  recoverIncompleteRecordings,
  invalidateCompletedRecordingsForResi,
  saveRecordingArtifact,
  saveRecordingChunk,
  setRecordingError,
} from '@pakti/shared/recordings'
import type { AppSettings } from '@pakti/types'
import { logScanEvent } from '@pakti/shared'
import { createServerRecordingDraftApi, reportServerLastErrorApi } from '@pakti/api-client'

type RecordingMode = 'idle' | 'recording' | 'stopping' | 'saving' | 'ready_to_record_next' | 'error'

type RecordingSessionState = {
  mode: RecordingMode
  activeResi: string | null
  queuedResi: string | null
  savingResi: string | null
  lastSavedResi: string | null
  lastSavedPath: string | null
  message: string
  startedAt: string | null
  recoveryMessage: string | null
}

type RecordingSessionOptions = {
  stream: MediaStream | null
  settings: AppSettings
  operatorName: string
  operatorCode: string
  taskType: 'qc' | 'packing'
  repeatQcResi?: string | null
}

type RecordingSessionRef = {
  draftId: string
  resiNumber: string
  startedAt: Date
  fileName: string
  mimeType: string
  pendingUploads: Promise<void>[]
  hasUploadFailure: boolean
} | null

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

export function useRecordingSession({ stream, settings, operatorName, operatorCode, taskType, repeatQcResi }: RecordingSessionOptions) {
  const operatorIdentity = useMemo(
    () => ({
      operatorName: operatorName.trim(),
      operatorCode: operatorCode.trim(),
      taskType,
    }),
    [operatorCode, operatorName, taskType],
  )
  const repeatQcTarget = useMemo(() => repeatQcResi?.trim() || null, [repeatQcResi])
  const [state, setState] = useState<RecordingSessionState>({
    mode: 'idle',
    activeResi: null,
    queuedResi: null,
    savingResi: null,
    lastSavedResi: null,
    lastSavedPath: null,
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
      void reportServerLastErrorApi('Kamera belum aktif.').catch(() => undefined)
      recorderRef.current = null
      sessionRef.current = null
      queuedResiRef.current = null
      queueMicrotask(() => {
        setState((current) => ({
          ...current,
          mode: 'idle',
          activeResi: null,
          queuedResi: null,
          savingResi: null,
          message: 'Kamera belum siap untuk rekaman.',
          startedAt: null,
        }))
      })
      return
    }

    if (!supportsRecorder) {
      void reportServerLastErrorApi('Browser tidak mendukung MediaRecorder.').catch(() => undefined)
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
      await hydrateRecordings()
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

  async function saveRecordingSnapshot(snapshot: NonNullable<RecordingSessionRef>) {
    setState((current) => ({
      ...current,
      mode: 'saving',
      activeResi: snapshot.resiNumber,
      queuedResi: queuedResiRef.current,
      savingResi: snapshot.resiNumber,
      message: `Menyimpan video resi ${snapshot.resiNumber}...`,
      startedAt: null,
    }))

    try {
      const storedRecord = findRecordingById(snapshot.draftId)

      if (!storedRecord) {
        throw new Error('Rekaman draft tidak ditemukan.')
      }

      await Promise.allSettled(snapshot.pendingUploads)

      if (snapshot.hasUploadFailure) {
        throw new Error('Salah satu chunk video gagal diunggah ke server.')
      }

      const completed = await saveRecordingArtifact(storedRecord)

      logScanEvent(
        snapshot.resiNumber,
        'stop',
        `Rekaman selesai untuk ${snapshot.resiNumber}.`,
        {
          operatorName: operatorIdentity.operatorName,
          operatorCode: operatorIdentity.operatorCode,
        },
        operatorIdentity.taskType,
      )

      setState((current) => ({
        ...current,
        lastSavedResi: completed?.resiNumber ?? snapshot.resiNumber,
        lastSavedPath: completed?.filePath ?? null,
        savingResi: null,
        message: `Penyimpanan video resi ${snapshot.resiNumber} selesai.`,
      }))

      return {
        ok: true,
        message: `Penyimpanan video resi ${snapshot.resiNumber} selesai.`,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal menyimpan rekaman.'
      void reportServerLastErrorApi(message).catch(() => undefined)
      setRecordingError(snapshot.draftId, message)
      queuedResiRef.current = null
      setState((current) => ({
        ...current,
        mode: 'error',
        queuedResi: null,
        savingResi: null,
        message,
      }))
      return {
        ok: false,
        message,
      }
    }
  }

  async function finalizeCurrentRecording() {
    const recorder = recorderRef.current
    const session = sessionRef.current

    if (!recorder || !session) {
      return 'Tidak ada rekaman aktif.'
    }

    const snapshot: NonNullable<RecordingSessionRef> = {
      draftId: session.draftId,
      resiNumber: session.resiNumber,
      startedAt: session.startedAt,
      fileName: session.fileName,
      mimeType: recorder.mimeType || session.mimeType || 'video/webm',
      pendingUploads: [...session.pendingUploads],
      hasUploadFailure: session.hasUploadFailure,
    }

    recorderRef.current = null
    sessionRef.current = null

    setState((current) => ({
      ...current,
      mode: 'saving',
      activeResi: snapshot.resiNumber,
      queuedResi: queuedResiRef.current,
      savingResi: snapshot.resiNumber,
      message: `Menyimpan video resi ${snapshot.resiNumber}...`,
      startedAt: null,
    }))

    const saveResult = await saveRecordingSnapshot(snapshot)

    if (!saveResult.ok) {
      const errorMessage = saveResult.message
      stopPromiseResolverRef.current?.(errorMessage)
      stopPromiseResolverRef.current = null
      return errorMessage
    }

    const nextResi = queuedResiRef.current
    queuedResiRef.current = null

    if (nextResi) {
      setState((current) => ({
        ...current,
        mode: 'ready_to_record_next',
        queuedResi: nextResi,
        message: `Penyimpanan selesai. Siap merekam resi ${nextResi}.`,
      }))

      await new Promise<void>((resolve) => {
        window.setTimeout(() => resolve(), 0)
      })

      const started = await startRecording(nextResi)
      const finalMessage = started
        ? `Rekaman ${snapshot.resiNumber} tersimpan. Rekaman baru dimulai untuk ${nextResi}.`
        : `Rekaman ${snapshot.resiNumber} tersimpan, tetapi gagal memulai resi ${nextResi}.`

      stopPromiseResolverRef.current?.(finalMessage)
      stopPromiseResolverRef.current = null

      return finalMessage
    }

    setState((current) => ({
      ...current,
      mode: 'idle',
      activeResi: null,
      queuedResi: null,
      savingResi: null,
      startedAt: null,
      message: `Rekaman tersimpan: ${snapshot.resiNumber}`,
    }))

    const finalMessage = `Rekaman tersimpan: ${snapshot.resiNumber}`
    stopPromiseResolverRef.current?.(finalMessage)
    stopPromiseResolverRef.current = null

    return finalMessage
  }

  async function startRecording(resiNumber: string) {
    if (!stream) {
      void reportServerLastErrorApi('Kamera belum aktif.').catch(() => undefined)
      setState((current) => ({
        ...current,
        mode: 'error',
        message: 'Kamera belum aktif.',
      }))
      return false
    }

    if (!supportsRecorder) {
      void reportServerLastErrorApi('Browser tidak mendukung MediaRecorder.').catch(() => undefined)
      setState((current) => ({
        ...current,
        mode: 'error',
        message: 'Browser tidak mendukung MediaRecorder.',
      }))
      return false
    }

    const mimeType = pickRecorderMimeType()
    const recorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType } : undefined,
    )
    const startedAt = new Date()
    const draft = createRecordingDraft({
      resiNumber,
      taskType: operatorIdentity.taskType,
      startedAt,
      settings,
      operatorName: operatorIdentity.operatorName,
      operatorCode: operatorIdentity.operatorCode,
      mimeType: mimeType || recorder.mimeType || 'video/webm',
    })

    try {
      await createServerRecordingDraftApi({
        id: draft.id,
        resiNumber: draft.resiNumber,
        taskType: draft.taskType,
        operatorName: draft.operatorName ?? '',
        operatorCode: draft.operatorCode ?? '',
        startedAt: draft.startTime,
        fileName: draft.fileName,
        filePath: draft.filePath,
        fileSizeBytes: draft.fileSizeBytes,
        status: draft.status,
        note: draft.note,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal membuat draft recording.'
      void reportServerLastErrorApi(message).catch(() => undefined)
      setRecordingError(draft.id, message)
      setState((current) => ({
        ...current,
        mode: 'error',
        message,
      }))
      return false
    }

    logScanEvent(
      resiNumber,
      'start',
      `Rekaman dimulai untuk ${resiNumber}.`,
      {
        operatorName: operatorIdentity.operatorName,
        operatorCode: operatorIdentity.operatorCode,
      },
      operatorIdentity.taskType,
    )

    const session: NonNullable<RecordingSessionRef> = {
      draftId: draft.id,
      resiNumber,
      startedAt,
      fileName: draft.fileName,
      mimeType: mimeType || recorder.mimeType || 'video/webm',
      pendingUploads: [],
      hasUploadFailure: false,
    }

    sessionRef.current = session
    recorderRef.current = recorder
    queuedResiRef.current = null

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0 && sessionRef.current?.draftId === session.draftId) {
        const uploadPromise = saveRecordingChunk(session.draftId, session.pendingUploads.length, event.data).catch(
          (error) => {
            session.hasUploadFailure = true
            void reportServerLastErrorApi(
              error instanceof Error ? error.message : 'Gagal mengunggah chunk video.',
            ).catch(() => undefined)
            setState((current) => ({
              ...current,
              mode: 'error',
              message: error instanceof Error ? error.message : 'Gagal mengunggah chunk video.',
            }))
          },
        )
        session.pendingUploads.push(uploadPromise)
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
      void finalizeCurrentRecording()
    }

    try {
      recorder.start(1000)
      setState((current) => ({
        ...current,
        mode: 'recording',
        activeResi: resiNumber,
        queuedResi: null,
        savingResi: null,
        message: `Merekam resi ${resiNumber}`,
        startedAt: startedAt.toISOString(),
      }))
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal memulai rekaman.'
      void reportServerLastErrorApi(message).catch(() => undefined)
      setState((current) => ({
        ...current,
        mode: 'error',
        message,
      }))
      return false
    }
  }

  async function stopCurrentRecording() {
    const recorder = recorderRef.current

    if (!recorder) {
      return state.mode === 'saving' || state.mode === 'ready_to_record_next'
        ? state.message
        : 'Tidak ada rekaman aktif.'
    }

    if (state.mode === 'stopping' || state.mode === 'saving') {
      return state.message
    }

    setState((current) => ({
      ...current,
      mode: 'stopping',
      message: 'Menghentikan rekaman dan menyiapkan penyimpanan...',
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
        operatorIdentity.taskType,
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

    if (state.mode === 'error' && !recorderRef.current) {
      const message = state.message
      return {
        accepted: false,
        action: 'error',
        message,
        resiNumber,
      }
    }

    await hydrateRecordings()

    const latestRecording = findLatestRecordingByResiAndTask(resiNumber, operatorIdentity.taskType)
    const qcRecording = findLatestRecordingByResiAndTask(resiNumber, 'qc')
    const isRepeatQcTarget = operatorIdentity.taskType === 'qc' && repeatQcTarget === resiNumber

    if (repeatQcTarget && operatorIdentity.taskType === 'qc' && resiNumber !== repeatQcTarget) {
      const message = `Mode ulangi QC aktif untuk resi ${repeatQcTarget}.`
      logScanEvent(
        resiNumber,
        'duplicate',
        message,
        {
          operatorName: operatorIdentity.operatorName,
          operatorCode: operatorIdentity.operatorCode,
        },
        operatorIdentity.taskType,
      )
      setState((current) => ({
        ...current,
        message,
      }))
      return {
        accepted: false,
        action: 'error',
        message,
        resiNumber,
      }
    }

    if (isRepeatQcTarget) {
      try {
        await invalidateCompletedRecordingsForResi(resiNumber)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Gagal menyiapkan ulang QC.'
        void reportServerLastErrorApi(message).catch(() => undefined)
        setState((current) => ({
          ...current,
          message,
        }))
        return {
          accepted: false,
          action: 'error',
          message,
          resiNumber,
        }
      }
    }

    if (operatorIdentity.taskType === 'packing' && qcRecording?.status !== 'completed') {
      const message = 'Resi ini belum selesai QC, packing belum bisa dimulai.'
      logScanEvent(
        resiNumber,
        'duplicate',
        message,
        {
          operatorName: operatorIdentity.operatorName,
          operatorCode: operatorIdentity.operatorCode,
        },
        operatorIdentity.taskType,
      )
      setState((current) => ({
        ...current,
        message,
      }))
      return {
        accepted: false,
        action: 'error',
        message,
        resiNumber,
      }
    }

    if (latestRecording?.status === 'completed' && resiNumber !== state.activeResi && !isRepeatQcTarget) {
      const message = 'Resi ini sudah diproses.'
      logScanEvent(
        resiNumber,
        'duplicate',
        'Resi yang sudah pernah diproses discan ulang.',
        {
          operatorName: operatorIdentity.operatorName,
          operatorCode: operatorIdentity.operatorCode,
        },
        operatorIdentity.taskType,
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

    if (state.mode === 'idle' && !recorderRef.current) {
      const started = await startRecording(resiNumber)
      return {
        accepted: started,
        action: started ? 'started' : 'error',
        message: started ? `Merekam resi ${resiNumber}.` : 'Gagal memulai rekaman.',
        resiNumber,
      }
    }

    queuedResiRef.current = resiNumber
    setState((current) => ({
      ...current,
      queuedResi: resiNumber,
      mode: current.mode === 'saving' ? current.mode : 'stopping',
      message:
        current.mode === 'saving'
          ? `Penyimpanan sedang berjalan. Resi ${resiNumber} akan diproses setelah selesai.`
          : 'Menyimpan data/video...',
    }))

    if (state.mode === 'recording') {
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

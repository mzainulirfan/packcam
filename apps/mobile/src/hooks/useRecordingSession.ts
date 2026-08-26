import { useEffect, useMemo, useRef, useState } from 'react'
import { createRecordingDraft, saveRecordingArtifact, saveRecordingChunk } from '@pakti/shared/recordings'
import { logScanEvent } from '@pakti/shared'
import { createServerRecordingDraftApi, reportServerLastErrorApi } from '@pakti/api-client'
import type { AppSettings, WorkTask } from '@pakti/types'
import type { LocalRecordingRecord } from '@pakti/shared/recordings'

type RecordingMode = 'idle' | 'recording' | 'stopping' | 'saving' | 'error'

type RecordingSessionState = {
  mode: RecordingMode
  activeResi: string | null
  savingResi: string | null
  lastSavedResi: string | null
  lastSavedPath: string | null
  message: string
  startedAt: string | null
}

type RecordingSessionOptions = {
  stream: MediaStream | null
  settings: Pick<AppSettings, 'videoRootPath' | 'videoFormat'>
  operatorName: string
  operatorCode: string
  taskType: WorkTask
}

type RecordingSessionRef = {
  draft: LocalRecordingRecord
  startedAt: Date
  mimeType: string
  pendingUploads: Promise<void>[]
  hasUploadFailure: boolean
} | null

const RECORDING_VIDEO_BITS_PER_SECOND = 900_000
const RECORDING_AUDIO_BITS_PER_SECOND = 64_000

function pickRecorderMimeType() {
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? ''
}

function normalizeMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export function useMobileRecordingSession({ stream, settings, operatorName, operatorCode, taskType }: RecordingSessionOptions) {
  const operatorIdentity = useMemo(
    () => ({
      operatorName: operatorName.trim(),
      operatorCode: operatorCode.trim(),
      taskType,
    }),
    [operatorCode, operatorName, taskType],
  )
  const [state, setState] = useState<RecordingSessionState>({
    mode: 'idle',
    activeResi: null,
    savingResi: null,
    lastSavedResi: null,
    lastSavedPath: null,
    message: 'Rekaman siap.',
    startedAt: null,
  })
  const recorderRef = useRef<MediaRecorder | null>(null)
  const sessionRef = useRef<RecordingSessionRef>(null)
  const stopResolveRef = useRef<((message: string) => void) | null>(null)

  const supportsRecorder = useMemo(() => typeof MediaRecorder !== 'undefined', [])

  useEffect(() => {
    if (!stream) {
      recorderRef.current = null
      sessionRef.current = null
      queueMicrotask(() => {
        setState((current) => ({
          ...current,
          mode: 'idle',
          activeResi: null,
          savingResi: null,
          startedAt: null,
          message: 'Kamera belum siap untuk rekaman.',
        }))
      })
      return
    }

    if (!supportsRecorder) {
      queueMicrotask(() => {
        setState((current) => ({
          ...current,
          mode: 'error',
          message: 'Browser tidak mendukung MediaRecorder.',
        }))
      })
    }
  }, [stream, supportsRecorder])

  async function finalizeRecording() {
    const recorder = recorderRef.current
    const session = sessionRef.current

    if (!recorder || !session) {
      return 'Tidak ada rekaman aktif.'
    }

    const snapshot: NonNullable<RecordingSessionRef> = {
      draft: session.draft,
      startedAt: session.startedAt,
      mimeType: recorder.mimeType || session.mimeType || 'video/webm',
      pendingUploads: [...session.pendingUploads],
      hasUploadFailure: session.hasUploadFailure,
    }

    recorderRef.current = null
    sessionRef.current = null

    setState((current) => ({
      ...current,
      mode: 'saving',
      activeResi: snapshot.draft.resiNumber,
      savingResi: snapshot.draft.resiNumber,
      startedAt: null,
      message: `Menyimpan video resi ${snapshot.draft.resiNumber}...`,
    }))

    try {
      await Promise.allSettled(snapshot.pendingUploads)
      if (snapshot.hasUploadFailure) {
        throw new Error('Salah satu chunk video gagal diunggah ke server.')
      }

      const finalRecord = await saveRecordingArtifact(snapshot.draft)

      logScanEvent(
        snapshot.draft.resiNumber,
        'stop',
        `Rekaman selesai untuk ${snapshot.draft.resiNumber}.`,
        {
          operatorName: operatorIdentity.operatorName,
          operatorCode: operatorIdentity.operatorCode,
        },
        operatorIdentity.taskType,
      )

      setState((current) => ({
        ...current,
        mode: 'idle',
        activeResi: null,
        savingResi: null,
        lastSavedResi: finalRecord?.resiNumber ?? snapshot.draft.resiNumber,
        lastSavedPath: finalRecord?.filePath ?? null,
        message: `Rekaman tersimpan: ${snapshot.draft.resiNumber}`,
      }))

      stopResolveRef.current?.(`Rekaman tersimpan: ${snapshot.draft.resiNumber}`)
      stopResolveRef.current = null

      return `Rekaman tersimpan: ${snapshot.draft.resiNumber}`
    } catch (error) {
      const message = normalizeMessage(error, 'Gagal menyimpan rekaman.')
      void reportServerLastErrorApi(message).catch(() => undefined)
      setState((current) => ({
        ...current,
        mode: 'error',
        savingResi: null,
        message,
      }))

      stopResolveRef.current?.(message)
      stopResolveRef.current = null
      return message
    }
  }

  async function startRecording(resiNumber: string) {
    if (state.mode === 'recording' || state.mode === 'stopping' || state.mode === 'saving') {
      return 'Rekaman sedang berjalan.'
    }

    if (!stream) {
      const message = 'Kamera belum aktif.'
      setState((current) => ({
        ...current,
        mode: 'error',
        message,
      }))
      return message
    }

    if (!supportsRecorder) {
      const message = 'Browser tidak mendukung MediaRecorder.'
      setState((current) => ({
        ...current,
        mode: 'error',
        message,
      }))
      return message
    }

    const mimeType = pickRecorderMimeType()
    const recorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: RECORDING_VIDEO_BITS_PER_SECOND,
      audioBitsPerSecond: RECORDING_AUDIO_BITS_PER_SECOND,
    })
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
      const message = normalizeMessage(error, 'Gagal membuat draft recording.')
      void reportServerLastErrorApi(message).catch(() => undefined)
      setState((current) => ({
        ...current,
        mode: 'error',
        message,
      }))
      return message
    }

    const session: NonNullable<RecordingSessionRef> = {
      draft,
      startedAt,
      mimeType: mimeType || recorder.mimeType || 'video/webm',
      pendingUploads: [],
      hasUploadFailure: false,
    }

    sessionRef.current = session
    recorderRef.current = recorder

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0 && sessionRef.current?.draft.id === session.draft.id) {
        const uploadPromise = saveRecordingChunk(session.draft.id, session.pendingUploads.length, event.data).catch(
          (error) => {
            session.hasUploadFailure = true
            const message = normalizeMessage(error, 'Gagal mengunggah chunk video.')
            void reportServerLastErrorApi(message).catch(() => undefined)
            setState((current) => ({
              ...current,
              mode: 'error',
              message,
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
      void finalizeRecording()
    }

    try {
      recorder.start(3000)
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
      setState((current) => ({
        ...current,
        mode: 'recording',
        activeResi: resiNumber,
        savingResi: null,
        message: `Merekam resi ${resiNumber}.`,
        startedAt: startedAt.toISOString(),
      }))
      return `Merekam resi ${resiNumber}.`
    } catch (error) {
      const message = normalizeMessage(error, 'Gagal memulai rekaman.')
      void reportServerLastErrorApi(message).catch(() => undefined)
      setState((current) => ({
        ...current,
        mode: 'error',
        message,
      }))
      return message
    }
  }

  async function stopRecording() {
    const recorder = recorderRef.current

    if (!recorder) {
      return state.mode === 'saving' ? state.message : 'Tidak ada rekaman aktif.'
    }

    if (state.mode === 'stopping' || state.mode === 'saving') {
      return state.message
    }

    setState((current) => ({
      ...current,
      mode: 'stopping',
      message: 'Menghentikan rekaman...',
    }))

    recorder.stop()

    return new Promise<string>((resolve) => {
      stopResolveRef.current = resolve
    })
  }

  function resetError() {
    setState((current) => ({
      ...current,
      mode: 'idle',
      message: 'Rekaman siap.',
    }))
  }

  return {
    state,
    startRecording,
    stopRecording,
    resetError,
  }
}

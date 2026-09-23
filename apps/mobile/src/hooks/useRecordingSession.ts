import { useEffect, useMemo, useRef, useState } from 'react'
import { createRecordingDraft, saveRecordingArtifact, saveRecordingChunk } from '@pakti/shared/recordings'
import { logScanEvent } from '@pakti/shared'
import { createServerRecordingDraftApi, deleteServerRecordingApi, reportServerLastErrorApi } from '@pakti/api-client'
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
  packingSessionId?: string | null
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

export function useMobileRecordingSession({ stream, settings, operatorName, operatorCode, taskType, packingSessionId = null }: RecordingSessionOptions) {
  const operatorIdentity = useMemo(
    () => ({
      operatorName: operatorName.trim(),
      operatorCode: operatorCode.trim(),
      taskType,
      packingSessionId,
    }),
    [operatorCode, operatorName, packingSessionId, taskType],
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
  // Cermin sinkron agar guard tidak kalah oleh stale closure antar tap/scan cepat.
  const modeRef = useRef<RecordingMode>('idle')
  const startBusyRef = useRef(false)
  const failedDraftIdRef = useRef<string | null>(null)

  useEffect(() => {
    modeRef.current = state.mode
  }, [state.mode])

  const supportsRecorder = useMemo(() => typeof MediaRecorder !== 'undefined', [])

  useEffect(() => {
    if (!stream) {
      const recorder = recorderRef.current
      const session = sessionRef.current
      // Stream hilang saat rekam (pindah tab / kamera error): coba stop agar
      // onstop -> finalize tetap jalan, jangan orphan-kan draft diam-diam.
      if (recorder && session && recorder.state !== 'inactive') {
        try {
          recorder.stop()
        } catch {
          // Abaikan; finalize/error handler yang menyelesaikan.
        }
        return
      }
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
      failedDraftIdRef.current = snapshot.draft.id
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
    if (startBusyRef.current || modeRef.current === 'recording' || modeRef.current === 'stopping' || modeRef.current === 'saving') {
      return 'Rekaman sedang berjalan.'
    }
    startBusyRef.current = true

    if (!stream) {
      const message = 'Kamera belum aktif.'
      setState((current) => ({
        ...current,
        mode: 'error',
        message,
      }))
      startBusyRef.current = false
      return message
    }

    if (!supportsRecorder) {
      const message = 'Browser tidak mendukung MediaRecorder.'
      setState((current) => ({
        ...current,
        mode: 'error',
        message,
      }))
      startBusyRef.current = false
      return message
    }

    const mimeType = pickRecorderMimeType()
    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: RECORDING_VIDEO_BITS_PER_SECOND,
        audioBitsPerSecond: RECORDING_AUDIO_BITS_PER_SECOND,
      })
    } catch (error) {
      const message = normalizeMessage(error, 'Browser tidak bisa memulai rekaman dengan konfigurasi video ini.')
      setState((current) => ({
        ...current,
        mode: 'error',
        message,
      }))
      startBusyRef.current = false
      return message
    }
    const startedAt = new Date()
    const draft = createRecordingDraft({
      resiNumber,
      taskType: operatorIdentity.taskType,
      startedAt,
      settings,
      operatorName: operatorIdentity.operatorName,
      operatorCode: operatorIdentity.operatorCode,
      mimeType: mimeType || recorder.mimeType || 'video/webm',
      mediaType: 'video',
      packingSessionId: operatorIdentity.taskType === 'packing' ? operatorIdentity.packingSessionId : null,
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
        mediaType: draft.mediaType,
        packingSessionId: draft.packingSessionId,
      })
    } catch (error) {
      const message = normalizeMessage(error, 'Gagal membuat draft recording.')
      void reportServerLastErrorApi(message).catch(() => undefined)
      setState((current) => ({
        ...current,
        mode: 'error',
        message,
      }))
      startBusyRef.current = false
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
      startBusyRef.current = false
      return `Merekam resi ${resiNumber}.`
    } catch (error) {
      const message = normalizeMessage(error, 'Gagal memulai rekaman.')
      void reportServerLastErrorApi(message).catch(() => undefined)
      setState((current) => ({
        ...current,
        mode: 'error',
        message,
      }))
      startBusyRef.current = false
      return message
    }
  }

  async function stopRecording() {
    const recorder = recorderRef.current

    if (!recorder) {
      return modeRef.current === 'saving' ? state.message : 'Tidak ada rekaman aktif.'
    }

    if (modeRef.current === 'stopping' || modeRef.current === 'saving') {
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
    failedDraftIdRef.current = null
    setState((current) => ({
      ...current,
      mode: 'idle',
      activeResi: null,
      savingResi: null,
      message: 'Rekaman siap.',
    }))
  }

  /** Buang draft gagal di server (best-effort) lalu kembalikan ke idle agar scanner jalan lagi. */
  async function discardErrorDraft() {
    const draftId = failedDraftIdRef.current ?? sessionRef.current?.draft.id ?? null
    if (draftId) {
      try {
        await deleteServerRecordingApi(draftId)
      } catch {
        // Abaikan: draft mungkin memang tidak tersimpan di server.
      }
    }
    recorderRef.current = null
    sessionRef.current = null
    failedDraftIdRef.current = null
    setState((current) => ({
      ...current,
      mode: 'idle',
      activeResi: null,
      savingResi: null,
      message: 'Rekaman siap.',
    }))
  }

  return {
    state,
    startRecording,
    stopRecording,
    resetError,
    discardErrorDraft,
  }
}

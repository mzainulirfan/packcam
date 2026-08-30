import { type Dispatch, type SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildServerFileUrl, prepareServerRecordingShareFileApi } from '@pakti/api-client'
import type { RecordingRow, WorkTask } from '@pakti/types'

type PreparedShareFile = {
  fileName: string
  filePath: string
  mimeType: string
  file: File
}

type ShareFileInfo = {
  fileName: string
  filePath: string
  mimeType: string
}

function isPhotoRecord(record: RecordingRow) {
  if (record.mediaType === 'photo') return true
  const fileName = `${record.fileName ?? ''} ${record.filePath ?? ''}`.toLowerCase()
  return /\.(jpe?g|png|webp)(?:\?|#|$)/.test(fileName)
}

type ScanNotice = {
  kind: 'success' | 'warning'
  title: string
  message: string
}

type UseSharePreparationParams = {
  active: boolean
  recordings: RecordingRow[]
  setRecordings: Dispatch<SetStateAction<RecordingRow[]>>
  refreshHistory: () => Promise<void>
  setBootError: (message: string) => void
  showScanNotice: (notice: ScanNotice) => void
  formatTask: (taskType: WorkTask) => string
  normalizeError: (error: unknown) => string
}

export function useSharePreparation({
  active,
  recordings,
  setRecordings,
  refreshHistory,
  setBootError,
  showScanNotice,
  formatTask,
  normalizeError,
}: UseSharePreparationParams) {
  const [sharingRecordId, setSharingRecordId] = useState<string | null>(null)
  const [preparingShareFileIds, setPreparingShareFileIds] = useState<Set<string>>(() => new Set())
  const [shareProgressByRecordingId, setShareProgressByRecordingId] = useState<Map<string, number>>(() => new Map())
  const [sharePreparationErrors, setSharePreparationErrors] = useState<Map<string, string>>(() => new Map())
  const [preparedShareFileIds, setPreparedShareFileIds] = useState<Set<string>>(() => new Set())
  const preparedShareFilesRef = useRef(new Map<string, PreparedShareFile>())
  const requestedShareFileIdsRef = useRef(new Set<string>())

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handleShareProgress = (event: Event) => {
      const detail = (event as CustomEvent<{ recordingId?: string; progress?: number }>).detail
      if (!detail?.recordingId || typeof detail.progress !== 'number') {
        return
      }

      setShareProgressByRecordingId((current) => {
        const next = new Map(current)
        next.set(detail.recordingId!, Math.max(0, Math.min(99, Math.round(detail.progress!))))
        return next
      })
    }

    window.addEventListener('pakti:share-file-progress', handleShareProgress)
    return () => window.removeEventListener('pakti:share-file-progress', handleShareProgress)
  }, [])

  const markShareFilePrepared = useCallback((recordId: string, shareFile: ShareFileInfo) => {
    setRecordings((current) => current.map((row) => row.id === recordId ? {
      ...row,
      shareFileName: shareFile.fileName,
      shareFilePath: shareFile.filePath,
      shareFileMimeType: shareFile.mimeType,
      shareFileReady: true,
    } : row))
    setPreparedShareFileIds((current) => new Set(current).add(recordId))
  }, [setRecordings])

  useEffect(() => {
    if (!active) {
      return
    }

    const pendingRecords = recordings
      .filter((record) => record.status === 'completed' && Boolean(record.filePath) && !isPhotoRecord(record) && !record.shareFileReady)
    const activeRecords = pendingRecords.slice(0, 3)

    if (activeRecords.length === 0) {
      return
    }

    let cancelled = false

    async function preparePendingShareFiles() {
      let preparedAny = false
      for (const record of activeRecords) {
        if (cancelled || requestedShareFileIdsRef.current.has(record.id)) {
          continue
        }

        requestedShareFileIdsRef.current.add(record.id)
        setPreparingShareFileIds((current) => new Set(current).add(record.id))
        setShareProgressByRecordingId((current) => new Map(current).set(record.id, 0))
        setSharePreparationErrors((current) => {
          const next = new Map(current)
          next.delete(record.id)
          return next
        })
        try {
          const shareFile = await prepareServerRecordingShareFileApi(record.id)
          markShareFilePrepared(record.id, shareFile)
          preparedAny = true
        } catch (error) {
          setSharePreparationErrors((current) => new Map(current).set(record.id, normalizeError(error)))
        } finally {
          requestedShareFileIdsRef.current.delete(record.id)
          setPreparingShareFileIds((current) => {
            const next = new Set(current)
            next.delete(record.id)
            return next
          })
          setShareProgressByRecordingId((current) => {
            const next = new Map(current)
            next.delete(record.id)
            return next
          })
        }
      }

      if (!cancelled && preparedAny) {
        void refreshHistory()
      }
    }

    void preparePendingShareFiles()

    return () => {
      cancelled = true
    }
  }, [active, markShareFilePrepared, normalizeError, recordings, refreshHistory])

  const queuedShareFileIds = useMemo(() => new Set(
    recordings
      .filter((record) => record.status === 'completed' && Boolean(record.filePath) && !isPhotoRecord(record) && !record.shareFileReady)
      .slice(3)
      .map((record) => record.id),
  ), [recordings])

  const handleShareRecording = useCallback(
    async (record: RecordingRow, target: 'native' | 'whatsapp') => {
      if (!record.filePath) {
        setBootError('File video belum tersedia untuk dibagikan.')
        return
      }

      const mediaLabel = isPhotoRecord(record) ? 'Foto' : 'Video'
      const shareText = `${mediaLabel} ${formatTask(record.taskType)} resi ${record.resiNumber}`
      setSharingRecordId(record.id)
      setPreparingShareFileIds((current) => new Set(current).add(record.id))
      setShareProgressByRecordingId((current) => new Map(current).set(record.id, 0))
      setSharePreparationErrors((current) => {
        const next = new Map(current)
        next.delete(record.id)
        return next
      })

      const preparedShareFile = preparedShareFilesRef.current.get(record.id)
      try {
        let preparedFile = preparedShareFile
        if (!preparedFile) {
          const shareFile = isPhotoRecord(record)
            ? {
                fileName: record.fileName,
                filePath: record.filePath,
                mimeType: record.shareFileMimeType ?? 'image/jpeg',
              }
            : record.shareFileReady && record.shareFilePath && record.shareFileName
            ? {
                fileName: record.shareFileName,
                filePath: record.shareFilePath,
                mimeType: record.shareFileMimeType ?? 'video/mp4',
              }
            : await prepareServerRecordingShareFileApi(record.id)
          markShareFilePrepared(record.id, shareFile)

          const videoUrl = buildServerFileUrl(shareFile.filePath)
          const response = await fetch(videoUrl, { credentials: 'include' })
          if (!response.ok) {
            throw new Error(`${mediaLabel} belum bisa diambil untuk dibagikan.`)
          }

          const blob = await response.blob()
          const file = new File([blob], shareFile.fileName, {
            type: shareFile.mimeType || blob.type || (isPhotoRecord(record) ? 'image/jpeg' : 'video/mp4'),
          })
          preparedFile = {
            fileName: shareFile.fileName,
            filePath: shareFile.filePath,
            mimeType: shareFile.mimeType || blob.type || (isPhotoRecord(record) ? 'image/jpeg' : 'video/mp4'),
            file,
          }
          preparedShareFilesRef.current.set(record.id, preparedFile)
          setPreparedShareFileIds(new Set(preparedShareFilesRef.current.keys()))
        }

        if (!navigator.share) {
          showScanNotice({
            kind: 'warning',
            title: 'File siap dibagikan',
            message: 'Browser ini belum mendukung share file. File sudah disiapkan untuk dipakai lagi nanti.',
          })
          return
        }

        const shareData: ShareData = {
          title: shareText,
          text: shareText,
          files: [preparedFile.file],
        }

        if (!navigator.canShare?.(shareData)) {
          const targetName = target === 'whatsapp' ? 'WhatsApp' : 'aplikasi lain'
          setBootError(`Browser ini belum mendukung share file ${mediaLabel.toLowerCase()} ke ${targetName}.`)
          return
        }

        await navigator.share(shareData)
        showScanNotice({
          kind: 'success',
          title: `${mediaLabel} siap dibagikan`,
          message: 'Ketuk Bagikan lagi untuk memilih aplikasi.',
        })
      } catch (error) {
        setSharePreparationErrors((current) => new Map(current).set(record.id, normalizeError(error)))
        setBootError(normalizeError(error))
      } finally {
        setSharingRecordId(null)
        setPreparingShareFileIds((current) => {
          const next = new Set(current)
          next.delete(record.id)
          return next
        })
        setShareProgressByRecordingId((current) => {
          const next = new Map(current)
          next.delete(record.id)
          return next
        })
      }
    },
    [formatTask, markShareFilePrepared, normalizeError, setBootError, showScanNotice],
  )

  return {
    sharingRecordId,
    preparingShareFileIds,
    shareProgressByRecordingId,
    sharePreparationErrors,
    queuedShareFileIds,
    preparedShareFileIds,
    handleShareRecording,
  }
}

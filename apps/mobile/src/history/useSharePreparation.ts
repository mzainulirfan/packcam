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
  const [preparedShareFileIds, setPreparedShareFileIds] = useState<Set<string>>(() => new Set())
  const preparedShareFilesRef = useRef(new Map<string, PreparedShareFile>())
  const requestedShareFileIdsRef = useRef(new Set<string>())

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
      .filter((record) => record.status === 'completed' && Boolean(record.filePath) && !record.shareFileReady)
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
        try {
          const shareFile = await prepareServerRecordingShareFileApi(record.id)
          markShareFilePrepared(record.id, shareFile)
          preparedAny = true
        } catch {
          // Manual prepare remains available from the detail sheet if background work fails.
        } finally {
          requestedShareFileIdsRef.current.delete(record.id)
          setPreparingShareFileIds((current) => {
            const next = new Set(current)
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
  }, [active, markShareFilePrepared, recordings, refreshHistory])

  const queuedShareFileIds = useMemo(() => new Set(
    recordings
      .filter((record) => record.status === 'completed' && Boolean(record.filePath) && !record.shareFileReady)
      .slice(3)
      .map((record) => record.id),
  ), [recordings])

  const handleShareRecording = useCallback(
    async (record: RecordingRow, target: 'native' | 'whatsapp') => {
      if (!record.filePath) {
        setBootError('File video belum tersedia untuk dibagikan.')
        return
      }

      const shareText = `Video ${formatTask(record.taskType)} resi ${record.resiNumber}`
      setSharingRecordId(record.id)
      setPreparingShareFileIds((current) => new Set(current).add(record.id))

      const preparedShareFile = preparedShareFilesRef.current.get(record.id)
      try {
        let preparedFile = preparedShareFile
        if (!preparedFile) {
          const shareFile = record.shareFileReady && record.shareFilePath && record.shareFileName
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
            throw new Error('Video belum bisa diambil untuk dibagikan.')
          }

          const blob = await response.blob()
          const file = new File([blob], shareFile.fileName, {
            type: shareFile.mimeType || blob.type || 'video/mp4',
          })
          preparedFile = {
            fileName: shareFile.fileName,
            filePath: shareFile.filePath,
            mimeType: shareFile.mimeType || blob.type || 'video/mp4',
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
          setBootError(`Browser ini belum mendukung share file video ke ${targetName}.`)
          return
        }

        await navigator.share(shareData)
        showScanNotice({
          kind: 'success',
          title: 'Video siap dibagikan',
          message: 'Ketuk Bagikan lagi untuk memilih aplikasi.',
        })
      } catch (error) {
        setBootError(normalizeError(error))
      } finally {
        setSharingRecordId(null)
        setPreparingShareFileIds((current) => {
          const next = new Set(current)
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
    queuedShareFileIds,
    preparedShareFileIds,
    handleShareRecording,
  }
}

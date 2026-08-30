import { useEffect, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon, Copy01Icon, SentIcon, Share08Icon, TrashIcon } from '@hugeicons/core-free-icons'
import { buildServerFileUrl } from '@pakti/api-client'
import type { RecordingRow, WorkTask } from '@pakti/types'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

type HistoryDetailTarget = {
  resiNumber: string
  rows: RecordingRow[]
}

type GroupShareStatus = {
  label: string
  ready: boolean
}

type HistoryDetailSheetProps = {
  target: HistoryDetailTarget | null
  sharingRecordId: string | null
  preparingChatSendId: string | null
  deletingRecordId: string | null
  preparingShareFileIds: ReadonlySet<string>
  shareProgressByRecordingId: ReadonlyMap<string, number>
  sharePreparationErrors: ReadonlyMap<string, string>
  queuedShareFileIds: ReadonlySet<string>
  preparedShareFileIds: ReadonlySet<string>
  chatSendByRecordingId?: Map<string, import('@pakti/types').RecordingChatSend>
  formatDateTime: (value: string | null | undefined) => string
  formatTask: (taskType: WorkTask) => string
  formatStatus: (status: RecordingRow['status']) => string
  getGroupShareStatus: (rows: RecordingRow[]) => GroupShareStatus
  getGroupShareStatusClassName: (ready: boolean) => string
  getShareStatusClassName: (record: RecordingRow) => string
  getShareStatusLabel: (record: RecordingRow) => string
  getShareStatusDescription: (record: RecordingRow) => string
  onOpenChange: (open: boolean) => void
  onCopyResi: (resiNumber: string) => void
  onShareRecording: (record: RecordingRow, target: 'native' | 'whatsapp') => void
  onPrepareShopeeChat: (record: RecordingRow) => void
  onDeleteClick: (record: RecordingRow) => void
}

function isPhotoRecord(record: RecordingRow) {
  const mediaType = (record as unknown as { mediaType?: string }).mediaType
  if (mediaType === 'photo') return true
  const fileName = ((record as unknown as { fileName?: string | null }).fileName ?? record.filePath ?? '').toLowerCase()
  return /\.(jpe?g|png|webp)$/.test(fileName)
}

function AuthenticatedImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [directFailed, setDirectFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let nextObjectUrl: string | null = null

    queueMicrotask(() => {
      if (cancelled) return
      setObjectUrl(null)
      setError(null)
      setDirectFailed(false)
    })

    fetch(src, { credentials: 'include' })
      .then((response) => {
        if (!response.ok) throw new Error(`Gagal membuka foto (${response.status}).`)
        return response.blob()
      })
      .then((blob) => {
        if (cancelled) return
        nextObjectUrl = URL.createObjectURL(blob)
        setObjectUrl(nextObjectUrl)
      })
      .catch((fetchError) => {
        if (!cancelled) setError(fetchError instanceof Error ? fetchError.message : 'Gagal membuka foto.')
      })

    return () => {
      cancelled = true
      if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl)
    }
  }, [src])

  if (error) {
    return directFailed ? (
      <div className="grid min-h-[180px] place-items-center bg-black px-4 text-center text-xs text-white/70">{error}</div>
    ) : (
      <img className={className} src={src} alt={alt} onError={() => setDirectFailed(true)} />
    )
  }

  if (!objectUrl) {
    return <div className="grid min-h-[180px] place-items-center bg-black text-xs text-white/70">Membuka foto...</div>
  }

  return <img className={className} src={objectUrl} alt={alt} />
}

export function HistoryDetailSheet({
  target,
  sharingRecordId,
  preparingChatSendId,
  deletingRecordId,
  preparingShareFileIds,
  shareProgressByRecordingId,
  sharePreparationErrors,
  queuedShareFileIds,
  chatSendByRecordingId,
  formatDateTime,
  formatTask,
  formatStatus,
  getGroupShareStatus,
  getGroupShareStatusClassName,
  getShareStatusClassName,
  getShareStatusLabel,
  onOpenChange,
  onCopyResi,
  onShareRecording,
  onPrepareShopeeChat,
  onDeleteClick,
}: HistoryDetailSheetProps) {
  if (!target) {
    return null
  }

  const groupShareStatus = getGroupShareStatus(target.rows)
  const groupSharePreparing = target.rows.some((record) => preparingShareFileIds.has(record.id))
  const groupShareFailed = !groupSharePreparing && target.rows.some((record) => sharePreparationErrors.has(record.id))
  const groupShareQueued = !groupSharePreparing && !groupShareFailed && target.rows.some((record) => queuedShareFileIds.has(record.id))
  const groupShareActiveRecord = target.rows.find((record) => preparingShareFileIds.has(record.id))
  const groupShareProgress = groupShareActiveRecord ? shareProgressByRecordingId.get(groupShareActiveRecord.id) ?? 0 : null

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent side="bottom" showCloseButton={false} className="w-full rounded-t-[4px] border-border bg-popover p-0" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
        <SheetHeader className="border-b border-[var(--op-hairline)] px-4 pb-3 pt-4">
          <div className="grid gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 text-left">
                <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--op-mute)]">Detail resi</p>
                <SheetTitle className="mt-1 truncate text-left text-[18px] leading-none">{target.resiNumber}</SheetTitle>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  className="grid h-9 w-9 place-items-center rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-canvas)] text-[var(--op-ink)] hover:bg-[var(--op-surface-soft)]"
                  onClick={() => onCopyResi(target.resiNumber)}
                  aria-label="Salin nomor resi"
                >
                  <HugeiconsIcon icon={Copy01Icon} size={16} />
                </button>
                <button
                  type="button"
                  className="grid h-9 w-9 place-items-center rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-canvas)] text-[var(--op-ink)] hover:bg-[var(--op-surface-soft)]"
                  onClick={() => onOpenChange(false)}
                  aria-label="Tutup detail rekaman"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={16} />
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={groupSharePreparing
                ? 'rounded-[4px] border border-[var(--op-warning,#ff9f0a)] bg-[var(--op-warning,#ff9f0a)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--op-warning,#ff9f0a)] animate-pulse'
                : groupShareFailed
                  ? 'rounded-[4px] border border-destructive/50 px-2 py-0.5 text-[11px] text-destructive'
                : groupShareQueued
                  ? 'rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-surface-soft)] px-2 py-0.5 text-[11px] text-[var(--op-mute)]'
                  : getGroupShareStatusClassName(groupShareStatus.ready)}>
                {groupSharePreparing ? `Menyiapkan share ${groupShareProgress}%` : groupShareFailed ? 'Gagal menyiapkan' : groupShareQueued ? 'Antri share' : groupShareStatus.label}
              </span>
              <span className="text-[12px] text-[var(--op-mute)]">{target.rows.length} dokumentasi tersimpan</span>
            </div>
          </div>
          <SheetDescription className="sr-only">Detail dokumentasi untuk resi {target.resiNumber}.</SheetDescription>
        </SheetHeader>
        <div className="grid max-h-[76vh] gap-3 overflow-y-auto px-4 pb-6 pt-3">
          {target.rows.map((record) => {
            const chatSend = chatSendByRecordingId?.get(record.id)
            const sharePreparing = preparingShareFileIds.has(record.id)
            const shareFailed = sharePreparationErrors.has(record.id)
            const shareQueued = queuedShareFileIds.has(record.id)
            const shareLabel = sharePreparing
              ? `Menyiapkan ${shareProgressByRecordingId.get(record.id) ?? 0}%`
              : shareFailed
                ? 'Gagal share'
              : shareQueued
                ? 'Antri share'
                : getShareStatusLabel(record)
            const canShare = record.status === 'completed' && Boolean(record.filePath)

            return (
              <article key={record.id} className="overflow-hidden rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-surface-soft)]">
                {canShare ? (
                  <div className="bg-black">
                    {isPhotoRecord(record) ? (
                      <AuthenticatedImage
                        className="block max-h-[52vh] w-full bg-black object-contain"
                        src={buildServerFileUrl(record.filePath)}
                        alt={`Dokumentasi ${record.resiNumber}`}
                      />
                    ) : (
                      <video
                        className="block max-h-[52vh] w-full bg-black object-contain"
                        src={buildServerFileUrl(record.filePath)}
                        controls
                        playsInline
                        preload="metadata"
                        crossOrigin="use-credentials"
                      />
                    )}
                  </div>
                ) : null}

                <div className="grid gap-3 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-[4px] bg-[var(--op-ink)] px-2 py-0.5 text-[12px] font-medium text-[var(--op-canvas)]">
                      {formatTask(record.taskType)} {isPhotoRecord(record) ? 'foto' : 'video'}
                    </span>
                    <span className={record.status === 'completed' ? 'text-[12px] font-medium' : 'text-[12px] text-[var(--op-mute)]'}>
                      {formatStatus(record.status)}
                    </span>
                    <span className={sharePreparing
                      ? 'rounded-[4px] border border-[var(--op-warning,#ff9f0a)] bg-[var(--op-warning,#ff9f0a)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--op-warning,#ff9f0a)] animate-pulse'
                      : shareFailed
                        ? 'rounded-[4px] border border-destructive/50 px-2 py-0.5 text-[11px] text-destructive'
                      : shareQueued
                        ? 'rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-canvas)] px-2 py-0.5 text-[11px] text-[var(--op-mute)]'
                        : getShareStatusClassName(record)}>
                      {shareLabel}
                    </span>
                  </div>

                  <p className="m-0 text-[12px] leading-snug text-[var(--op-mute)]">
                    {formatDateTime(record.updatedAt)} · {record.operatorName || '-'}
                    {chatSend ? ` · ${chatSend.status === 'sent' ? 'Shopee terkirim' : chatSend.status === 'prepared' ? 'Shopee siap' : `Shopee ${chatSend.status}`}` : ''}
                  </p>

                  {shareFailed ? (
                    <p className="m-0 rounded-[4px] border border-destructive/30 bg-destructive/5 px-2 py-2 text-[12px] text-destructive">
                      {sharePreparationErrors.get(record.id)}
                    </p>
                  ) : null}

                  <div className="grid grid-cols-3 gap-2">
                    {canShare ? (
                      <>
                        <button
                          type="button"
                          className="flex h-10 items-center justify-center gap-1.5 rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-canvas)] px-2 text-[12px] font-medium hover:bg-[var(--op-surface-soft)] disabled:opacity-50"
                          onClick={() => onShareRecording(record, 'native')}
                          disabled={sharePreparing || deletingRecordId !== null}
                        >
                          <HugeiconsIcon icon={Share08Icon} size={14} />
                          Share
                        </button>
                        <button
                          type="button"
                          className="flex h-10 items-center justify-center gap-1.5 rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-canvas)] px-2 text-[12px] font-medium hover:bg-[var(--op-surface-soft)] disabled:opacity-50"
                          onClick={() => onPrepareShopeeChat(record)}
                          disabled={preparingChatSendId === record.id || sharingRecordId !== null || deletingRecordId !== null}
                        >
                          <HugeiconsIcon icon={SentIcon} size={14} />
                          Shopee
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      className={canShare ? 'flex h-10 items-center justify-center gap-1.5 rounded-[4px] border border-destructive/40 bg-transparent px-2 text-[12px] font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50' : 'col-span-3 flex h-10 items-center justify-center gap-1.5 rounded-[4px] border border-destructive/40 bg-transparent px-2 text-[12px] font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50'}
                      onClick={() => onDeleteClick(record)}
                      disabled={deletingRecordId !== null || sharingRecordId !== null}
                    >
                      <HugeiconsIcon icon={TrashIcon} size={14} />
                      Hapus
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </SheetContent>
    </Sheet>
  )
}

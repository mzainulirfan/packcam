import { HugeiconsIcon } from '@hugeicons/react'
import { Copy01Icon, SentIcon, Share08Icon, TrashIcon } from '@hugeicons/core-free-icons'
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
  deletingRecordId: string | null
  preparedShareFileIds: ReadonlySet<string>
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
  onDeleteClick: (record: RecordingRow) => void
}

export function HistoryDetailSheet({
  target,
  sharingRecordId,
  deletingRecordId,
  preparedShareFileIds,
  formatDateTime,
  formatTask,
  formatStatus,
  getGroupShareStatus,
  getGroupShareStatusClassName,
  getShareStatusClassName,
  getShareStatusLabel,
  getShareStatusDescription,
  onOpenChange,
  onCopyResi,
  onShareRecording,
  onDeleteClick,
}: HistoryDetailSheetProps) {
  if (!target) {
    return null
  }

  const groupShareStatus = getGroupShareStatus(target.rows)

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="w-full rounded-t-[4px] border-border bg-popover p-0" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
        <SheetHeader className="border-b border-[var(--op-hairline)] px-4 pb-3 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 text-left">
              <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--op-mute)]">Detail resi</p>
              <SheetTitle className="mt-1 truncate text-left text-[18px] leading-none">{target.resiNumber}</SheetTitle>
            </div>
            <span className={getGroupShareStatusClassName(groupShareStatus.ready)}>{groupShareStatus.label}</span>
          </div>
          <SheetDescription className="text-left text-[12px]">
            {target.rows.length} dokumentasi tersimpan untuk resi ini.
          </SheetDescription>
        </SheetHeader>
        <div className="grid max-h-[76vh] gap-3 overflow-y-auto px-4 pb-6 pt-3">
          {target.rows.map((record) => (
            <article key={record.id} className="grid gap-3 rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-surface-soft)] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="grid min-w-0 gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-[4px] bg-[var(--op-ink)] px-2 py-0.5 text-[12px] font-medium text-[var(--op-canvas)]">
                      {formatTask(record.taskType)}
                    </span>
                    <span className={record.status === 'completed' ? 'text-[12px] font-medium' : 'text-[12px] text-[var(--op-mute)]'}>
                      {formatStatus(record.status)}
                    </span>
                  </div>
                  <span className="text-[12px] leading-snug text-[var(--op-mute)]">
                    {formatDateTime(record.updatedAt)} · oleh {record.operatorName || '-'}
                  </span>
                </div>
                <button
                  type="button"
                  className="grid h-9 w-10 shrink-0 place-items-center rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-canvas)] text-[var(--op-ink)] hover:bg-[var(--op-surface-soft)]"
                  onClick={() => onCopyResi(record.resiNumber)}
                  aria-label="Salin nomor resi"
                >
                  <HugeiconsIcon icon={Copy01Icon} size={14} />
                </button>
              </div>

              {record.status === 'completed' && record.filePath ? (
                <div className="overflow-hidden rounded-[4px] border border-[var(--op-hairline)] bg-black">
                  <video
                    className="block max-h-[44vh] w-full bg-black object-contain"
                    src={buildServerFileUrl(record.filePath)}
                    controls
                    playsInline
                    preload="metadata"
                    crossOrigin="use-credentials"
                  />
                </div>
              ) : null}

              <div className="grid gap-1 rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-canvas)] p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className={getShareStatusClassName(record)}>{getShareStatusLabel(record)}</span>
                </div>
                <span className="text-[12px] leading-relaxed text-[var(--op-mute)]">{getShareStatusDescription(record)}</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {record.status === 'completed' && record.filePath ? (
                  <>
                    <button
                      type="button"
                      className="flex h-10 items-center justify-center gap-2 rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-canvas)] px-3 text-sm font-medium hover:bg-[var(--op-surface-soft)] disabled:opacity-50"
                      onClick={() => onShareRecording(record, 'native')}
                      disabled={sharingRecordId === record.id || deletingRecordId !== null}
                    >
                      <HugeiconsIcon icon={Share08Icon} size={14} />
                      {sharingRecordId === record.id
                        ? 'Menyiapkan...'
                        : preparedShareFileIds.has(record.id)
                          ? 'Bagikan'
                          : 'Siapkan share'}
                    </button>
                    <button
                      type="button"
                      className="flex h-10 items-center justify-center gap-2 rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-canvas)] px-3 text-sm font-medium hover:bg-[var(--op-surface-soft)] disabled:opacity-50"
                      onClick={() => onShareRecording(record, 'whatsapp')}
                      disabled={sharingRecordId === record.id || deletingRecordId !== null}
                    >
                      <HugeiconsIcon icon={SentIcon} size={14} />
                      WhatsApp
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  className="col-span-2 flex h-10 items-center justify-center gap-2 rounded-[4px] border border-destructive/40 bg-transparent px-3 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  onClick={() => onDeleteClick(record)}
                  disabled={deletingRecordId !== null || sharingRecordId !== null}
                >
                  <HugeiconsIcon icon={TrashIcon} size={14} />
                  Hapus dokumentasi
                </button>
              </div>
            </article>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}

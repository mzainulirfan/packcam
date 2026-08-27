import type { ReactNode } from 'react'
import type { LocalRecordingRecord } from '@pakti/shared/recordings'

import { Button } from '../components/ui/button'
import { ModalOverlay } from '../components/ui/ModalOverlay'
import { DialogCloseButton, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog'

type HistoryDetailDialogProps = {
  open: boolean
  record: LocalRecordingRecord | null
  operatorLabel: string
  onCopyResi?: () => void
  onClose: () => void
  children: ReactNode
}

function formatHeaderDate(value: string) {
  try {
    return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  } catch {
    return value
  }
}

export function HistoryDetailDialog({ open, record, operatorLabel, onCopyResi, onClose, children }: HistoryDetailDialogProps) {
  if (!open || !record) {
    return null
  }

  const taskLabel = record.taskType === 'packing' ? 'Packing' : 'QC'
  const statusLabel = record.status === 'completed' ? 'Selesai' : record.status === 'recording' ? 'Merekam' : 'Error'

  return (
    <ModalOverlay
      onClose={onClose}
      contentClassName="w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] p-0 sm:w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-2rem)] lg:w-[90rem] lg:max-w-[90rem]"
      staticBackdrop
    >
      <div className="history-opencode__detail-modal flex max-h-[88vh] flex-col overflow-hidden">
        <DialogHeader className="history-opencode__detail-header sticky top-0 z-10 flex items-start justify-between gap-3 bg-[#fdfcfc] text-left">
          <div className="grid min-w-0 gap-1">
            <p className="text-[11px] tracking-wide text-[var(--op-mute)]">Detail dokumentasi</p>
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle className="truncate text-[18px] font-bold leading-none tracking-tight">{record.resiNumber}</DialogTitle>
              {onCopyResi ? (
                <Button type="button" variant="outline" size="sm" className="history-opencode__button h-7 px-2 text-[11px]" onClick={onCopyResi}>
                  [Salin resi]
                </Button>
              ) : null}
            </div>
            <DialogDescription className="truncate text-[12px]">
              {taskLabel} · {statusLabel} · {formatHeaderDate(record.startTime)} · {operatorLabel}
            </DialogDescription>
          </div>
          <DialogCloseButton onClick={onClose} />
        </DialogHeader>

        <div className="history-opencode__detail-body grid flex-1 items-start gap-4 overflow-y-auto p-4 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-6 lg:p-6">
          {children}
        </div>
      </div>
    </ModalOverlay>
  )
}

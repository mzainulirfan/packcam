import type { ReactNode } from 'react'
import type { LocalRecordingRecord } from '@pakti/shared/recordings'

import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon, Copy01Icon } from '@hugeicons/core-free-icons'
import { Button } from '../components/ui/button'
import { ModalOverlay } from '../components/ui/ModalOverlay'
import { DialogDescription, DialogTitle } from '../components/ui/dialog'

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
      contentClassName="w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] p-0 sm:w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-2rem)] lg:w-[90rem] lg:max-w-[90rem] overflow-hidden rounded-2xl border-[#e6e6e6] bg-white font-['Inter'] shadow-[0_10px_28px_rgba(0,0,0,0.08)]"
      staticBackdrop
    >
      <div className="flex max-h-[88vh] flex-col overflow-hidden bg-white font-['Inter']">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[#e6e6e6] bg-white p-6 text-left">
          <div className="grid min-w-0 gap-1">
            <p className="font-['Inter'] text-[12px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Detail dokumentasi</p>
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle className="truncate font-['Inter'] text-[20px] font-bold tracking-[-0.2px] text-[#000000]">{record.resiNumber}</DialogTitle>
              {onCopyResi ? (
                <Button type="button" variant="ghost" size="sm" className="h-7 rounded-full border border-[#e6e6e6] bg-white px-2.5 font-['Inter'] text-[11px] font-medium text-[#31302e] hover:bg-[#f6f5f4]" onClick={onCopyResi}>
                  <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={1.9} /> Salin resi
                </Button>
              ) : null}
            </div>
            <DialogDescription className="truncate font-['Inter'] text-[13px] text-[#615d59]">
              {taskLabel} · {statusLabel} · {formatHeaderDate(record.startTime)} · {operatorLabel}
            </DialogDescription>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} className="h-9 w-9 shrink-0 rounded-lg text-[#615d59] hover:bg-[#f6f5f4] hover:text-[#000000]">
            <HugeiconsIcon icon={Cancel01Icon} size={19} strokeWidth={1.9} />
          </Button>
        </div>

        <div className="grid flex-1 items-start gap-4 overflow-y-auto bg-[#f6f5f4] p-4 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-6 lg:p-6">{children}</div>
      </div>
    </ModalOverlay>
  )
}

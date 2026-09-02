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
      contentClassName="!w-[98vw] !max-w-[1080px] !max-h-[88vh] overflow-hidden rounded-[12px] border border-[#e6e6e6] bg-white p-0 font-['Inter'] shadow-[0_23px_52px_rgba(0,0,0,0.08),0_4px_18px_rgba(0,0,0,0.06)]"
      staticBackdrop
    >
      <div className="flex max-h-[88vh] flex-col overflow-hidden bg-white font-['Inter']">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[#e6e6e6] bg-white px-6 py-5 text-left">
          <div className="grid min-w-0 gap-2">
            <p className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Detail dokumentasi</p>
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle className="truncate font-['Inter'] text-[20px] font-semibold leading-none tracking-[-0.5px] text-[#000000]">{record.resiNumber}</DialogTitle>
              <span className="inline-flex items-center rounded-full bg-[#000000] px-2.5 py-1 font-['Inter'] text-[11px] font-semibold text-white">{taskLabel}</span>
              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 font-['Inter'] text-[11px] font-medium ${record.status === 'completed' ? 'border-[#e6e6e6] bg-[#f6f5f4] text-[#31302e]' : record.status === 'recording' ? 'border-[#fde68a] bg-[#fef3c7] text-[#92400e]' : 'border-[#fecaca] bg-[#fee2e2] text-[#991b1b]'}`}>{statusLabel}</span>
              {onCopyResi ? (
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-full border border-[#e6e6e6] bg-white text-[#615d59] hover:bg-[#f6f5f4] hover:text-[#000000]" onClick={onCopyResi} title="Salin resi">
                  <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={1.9} />
                </Button>
              ) : null}
            </div>
            <DialogDescription className="font-['Inter'] text-[12px] leading-none text-[#615d59]">
              {formatHeaderDate(record.startTime)} · <span className="font-medium text-[#31302e]">{operatorLabel}</span>
            </DialogDescription>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 shrink-0 rounded-[8px] border border-[#e6e6e6] bg-white text-[#615d59] hover:bg-[#f6f5f4] hover:text-[#000000]">
            <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.9} />
          </Button>
        </div>

        <div className="grid flex-1 gap-4 overflow-y-auto bg-[#f6f5f4] p-4 sm:p-5 lg:grid-cols-[380px_minmax(0,1fr)]">{children}</div>
      </div>
    </ModalOverlay>
  )
}

import type { ReactNode } from 'react'
import type { LocalRecordingRecord } from '@pakti/shared/recordings'

import { ModalOverlay } from '../components/ui/ModalOverlay'
import { DialogCloseButton, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog'

type HistoryDetailDialogProps = {
  open: boolean
  record: LocalRecordingRecord | null
  operatorLabel: string
  onClose: () => void
  children: ReactNode
}

export function HistoryDetailDialog({ open, record, operatorLabel, onClose, children }: HistoryDetailDialogProps) {
  if (!open || !record) {
    return null
  }

  return (
    <ModalOverlay
      onClose={onClose}
      contentClassName="w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] p-0 sm:w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-2rem)] lg:w-[114rem] lg:max-w-[114rem]"
      staticBackdrop
    >
      <div className="history-opencode__detail-modal flex max-h-[88vh] flex-col overflow-hidden">
        <DialogHeader className="history-opencode__detail-header flex items-start justify-between gap-3 text-left">
          <div className="min-w-0 grid gap-1">
            <p>[+] Detail history</p>
            <DialogTitle className="truncate">{record.resiNumber}</DialogTitle>
            <DialogDescription className="truncate">
              {operatorLabel}
            </DialogDescription>
          </div>
          <DialogCloseButton onClick={onClose} />
        </DialogHeader>

        <div className="history-opencode__detail-body grid flex-1 items-start gap-3 overflow-y-auto lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          {children}
        </div>
      </div>
    </ModalOverlay>
  )
}

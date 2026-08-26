import { HugeiconsIcon } from '@hugeicons/react'
import { TrashIcon } from '@hugeicons/core-free-icons'
import type { RecordingRow, WorkTask } from '@pakti/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type HistoryDeleteDialogProps = {
  record: RecordingRow | null
  deletingRecordId: string | null
  formatTask: (taskType: WorkTask) => string
  onOpenChange: (open: boolean) => void
  onConfirm: (record: RecordingRow) => void
}

export function HistoryDeleteDialog({
  record,
  deletingRecordId,
  formatTask,
  onOpenChange,
  onConfirm,
}: HistoryDeleteDialogProps) {
  return (
    <Dialog open={Boolean(record)} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[4px] border-border bg-popover text-popover-foreground" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
        <DialogHeader>
          <DialogTitle>Hapus dokumentasi?</DialogTitle>
          <DialogDescription>
            Video {record ? formatTask(record.taskType) : ''} untuk resi <strong>{record?.resiNumber}</strong> akan dihapus. Tindakan ini tidak dapat dibatalkan.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" className="rounded-[4px]" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="gap-2 rounded-[4px]"
            disabled={deletingRecordId !== null || !record}
            onClick={() => {
              if (!record) return
              onConfirm(record)
            }}
          >
            <HugeiconsIcon icon={TrashIcon} size={14} />
            {deletingRecordId ? 'Menghapus...' : 'Hapus'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

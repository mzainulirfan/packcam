import type { LocalRecordingRecord } from '@pakti/shared/recordings'
import { HugeiconsIcon } from '@hugeicons/react'
import { Delete02Icon, Download01Icon, Tick02Icon } from '@hugeicons/core-free-icons'

import { Button } from '../components/ui/button'

type HistoryRecordingCardProps = {
  record: LocalRecordingRecord
  isSelected: boolean
  invalidRecord: boolean
  chatSend?: import('@pakti/types').RecordingChatSend | null
  downloadingRecordId: string | null
  deletingRecordId: string | null
  formatDateTime: (value: string) => string
  onDownload: (record: LocalRecordingRecord) => void
  onDelete: (record: LocalRecordingRecord) => void
}

export function HistoryRecordingCard({
  record,
  isSelected,
  invalidRecord,
  chatSend,
  downloadingRecordId,
  deletingRecordId,
  formatDateTime,
  onDownload,
  onDelete,
}: HistoryRecordingCardProps) {
  return (
    <div className={`overflow-hidden rounded-xl border bg-white ${isSelected ? 'border-[#0075de] ring-1 ring-[#0075de]/20' : 'border-[#e6e6e6]'}`}>
      <div className="flex items-center justify-between gap-2 border-b border-[#e6e6e6] bg-[#fbfaf9] px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className={`inline-flex rounded-full border px-2 py-0.5 font-['Inter'] text-[11px] font-medium ${record.taskType === 'packing' ? 'border-[#e6e6e6] bg-[#f6f5f4] text-[#000000]' : 'border-[#e6e6e6] bg-white text-[#31302e]'}`}>{record.taskType}</span>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-['Inter'] text-[11px] font-semibold ${record.status === 'completed' ? 'border border-[#e6e6e6] bg-[#f6f5f4] text-[#31302e]' : record.status === 'recording' ? 'bg-[#fef3c7] text-[#92400e]' : 'bg-[#fee2e2] text-[#991b1b]'}`}>
            {record.status === 'completed' ? <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2} /> : null}
            {record.status === 'completed' ? 'Selesai' : record.status === 'recording' ? 'Merekam' : 'Error'}
          </span>
          {invalidRecord ? <span className="inline-flex rounded-full bg-[#fee2e2] px-2 py-0.5 font-['Inter'] text-[10px] font-semibold text-[#991b1b]">Invalid</span> : null}
        </div>
        <span className="font-['Inter'] text-[11px] text-[#a39e98]">{(record as unknown as { mediaType?: string }).mediaType === 'photo' || isPhotoFile(record.fileName) || isPhotoFile(record.filePath) ? 'foto' : 'video'}</span>
      </div>

      <div className="grid gap-2 p-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-0.5">
            <span className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.06em] text-[#a39e98]">Waktu</span>
            <span className="font-['Inter'] text-[12px] font-medium leading-tight text-[#000000]">{formatDateTime(record.startTime)}</span>
          </div>
          <div className="grid gap-0.5">
            <span className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.06em] text-[#a39e98]">File • Ukuran</span>
            <span className="truncate font-['Inter'] text-[12px] font-medium leading-tight text-[#000000]" title={record.fileName}>
              {record.fileName} <span className="font-normal text-[#a39e98]">· {record.fileSizeBytes ? `${Math.round(record.fileSizeBytes / 1024)} KB` : '-'}</span>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(record as unknown as { packingPayAmount?: number | null }).packingPayAmount != null && record.taskType === 'packing' ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#e6e6e6] bg-[#f6f5f4] px-2 py-1 font-['Inter'] text-[11px] font-medium text-[#31302e]">
              Upah {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format((record as unknown as { packingPayAmount: number }).packingPayAmount)}
              {(record as unknown as { packingPayStatus?: string | null }).packingPayStatus === 'needs_review' ? <span className="rounded-full bg-[#fef3c7] px-1 py-0.5 text-[10px] text-[#92400e]">review</span> : null}
            </span>
          ) : null}
          {(record as unknown as { packerOperatorName?: string | null }).packerOperatorName ? (
            <span className="inline-flex rounded-full border border-[#e6e6e6] bg-white px-2 py-1 font-['Inter'] text-[11px] font-medium text-[#31302e]">
              {(record as unknown as { packerOperatorName: string }).packerOperatorName}
            </span>
          ) : null}
          {chatSend ? (
            <span className="inline-flex rounded-full border border-[#e6e6e6] bg-white px-2 py-1 font-['Inter'] text-[11px] text-[#615d59]">
              {chatSend.status === 'sent' ? 'Terkirim' : chatSend.status === 'prepared' ? 'Siap kirim' : 'Antri'} · {chatSend.buyerUsername}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-[#e6e6e6] bg-white px-3 py-2">
        <span className="truncate font-['Inter'] text-[11px] text-[#a39e98]">{record.fileName}</span>
        <div className="flex shrink-0 gap-1.5">
          <Button type="button" variant="ghost" size="sm" className="h-7 rounded-full border border-[#e6e6e6] bg-white px-2.5 font-['Inter'] text-[11px] font-medium text-[#31302e] hover:bg-[#f6f5f4]" disabled={downloadingRecordId !== null} onClick={() => onDownload(record)}>
            <HugeiconsIcon icon={Download01Icon} size={12} strokeWidth={1.9} /> {downloadingRecordId === record.id ? '...' : 'Unduh'}
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 rounded-full border border-[#e6e6e6] bg-white px-2.5 font-['Inter'] text-[11px] font-medium text-[#991b1b] hover:bg-[#fee2e2]" disabled={deletingRecordId !== null} onClick={() => onDelete(record)}>
            <HugeiconsIcon icon={Delete02Icon} size={12} strokeWidth={1.9} /> {deletingRecordId === record.id ? '...' : 'Hapus'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function isPhotoFile(name: string | null | undefined) {
  const ext = (name ?? '').toLowerCase().split('.').pop() ?? ''
  return ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'webp'
}

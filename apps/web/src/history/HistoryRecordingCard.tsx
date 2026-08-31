import type { LocalRecordingRecord } from '@pakti/shared/recordings'
import { HugeiconsIcon } from '@hugeicons/react'
import { Delete02Icon, Download01Icon } from '@hugeicons/core-free-icons'

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
  const fileSizeLabel = record.fileSizeBytes ? `${Math.round(record.fileSizeBytes / 1024)} KB` : '-'

  return (
    <div className={`overflow-hidden rounded-xl border ${isSelected ? 'border-[#0075de] bg-[#f6f5f4]' : 'border-[#e6e6e6] bg-white'} p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex rounded-full border px-2.5 py-1 font-['Inter'] text-[12px] font-medium ${record.taskType === 'packing' ? 'border-[#e6e6e6] bg-[#f6f5f4] text-[#000000]' : 'border-[#e6e6e6] bg-white text-[#31302e]'}`}>{record.taskType}</span>
          <span className={`inline-flex rounded-full px-2.5 py-1 font-['Inter'] text-[11px] font-semibold ${record.status === 'completed' ? 'bg-[#000000] text-white' : record.status === 'recording' ? 'bg-[#fef3c7] text-[#92400e] ring-1 ring-[#fde68a]' : 'bg-[#fee2e2] text-[#991b1b] ring-1 ring-[#fecaca]'}`}>
            {record.status === 'completed' ? 'Selesai' : record.status === 'recording' ? 'Recording' : 'Error'}
          </span>
          <span className="inline-flex rounded-full border border-[#e6e6e6] bg-white px-2 py-0.5 font-['Inter'] text-[11px] text-[#615d59]">{(record as unknown as { mediaType?: string }).mediaType === 'photo' || isPhotoFileCard(record.fileName) || isPhotoFileCard(record.filePath) ? 'foto' : 'video'}</span>
          {invalidRecord ? <span className="inline-flex rounded-full bg-[#fee2e2] px-2 py-0.5 font-['Inter'] text-[11px] font-semibold text-[#991b1b] ring-1 ring-[#fecaca]">Tidak valid</span> : null}
          {isSelected ? <span className="inline-flex rounded-full bg-[#0075de] px-2 py-0.5 font-['Inter'] text-[11px] font-semibold text-white">Dipilih</span> : null}
        </div>
        <div className="flex gap-1.5">
          <Button type="button" variant="ghost" size="sm" className="h-8 rounded-full border border-[#e6e6e6] bg-white px-3 font-['Inter'] text-[12px] font-medium text-[#31302e] hover:bg-[#f6f5f4]" disabled={downloadingRecordId !== null} onClick={() => onDownload(record)}>
            <HugeiconsIcon icon={Download01Icon} size={14} strokeWidth={1.9} /> {downloadingRecordId === record.id ? 'Menyiapkan...' : 'Unduh'}
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-8 rounded-full border border-[#e6e6e6] bg-white px-3 font-['Inter'] text-[12px] font-medium text-[#991b1b] hover:bg-[#fee2e2]" disabled={deletingRecordId !== null} onClick={() => onDelete(record)}>
            <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={1.9} /> {deletingRecordId === record.id ? 'Menghapus...' : 'Hapus'}
          </Button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 rounded-[8px] border border-[#e6e6e6] bg-[#f6f5f4] p-3 sm:grid-cols-3">
        <div className="grid gap-1">
          <span className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Waktu</span>
          <span className="font-['Inter'] text-[13px] font-medium text-[#000000]">{formatDateTime(record.startTime)}</span>
        </div>
        <div className="grid gap-1">
          <span className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">File</span>
          <span className="truncate font-['Inter'] text-[13px] font-medium text-[#000000]" title={record.fileName}>{record.fileName}</span>
        </div>
        <div className="grid gap-1">
          <span className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Ukuran</span>
          <span className="font-['Inter'] text-[13px] font-medium text-[#000000]">{fileSizeLabel}</span>
        </div>
        {(record as unknown as { packingPayAmount?: number | null }).packingPayAmount != null && record.taskType === 'packing' ? (
          <div className="grid gap-1">
            <span className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Upah</span>
            <span className="font-['Inter'] text-[13px] font-semibold text-[#000000]">
              {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format((record as unknown as { packingPayAmount: number }).packingPayAmount)}
              {(record as unknown as { packingPayStatus?: string | null }).packingPayStatus === 'needs_review' ? <span className="ml-1 rounded-full bg-[#fef3c7] px-1.5 py-0.5 text-[10px] text-[#92400e] ring-1 ring-[#fde68a]">needs_review</span> : null}
            </span>
          </div>
        ) : null}
        {(record as unknown as { packerOperatorName?: string | null }).packerOperatorName ? (
          <div className="grid gap-1">
            <span className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Packer</span>
            <span className="truncate font-['Inter'] text-[13px] font-medium text-[#000000]">{(record as unknown as { packerOperatorName: string }).packerOperatorName} {(record as unknown as { packerOperatorCode?: string | null }).packerOperatorCode ? `· ${(record as unknown as { packerOperatorCode: string }).packerOperatorCode}` : ''}</span>
          </div>
        ) : null}
        {(record as unknown as { packingPayBreakdown?: unknown | null }).packingPayBreakdown ? (
          <div className="grid gap-1 sm:col-span-3">
            <span className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Breakdown</span>
            <span className="truncate font-['Inter'] text-[12px] text-[#31302e]" title={JSON.stringify((record as unknown as { packingPayBreakdown: unknown }).packingPayBreakdown)}>
              {(() => {
                const b = (record as unknown as { packingPayBreakdown: { ruleName?: string; payType?: string; amount?: number; quantity?: number; total?: number } }).packingPayBreakdown
                return `${b.ruleName ?? '-'} · ${b.payType ?? '-'} · Rp${b.amount ?? 0} x${b.quantity ?? 1} = Rp${b.total ?? 0}`
              })()}
            </span>
          </div>
        ) : null}
        {(record as unknown as { orderSnapshot?: unknown | null }).orderSnapshot ? (
          <div className="grid gap-1">
            <span className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Shipping</span>
            <span className="truncate font-['Inter'] text-[12px] text-[#31302e]">{(() => { const s = (record as unknown as { orderSnapshot: { shippingChannel?: string } }).orderSnapshot; return s.shippingChannel || s.shippingChannel === '' ? String(s.shippingChannel) : '-'; })()}</span>
          </div>
        ) : (record as unknown as { shippingChannel?: string | null }).shippingChannel ? (
          <div className="grid gap-1">
            <span className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Shipping</span>
            <span className="truncate font-['Inter'] text-[12px] text-[#31302e]">{(record as unknown as { shippingChannel: string }).shippingChannel}</span>
          </div>
        ) : null}
      </div>

      {chatSend ? (
        <div className="mt-3 rounded-[8px] border border-[#e6e6e6] bg-white px-3 py-2 font-['Inter'] text-[12px] text-[#615d59]">
          {chatSend.status === 'sent' ? 'Terkirim ke pembeli' : chatSend.status === 'prepared' ? 'Siap kirim' : chatSend.status === 'pending' ? 'Antri kirim' : chatSend.status} {chatSend.buyerUsername ? `· ${chatSend.buyerUsername}` : ''}
        </div>
      ) : null}
    </div>
  )
}

function isPhotoFileCard(name: string | null | undefined) {
  const ext = (name ?? '').toLowerCase().split('.').pop() ?? ''
  return ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'webp'
}

import type { LocalRecordingRecord } from '@pakti/shared/recordings'

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
    <div className={isSelected ? 'history-opencode__record-card is-selected' : 'history-opencode__record-card'}>
      <div className="history-opencode__record-card-inner">
        <div className="history-opencode__record-card-main">
          <div className="history-opencode__record-card-head">
            <TaskPill taskType={record.taskType} />
            <div className="history-opencode__record-card-badges">
              <StatusPill status={record.status} />
              <MediaPill mediaType={(record as unknown as { mediaType?: string }).mediaType ?? 'video'} />
              {invalidRecord ? (
                <span className="history-opencode__badge">
                  [!] Tidak valid
                </span>
              ) : null}
              {isSelected ? (
                <span className="history-opencode__badge">
                  [x] Dipilih
                </span>
              ) : null}
            </div>
          </div>

          <div className="history-opencode__record-meta">
            <span>
              <small>Waktu</small>
              <strong>{formatDateTime(record.startTime)}</strong>
            </span>
            <span>
              <small>File</small>
              <strong className="truncate" title={record.fileName}>{record.fileName}</strong>
            </span>
            <span>
              <small>Ukuran</small>
              <strong>{fileSizeLabel}</strong>
            </span>
            {(record as unknown as { packingPayAmount?: number | null }).packingPayAmount != null && record.taskType === 'packing' ? (
              <span>
                <small>Upah</small>
                <strong>{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format((record as unknown as { packingPayAmount: number }).packingPayAmount)}</strong>
                {(record as unknown as { packingPayStatus?: string | null }).packingPayStatus === 'needs_review' ? (
                  <span className="history-opencode__badge ml-1">[!] needs_review</span>
                ) : null}
              </span>
            ) : null}
            {(record as unknown as { packerOperatorName?: string | null }).packerOperatorName ? (
              <span>
                <small>Packer</small>
                <strong className="truncate">{(record as unknown as { packerOperatorName: string }).packerOperatorName} {(record as unknown as { packerOperatorCode?: string | null }).packerOperatorCode ? `· ${(record as unknown as { packerOperatorCode: string }).packerOperatorCode}` : ''}</strong>
              </span>
            ) : null}
            {(record as unknown as { packingPayBreakdown?: unknown | null }).packingPayBreakdown ? (
              <span>
                <small>Breakdown</small>
                <strong className="truncate text-[11px]" title={JSON.stringify((record as unknown as { packingPayBreakdown: unknown }).packingPayBreakdown)}>
                  {(() => {
                    const b = (record as unknown as { packingPayBreakdown: { ruleName?: string; payType?: string; amount?: number; quantity?: number; total?: number } }).packingPayBreakdown
                    return `${b.ruleName ?? '-'} · ${b.payType ?? '-'} · Rp${b.amount ?? 0} x${b.quantity ?? 1} = Rp${b.total ?? 0}`
                  })()}
                </strong>
              </span>
            ) : null}
            {(record as unknown as { orderSnapshot?: unknown | null }).orderSnapshot ? (
              <span>
                <small>Shipping</small>
                <strong className="truncate text-[11px]">{(() => { const s = (record as unknown as { orderSnapshot: { shippingChannel?: string } }).orderSnapshot; return s.shippingChannel || s.shippingChannel === '' ? String(s.shippingChannel) : '-'; })()}</strong>
              </span>
            ) : (record as unknown as { shippingChannel?: string | null }).shippingChannel ? (
              <span>
                <small>Shipping</small>
                <strong className="truncate text-[11px]">{(record as unknown as { shippingChannel: string }).shippingChannel}</strong>
              </span>
            ) : null}
          </div>

          {chatSend ? (
            <div className="history-opencode__record-chat-status">
              {chatSend.status === 'sent' ? '[✓] Terkirim ke pembeli' : chatSend.status === 'prepared' ? '[~] Siap kirim' : chatSend.status === 'pending' ? '[…] Antri kirim' : `[!] ${chatSend.status}`} {chatSend.buyerUsername ? `· ${chatSend.buyerUsername}` : ''}
            </div>
          ) : null}
        </div>

        <div className="history-opencode__record-actions">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="history-opencode__button history-opencode__record-action-button"
            disabled={downloadingRecordId !== null}
            onClick={() => onDownload(record)}
          >
            {downloadingRecordId === record.id ? '[Menyiapkan...]' : '[Unduh]'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="history-opencode__button history-opencode__record-action-button is-danger"
            disabled={deletingRecordId !== null}
            onClick={() => onDelete(record)}
          >
            {deletingRecordId === record.id ? '[Menghapus...]' : '[Hapus]'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function TaskPill({ taskType }: { taskType: LocalRecordingRecord['taskType'] }) {
  return (
    <span className="history-opencode__status">
      [+] {taskType}
    </span>
  )
}

function StatusPill({ status }: { status: LocalRecordingRecord['status'] }) {
  const label =
    status === 'completed'
      ? 'Lengkap'
      : status === 'recording'
        ? 'Recording'
        : 'Error'
  const marker =
    status === 'completed'
      ? '[x]'
      : status === 'recording'
        ? '[~]'
        : '[!]'

  return (
    <span className="history-opencode__status">
      {marker} {label}
    </span>
  )
}

function MediaPill({ mediaType }: { mediaType: string }) {
  return <span className="history-opencode__badge">[{mediaType === 'photo' ? 'foto' : 'video'}]</span>
}

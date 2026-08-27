import type { LocalRecordingRecord } from '@pakti/shared/recordings'

import { Button } from '../components/ui/button'

type HistoryRecordingCardProps = {
  record: LocalRecordingRecord
  isSelected: boolean
  invalidRecord: boolean
  downloadingRecordId: string | null
  deletingRecordId: string | null
  formatDateTime: (value: string) => string
  onPreview: (record: LocalRecordingRecord) => void
  onCopyPath: (record: LocalRecordingRecord) => void
  onDownload: (record: LocalRecordingRecord) => void
  onDelete: (record: LocalRecordingRecord) => void
}

export function HistoryRecordingCard({
  record,
  isSelected,
  invalidRecord,
  downloadingRecordId,
  deletingRecordId,
  formatDateTime,
  onPreview,
  onCopyPath,
  onDownload,
  onDelete,
}: HistoryRecordingCardProps) {
  return (
    <div className={isSelected ? 'history-opencode__record-card is-selected' : 'history-opencode__record-card'}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <TaskPill taskType={record.taskType} />
            <StatusPill status={record.status} />
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
          <div className="history-opencode__record-meta grid gap-0.5">
            <span className="truncate">File: {record.fileName}</span>
            <span className="truncate">Path: {record.filePath}</span>
            <span>{formatDateTime(record.startTime)}</span>
            <span>{record.note ?? 'Tidak ada catatan tambahan.'}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {record.status === 'completed' ? (
            <Button type="button" size="sm" className="history-opencode__button" onClick={() => onPreview(record)}>
              [preview]
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" className="history-opencode__button" onClick={() => onCopyPath(record)}>
            [copy-path]
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="history-opencode__button"
            disabled={downloadingRecordId !== null}
            onClick={() => onDownload(record)}
          >
            {downloadingRecordId === record.id ? '[preparing]' : record.shareFileReady ? '[download]' : '[preparing video]'}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={deletingRecordId !== null}
            onClick={() => onDelete(record)}
          >
            {deletingRecordId === record.id ? '[deleting]' : '[delete]'}
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

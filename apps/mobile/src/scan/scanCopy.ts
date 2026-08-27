import type { RecordingRow, WorkTask } from '@pakti/types'

export function getPackingQcMessage(qcStatus: RecordingRow['status'] | undefined) {
  return qcStatus === 'recording'
    ? 'Resi ini masih di QC. Tunggu selesai dulu.'
    : 'Resi ini belum masuk QC. Packing belum bisa jalan.'
}

export function getDuplicateScanNotice({
  existing,
  taskType,
  taskProgressQcStatus,
  formatTask,
}: {
  existing: RecordingRow
  taskType: WorkTask
  taskProgressQcStatus?: RecordingRow['status']
  formatTask: (taskType: WorkTask) => string
}) {
  const currentTaskName = formatTask(taskType)
  const isCompletedPackingWithQc = taskType === 'packing' && taskProgressQcStatus === 'completed'

  const title =
    existing.status === 'completed'
      ? isCompletedPackingWithQc
        ? 'Sudah lengkap'
        : `${currentTaskName} selesai`
      : `${currentTaskName} sedang jalan`

  const message =
    existing.status === 'completed'
      ? isCompletedPackingWithQc
        ? 'QC dan Packing sudah selesai.'
        : `Resi ini sudah diproses di ${currentTaskName}.`
      : existing.status === 'recording'
        ? `Resi ini sedang diproses di ${currentTaskName}.`
        : `Resi ini sudah tercatat di ${currentTaskName}.`

  return { title, message }
}

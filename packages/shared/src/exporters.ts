type RecordingExportRecord = {
  id: string
  resiNumber: string
  taskType: string
  operatorName: string | null
  operatorCode: string | null
  fileName: string
  filePath: string
  fileSizeBytes: number | null
  recordDate: string
  startTime: string
  endTime: string | null
  durationSeconds: number | null
  status: string
  note: string | null
  blobKey?: string | null
  mimeType?: string | null
  createdAt: string
  updatedAt: string
}

function escapeCsvValue(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }

  return value
}

export function recordsToCsv(records: RecordingExportRecord[]) {
  const header = [
    'id',
    'resi_number',
    'task_type',
    'operator_name',
    'operator_code',
    'file_name',
    'file_path',
    'file_size_bytes',
    'record_date',
    'start_time',
    'end_time',
    'duration_seconds',
    'status',
    'note',
    'blob_key',
    'mime_type',
    'created_at',
    'updated_at',
  ]

  const rows = records.map((record) =>
    [
      record.id,
      record.resiNumber,
      record.taskType,
      record.operatorName ?? '',
      record.operatorCode ?? '',
      record.fileName,
      record.filePath,
      String(record.fileSizeBytes ?? ''),
      record.recordDate,
      record.startTime,
      record.endTime ?? '',
      String(record.durationSeconds ?? ''),
      record.status,
      record.note ?? '',
      record.blobKey ?? '',
      record.mimeType ?? '',
      record.createdAt,
      record.updatedAt,
    ]
      .map((value) => escapeCsvValue(value))
      .join(','),
  )

  return [header.join(','), ...rows].join('\r\n')
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function recordsToExcelXml(records: RecordingExportRecord[]) {
  const rows = records
    .map((record) => {
      const cells = [
        record.id,
        record.resiNumber,
        record.taskType,
        record.operatorName ?? '',
        record.operatorCode ?? '',
        record.fileName,
        record.filePath,
        String(record.fileSizeBytes ?? ''),
        record.recordDate,
        record.startTime,
        record.endTime ?? '',
        String(record.durationSeconds ?? ''),
        record.status,
        record.note ?? '',
        record.createdAt,
        record.updatedAt,
      ]
        .map((value) => `<Cell><Data ss:Type="String">${xmlEscape(value)}</Data></Cell>`)
        .join('')

      return `<Row>${cells}</Row>`
    })
    .join('')

  return `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Pakti">
    <Table>
      <Row>
        <Cell><Data ss:Type="String">id</Data></Cell>
        <Cell><Data ss:Type="String">resi_number</Data></Cell>
        <Cell><Data ss:Type="String">task_type</Data></Cell>
        <Cell><Data ss:Type="String">operator_name</Data></Cell>
        <Cell><Data ss:Type="String">operator_code</Data></Cell>
        <Cell><Data ss:Type="String">file_name</Data></Cell>
        <Cell><Data ss:Type="String">file_path</Data></Cell>
        <Cell><Data ss:Type="String">file_size_bytes</Data></Cell>
        <Cell><Data ss:Type="String">record_date</Data></Cell>
        <Cell><Data ss:Type="String">start_time</Data></Cell>
        <Cell><Data ss:Type="String">end_time</Data></Cell>
        <Cell><Data ss:Type="String">duration_seconds</Data></Cell>
        <Cell><Data ss:Type="String">status</Data></Cell>
        <Cell><Data ss:Type="String">note</Data></Cell>
        <Cell><Data ss:Type="String">blob_key</Data></Cell>
        <Cell><Data ss:Type="String">mime_type</Data></Cell>
        <Cell><Data ss:Type="String">created_at</Data></Cell>
        <Cell><Data ss:Type="String">updated_at</Data></Cell>
      </Row>
      ${rows}
    </Table>
  </Worksheet>
</Workbook>`
}

import type { LocalRecordingRecord } from './recordings'

function escapeCsvValue(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }

  return value
}

export function recordsToCsv(records: LocalRecordingRecord[]) {
  const header = [
    'id',
    'resi_number',
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
    'created_at',
    'updated_at',
  ]

  const rows = records.map((record) =>
    [
      record.id,
      record.resiNumber,
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

export function recordsToExcelXml(records: LocalRecordingRecord[]) {
  const rows = records
    .map((record) => {
      const cells = [
        record.id,
        record.resiNumber,
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
  <Worksheet ss:Name="PackCam">
    <Table>
      <Row>
        <Cell><Data ss:Type="String">id</Data></Cell>
        <Cell><Data ss:Type="String">resi_number</Data></Cell>
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
        <Cell><Data ss:Type="String">created_at</Data></Cell>
        <Cell><Data ss:Type="String">updated_at</Data></Cell>
      </Row>
      ${rows}
    </Table>
  </Worksheet>
</Workbook>`
}

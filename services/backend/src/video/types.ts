export type VideoProcessingRecording = {
  id: string
  file_name: string
  file_path: string
  resi_number: string
  operator_name: string | null
  operator_code: string | null
  start_time: string
  duration_seconds: number | null
}

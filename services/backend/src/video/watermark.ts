import fs from 'node:fs'
import path from 'node:path'

import { runFfmpeg } from './ffmpeg'
import type { VideoProcessingRecording } from './types'

const WATERMARK_TIME_ZONE = process.env.PAKTI_TIME_ZONE || 'Asia/Jakarta'

function getWatermarkFontPath() {
  const candidates = [
    process.env.PAKTI_WATERMARK_FONT,
    'C:\\Windows\\Fonts\\arial.ttf',
    'C:\\Windows\\Fonts\\segoeui.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf',
  ].filter(Boolean) as string[]

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null
}

function escapeDrawTextValue(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%')
    .replace(/,/g, '\\,')
}

function escapeFilterPath(value: string) {
  return value.replace(/\\/g, '/').replace(/:/g, '\\:')
}

function formatWatermarkDate(value: string | null) {
  const date = value ? new Date(value) : new Date()
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: WATERMARK_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function buildDrawTextFilter(recording: VideoProcessingRecording, placement: 'top-center' | 'top-left' = 'top-center') {
  const operator = [recording.operator_name, recording.operator_code]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' / ') || '-'
  const fontPath = getWatermarkFontPath()
  const fontOption = fontPath ? `:fontfile='${escapeFilterPath(fontPath)}'` : ''
  const line1 = escapeDrawTextValue(`RESI ${recording.resi_number}`)
  const line2 = escapeDrawTextValue(`Petugas: ${operator}`)
  const line3 = escapeDrawTextValue(formatWatermarkDate(recording.start_time))

  if (placement === 'top-left') {
    return [
      'drawbox=x=16:y=24:w=448:h=96:color=black@0.42:t=fill',
      `drawtext=text='${line1}'${fontOption}:x=32:y=38:fontsize=24:fontcolor=white`,
      `drawtext=text='${line2}'${fontOption}:x=32:y=70:fontsize=17:fontcolor=white@0.92`,
      `drawtext=text='${line3}'${fontOption}:x=32:y=96:fontsize=15:fontcolor=white@0.78`,
    ].join(',')
  }

  return [
    'drawbox=x=max(16\\,(iw-min(560\\,iw-32))/2):y=24:w=min(560\\,iw-32):h=96:color=black@0.42:t=fill',
    `drawtext=text='${line1}'${fontOption}:x=(w-text_w)/2:y=38:fontsize=24:fontcolor=white`,
    `drawtext=text='${line2}'${fontOption}:x=(w-text_w)/2:y=70:fontsize=17:fontcolor=white@0.92`,
    `drawtext=text='${line3}'${fontOption}:x=(w-text_w)/2:y=96:fontsize=15:fontcolor=white@0.78`,
  ].join(',')
}

export function isMp4Recording(recording: VideoProcessingRecording) {
  return path.posix.extname(recording.file_path).toLowerCase() === '.mp4' ||
    path.extname(recording.file_name).toLowerCase() === '.mp4'
}

export async function runFfmpegMp4TranscodeToFile(recording: VideoProcessingRecording, inputPath: string, outputPath: string) {
  const buildArgs = (filter: string) => [
    '-y', '-i', inputPath, '-map', '0:v:0', '-map', '0:a?', '-vf', filter,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', outputPath,
  ]

  try {
    await runFfmpeg(buildArgs(buildDrawTextFilter(recording, 'top-center')))
  } catch {
    if (fs.existsSync(outputPath)) {
      fs.rmSync(outputPath, { force: true })
    }

    await runFfmpeg(buildArgs(buildDrawTextFilter(recording, 'top-left')))
  }
}

export async function runFfmpegWatermarkToFile(recording: VideoProcessingRecording, inputPath: string, outputPath: string) {
  const buildArgs = (filter: string) => [
    '-y', '-i', inputPath, '-vf', filter, '-c:v', 'libvpx-vp9', '-deadline', 'realtime',
    '-cpu-used', '6', '-row-mt', '1', '-b:v', '0', '-crf', '36', '-c:a', 'copy', outputPath,
  ]

  try {
    await runFfmpeg(buildArgs(buildDrawTextFilter(recording, 'top-center')))
  } catch {
    if (fs.existsSync(outputPath)) {
      fs.rmSync(outputPath, { force: true })
    }

    await runFfmpeg(buildArgs(buildDrawTextFilter(recording, 'top-left')))
  }
}

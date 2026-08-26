import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

import ffmpegStatic from 'ffmpeg-static'

export type VideoProcessingRecording = {
  file_name: string
  file_path: string
  resi_number: string
  operator_name: string | null
  operator_code: string | null
  start_time: string
  duration_seconds: number | null
}

export const SHOPEE_VIDEO_LIMIT_BYTES = 25 * 1024 * 1024

const WATERMARK_TIME_ZONE = process.env.PAKTI_TIME_ZONE || 'Asia/Jakarta'
const SHARE_VIDEO_TARGET_BYTES = 24 * 1024 * 1024
const SHARE_MAX_VIDEO_BITRATE = 1_200_000
const SHARE_MIN_VIDEO_BITRATE = 80_000

function getFfmpegPath() {
  return process.env.FFMPEG_PATH || ffmpegStatic || 'ffmpeg'
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getShareEncodingProfile(recording: VideoProcessingRecording) {
  const durationSeconds = Math.max(1, Math.ceil(recording.duration_seconds ?? 60))
  const totalBitrate = Math.floor((SHARE_VIDEO_TARGET_BYTES * 8 * 0.92) / durationSeconds)
  const audioBitrate = totalBitrate < 260_000 ? 32_000 : 48_000
  const videoBitrate = clampNumber(totalBitrate - audioBitrate, SHARE_MIN_VIDEO_BITRATE, SHARE_MAX_VIDEO_BITRATE)

  return { videoBitrate, audioBitrate }
}

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

async function runFfmpeg(args: string[], errorLabel = 'ffmpeg watermark gagal') {
  const ffmpegPath = getFfmpegPath()

  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { windowsHide: true })
    let stderr = ''

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
      if (stderr.length > 4000) {
        stderr = stderr.slice(-4000)
      }
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${errorLabel} (${code ?? 'unknown'}): ${stderr.trim()}`))
      }
    })
  })
}

export function isMp4Recording(recording: VideoProcessingRecording) {
  return path.posix.extname(recording.file_path).toLowerCase() === '.mp4' ||
    path.extname(recording.file_name).toLowerCase() === '.mp4'
}

export async function runFfmpegShareMp4Transcode(recording: VideoProcessingRecording, inputPath: string, outputPath: string) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  const { videoBitrate, audioBitrate } = getShareEncodingProfile(recording)

  await runFfmpeg([
    '-y',
    '-i',
    inputPath,
    '-map',
    '0:v:0',
    '-map',
    '0:a?',
    '-vf',
    'scale=720:720:force_original_aspect_ratio=decrease:force_divisible_by=2,fps=15',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-b:v',
    String(videoBitrate),
    '-maxrate',
    String(videoBitrate),
    '-bufsize',
    String(videoBitrate * 2),
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    String(audioBitrate),
    '-movflags',
    '+faststart',
    outputPath,
  ], 'ffmpeg share video gagal')

  const outputSize = fs.statSync(outputPath).size
  if (outputSize > SHOPEE_VIDEO_LIMIT_BYTES) {
    throw new Error(`File share masih lebih dari 25MB (${Math.ceil(outputSize / 1024 / 1024)}MB). Rekaman terlalu panjang untuk batas Shopee.`)
  }
}

export async function runFfmpegMp4TranscodeToFile(recording: VideoProcessingRecording, inputPath: string, outputPath: string) {
  const buildArgs = (filter: string) => [
    '-y',
    '-i',
    inputPath,
    '-map',
    '0:v:0',
    '-map',
    '0:a?',
    '-vf',
    filter,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '28',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    outputPath,
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
    '-y',
    '-i',
    inputPath,
    '-vf',
    filter,
    '-c:v',
    'libvpx-vp9',
    '-deadline',
    'realtime',
    '-cpu-used',
    '6',
    '-row-mt',
    '1',
    '-b:v',
    '0',
    '-crf',
    '36',
    '-c:a',
    'copy',
    outputPath,
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

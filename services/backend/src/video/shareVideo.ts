import fs from 'node:fs'
import path from 'node:path'

import { runFfmpeg } from './ffmpeg'
import type { VideoProcessingRecording } from './types'

export const SHOPEE_VIDEO_LIMIT_BYTES = 25 * 1024 * 1024

const SHARE_VIDEO_TARGET_BYTES = 24 * 1024 * 1024
const SHARE_MAX_VIDEO_BITRATE = 1_200_000
const SHARE_MIN_VIDEO_BITRATE = 80_000

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

export async function runFfmpegShareMp4Transcode(recording: VideoProcessingRecording, inputPath: string, outputPath: string) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  const { videoBitrate, audioBitrate } = getShareEncodingProfile(recording)

  await runFfmpeg([
    '-y', '-i', inputPath, '-map', '0:v:0', '-map', '0:a?',
    '-vf', 'scale=720:720:force_original_aspect_ratio=decrease:force_divisible_by=2,fps=15',
    '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', String(videoBitrate),
    '-maxrate', String(videoBitrate), '-bufsize', String(videoBitrate * 2), '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', String(audioBitrate), '-movflags', '+faststart', outputPath,
  ], 'ffmpeg share video gagal')

  const outputSize = fs.statSync(outputPath).size
  if (outputSize > SHOPEE_VIDEO_LIMIT_BYTES) {
    throw new Error(`File share masih lebih dari 25MB (${Math.ceil(outputSize / 1024 / 1024)}MB). Rekaman terlalu panjang untuk batas Shopee.`)
  }
}

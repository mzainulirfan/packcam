import fs from 'node:fs'
import path from 'node:path'

import { runFfmpeg } from './ffmpeg'
import type { VideoProcessingRecording } from './types'
import { broadcastBackendEvent } from '../realtime'

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

function findEbmlOffset(buffer: Buffer): number {
  for (let i = 0; i < Math.min(buffer.length - 4, 64); i += 1) {
    if (buffer[i] === 0x1a && buffer[i + 1] === 0x45 && buffer[i + 2] === 0xdf && buffer[i + 3] === 0xa3) return i
  }
  return -1
}

export async function runFfmpegShareMp4Transcode(recording: VideoProcessingRecording, inputPath: string, outputPath: string) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  const { videoBitrate, audioBitrate } = getShareEncodingProfile(recording)
  const durationSeconds = Math.max(1, Number(recording.duration_seconds ?? 60))
  let lastProgress = -1
  let effectiveInputPath = inputPath
  let tempRepairedPath: string | null = null

  const tryRun = () => runFfmpeg([
    '-y', '-i', effectiveInputPath, '-map', '0:v:0', '-map', '0:a?',
    '-vf', 'scale=720:720:force_original_aspect_ratio=decrease:force_divisible_by=2,fps=15',
    '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', String(videoBitrate),
    '-maxrate', String(videoBitrate), '-bufsize', String(videoBitrate * 2), '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', String(audioBitrate), '-movflags', '+faststart',
    '-progress', 'pipe:2', '-nostats', outputPath,
  ], 'ffmpeg share video gagal', ({ elapsedSeconds }) => {
    const progress = Math.min(99, Math.max(0, Math.floor((elapsedSeconds / durationSeconds) * 100)))
    if (progress === lastProgress) {
      return
    }

    lastProgress = progress
    broadcastBackendEvent('share-file-progress', {
      recordingId: recording.id,
      resiNumber: recording.resi_number,
      fileName: path.basename(outputPath),
      progress,
    })
  })

  try {
    await tryRun()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const isEbmlError = message.includes('EBML header parsing failed') || message.includes('Invalid data found when processing input')
    if (!isEbmlError) throw error
    try {
      const header = fs.readFileSync(inputPath).subarray(0, 8192)
      const offset = findEbmlOffset(header)
      if (offset <= 0) throw error
      tempRepairedPath = `${inputPath}.repaired-${Date.now()}.webm`
      const full = fs.readFileSync(inputPath)
      fs.writeFileSync(tempRepairedPath, full.subarray(offset))
      effectiveInputPath = tempRepairedPath
      if (fs.existsSync(outputPath)) fs.rmSync(outputPath, { force: true })
      await tryRun()
    } catch (repairError) {
      if (tempRepairedPath && fs.existsSync(tempRepairedPath)) fs.rmSync(tempRepairedPath, { force: true })
      throw new Error(`File video rusak (EBML header invalid) untuk resi ${recording.resi_number}. Silakan rekam ulang.`)
    } finally {
      if (tempRepairedPath && fs.existsSync(tempRepairedPath)) fs.rmSync(tempRepairedPath, { force: true })
    }
  } finally {
    if (tempRepairedPath && fs.existsSync(tempRepairedPath)) fs.rmSync(tempRepairedPath, { force: true })
  }

  const outputSize = fs.statSync(outputPath).size
  if (outputSize > SHOPEE_VIDEO_LIMIT_BYTES) {
    throw new Error(`File share masih lebih dari 25MB (${Math.ceil(outputSize / 1024 / 1024)}MB). Rekaman terlalu panjang untuk batas Shopee.`)
  }
}

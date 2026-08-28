import { spawn } from 'node:child_process'

import ffmpegStatic from 'ffmpeg-static'

export function getFfmpegPath() {
  return process.env.FFMPEG_PATH || ffmpegStatic || 'ffmpeg'
}

export async function runFfmpeg(
  args: string[],
  errorLabel = 'ffmpeg watermark gagal',
  onProgress?: (progress: { elapsedSeconds: number }) => void,
) {
  const ffmpegPath = getFfmpegPath()

  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { windowsHide: true })
    let stderr = ''
    let progressOutput = ''

    child.stderr.on('data', (chunk: Buffer) => {
      const output = chunk.toString()
      if (onProgress) {
        progressOutput += output
        const match = progressOutput.match(/(?:^|\n)out_time_us=(\d+)/)
        if (match) {
          onProgress({ elapsedSeconds: Number(match[1]) / 1_000_000 })
          progressOutput = progressOutput.slice(match.index! + match[0].length)
        } else if (progressOutput.length > 1000) {
          progressOutput = progressOutput.slice(-1000)
        }
      }

      stderr += output
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

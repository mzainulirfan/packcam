import { spawn } from 'node:child_process'

import ffmpegStatic from 'ffmpeg-static'

export function getFfmpegPath() {
  return process.env.FFMPEG_PATH || ffmpegStatic || 'ffmpeg'
}

export async function runFfmpeg(args: string[], errorLabel = 'ffmpeg watermark gagal') {
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

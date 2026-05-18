import { spawn } from 'node:child_process'
import process from 'node:process'

const npmCmd = 'npm'
const useShell = true

const children = [
  spawn(npmCmd, ['run', 'api:dev'], {
    stdio: 'inherit',
    shell: useShell,
  }),
  spawn(npmCmd, ['run', 'dev', '--', '--host'], {
    stdio: 'inherit',
    shell: useShell,
  }),
]

let shuttingDown = false

function shutdown(code = 0) {
  if (shuttingDown) {
    return
  }

  shuttingDown = true

  for (const child of children) {
    if (!child.killed) {
      child.kill()
    }
  }

  process.exit(code)
}

for (const child of children) {
  child.on('exit', (code, signal) => {
    if (shuttingDown) {
      return
    }

    if (signal) {
      shutdown(1)
      return
    }

    if (typeof code === 'number' && code !== 0) {
      shutdown(code)
    }
  })
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

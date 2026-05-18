import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export { downloadTextFile } from './download'
export { getBuildInfo } from './buildInfo'
export { listScanLogs, logScanEvent } from './scanLogs'

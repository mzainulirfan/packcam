export const DEFAULT_SCAN_INTERVAL_MS = 100
export const DEFAULT_SCAN_AREA_RATIO = 0.82
export const FULL_FRAME_SCAN_EVERY = 3
export const AUTO_SWITCH_TO_FULL_FRAME_AFTER_MISSES = 6
export type ScanMode = 'center-first' | 'full-frame'

const MIN_SCAN_AREA_RATIO = 0.4
const MAX_SCAN_AREA_RATIO = 1

export type ScanRegionRect = {
  sourceX: number
  sourceY: number
  sourceWidth: number
  sourceHeight: number
}

export function normalizeBarcodeValue(value: string) {
  return value.trim()
}

export function getScanRegionRect(
  videoWidth: number,
  videoHeight: number,
  scanAreaRatio: number,
): ScanRegionRect {
  const ratio = Math.min(Math.max(scanAreaRatio, MIN_SCAN_AREA_RATIO), MAX_SCAN_AREA_RATIO)
  const sourceWidth = Math.max(1, Math.round(videoWidth * ratio))
  const sourceHeight = Math.max(1, Math.round(videoHeight * ratio))
  const sourceX = Math.max(0, Math.round((videoWidth - sourceWidth) / 2))
  const sourceY = Math.max(0, Math.round((videoHeight - sourceHeight) / 2))

  return {
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
  }
}

export function getScanAreaRatioForAttempt(attemptIndex: number, scanAreaRatio: number) {
  if (attemptIndex > 0 && attemptIndex % FULL_FRAME_SCAN_EVERY === 0) {
    return 1
  }

  return scanAreaRatio
}

export function getScanAreaRatioForMode(scanMode: ScanMode, attemptIndex: number, scanAreaRatio: number) {
  if (scanMode === 'full-frame') {
    return 1
  }

  return getScanAreaRatioForAttempt(attemptIndex, scanAreaRatio)
}

export function shouldAutoSwitchToFullFrame(scanMode: ScanMode, missStreak: number) {
  return scanMode === 'center-first' && missStreak >= AUTO_SWITCH_TO_FULL_FRAME_AFTER_MISSES
}

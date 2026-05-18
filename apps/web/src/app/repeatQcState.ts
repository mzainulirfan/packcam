const REPEAT_QC_KEY = 'pakti.repeatQcResi'

function readStoredRepeatQcResi() {
  if (typeof window === 'undefined') {
    return null
  }

  const stored = window.sessionStorage.getItem(REPEAT_QC_KEY)
  return stored?.trim() || null
}

function writeStoredRepeatQcResi(resiNumber: string | null) {
  if (typeof window === 'undefined') {
    return
  }

  if (!resiNumber?.trim()) {
    window.sessionStorage.removeItem(REPEAT_QC_KEY)
    return
  }

  window.sessionStorage.setItem(REPEAT_QC_KEY, resiNumber.trim())
}

export function readRepeatQcResi() {
  return readStoredRepeatQcResi()
}

export function setRepeatQcResi(resiNumber: string | null) {
  writeStoredRepeatQcResi(resiNumber)
}

export function clearRepeatQcResi() {
  writeStoredRepeatQcResi(null)
}

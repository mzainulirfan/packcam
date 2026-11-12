export const DEFAULT_BARCODE_RELEASE_MS = 350

export type BarcodeScanGate = {
  lastEmittedValue: string | null
  lastEmittedAt: number
  clearSince: number | null
  blockedValues: Set<string>
}

export function createBarcodeScanGate(): BarcodeScanGate {
  return {
    lastEmittedValue: null,
    lastEmittedAt: 0,
    clearSince: null,
    blockedValues: new Set<string>(),
  }
}

/**
 * Saat konteks scanner berubah (rekaman selesai / mode berganti), pertahankan
 * nilai terakhir dan tunggu frame kosong sebelum nilai yang sama boleh keluar
 * lagi. Ini mencegah frame kamera lama dianggap sebagai scan baru.
 */
export function resetBarcodeScanGate(gate: BarcodeScanGate, blockedValue?: string | null) {
  gate.clearSince = null
  if (gate.lastEmittedValue) {
    gate.blockedValues.add(gate.lastEmittedValue)
  }
  const normalizedBlockedValue = blockedValue?.trim()
  if (normalizedBlockedValue) {
    gate.blockedValues.add(normalizedBlockedValue)
  }
}

/**
 * Scanner bersifat edge-triggered: barcode yang terus terlihat hanya keluar
 * sekali. Nilai yang sama baru boleh keluar lagi setelah barcode tidak terlihat
 * selama `releaseMs` dan cooldown sudah lewat. Barcode berbeda tetap bisa keluar
 * langsung agar alur scan paket berikutnya tetap cepat.
 */
export function observeBarcodeScan(
  gate: BarcodeScanGate,
  rawValue: string | null | undefined,
  now: number,
  cooldownMs: number,
  releaseMs = DEFAULT_BARCODE_RELEASE_MS,
) {
  const value = rawValue?.trim() ?? ''

  if (!value) {
    if (gate.clearSince === null) {
      gate.clearSince = now
    }
    if (now - gate.clearSince >= releaseMs) {
      gate.blockedValues.clear()
    }
    return false
  }

  gate.clearSince = null

  if (gate.blockedValues.has(value)) {
    return false
  }
  if (value === gate.lastEmittedValue && now - gate.lastEmittedAt < cooldownMs) {
    return false
  }

  gate.blockedValues.add(value)
  gate.lastEmittedValue = value
  gate.lastEmittedAt = now
  return true
}

import type { PackingPaymentAdjustment, PackingPaymentMethod } from '@pakti/types'

export function normalizePaymentMethodOf(value: unknown): PackingPaymentMethod {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'transfer') return 'transfer'
  if (normalized === 'other') return 'other'
  return 'cash'
}

export function parseStoredAdjustments(value: string | null): PackingPaymentAdjustment[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((entry): entry is PackingPaymentAdjustment => {
        if (!entry || typeof entry !== 'object') return false
        const item = entry as Record<string, unknown>
        return typeof item.label === 'string' && (item.kind === 'add' || item.kind === 'deduct') && Number.isFinite(Number(item.amount))
      })
      .map((entry) => ({ label: entry.label.trim(), kind: entry.kind, amount: Math.round(Number(entry.amount)) }))
      .filter((entry) => entry.label.length > 0 && entry.amount > 0)
  } catch {
    return []
  }
}

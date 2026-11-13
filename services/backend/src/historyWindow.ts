/** Receives authorized rows; keeps every stage for resis active in the requested window. */
export function selectHistoryActivityWindow<T extends { resi_number: string; updated_at: string }>(rows: T[], since: number | null): T[] {
  if (since === null) return rows
  const activeResis = new Set(rows
    .filter(row => Date.parse(row.updated_at) >= since)
    .map(row => row.resi_number.trim().toLowerCase()))
  return rows.filter(row => activeResis.has(row.resi_number.trim().toLowerCase()))
}

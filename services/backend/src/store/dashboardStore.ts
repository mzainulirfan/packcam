import { ensureServerStorage, getDb } from '../db'

function db() {
  ensureServerStorage()
  return getDb()
}

export type DashboardOperatorRow = {
  operatorName: string
  operatorCode: string
  name: string
  packingCount: number
  payAmount: number
}

export type DashboardSummary = {
  date: string
  qcCompleted: number
  packingCompleted: number
  payTotal: number
  operators: DashboardOperatorRow[]
  chat: { pending: number; sent: number; failed: number }
  ordersUpdated: number
}

function jakartaDate(offsetDays = 0) {
  const now = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

function normalizeDateParam(value: unknown): string {
  const raw = String(value ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  return jakartaDate(0)
}

export function getDashboardSummary(dateParam?: unknown): DashboardSummary {
  const date = normalizeDateParam(dateParam)

  const qcRow = db().prepare(
    `SELECT COUNT(*) AS count FROM recordings WHERE task_type = 'qc' AND status = 'completed' AND record_date = ?`,
  ).get(date) as { count: number }

  const packingRow = db().prepare(
    `SELECT COUNT(*) AS count, COALESCE(SUM(packing_pay_amount), 0) AS pay
     FROM recordings WHERE task_type = 'packing' AND status = 'completed' AND record_date = ?`,
  ).get(date) as { count: number; pay: number }

  const operatorRows = db().prepare(
    `SELECT packer_operator_name AS operatorName, packer_operator_code AS operatorCode,
            COALESCE(NULLIF(operator_name, ''), packer_operator_name) AS name,
            COUNT(*) AS packingCount, COALESCE(SUM(packing_pay_amount), 0) AS payAmount
     FROM recordings
     WHERE task_type = 'packing' AND status = 'completed' AND record_date = ?
     GROUP BY packer_operator_name, packer_operator_code
     ORDER BY packingCount DESC`,
  ).all(date) as DashboardOperatorRow[]

  const chatRows = db().prepare(
    `SELECT status, COUNT(*) AS count FROM recording_chat_sends
     WHERE date(created_at, '+7 hours') = ?
     GROUP BY status`,
  ).all(date) as Array<{ status: string; count: number }>
  const chatCount = (status: string) => chatRows.find((r) => r.status === status)?.count ?? 0

  const ordersRow = db().prepare(
    `SELECT COUNT(*) AS count FROM orders WHERE source = 'shopee' AND date(updated_at, '+7 hours') = ?`,
  ).get(date) as { count: number }

  return {
    date,
    qcCompleted: qcRow.count ?? 0,
    packingCompleted: packingRow.count ?? 0,
    payTotal: packingRow.pay ?? 0,
    operators: operatorRows.map((row) => ({
      operatorName: row.operatorName,
      operatorCode: row.operatorCode,
      name: row.name,
      packingCount: row.packingCount,
      payAmount: row.payAmount,
    })),
    chat: {
      pending: chatCount('pending'),
      sent: chatCount('sent'),
      failed: chatCount('failed') + chatCount('cancelled'),
    },
    ordersUpdated: ordersRow.count ?? 0,
  }
}

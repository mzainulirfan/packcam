import { ensureServerStorage, getDb } from '../db'

function db() {
  ensureServerStorage()
  return getDb()
}

export type DashboardOperatorRow = {
  operatorName: string
  operatorCode: string
  name: string
  displayName: string
  packingCount: number
  payAmount: number
}

export type DashboardChannelRow = {
  channel: string
  count: number
}

export type DashboardSummary = {
  date: string
  qcCompleted: number
  packingCompleted: number
  payTotal: number
  operators: DashboardOperatorRow[]
  byChannel: DashboardChannelRow[]
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
            COALESCE(NULLIF((SELECT p.full_name FROM operator_profiles p
              WHERE LOWER(p.operator_name) = LOWER(packer_operator_name)
                AND LOWER(p.operator_code) = LOWER(packer_operator_code)
              ORDER BY p.last_used_at DESC LIMIT 1), ''), packer_operator_name) AS displayName,
            COUNT(*) AS packingCount, COALESCE(SUM(packing_pay_amount), 0) AS payAmount
     FROM recordings
     WHERE task_type = 'packing' AND status = 'completed' AND record_date = ?
     GROUP BY packer_operator_name, packer_operator_code
     ORDER BY packingCount DESC`,
  ).all(date) as DashboardOperatorRow[]

  const channelRows = db().prepare(
    `SELECT COALESCE(NULLIF(TRIM(r.shipping_channel), ''),
                     NULLIF(TRIM((SELECT o.shipping_channel FROM orders o
                       WHERE o.source = 'shopee'
                         AND lower(o.tracking_number) = lower(r.resi_number)
                       ORDER BY o.updated_at DESC LIMIT 1)), ''),
                     'Tanpa data') AS channel,
            COUNT(*) AS count
     FROM recordings r
     WHERE r.task_type = 'packing' AND r.status = 'completed' AND r.record_date = ?
     GROUP BY channel
     ORDER BY count DESC`,
  ).all(date) as DashboardChannelRow[]

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
      displayName: row.displayName || row.operatorName,
      packingCount: row.packingCount,
      payAmount: row.payAmount,
    })),
    byChannel: channelRows.map((row) => ({
      channel: row.channel || 'Tanpa data',
      count: row.count ?? 0,
    })),
    chat: {
      pending: chatCount('pending'),
      sent: chatCount('sent'),
      failed: chatCount('failed') + chatCount('cancelled'),
    },
    ordersUpdated: ordersRow.count ?? 0,
  }
}

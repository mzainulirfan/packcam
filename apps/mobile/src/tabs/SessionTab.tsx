import { useEffect, useMemo, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Logout02Icon, UserIcon } from '@hugeicons/core-free-icons'
import type { OperatorSession, PackingPayment, PackingWorkSession, WorkTask } from '@pakti/types'
import { readPackingPaymentsApi, readPackingSessionsApi } from '@pakti/api-client'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type SessionTabProps = {
  session: OperatorSession
  isAdmin: boolean
  taskBusy: boolean
  formatDateTime: (value: string | null | undefined) => string
  formatTask: (taskType: WorkTask) => string
  onTaskChange: (taskType: WorkTask) => void
  onLogoutClick: () => void
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount)
}

function formatShortDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return new Date(iso).toLocaleDateString('id-ID')
  }
}

function AdminPackingSection() {
  const [sessions, setSessions] = useState<PackingWorkSession[]>([])
  const [payments, setPayments] = useState<PackingPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [paidFilter, setPaidFilter] = useState<'all' | 'unpaid' | 'paid'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'closed' | 'cancelled'>('closed')
  const [packerFilter, setPackerFilter] = useState<string>('all')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [s, p] = await Promise.all([
        readPackingSessionsApi(100),
        readPackingPaymentsApi(20).catch(() => [] as PackingPayment[]),
      ])
      setSessions(s)
      setPayments(p as PackingPayment[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data packing.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void load()
    })
  }, [])

  const packerOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of sessions) {
      const key = `${s.packerOperatorName}::${s.packerOperatorCode}`
      if (!map.has(key)) map.set(key, `${s.packerNameSnapshot} (${s.packerCodeSnapshot})`)
    }
    return Array.from(map.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [sessions])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return sessions.filter((s) => {
      const matchesSearch = !q || `${s.packerNameSnapshot} ${s.packerCodeSnapshot} ${s.id}`.toLowerCase().includes(q)
      const matchesStatus = statusFilter === 'all' || s.status === statusFilter
      const matchesPacker = packerFilter === 'all' || `${s.packerOperatorName}::${s.packerOperatorCode}` === packerFilter
      const isPaid = Boolean(s.paidAt)
      const matchesPaid = paidFilter === 'all' || (paidFilter === 'paid' ? isPaid : !isPaid)
      return matchesSearch && matchesStatus && matchesPacker && matchesPaid
    })
  }, [sessions, search, statusFilter, packerFilter, paidFilter])

  const totals = useMemo(() => {
    const totalPaket = filtered.reduce((a, s) => a + (s.completedPackingCount ?? 0), 0)
    const totalUpah = filtered.reduce((a, s) => a + (s.totalPayAmount ?? 0), 0)
    const paid = filtered.filter((s) => Boolean(s.paidAt)).length
    return { totalPaket, totalUpah, paid, unpaid: filtered.length - paid, count: filtered.length }
  }, [filtered])

  const visibleSessions = expanded ? filtered : filtered.slice(0, 8)

  function buildSelectionShareText() {
    if (filtered.length === 0) return ''
    const firstName = packerFilter !== 'all' ? (packerOptions.find((o) => o.key === packerFilter)?.label.split(' (')[0] ?? 'Kak') : 'Kak'
    const sorted = [...filtered].sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
    const start = new Date(sorted[0].startedAt)
    const end = new Date(sorted[sorted.length - 1].startedAt)
    const sameDay = start.toDateString() === end.toDateString()
    const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
    let periode: string
    if (sameDay) periode = start.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    else if (sameMonth) periode = `${start.getDate()}–${end.getDate()} ${start.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}`
    else periode = `${start.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} – ${end.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`

    const groups = new Map<string, PackingWorkSession[]>()
    for (const r of sorted) {
      const d = new Date(r.startedAt)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(r)
    }
    const lines: string[] = []
    lines.push(`Halo ${firstName} 👋`, ``, `Ini ringkasan upah packing kamu ya:`, ``, `Periode: ${periode}`, ``, `Total keseluruhan:`, `• ${filtered.length} sesi packing`, `• ${totals.totalPaket} paket`, `• Total upah: ${formatCurrency(totals.totalUpah)}`, `• Sudah dibayar: ${totals.paid} sesi`, `• Belum dibayar: ${totals.unpaid} sesi`, ``, `Rinciannya:`, ``)
    for (const key of Array.from(groups.keys()).sort()) {
      const group = groups.get(key)!
      const header = new Date(group[0].startedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
      lines.push(`📅 ${header}`)
      group.forEach((s, idx) => {
        const paid = Boolean(s.paidAt)
        lines.push(`• Sesi ${idx + 1} — ${s.completedPackingCount} paket • ${formatCurrency(s.totalPayAmount)} • ${paid ? '✅ Sudah dibayar' : 'Belum dibayar'}`)
      })
      lines.push(``)
    }
    lines.push(`Coba dicek dulu ya. Kalau datanya sudah sesuai, kabari admin supaya pembayaran yang belum selesai bisa diproses 😊`, ``, `Makasih banyak sudah bantu proses packing 🙏`)
    return lines.join('\n')
  }

  function buildPaymentShareText(p: PackingPayment) {
    const firstName = p.packerNameSnapshot.split(' ')[0]
    const metode = p.paymentMethod === 'cash' ? 'Tunai' : p.paymentMethod === 'transfer' ? 'Transfer' : 'Lainnya'
    const lines = [
      `Halo Kak ${firstName} 👋`,
      ``,
      `Kabar baik — pembayaran upah packing kamu sudah selesai diproses ✓`,
      ``,
      `Petugas: ${p.packerNameSnapshot} (${p.packerCodeSnapshot})`,
      `No. Pembayaran: ${p.paymentNo}`,
      `Tanggal bayar: ${new Date(p.paidAt).toLocaleString('id-ID')}`,
      `Metode: ${metode} (${p.paymentMethod})`,
      p.note ? `Catatan: ${p.note}` : null,
      ``,
      `Total dibayar: ${formatCurrency(p.totalAmount)}`,
      `Rincian: ${p.totalSessions} sesi • ${p.totalPackages} paket`,
      ``,
      `Dibayar oleh: ${p.paidByOperatorName} (${p.paidByOperatorCode})`,
      ``,
      `Mohon dicek dan konfirmasi ya. Terima kasih banyak atas kerja kerasnya 🙏`,
    ].filter(Boolean) as string[]
    return lines.join('\n')
  }

  async function copyText(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey((c) => (c === key ? null : c)), 1800)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
        setCopiedKey(key)
        setTimeout(() => setCopiedKey((c) => (c === key ? null : c)), 1800)
      } finally {
        ta.remove()
      }
    }
  }

  function shareWA(text: string) {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="grid gap-3">
      <section className="grid gap-3 rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-canvas)] p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--op-mute)]">Admin • Packing & Bayar</p>
            <h3 className="mt-1 text-[14px] font-bold leading-none">Ringkasan Sesi (read-only)</h3>
            <p className="mt-1 text-[11px] leading-snug text-[var(--op-mute)]">Lihat sesi & bayar — bayar tetap di web. Mobile hanya cek & share.</p>
          </div>
          <Button type="button" variant="outline" size="sm" className="h-7 shrink-0 rounded-[4px] text-xs" onClick={() => void load()} disabled={loading}>
            {loading ? '…' : '↻ Refresh'}
          </Button>
        </div>

        {error ? (
          <Alert variant="destructive" className="rounded-[4px] py-2">
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-surface-soft)] px-3 py-2">
            <p className="m-0 text-[11px] text-[var(--op-mute)]">Sesi terfilter</p>
            <p className="m-0 mt-1 font-bold tabular-nums">{totals.count}</p>
            <p className="m-0 text-[11px] text-[var(--op-mute)]">{totals.paid} dibayar • {totals.unpaid} belum</p>
          </div>
          <div className="rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-surface-soft)] px-3 py-2">
            <p className="m-0 text-[11px] text-[var(--op-mute)]">Total paket / upah</p>
            <p className="m-0 mt-1 font-bold tabular-nums">{totals.totalPaket} paket</p>
            <p className="m-0 text-[11px] font-medium text-[var(--op-ink)]">{formatCurrency(totals.totalUpah)}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 rounded-[4px] text-xs"
            onClick={() => void copyText(buildSelectionShareText(), 'sel')}
            disabled={filtered.length === 0}
          >
            {copiedKey === 'sel' ? 'Copied' : 'Copy ringkasan'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 rounded-[4px] text-xs"
            onClick={() => shareWA(buildSelectionShareText())}
            disabled={filtered.length === 0}
          >
            Share WA
          </Button>
        </div>

        <div className="grid gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari packer / kode..."
            className="h-8 rounded-[4px] border-[var(--op-hairline)] bg-[var(--op-surface-soft)] text-xs"
          />
          <div className="grid grid-cols-3 gap-1.5">
            <select value={packerFilter} onChange={(e) => setPackerFilter(e.target.value)} className="h-8 rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-surface-soft)] px-2 text-xs text-[var(--op-ink)] outline-none">
              <option value="all">Semua petugas</option>
              {packerOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
            <select value={paidFilter} onChange={(e) => setPaidFilter(e.target.value as typeof paidFilter)} className="h-8 rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-surface-soft)] px-2 text-xs outline-none">
              <option value="all">Semua bayar</option>
              <option value="unpaid">Belum</option>
              <option value="paid">Sudah</option>
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="h-8 rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-surface-soft)] px-2 text-xs outline-none">
              <option value="all">Semua status</option>
              <option value="active">active</option>
              <option value="closed">closed</option>
            </select>
          </div>
        </div>

        <div className="grid gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--op-mute)]">Daftar sesi ({filtered.length})</p>
          {loading ? (
            <div className="space-y-2">
              <div className="h-12 animate-pulse rounded-[4px] bg-[var(--op-surface-soft)]" />
              <div className="h-12 animate-pulse rounded-[4px] bg-[var(--op-surface-soft)]" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="rounded-[4px] border border-dashed border-[var(--op-hairline)] bg-[var(--op-surface-soft)] px-3 py-4 text-center text-xs text-[var(--op-mute)]">Tidak ada sesi sesuai filter.</p>
          ) : (
            <>
              <div className="grid max-h-[42vh] gap-1.5 overflow-y-auto pr-1">
                {visibleSessions.map((s) => (
                  <div key={s.id} className="rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-surface-soft)] px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold leading-none">{s.packerNameSnapshot}</p>
                        <p className="mt-1 text-xs text-[var(--op-mute)]">
                          {s.packerCodeSnapshot} • {formatShortDate(s.startedAt)} • [{s.status}]
                        </p>
                      </div>
                      <span className={s.paidAt ? 'shrink-0 rounded bg-[var(--op-ink)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--op-canvas)]' : 'shrink-0 rounded border border-[var(--op-hairline)] bg-[var(--op-canvas)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--op-mute)]'}>
                        {s.paidAt ? 'dibayar' : 'belum'}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-2 text-xs">
                      <span className="tabular-nums">{s.completedPackingCount} paket • {formatCurrency(s.totalPayAmount)}</span>
                      <span className="truncate font-mono text-[11px] text-[var(--op-mute)]" title={s.id}>
                        {s.id.slice(0, 8)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {filtered.length > 8 ? (
                <Button type="button" variant="ghost" size="sm" className="h-7 w-full rounded-[4px] text-xs" onClick={() => setExpanded((v) => !v)}>
                  {expanded ? 'Ciutkan' : `Lihat semua (${filtered.length})`}
                </Button>
              ) : null}
            </>
          )}
        </div>
      </section>

      <section className="grid gap-2 rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-canvas)] p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--op-mute)]">Riwayat bayar ({payments.length})</p>
          <Button type="button" variant="ghost" size="sm" className="h-7 rounded-[4px] text-xs" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        </div>
        {payments.length === 0 ? (
          <p className="rounded-[4px] border border-dashed border-[var(--op-hairline)] bg-[var(--op-surface-soft)] px-3 py-3 text-center text-xs text-[var(--op-mute)]">Belum ada pembayaran.</p>
        ) : (
          <div className="grid max-h-[38vh] gap-1.5 overflow-y-auto pr-1">
            {payments.map((p) => (
              <div key={p.id} className="rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-surface-soft)] px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs font-bold">{p.paymentNo}</p>
                    <p className="mt-1 truncate text-xs text-[var(--op-mute)]">
                      {p.packerNameSnapshot} ({p.packerCodeSnapshot}) • {p.totalSessions} sesi • {p.totalPackages} paket
                    </p>
                  </div>
                  <span className="shrink-0 rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-canvas)] px-1.5 py-0.5 font-mono text-[11px]">{p.paymentMethod}</span>
                </div>
                <p className="mt-1 text-xs font-medium tabular-nums">{formatCurrency(p.totalAmount)}</p>
                <p className="text-[11px] text-[var(--op-mute)]">{new Date(p.paidAt).toLocaleString('id-ID')}</p>
                <div className="mt-2 flex gap-1.5">
                  <Button type="button" variant="outline" size="sm" className="h-7 flex-1 rounded-[4px] text-xs" onClick={() => void copyText(buildPaymentShareText(p), `pay-${p.id}`)}>
                    {copiedKey === `pay-${p.id}` ? 'Copied' : 'Copy'}
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 flex-1 rounded-[4px] text-xs" onClick={() => shareWA(buildPaymentShareText(p))}>
                    WA
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] leading-snug text-[var(--op-mute)]">Bayar tetap di web. Mobile hanya untuk cek & share.</p>
      </section>
    </div>
  )
}

export function SessionTab({
  session,
  isAdmin,
  taskBusy,
  formatDateTime,
  formatTask,
  onTaskChange,
  onLogoutClick,
}: SessionTabProps) {
  const roleLabel = session.role === 'admin' ? 'Admin' : 'Operator'

  return (
    <div className="grid gap-3 pt-1" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
      <div className="flex items-center justify-between gap-3 border-b border-[var(--op-hairline)] pb-3">
        <div className="min-w-0">
          <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--op-mute)]">Session</p>
          <h2 className="mt-1 truncate text-[18px] font-bold leading-none">{session.operatorName}</h2>
          <p className="mt-1 text-[12px] text-[var(--op-mute)]">{session.operatorCode || '-'} · {roleLabel}</p>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[4px] bg-[var(--op-ink)] text-[var(--op-canvas)]">
          <HugeiconsIcon icon={UserIcon} size={16} />
        </span>
      </div>

      <div className="grid gap-3">
        <section className="grid gap-3 rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-canvas)] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-[4px] bg-[var(--op-ink)] px-2 py-0.5 text-[11px] font-medium text-[var(--op-canvas)]">
              {roleLabel}
            </span>
            <span className="rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-surface-soft)] px-2 py-0.5 text-[11px] text-[var(--op-mute)]">
              {formatTask(session.taskType)} aktif
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[12px]">
            <div className="rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-surface-soft)] px-3 py-2">
              <p className="m-0 text-[var(--op-mute)]">Kode</p>
              <p className="m-0 mt-1 truncate font-bold text-[var(--op-ink)]">{session.operatorCode || '-'}</p>
            </div>
            <div className="rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-surface-soft)] px-3 py-2">
              <p className="m-0 text-[var(--op-mute)]">Login</p>
              <p className="m-0 mt-1 truncate font-bold text-[var(--op-ink)]">{formatDateTime(session.loggedInAt)}</p>
            </div>
          </div>
        </section>

        <section className="grid gap-3 rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-surface-soft)] p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--op-mute)]">Mode kerja aktif</p>
              <h3 className="mt-1 text-[20px] font-bold leading-none">{formatTask(session.taskType)}</h3>
            </div>
            <span className="shrink-0 rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-canvas)] px-2 py-0.5 text-[12px] font-medium text-[var(--op-mute)]">
              Scan
            </span>
          </div>

          {isAdmin ? (
            <div className="grid grid-cols-2 gap-2 rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-canvas)] p-1">
              <Button
                type="button"
                variant="ghost"
                className={session.taskType === 'qc'
                  ? 'h-10 rounded-[4px] bg-[var(--op-ink)] text-[var(--op-canvas)] hover:bg-[var(--op-ink)] hover:text-[var(--op-canvas)]'
                  : 'h-10 rounded-[4px] text-[var(--op-mute)] hover:bg-[var(--op-surface-soft)] hover:text-[var(--op-ink)]'}
                onClick={() => onTaskChange('qc')}
                disabled={taskBusy}
              >
                QC
              </Button>
              <Button
                type="button"
                variant="ghost"
                className={session.taskType === 'packing'
                  ? 'h-10 rounded-[4px] bg-[var(--op-ink)] text-[var(--op-canvas)] hover:bg-[var(--op-ink)] hover:text-[var(--op-canvas)]'
                  : 'h-10 rounded-[4px] text-[var(--op-mute)] hover:bg-[var(--op-surface-soft)] hover:text-[var(--op-ink)]'}
                onClick={() => onTaskChange('packing')}
                disabled={taskBusy}
              >
                Packing
              </Button>
            </div>
          ) : (
            <div className="rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-canvas)] px-3 py-3 text-sm font-medium text-[var(--op-ink)]">
              Mode ditentukan admin.
            </div>
          )}

          <p className="m-0 text-[12px] leading-relaxed text-[var(--op-mute)]">
            {isAdmin ? 'Perubahan mode berlaku untuk scan berikutnya.' : 'Hubungi admin jika mode kerja perlu diganti.'}
          </p>
        </section>

        {isAdmin ? <AdminPackingSection /> : null}

        <section className="rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-canvas)] p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="m-0 text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--op-mute)]">Akhiri sesi</p>
              <p className="m-0 mt-1 text-[12px] leading-snug text-[var(--op-mute)]">Keluar dari perangkat ini.</p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-10 shrink-0 rounded-[4px] border-destructive/40 px-3 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={onLogoutClick}
            >
              <HugeiconsIcon icon={Logout02Icon} size={16} />
              Keluar
            </Button>
          </div>
        </section>

      </div>
    </div>
  )
}

import { type ReactNode, useEffect, useId, useMemo, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ChevronDownIcon, Logout02Icon, WorkHistoryIcon } from '@hugeicons/core-free-icons'
import type { OperatorSession, PackingPayment, PackingWorkSession, WorkTask } from '@pakti/types'
import { readPackingPaymentsApi, readPackingSessionsApi } from '@pakti/api-client'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import './SessionTab.css'

// ─── Utilities ────────────────────────────────────────────────────────────────

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

/** Ambil 1–2 huruf inisial dari nama. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// ─── Avatar ────────────────────────────────────────────────────────────────────

function OperatorAvatar({ name }: { name: string }) {
  return <span className="account-avatar" aria-hidden="true">{initials(name)}</span>
}

function WorkModeToggle({
  value,
  isAdmin,
  disabled,
  onChange,
}: {
  value: WorkTask
  isAdmin: boolean
  disabled: boolean
  onChange: (task: WorkTask) => void
}) {
  return (
    <section className="account-work" aria-labelledby="account-work-title" aria-busy={disabled}>
      <div className="account-section-heading">
        <h3 id="account-work-title">Mode kerja</h3>
        <span className="account-caption">{isAdmin ? 'Akses admin' : 'Ditentukan admin'}</span>
      </div>
      {isAdmin ? (
        <div className="account-mode" role="group" aria-label="Pilih mode kerja">
          {(['qc', 'packing'] as const).map((task) => (
            <button key={task} type="button" aria-pressed={value === task} disabled={disabled}
              onClick={() => { if (value !== task) onChange(task) }}>
              <span>{task === 'qc' ? 'QC' : 'Packing'}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="account-assigned-mode">
          <span className="account-mode-marker" aria-hidden="true" />
          <div><strong>{value === 'packing' ? 'Packing' : 'QC'}</strong>
            <p>{value === 'packing' ? 'Dokumentasikan pengemasan paket.' : 'Dokumentasikan pemeriksaan barang.'}</p>
          </div>
        </div>
      )}
      <p className="account-caption" role="status">
        {disabled ? 'Sedang memperbarui mode kerja...' : isAdmin ? `${value === 'qc' ? 'Pemeriksaan barang' : 'Pengemasan paket'} untuk scan berikutnya.` : 'Hubungi admin untuk mengubah mode kerja Anda.'}
      </p>
    </section>
  )
}

function CollapsibleSection({
  title,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string
  badge?: number | string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()

  return (
    <div className="rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-canvas)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        id={`${panelId}-trigger`}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
      >
        <span className="flex items-center gap-2">
          <span className="text-[13px] font-bold leading-none text-[var(--op-ink)]">{title}</span>
          {badge !== undefined && (
            <span className="rounded-[3px] bg-[var(--op-surface-soft)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--op-mute)]">
              {badge}
            </span>
          )}
        </span>
        <HugeiconsIcon
          icon={ChevronDownIcon}
          size={14}
          className={`shrink-0 text-[var(--op-mute)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div id={panelId} role="region" aria-labelledby={`${panelId}-trigger`} hidden={!open} className="account-report-panel border-t border-[var(--op-hairline)] px-3 pb-3 pt-3">{open ? children : null}</div>
    </div>
  )
}

// ─── AdminPackingSection ───────────────────────────────────────────────────────

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
    queueMicrotask(() => { void load() })
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
    const subtotal = p.subtotalAmount ?? p.totalAmount
    const adjustments = p.adjustments ?? []
    const lines = [
      `Halo Kak ${firstName} 👋`,
      ``,
      `Kabar baik — pembayaran upah packing kamu sudah selesai diproses ✓`,
      ``,
      `Petugas: ${p.packerNameSnapshot} (${p.packerCodeSnapshot})`,
      `No. Pembayaran: ${p.paymentNo}`,
      `Tanggal bayar: ${new Date(p.paidAt).toLocaleString('id-ID')}`,
      `Metode: ${metode}`,
      p.note ? `Catatan: ${p.note}` : null,
      ``,
      `Subtotal upah: ${formatCurrency(subtotal)}`,
      ...adjustments.map((item) => `${item.kind === 'add' ? '+' : '−'} ${item.label}: ${formatCurrency(item.amount)}`),
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

  // ── Status label mapping ──
  const statusLabelMap: Record<string, string> = { all: 'Semua status', active: 'Aktif', closed: 'Ditutup', cancelled: 'Dibatalkan' }
  const paidLabelMap: Record<string, string> = { all: 'Semua', paid: 'Sudah dibayar', unpaid: 'Belum dibayar' }

  return (
    <div className="grid gap-3">
      {/* ── Sesi Packing ── */}
      <CollapsibleSection title="Sesi packing" badge={totals.count}>
        <div className="grid gap-3">
          {error ? (
            <Alert variant="destructive" className="rounded-[4px] py-2">
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          ) : null}

          {/* Statistik ringkas */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-surface-soft)] px-3 py-2.5">
              <p className="text-[11px] text-[var(--op-mute)]">Sesi terfilter</p>
              <p className="mt-1 font-mono text-[18px] font-bold leading-none tabular-nums">{totals.count}</p>
              <p className="mt-0.5 text-[11px] text-[var(--op-mute)]">
                {totals.paid} dibayar · {totals.unpaid} belum
              </p>
            </div>
            <div className="rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-surface-soft)] px-3 py-2.5">
              <p className="text-[11px] text-[var(--op-mute)]">Total upah</p>
              <p className="mt-1 font-mono text-[13px] font-bold leading-none tabular-nums">
                {formatCurrency(totals.totalUpah)}
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--op-mute)]">{totals.totalPaket} paket</p>
            </div>
          </div>

          {/* Tombol share ringkasan */}
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-[4px] text-xs"
              onClick={() => void copyText(buildSelectionShareText(), 'sel')}
              disabled={filtered.length === 0}
            >
              {copiedKey === 'sel' ? '✓ Disalin' : 'Salin ringkasan'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-[4px] text-xs"
              onClick={() => shareWA(buildSelectionShareText())}
              disabled={filtered.length === 0}
            >
              Kirim WA
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto h-8 rounded-[4px] text-xs text-[var(--op-mute)]"
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? '…' : '↻ Refresh'}
            </Button>
          </div>

          {/* Filter */}
          <div className="grid gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Cari packer atau kode"
              placeholder="Cari packer atau kode..."
              className="h-8 rounded-[4px] border-[var(--op-hairline)] bg-[var(--op-surface-soft)] text-xs"
            />
            <div className="grid grid-cols-3 gap-1.5">
              <select
                aria-label="Filter petugas"
                value={packerFilter}
                onChange={(e) => setPackerFilter(e.target.value)}
                className="h-8 rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-surface-soft)] px-2 text-xs text-[var(--op-ink)] outline-none"
              >
                <option value="all">Semua petugas</option>
                {packerOptions.map((o) => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
              <select
                aria-label="Filter pembayaran"
                value={paidFilter}
                onChange={(e) => setPaidFilter(e.target.value as typeof paidFilter)}
                className="h-8 rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-surface-soft)] px-2 text-xs text-[var(--op-ink)] outline-none"
              >
                {Object.entries(paidLabelMap).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <select
                aria-label="Filter status sesi"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                className="h-8 rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-surface-soft)] px-2 text-xs text-[var(--op-ink)] outline-none"
              >
                {Object.entries(statusLabelMap).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>

          {/* Daftar sesi */}
          <div className="grid gap-1.5">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--op-mute)]">
              Daftar sesi ({filtered.length})
            </p>
            {loading ? (
              <div className="space-y-2">
                <div className="h-12 animate-pulse rounded-[4px] bg-[var(--op-surface-soft)]" />
                <div className="h-12 animate-pulse rounded-[4px] bg-[var(--op-surface-soft)]" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="rounded-[4px] border border-dashed border-[var(--op-hairline)] bg-[var(--op-surface-soft)] px-3 py-4 text-center text-xs text-[var(--op-mute)]">
                Tidak ada sesi sesuai filter.
              </p>
            ) : (
              <>
                <div className="grid gap-1.5">
                  {visibleSessions.map((s) => (
                    <div
                      key={s.id}
                      className="rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-surface-soft)] px-3 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold leading-none">{s.packerNameSnapshot}</p>
                          <p className="mt-1 text-xs text-[var(--op-mute)]">
                            <span className="font-mono">{s.packerCodeSnapshot}</span>
                            {' · '}
                            {formatShortDate(s.startedAt)}
                            {' · '}
                            {statusLabelMap[s.status] ?? s.status}
                          </p>
                        </div>
                        <span
                          className={
                            s.paidAt
                              ? 'shrink-0 rounded-[3px] bg-[var(--op-ink)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--op-canvas)]'
                              : 'shrink-0 rounded-[3px] border border-amber-500/50 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300'
                          }
                        >
                          {s.paidAt ? 'Dibayar' : 'Belum'}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                        <span className="font-mono tabular-nums">
                          {s.completedPackingCount} paket · {formatCurrency(s.totalPayAmount)}
                        </span>
                        <span className="truncate font-mono text-[11px] text-[var(--op-mute)]" title={s.id}>
                          {s.id.slice(0, 8)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {filtered.length > 8 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-full rounded-[4px] text-xs"
                    onClick={() => setExpanded((v) => !v)}
                  >
                    {expanded ? 'Ciutkan' : `Lihat semua (${filtered.length})`}
                  </Button>
                ) : null}
              </>
            )}
          </div>
        </div>
      </CollapsibleSection>

      {/* ── Riwayat Pembayaran ── */}
      <CollapsibleSection title="Riwayat pembayaran" badge={payments.length}>
        {payments.length === 0 ? (
          <p className="rounded-[4px] border border-dashed border-[var(--op-hairline)] bg-[var(--op-surface-soft)] px-3 py-4 text-center text-xs text-[var(--op-mute)]">
            Belum ada riwayat pembayaran.
          </p>
        ) : (
          <div className="grid gap-2">
            {payments.map((p) => (
              <div
                key={p.id}
                className="rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-surface-soft)] px-3 py-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs font-bold">{p.paymentNo}</p>
                    <p className="mt-1 truncate text-xs text-[var(--op-mute)]">
                      {p.packerNameSnapshot} · {p.totalSessions} sesi · {p.totalPackages} paket
                    </p>
                  </div>
                  <span className="shrink-0 rounded-[3px] bg-[var(--op-ink)] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[var(--op-canvas)]">
                    {p.paymentMethod === 'cash' ? 'Tunai' : p.paymentMethod === 'transfer' ? 'Transfer' : p.paymentMethod}
                  </span>
                </div>
                <p className="mt-1.5 font-mono text-sm font-bold tabular-nums">{formatCurrency(p.totalAmount)}</p>
                <p className="text-[11px] text-[var(--op-mute)]">{new Date(p.paidAt).toLocaleString('id-ID')}</p>
                <div className="mt-2 flex gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 flex-1 rounded-[4px] text-xs"
                    onClick={() => void copyText(buildPaymentShareText(p), `pay-${p.id}`)}
                  >
                    {copiedKey === `pay-${p.id}` ? '✓ Disalin' : 'Salin'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 flex-1 rounded-[4px] text-xs"
                    onClick={() => shareWA(buildPaymentShareText(p))}
                  >
                    Kirim WA
                  </Button>
                </div>
              </div>
            ))}

          </div>
        )}
      </CollapsibleSection>
    </div>
  )
}

// ─── SessionTab (main export) ──────────────────────────────────────────────────

type SessionTabProps = {
  session: OperatorSession
  isAdmin: boolean
  taskBusy: boolean
  formatDateTime: (value: string | null | undefined) => string
  formatTask: (taskType: WorkTask) => string
  onTaskChange: (taskType: WorkTask) => void
  onLogoutClick: () => void
}

export function SessionTab({
  session,
  isAdmin,
  taskBusy,
  formatDateTime,
  onTaskChange,
  onLogoutClick,
}: SessionTabProps) {
  const roleLabel = session.role === 'admin' ? 'Admin' : 'Operator'

  return (
    <div className="account-page">
      <header className="account-page-heading">
        <h2>Akun</h2>
        <p>Identitas dan akses kerja Anda di Pakti.</p>
      </header>
      <section className="account-identity" aria-label="Identitas akun">
        <div className="account-identity-main">
          <OperatorAvatar name={session.operatorName} />
          <div className="account-identity-copy">
            <h3>{session.operatorName}</h3>
            <div className="account-identity-meta">
              <span className="account-code">{session.operatorCode || 'Tanpa kode operator'}</span>
              <span className="account-role">{roleLabel}</span>
            </div>
          </div>
        </div>
        <dl className="account-session-meta">
          <div><dt>Masuk pada</dt><dd>{formatDateTime(session.loggedInAt)}</dd></div>
        </dl>
      </section>
      <WorkModeToggle value={session.taskType} isAdmin={isAdmin} disabled={taskBusy} onChange={onTaskChange} />
      {isAdmin ? (
        <section className="account-reports" aria-labelledby="account-reports-title">
          <div className="account-section-heading">
            <h3 id="account-reports-title"><HugeiconsIcon icon={WorkHistoryIcon} size={18} /> Laporan packing</h3>
          </div>
          <p className="account-caption">Cek sesi dan bagikan ringkasan pembayaran.</p>
          <AdminPackingSection />
          <p className="account-report-note">Pembayaran diproses melalui Pakti Web.</p>
        </section>
      ) : null}
      <footer className="account-exit">
        <Button type="button" variant="outline" className="account-logout" onClick={onLogoutClick}>
          <HugeiconsIcon icon={Logout02Icon} size={18} />
          Keluar dari perangkat ini
        </Button>
        <p>Sesi packing tetap tersimpan dan bisa dilanjutkan kembali.</p>
      </footer>
    </div>
  )
}

import { Fragment, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Cancel01Icon,
  Copy01Icon,
  DollarCircleIcon,
  Download01Icon,
  RefreshIcon,
  Search01Icon,
  SentIcon,
} from '@hugeicons/core-free-icons'

import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { readPackingPaymentsApi, readPackingSessionsApi } from '@pakti/api-client'
import type { PackingPayment, PackingWorkSession } from '@pakti/types'
import { downloadTextFile } from '@pakti/shared'
import { navigateTo } from '../app/uiState'

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount)
}

function formatPaymentMethodLabel(method: string | null | undefined) {
  if (method === 'transfer') return 'Transfer'
  if (method === 'other') return 'Lainnya'
  return 'Tunai'
}

function formatDateTimeWIB(iso: string | null | undefined) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    const date = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
    const time = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    return `${date}, ${time} WIB`
  } catch {
    return String(iso)
  }
}

function formatLongDate(iso: string) {
  try {
    const d = new Date(iso)
    const date = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    const time = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    return `${date} pukul ${time} WIB`
  } catch {
    return new Date(iso).toLocaleString('id-ID')
  }
}

export function PackingPaymentsPage() {
  const [payments, setPayments] = useState<PackingPayment[]>([])
  const [sessions, setSessions] = useState<PackingWorkSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [paymentSearch, setPaymentSearch] = useState('')
  const [expandedPaymentId, setExpandedPaymentId] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [shareDraft, setShareDraft] = useState<{ title: string; text: string } | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [pays, sess] = await Promise.all([
        readPackingPaymentsApi(50).catch(() => [] as PackingPayment[]),
        readPackingSessionsApi(100).catch(() => [] as PackingWorkSession[]),
      ])
      setPayments(pays as PackingPayment[])
      setSessions(sess as PackingWorkSession[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat riwayat pembayaran.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void load()
    })
  }, [])

  const filteredPayments = useMemo(() => {
    const q = paymentSearch.trim().toLowerCase()
    if (!q) return payments
    return payments.filter((p) =>
      `${p.paymentNo} ${p.packerNameSnapshot} ${p.packerCodeSnapshot} ${p.packerOperatorName} ${p.packerOperatorCode}`.toLowerCase().includes(q),
    )
  }, [payments, paymentSearch])

  const totals = useMemo(() => {
    const totalAmount = filteredPayments.reduce((acc, p) => acc + (p.totalAmount ?? 0), 0)
    const totalPackages = filteredPayments.reduce((acc, p) => acc + (p.totalPackages ?? 0), 0)
    return { totalAmount, totalPackages }
  }, [filteredPayments])

  function paymentSessionLookup(payment: PackingPayment) {
    const byId = new Map(sessions.map((s) => [s.id, s] as const))
    return payment.sessionIds.map((id) => byId.get(id)).filter(Boolean) as PackingWorkSession[]
  }

  function formatShortDate(iso: string) {
    try {
      return new Date(iso).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    } catch {
      return new Date(iso).toLocaleDateString('id-ID')
    }
  }

  function buildPaymentShareText(payment: PackingPayment) {
    const linked = paymentSessionLookup(payment)
    const metodeLabel = formatPaymentMethodLabel(payment.paymentMethod)
    const firstName = payment.packerNameSnapshot.split(' ')[0]
    const subtotal = payment.subtotalAmount ?? payment.totalAmount
    const adjustments = payment.adjustments ?? []
    const adjustmentTotal = payment.adjustmentTotal ?? 0
    const lines = [
      `Halo Kak ${firstName} 👋`,
      ``,
      `Kabar baik — pembayaran upah packing kamu sudah selesai diproses ✓`,
      ``,
      `Petugas: ${payment.packerNameSnapshot} (${payment.packerCodeSnapshot})`,
      `No. Pembayaran: ${payment.paymentNo}`,
      `Tanggal bayar: ${formatLongDate(payment.paidAt)}`,
      `Metode: ${metodeLabel} (${payment.paymentMethod})`,
      payment.note ? `Catatan: ${payment.note}` : null,
      ``,
      `Subtotal upah: ${formatCurrency(subtotal)}`,
      ...adjustments.map((item) => `${item.kind === 'add' ? '+' : '−'} ${item.label}: ${formatCurrency(item.amount)}`),
      adjustmentTotal !== 0 ? `Penyesuaian: ${adjustmentTotal > 0 ? '+' : '−'}${formatCurrency(Math.abs(adjustmentTotal)).replace('Rp', 'Rp')}` : null,
      `Total dibayar: ${formatCurrency(payment.totalAmount)}`,
      `Rincian: ${payment.totalSessions} sesi • ${payment.totalPackages} paket`,
      ``,
    ].filter(Boolean) as string[]
    if (linked.length > 0) {
      lines.push(`Detail sesi:`)
      linked.forEach((s, idx) => {
        lines.push(`${idx + 1}. ${formatShortDate(s.startedAt)} • ${s.completedPackingCount} paket • ${formatCurrency(s.totalPayAmount)}`)
      })
      lines.push(``)
    } else if (payment.sessionIds.length > 0) {
      lines.push(`Detail sesi tidak tersedia di perangkat ini.`, `ID sesi: ${payment.sessionIds.slice(0, 5).join(', ')}${payment.sessionIds.length > 5 ? '…' : ''}`, ``)
    }
    lines.push(`Dibayar oleh: ${payment.paidByOperatorName} (${payment.paidByOperatorCode})`, ``, `Mohon dicek dan konfirmasi ya. Terima kasih banyak atas kerja kerasnya 🙏`)
    return lines.join('\n')
  }

  async function copyText(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      window.setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1800)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      try {
        document.execCommand('copy')
        setCopiedKey(key)
        window.setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1800)
      } catch {
        alert('Gagal menyalin. Silakan copy manual.')
      } finally {
        ta.remove()
      }
    }
  }

  function shareToWhatsApp(text: string) {
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  function handleExportPayments() {
    if (payments.length === 0) {
      alert('Belum ada pembayaran.')
      return
    }
    const csv = ['payment_no,packer_name,packer_code,sesi,paket,subtotal,penyesuaian,upah,metode,paid_at,note,adjustment_detail', ...payments.map((p) => {
      const subtotal = p.subtotalAmount ?? p.totalAmount
      const adj = p.adjustmentTotal ?? 0
      const detail = (p.adjustments ?? []).map((item) => `${item.kind === 'add' ? '+' : '-'}${item.label} Rp${item.amount}`).join('|').replace(/,/g, ';')
      return `${p.paymentNo},${p.packerNameSnapshot},${p.packerCodeSnapshot},${p.totalSessions},${p.totalPackages},${subtotal},${adj},${p.totalAmount},${p.paymentMethod},${p.paidAt},${(p.note ?? '').replace(/,/g, ';')},${detail}`
    })].join('\n')
    downloadTextFile(`packing-payments-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8')
  }

  return (
    <div className="packing-page mx-auto max-w-[1240px] bg-[#f6f5f4] px-4 py-8 font-['Inter'] sm:px-6 lg:py-10 xl:px-8">
      <section className="mb-7 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="font-['Inter'] text-[12px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Operasional / Pembayaran</div>
          <h1 className="mt-2 font-['Inter'] text-[32px] font-bold leading-[1.1] tracking-[-0.8px] text-[#000000] sm:text-[36px]">Riwayat Pembayaran</h1>
          <p className="mt-3 max-w-2xl font-['Inter'] text-[14px] leading-6 text-[#615d59] sm:text-[15px]">Arsip pembayaran upah packing per petugas, lengkap dengan rincian potongan & bonus.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="ghost" onClick={() => navigateTo('packing-sessions')} className="h-10 rounded-lg border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] font-medium text-[#31302e] hover:bg-[#f6f5f4]">Sesi Packing</Button>
          <Button type="button" variant="ghost" onClick={() => void load()} disabled={loading} className="h-10 rounded-lg border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] font-medium text-[#31302e] hover:bg-[#f6f5f4] disabled:opacity-40"><HugeiconsIcon icon={RefreshIcon} size={16} strokeWidth={1.9} /> {loading ? 'Memuat...' : 'Refresh'}</Button>
          <Button type="button" variant="ghost" onClick={handleExportPayments} disabled={payments.length === 0} className="h-10 rounded-lg border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] font-medium text-[#31302e] hover:bg-[#f6f5f4] disabled:opacity-40"><HugeiconsIcon icon={Download01Icon} size={16} strokeWidth={1.9} /> Export CSV</Button>
        </div>
      </section>

      {error ? <Alert variant="destructive" className="mb-5 rounded-[4px] border-[#dddddd] bg-white font-['Inter'] text-[13px]"><p className="text-[#31302e]">{error}</p></Alert> : null}

      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Pembayaran" value={String(filteredPayments.length)} subLabel={`dari ${payments.length} total`} />
        <StatCard label="Paket" value={String(totals.totalPackages)} subLabel="paket dibayar" />
        <StatCard label="Total dibayar" value={formatCurrency(totals.totalAmount)} subLabel="terfilter" />
      </section>

      <section className="mt-5 overflow-hidden rounded-xl border border-[#dddddd] bg-white">
        <div className="flex flex-col gap-3 border-b border-[#dddddd] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h2 className="font-['Inter'] text-[16px] font-semibold text-[#000000]">Daftar pembayaran</h2>
            <p className="mt-1 font-['Inter'] text-[12px] text-[#a39e98]">{filteredPayments.length} dari {payments.length} pembayaran · terbaru di atas</p>
          </div>
          <label className="relative sm:w-64">
            <span className="pointer-events-none absolute inset-y-0 left-0 grid w-8 place-items-center text-[#a39e98]">
              <HugeiconsIcon icon={Search01Icon} size={15} strokeWidth={1.9} />
            </span>
            <Input value={paymentSearch} onChange={(e) => setPaymentSearch(e.target.value)} placeholder="Cari no. bayar / petugas..." className="h-9 w-full rounded-[4px] border-[#e6e6e6] bg-white pl-8 pr-3 font-['Inter'] text-[13px] placeholder:text-[#a39e98] focus-visible:border-[#8f8a84] focus-visible:ring-0" aria-label="Cari pembayaran" />
          </label>
        </div>
        {loading ? (
          <div className="grid gap-2 p-6">
            <div className="h-10 animate-pulse rounded-lg bg-[#f6f5f4]" />
            <div className="h-20 animate-pulse rounded-lg bg-[#f6f5f4]" />
            <div className="h-20 animate-pulse rounded-lg bg-[#f6f5f4]" />
          </div>
        ) : payments.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-[#f6f5f4] text-[#615d59]">
              <HugeiconsIcon icon={DollarCircleIcon} size={20} strokeWidth={1.9} />
            </div>
            <div className="mt-3 font-['Inter'] text-[14px] font-medium text-[#000000]">Belum ada pembayaran</div>
            <div className="mt-1 font-['Inter'] text-[12px] text-[#a39e98]">Pembayaran yang dibuat dari halaman Sesi Packing akan muncul di sini.</div>
            <Button type="button" variant="ghost" onClick={() => navigateTo('packing-sessions')} className="mt-4 h-9 rounded-lg bg-[#000000] px-4 font-['Inter'] text-[13px] font-medium text-white hover:bg-[#31302e]">Ke Sesi Packing</Button>
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <div className="mt-3 font-['Inter'] text-[14px] font-medium text-[#000000]">Tidak ada pembayaran yang cocok</div>
            <div className="mt-1 font-['Inter'] text-[12px] text-[#a39e98]">Coba kata kunci lain atau kosongkan pencarian.</div>
            <Button type="button" variant="ghost" onClick={() => setPaymentSearch('')} className="mt-4 h-9 rounded-lg border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] text-[#31302e] hover:bg-[#f6f5f4]">Tampilkan semua</Button>
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[980px] border-collapse">
              <thead className="bg-[#f6f5f4]">
                <tr className="text-left">
                  <Th>No. Bayar</Th>
                  <Th>Petugas</Th>
                  <Th className="text-center">Sesi</Th>
                  <Th className="text-right">Total</Th>
                  <Th>Penyesuaian</Th>
                  <Th>Metode</Th>
                  <Th>Waktu</Th>
                  <Th className="px-5 text-right">Aksi</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e6e6e6]">
                {filteredPayments.map((p) => {
                  const expanded = expandedPaymentId === p.id
                  const adjustments = p.adjustments ?? []
                  const linked = paymentSessionLookup(p)
                  return (
                    <Fragment key={p.id}>
                      <tr className="bg-white transition-colors hover:bg-[#fbfaf9]">
                        <Td className="font-['Inter'] text-[13px] font-medium text-[#000000]">{p.paymentNo}</Td>
                        <Td>
                          <div className="grid gap-0.5">
                            <span className="font-['Inter'] text-[13px] font-medium text-[#000000]">{p.packerNameSnapshot}</span>
                            <span className="font-['Inter'] text-[12px] text-[#a39e98]">{p.packerCodeSnapshot}</span>
                          </div>
                        </Td>
                        <Td className="text-center font-['Inter'] text-[13px] tabular-nums text-[#000000]">{p.totalSessions} sesi · {p.totalPackages} paket</Td>
                        <Td className="text-right">
                          <div className="grid gap-0.5">
                            <span className="font-['Inter'] text-[13px] font-semibold tabular-nums text-[#000000]">{formatCurrency(p.totalAmount)}</span>
                            {(p.adjustmentTotal ?? 0) !== 0 ? <span className="font-['Inter'] text-[11px] tabular-nums text-[#615d59]">subtotal {formatCurrency(p.subtotalAmount ?? p.totalAmount)}</span> : null}
                          </div>
                        </Td>
                        <Td>
                          {adjustments.length === 0 ? (
                            <span className="font-['Inter'] text-[12px] text-[#a39e98]">—</span>
                          ) : (
                            <button type="button" onClick={() => setExpandedPaymentId(expanded ? null : p.id)} aria-expanded={expanded} className="grid max-w-[220px] gap-0.5 text-left">
                              {adjustments.slice(0, 2).map((item, idx) => (
                                <span key={`${p.id}-adj-${idx}`} className={`truncate font-['Inter'] text-[12px] tabular-nums ${item.kind === 'add' ? 'text-[#000000]' : 'text-[#991b1b]'}`}>{item.kind === 'add' ? '+' : '−'} {item.label} · {formatCurrency(item.amount)}</span>
                              ))}
                              <span className="font-['Inter'] text-[11px] font-medium text-[#615d59]">{adjustments.length > 2 ? `+${adjustments.length - 2} lainnya · ` : ''}{expanded ? 'tutup ▲' : 'rincian ▼'}</span>
                            </button>
                          )}
                        </Td>
                        <Td><span className="inline-flex rounded-full border border-[#dddddd] bg-[#f6f5f4] px-2 py-0.5 font-['Inter'] text-[12px] font-medium text-[#31302e]">{formatPaymentMethodLabel(p.paymentMethod)}</span></Td>
                        <Td className="font-['Inter'] text-[12px] text-[#615d59]">{formatDateTimeWIB(p.paidAt)}</Td>
                        <Td className="px-5">
                          <div className="flex justify-end gap-1">
                            <Button type="button" variant="ghost" size="sm" onClick={() => { const t = buildPaymentShareText(p); setShareDraft({ title: `Pembayaran ${p.paymentNo}`, text: t }) }} className="h-8 rounded-lg bg-[#000000] px-4 font-['Inter'] text-[12px] font-medium text-white hover:bg-[#31302e]"><HugeiconsIcon icon={SentIcon} size={14} strokeWidth={1.9} /> Share</Button>
                          </div>
                        </Td>
                      </tr>
                      {expanded && adjustments.length > 0 ? (
                        <tr className="bg-[#fbfaf9]">
                          <td colSpan={8} className="px-4 py-3 sm:px-5">
                            <div className="grid gap-2">
                              <p className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Rincian penyesuaian</p>
                              <ul className="grid gap-1">
                                {adjustments.map((item, idx) => (
                                  <li key={`${p.id}-adj-full-${idx}`} className="flex justify-between gap-2 font-['Inter'] text-[12px] text-[#31302e]">
                                    <span className="min-w-0 truncate">{item.kind === 'add' ? '+' : '−'} {item.label}</span>
                                    <span className={`shrink-0 tabular-nums font-medium ${item.kind === 'add' ? 'text-[#000000]' : 'text-[#991b1b]'}`}>{item.kind === 'add' ? '+' : '−'}{formatCurrency(item.amount)}</span>
                                  </li>
                                ))}
                              </ul>
                              <div className="flex flex-wrap justify-between gap-1 border-t border-[#e6e6e6] pt-2 font-['Inter'] text-[12px] text-[#615d59]">
                                <span>Subtotal {formatCurrency(p.subtotalAmount ?? p.totalAmount)} · penyesuaian {(p.adjustmentTotal ?? 0) >= 0 ? '+' : '−'}{formatCurrency(Math.abs(p.adjustmentTotal ?? 0))}</span>
                                <span>Dibayar oleh {p.paidByOperatorName} ({p.paidByOperatorCode})</span>
                              </div>
                              {p.note ? <p className="font-['Inter'] text-[12px] text-[#615d59]">Catatan: {p.note}</p> : null}
                              {linked.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {linked.map((s) => (
                                    <span key={s.id} title={s.id} className="inline-flex rounded-full border border-[#dddddd] bg-white px-2 py-0.5 font-['Inter'] text-[11px] tabular-nums text-[#31302e]">{new Date(s.startedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} · {s.completedPackingCount} pkt · {formatCurrency(s.totalPayAmount)}</span>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Dialog open={Boolean(shareDraft)} onOpenChange={(open) => !open && setShareDraft(null)}>
        <DialogContent showCloseButton={false} className="packing-modal max-w-lg gap-0 overflow-hidden rounded-2xl border-[#dddddd] bg-white p-0 font-['Inter'] shadow-[0_10px_28px_rgba(0,0,0,0.08)]">
          <div className="border-b border-[#dddddd] p-6">
            <div className="flex items-start justify-between gap-5">
              <div className="grid gap-1">
                <DialogTitle className="font-['Inter'] text-[18px] font-semibold text-[#000000]">{shareDraft?.title ?? 'Bagikan rincian'}</DialogTitle>
                <DialogDescription className="font-['Inter'] text-[13px] leading-5 text-[#615d59]">Copy teks di bawah atau langsung share ke WhatsApp. Format siap tempel.</DialogDescription>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setShareDraft(null)} className="h-9 w-9 shrink-0 rounded-lg text-[#615d59] hover:bg-[#f6f5f4] hover:text-[#000000]">
                <HugeiconsIcon icon={Cancel01Icon} size={19} strokeWidth={1.9} />
              </Button>
            </div>
          </div>
          {shareDraft ? (
            <div className="grid gap-4 p-6">
              <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap break-words rounded-[4px] border border-[#dddddd] bg-[#f6f5f4] p-4 font-['Inter'] text-[13px] leading-6 text-[#31302e]">{shareDraft.text}</pre>
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => void copyText(shareDraft.text, 'draft')} className="h-9 rounded-full border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] text-[#31302e] hover:bg-[#f6f5f4]">
                  <HugeiconsIcon icon={Copy01Icon} size={16} strokeWidth={1.9} /> {copiedKey === 'draft' ? 'Tersalin ✓' : 'Salin'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => shareToWhatsApp(shareDraft.text)} className="h-9 rounded-full border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] text-[#31302e] hover:bg-[#f6f5f4]">
                  <HugeiconsIcon icon={SentIcon} size={16} strokeWidth={1.9} /> WhatsApp
                </Button>
                <Button type="button" variant="ghost" onClick={() => downloadTextFile(`${shareDraft.title.replace(/[^a-zA-Z0-9-_]+/g, '_')}.txt`, shareDraft.text, 'text/plain;charset=utf-8')} className="h-9 rounded-full border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] text-[#31302e] hover:bg-[#f6f5f4]">
                  <HugeiconsIcon icon={Download01Icon} size={16} strokeWidth={1.9} /> TXT
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StatCard({ label, value, subLabel }: { label: string; value: string; subLabel?: string }) {
  return (
    <article className="rounded-[12px] border border-[#e6e6e6] bg-white p-5">
      <div className="grid gap-2">
        <div className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">{label}</div>
        <div className="flex items-baseline gap-2">
          <span className="font-['Inter'] text-[26px] font-bold leading-none tracking-[-0.5px] text-[#000000]">{value}</span>
          {subLabel ? <span className="font-['Inter'] text-[12px] leading-none text-[#615d59]">{subLabel}</span> : null}
        </div>
      </div>
    </article>
  )
}

function Th({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <th className={`bg-[#f6f5f4] px-4 py-3 text-left font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98] ${className}`}>{children}</th>
}

function Td({ children, className = '', title }: { children: ReactNode; className?: string; title?: string }) {
  return <td title={title} className={`bg-white px-4 py-3 align-top font-['Inter'] text-[14px] text-[#31302e] ${className}`}>{children}</td>
}

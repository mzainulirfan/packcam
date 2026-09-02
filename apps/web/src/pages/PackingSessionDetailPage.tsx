import { useEffect, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowLeft01Icon, Cancel01Icon, Copy01Icon, Delete02Icon, DollarCircleIcon, Download01Icon, Edit02Icon, LockPasswordIcon, Package01Icon } from '@hugeicons/core-free-icons'
import { Button } from '../components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog'
import { Label } from '../components/ui/label'
import { Alert } from '../components/ui/alert'
import { closePackingSessionApi, deletePackingSessionApi, readPackingPayRulesApi, readPackingSessionApi, readServerHistoryRecordingsApi, updatePackingRecordingPayRuleApi } from '@pakti/api-client'
import type { PackingPayRule, PackingWorkSession } from '@pakti/types'
import { downloadTextFile } from '@pakti/shared'
import { recordsToCsv } from '@pakti/shared/exporters'
import { navigateTo, navigateToHistoryWithSession, usePackingSessionDetailId } from '../app/uiState'
import { getHistorySessionPath } from '../app/navigation'

type SessionOrderItem = {
  productName: string
  variationName?: string | null
  quantity: number
}

function NativeSelect({ value, onChange, options, placeholder, placeholderValue }: { value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; placeholder?: string; placeholderValue?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-full rounded-[4px] border border-[#dddddd] bg-white px-3 font-['Inter'] text-[14px] text-[#000000] focus-visible:border-[#8f8a84] focus-visible:ring-0">
      {placeholder ? <option value={placeholderValue ?? ''}>{placeholder}</option> : null}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount)
}

function formatPeriode(startedAt: string, endedAt: string | null) {
  try {
    const s = new Date(startedAt)
    const start = s.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    if (!endedAt) return `${start} → —`
    const e = new Date(endedAt)
    const end = e.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    return `${start} → ${end}`
  } catch {
    return `${new Date(startedAt).toLocaleDateString('id-ID')} → ${endedAt ? new Date(endedAt).toLocaleDateString('id-ID') : '—'}`
  }
}

function formatSessionOrderItemsTitle(items: SessionOrderItem[]) {
  if (!items || items.length === 0) return '-'
  const labels = items.slice(0, 2).map((it) => `${it.productName}${it.variationName?.trim() ? ` | ${it.variationName.trim()}` : ''} x${it.quantity}`)
  if (items.length > 2) labels.push(`+${items.length - 2} item lagi`)
  return labels.join(' · ')
}

function PackingOrderItemsSummary({ items }: { items: SessionOrderItem[] }) {
  if (!items || items.length === 0) return <span className="font-['Inter'] text-[13px] text-[#a39e98]">-</span>
  return (
    <div className="grid min-w-0 flex-1 gap-1" title={formatSessionOrderItemsTitle(items)}>
      {items.slice(0, 2).map((it, idx) => {
        const variation = it.variationName?.trim()
        return (
          <div key={`${it.productName}-${variation ?? ''}-${idx}`} className="flex min-w-0 items-start justify-between gap-2">
            <span className="grid min-w-0 gap-0.5">
              <span className="line-clamp-2 font-['Inter'] text-[13px] font-medium leading-5 text-[#31302e]">{it.productName}</span>
              {variation ? <span className="truncate font-['Inter'] text-[11px] leading-4 text-[#615d59]">{variation}</span> : null}
            </span>
            <span className="shrink-0 rounded-md bg-[#f6f5f4] px-1.5 py-0.5 font-['Inter'] text-[11px] font-semibold text-[#31302e] ring-1 ring-[#e6e6e6]">x{it.quantity}</span>
          </div>
        )
      })}
      {items.length > 2 ? <span className="font-['Inter'] text-[11px] text-[#a39e98]">+{items.length - 2} item lagi</span> : null}
    </div>
  )
}

function CopyValue({ value, copyKey, onCopy }: { value: string; copyKey: string; onCopy: (text: string, key: string) => Promise<void> }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="truncate font-['Inter'] text-[13px] text-[#31302e]" title={value}>{value}</span>
      <button type="button" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[#615d59] hover:bg-[#f6f5f4] hover:text-[#000000]" onClick={() => void onCopy(value, copyKey)} title="Copy">
        <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={1.9} />
      </button>
    </div>
  )
}

function StatCard({ label, value, subLabel, icon }: { label: string; value: string; subLabel: string; icon: typeof Package01Icon }) {
  return (
    <article className="rounded-xl border border-[#dddddd] bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">{label}</div>
          <div className="mt-3 font-['Inter'] text-[22px] font-bold leading-none tracking-[-0.5px] text-[#000000]">{value}</div>
          <div className="font-['Inter'] text-[12px] text-[#615d59]">{subLabel}</div>
        </div>
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#f6f5f4] text-[#31302e]"><HugeiconsIcon icon={icon} size={18} strokeWidth={1.9} /></span>
      </div>
    </article>
  )
}
function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`bg-[#f6f5f4] px-4 py-3 text-left font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98] ${className}`}>{children}</th>
}
function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`bg-transparent px-4 py-3 align-middle font-['Inter'] text-[13px] text-[#31302e] ${className}`}>{children}</td>
}

export function PackingSessionDetailPage() {
  const detailId = usePackingSessionDetailId()
  const [session, setSession] = useState<PackingWorkSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [records, setRecords] = useState<Awaited<ReturnType<typeof readServerHistoryRecordingsApi>>['records']>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [payRules, setPayRules] = useState<PackingPayRule[]>([])
  const [payRuleBusyId, setPayRuleBusyId] = useState<string | null>(null)
  const [payRuleEditTarget, setPayRuleEditTarget] = useState<{ id: string; resiNumber: string; packingPayRuleId?: string | null; packingPayBreakdown?: { ruleName?: string; payType?: string; amount?: number; quantity?: number; total?: number; manualOverride?: boolean } | null; packingPayAmount?: number | null } | null>(null)
  const [payRuleEditSelectedId, setPayRuleEditSelectedId] = useState<string>('')
  const [copyKey, setCopyKey] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  useEffect(() => {
    if (!detailId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void Promise.all([readPackingSessionApi(detailId), readPackingPayRulesApi().catch(() => [] as PackingPayRule[])])
      .then(([s, rules]) => {
        if (cancelled) return
        setSession(s as PackingWorkSession)
        setPayRules(rules as PackingPayRule[])
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Gagal memuat sesi.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [detailId])

  useEffect(() => {
    if (!detailId || !session) return
    let cancelled = false
    setDetailLoading(true)
    void readServerHistoryRecordingsApi({ taskType: 'packing' })
      .then((result) => {
        if (cancelled) return
        const filtered = result.records.filter((r) => (r as unknown as { packingSessionId?: string | null }).packingSessionId === session.id)
        setRecords(filtered)
      })
      .catch(() => { if (!cancelled) setRecords([]) })
      .finally(() => { if (!cancelled) setDetailLoading(false) })
    return () => { cancelled = true }
  }, [detailId, session])

  function canDeleteSession(s: PackingWorkSession) {
    return s.status === 'closed' && (s.completedPackingCount ?? 0) === 0 && !s.paidAt && !s.paymentId
  }

  async function handleClose() {
    if (!session) return
    if (!confirm('Tutup sesi packing ini?')) return
    try {
      const updated = await closePackingSessionApi(session.id)
      setSession(updated as PackingWorkSession)
    } catch (e) { alert(e instanceof Error ? e.message : 'Gagal tutup sesi') }
  }

  async function handleDelete() {
    if (!session || !canDeleteSession(session)) { alert('Hanya sesi closed kosong yang bisa dihapus.'); return }
    if (!confirm(`Hapus sesi kosong ${session.packerNameSnapshot}?`)) return
    try { await deletePackingSessionApi(session.id); navigateTo('packing-sessions') } catch (e) { alert(e instanceof Error ? e.message : 'Gagal hapus sesi') }
  }

  function openPayRuleEdit(record: { id: string; resiNumber: string; packingPayRuleId?: string | null; packingPayBreakdown?: { ruleName?: string; payType?: string; amount?: number; quantity?: number; total?: number; manualOverride?: boolean } | null; packingPayAmount?: number | null }) {
    if (!session || session.paidAt || session.paymentId) { alert('Pay rule tidak bisa diubah karena sesi sudah dibayar.'); return }
    if (payRules.length === 0) { alert('Belum ada pay rule.'); return }
    setPayRuleEditTarget(record); setPayRuleEditSelectedId(record.packingPayRuleId ?? '')
  }
  function closePayRuleEdit() { if (payRuleBusyId) return; setPayRuleEditTarget(null); setPayRuleEditSelectedId('') }
  async function handleConfirmPayRuleEdit() {
    if (!payRuleEditTarget || !session) return
    const ruleId = payRuleEditSelectedId
    if (!ruleId) { alert('Pilih pay rule.'); return }
    setPayRuleBusyId(payRuleEditTarget.id)
    try {
      const updated = await updatePackingRecordingPayRuleApi(payRuleEditTarget.id, ruleId)
      setRecords((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
      const refreshed = await readPackingSessionApi(session.id)
      setSession(refreshed as PackingWorkSession)
      setPayRuleEditTarget(null); setPayRuleEditSelectedId('')
    } catch (e) { alert(e instanceof Error ? e.message : 'Gagal ubah pay rule.') } finally { setPayRuleBusyId(null) }
  }

  function handleExportDetail() {
    if (!session || records.length === 0) { alert('Tidak ada data untuk export.'); return }
    const csv = recordsToCsv(records)
    downloadTextFile(`packing-session-${session.packerCodeSnapshot}-${session.id.slice(0, 8)}.csv`, csv, 'text/csv;charset=utf-8')
  }

  async function copyText(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      window.setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1600)
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
        window.setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1600)
      } catch {}
      finally { ta.remove() }
    }
  }

  async function copyDetailLink() {
    const url = `${window.location.origin}${getHistorySessionPath(session?.id ?? '')}`.replace('/history?session=', `/packing-sessions/${session?.id}?copy=history`)
    const detailUrl = `${window.location.origin}/packing-sessions/${session?.id}`
    try { await navigator.clipboard.writeText(detailUrl); setCopyKey('link'); setTimeout(() => setCopyKey(null), 1500) } catch { void url }
  }

  if (!detailId) return <div className="p-6">ID sesi tidak valid.</div>
  if (loading) return <div className="mx-auto max-w-[1240px] p-6">Memuat sesi...</div>
  if (error || !session) return <div className="mx-auto max-w-[1240px] p-6"><Alert variant="destructive"><p>{error ?? 'Sesi tidak ditemukan.'}</p></Alert><Button type="button" onClick={() => navigateTo('packing-sessions')} className="mt-4">Kembali</Button></div>

  const isPaid = Boolean(session.paidAt)
  const canDelete = canDeleteSession(session)
  const paymentLabel = isPaid ? formatCurrency(session.paidAmount ?? session.totalPayAmount) : 'Belum dibayar'
  const detailUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/packing-sessions/${session.id}`

  return (
    <div className="packing-page mx-auto max-w-[1240px] bg-[#f6f5f4] px-4 py-8 font-['Inter'] sm:px-6 lg:py-10 xl:px-8">
      <section className="mb-6 grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => navigateTo('packing-sessions')} className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-[#dddddd] bg-white px-3 py-2 font-['Inter'] text-[13px] font-medium text-[#31302e] hover:bg-white"><HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={1.9} /> Riwayat Sesi Packing</button>
          <button type="button" onClick={() => void copyDetailLink()} className="inline-flex items-center gap-1.5 rounded-lg border border-[#dddddd] bg-white px-3 py-2 font-['Inter'] text-[13px] text-[#31302e]">{copyKey === 'link' ? 'Link disalin' : 'Copy link'}</button>
          <a href={detailUrl} onClick={(e) => { e.preventDefault(); void navigator.clipboard.writeText(detailUrl).then(() => { setCopyKey('link'); setTimeout(() => setCopyKey(null), 1500) }) }} className="font-['Inter'] text-[12px] text-[#0075de] hover:underline">{detailUrl}</a>
        </div>
        <div className="overflow-hidden rounded-2xl border border-[#dddddd] bg-white">
          <div className="flex flex-col gap-6 p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="inline-flex rounded-full border border-[#dddddd] bg-white px-2.5 py-1 font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#615d59]">Detail sesi</div>
              <h1 className="mt-3 max-w-3xl truncate font-['Inter'] text-[34px] font-bold leading-[1.05] tracking-[-1px] text-[#000000] sm:text-[40px]">{session.packerNameSnapshot}</h1>
              <p className="mt-3 max-w-3xl font-['Inter'] text-[15px] leading-6 text-[#615d59]">{formatPeriode(session.startedAt, session.endedAt)} · dibuat oleh {session.createdByOperatorName ? `${session.createdByOperatorName} (${session.createdByOperatorCode ?? '-'})` : '-'}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className={`inline-flex rounded-full border px-2.5 py-1 font-['Inter'] text-[12px] font-semibold ${session.status === 'closed' ? 'border-[#000000] bg-[#000000] text-white' : 'border-[#dddddd] bg-white text-[#615d59]'}`}>{session.status}</span>
                <span className={`inline-flex rounded-full border px-2.5 py-1 font-['Inter'] text-[12px] font-semibold ${isPaid ? 'border-[#000000] bg-[#000000] text-white' : 'border-[#dddddd] bg-white text-[#615d59]'}`}>{isPaid ? 'Dibayar' : 'Belum dibayar'}</span>
                <span className="inline-flex rounded-full border border-[#dddddd] bg-[#f6f5f4] px-2.5 py-1 font-['Inter'] text-[12px] font-medium text-[#31302e]">{session.packerCodeSnapshot}</span>
                <span className="inline-flex rounded-full border border-[#dddddd] bg-white px-2.5 py-1 font-['Inter'] text-[12px] font-medium text-[#615d59]">{session.id.slice(0, 12)}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Button type="button" variant="ghost" onClick={handleExportDetail} disabled={records.length === 0} className="h-10 rounded-lg border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] font-medium text-[#31302e] hover:bg-[#f6f5f4] disabled:opacity-40"><HugeiconsIcon icon={Download01Icon} size={16} strokeWidth={1.9} /> Export</Button>
              <Button type="button" variant="ghost" onClick={() => navigateToHistoryWithSession(session.id)} className="h-10 rounded-lg border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] font-medium text-[#31302e] hover:bg-[#f6f5f4]">History</Button>
              {session.status === 'active' ? <Button type="button" variant="ghost" onClick={() => void handleClose()} className="h-10 rounded-lg border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] font-medium text-[#31302e] hover:bg-[#f6f5f4]">Tutup</Button> : null}
              {canDelete ? <Button type="button" variant="ghost" onClick={() => void handleDelete()} className="h-10 rounded-lg border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] font-medium text-[#31302e] hover:bg-[#f6f5f4]"><HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={1.9} /> Hapus</Button> : null}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Paket" value={String(session.completedPackingCount)} subLabel="completed" icon={Package01Icon} />
        <StatCard label="Upah" value={formatCurrency(session.totalPayAmount)} subLabel="total sesi" icon={DollarCircleIcon} />
        <StatCard label="Payment" value={paymentLabel} subLabel={isPaid ? 'sudah dibayar' : 'menunggu'} icon={DollarCircleIcon} />
      </section>

      <section className="mt-5 overflow-hidden rounded-xl border border-[#dddddd] bg-white">
        <div className="flex flex-col gap-3 border-b border-[#dddddd] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h2 className="font-['Inter'] text-[20px] font-semibold leading-snug tracking-[-0.125px] text-[#000000]">Detail paket sesi</h2>
            <p className="mt-1 font-['Inter'] text-[13px] leading-5 text-[#615d59]">Daftar paket completed yang masuk ke sesi ini. Produk dibersihkan dari metadata Shopee.</p>
          </div>
          <span className="inline-flex w-fit items-center rounded-full border border-[#dddddd] bg-white px-2.5 py-1 font-['Inter'] text-[11px] font-semibold text-[#615d59]">{detailLoading ? 'Loading...' : `${records.length} record`}</span>
        </div>
        {detailLoading ? (
          <div className="grid gap-2 p-6"><div className="h-10 animate-pulse rounded-lg bg-[#f6f5f4]" /><div className="h-20 animate-pulse rounded-lg bg-[#f6f5f4]" /></div>
        ) : records.length === 0 ? (
          <div className="px-6 py-14 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-[#f6f5f4] text-[#615d59]"><HugeiconsIcon icon={Package01Icon} size={20} strokeWidth={1.9} /></div><div className="mt-3 font-['Inter'] text-[15px] font-semibold text-[#000000]">Belum ada paket completed di sesi ini</div><div className="mt-1 font-['Inter'] text-[13px] text-[#615d59]">Sesi kosong yang sudah closed bisa dihapus.</div>{canDelete ? <Button type="button" variant="ghost" onClick={() => void handleDelete()} className="mt-4 h-9 rounded-lg border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] text-[#31302e] hover:bg-[#f6f5f4]">Hapus sesi kosong</Button> : null}</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[#dddddd] bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] border-collapse">
                <thead className="bg-[#f6f5f4]"><tr className="text-left"><Th className="px-5">Paket</Th><Th>Produk</Th><Th>Upah</Th><Th>Waktu</Th><Th className="px-5 text-right">Aksi</Th></tr></thead>
                <tbody className="divide-y divide-[#e6e6e6] bg-white">
                  {records.map((rec, index) => {
                    const r = rec as unknown as { id: string; resiNumber: string; orderNumber?: string | null; mediaType?: string; packingPayAmount?: number | null; packingPayRuleId?: string | null; packingPayBreakdown?: { ruleName?: string; payType?: string; amount?: number; quantity?: number; total?: number; manualOverride?: boolean } | null; orderSnapshot?: { items?: SessionOrderItem[] } | null; startTime?: string }
                    const items = r.orderSnapshot?.items ?? []
                    const canEdit = !isPaid && payRules.length > 0
                    return (
                      <tr key={r.id ?? `${r.resiNumber}-${index}`} className="transition-colors hover:bg-[#fbfaf9]">
                        <Td className="px-5 py-4">
                          <div className="grid gap-1.5">
                            <span className="font-['Inter'] text-[14px] font-semibold leading-tight text-[#000000]">{r.resiNumber}</span>
                            <CopyValue value={r.orderNumber ?? '-'} copyKey={`order-${r.id}`} onCopy={copyText} />
                            <span className="font-['Inter'] text-[12px] text-[#a39e98]">{r.mediaType ?? 'video'} · {r.startTime ? new Date(r.startTime).toLocaleDateString('id-ID') : '-'}</span>
                          </div>
                        </Td>
                        <Td>
                          <div className="flex max-w-[520px] items-start gap-2">
                            <PackingOrderItemsSummary items={items} />
                          </div>
                        </Td>
                        <Td>
                          <div className="grid gap-1">
                            <span className="font-['Inter'] text-[13px] font-medium tabular-nums text-[#000000]">{r.packingPayAmount != null ? formatCurrency(r.packingPayAmount) : '-'}</span>
                            <span className="inline-flex w-fit rounded-full bg-[#f6f5f4] px-2 py-0.5 font-['Inter'] text-[11px] font-medium text-[#31302e] ring-1 ring-[#e6e6e6]">{r.packingPayBreakdown?.ruleName ?? '-'}</span>
                          </div>
                        </Td>
                        <Td className="font-['Inter'] text-[12px] text-[#615d59]">{r.startTime ? new Date(r.startTime).toLocaleString('id-ID') : '-'}</Td>
                        <Td className="px-5 py-4">
                          <div className="flex justify-end gap-1.5">
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-lg border border-[#dddddd] bg-white text-[#615d59] hover:bg-[#f6f5f4] hover:text-[#000000]" onClick={() => void copyText(r.resiNumber, `resi-${r.id}`)} title="Copy resi"><HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={1.9} /></Button>
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-lg border border-[#dddddd] bg-white text-[#615d59] hover:bg-[#f6f5f4] hover:text-[#000000]" onClick={() => openPayRuleEdit({ id: r.id, resiNumber: r.resiNumber, packingPayRuleId: r.packingPayRuleId, packingPayBreakdown: r.packingPayBreakdown, packingPayAmount: r.packingPayAmount })} disabled={!canEdit || payRuleBusyId === r.id} title={isPaid ? 'Terkunci: sudah dibayar' : 'Ubah pay rule'}><HugeiconsIcon icon={isPaid ? LockPasswordIcon : Edit02Icon} size={14} strokeWidth={1.9} /></Button>
                          </div>
                        </Td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {copiedKey ? <div className="flex items-center gap-1.5 border-t border-[#dddddd] bg-[#fbfaf9] px-4 py-2.5 text-[12px] text-[#615d59]"><HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={1.9} />Copied {copiedKey}</div> : null}
          </div>
        )}
      </section>

      <Dialog open={Boolean(payRuleEditTarget)} onOpenChange={(open) => { if (!open) closePayRuleEdit() }}>
        <DialogContent showCloseButton={false} className="packing-modal max-w-md gap-0 overflow-hidden rounded-2xl border-[#dddddd] bg-white p-0 font-['Inter'] shadow-[0_10px_28px_rgba(0,0,0,0.08)]">
          <div className="border-b border-[#dddddd] p-6"><div className="flex items-start justify-between gap-5"><div className="grid gap-1"><DialogTitle className="font-['Inter'] text-[18px] font-semibold text-[#000000]">Ubah Pay Rule</DialogTitle><DialogDescription className="font-['Inter'] text-[13px] leading-5 text-[#615d59]">Pilih pay rule baru untuk paket ini.</DialogDescription></div><Button type="button" variant="ghost" size="icon" onClick={closePayRuleEdit} className="h-9 w-9 shrink-0 rounded-lg text-[#615d59] hover:bg-[#f6f5f4] hover:text-[#000000]"><HugeiconsIcon icon={Cancel01Icon} size={19} strokeWidth={1.9} /></Button></div></div>
          {payRuleEditTarget ? <div className="grid gap-4 p-6"><div className="rounded-[4px] border border-[#dddddd] bg-[#f6f5f4] px-3 py-3"><p className="font-['Inter'] text-[13px] font-semibold text-[#000000]">{payRuleEditTarget.resiNumber}</p><p className="mt-1 font-['Inter'] text-[12px] leading-5 text-[#615d59]">Saat ini: {payRuleEditTarget.packingPayBreakdown?.ruleName ?? '-'} · {payRuleEditTarget.packingPayAmount != null ? formatCurrency(payRuleEditTarget.packingPayAmount) : '-'}</p></div><div className="grid gap-1.5"><Label className="font-['Inter'] text-[12px] font-medium text-[#000000]">Pay rule baru</Label><NativeSelect value={payRuleEditSelectedId} onChange={setPayRuleEditSelectedId} options={payRules.map((rule) => ({ value: rule.id, label: `${rule.name} · ${formatCurrency(rule.amount)} · ${rule.payType}` }))} placeholder="Pilih pay rule" placeholderValue="" /></div><div className="flex justify-end gap-2 pt-1"><Button type="button" variant="ghost" onClick={closePayRuleEdit} disabled={Boolean(payRuleBusyId)} className="h-10 rounded-full border border-[#dddddd] bg-white px-5 font-['Inter'] text-[13px] text-[#31302e] hover:bg-[#f6f5f4]">Batal</Button><Button type="button" onClick={() => void handleConfirmPayRuleEdit()} disabled={Boolean(payRuleBusyId) || !payRuleEditSelectedId || payRuleEditSelectedId === (payRuleEditTarget.packingPayRuleId ?? '')} className="h-10 rounded-full bg-[#000000] px-6 font-['Inter'] text-[13px] font-medium text-white hover:bg-[#31302e] disabled:opacity-40">{payRuleBusyId ? 'Menyimpan...' : 'Simpan'}</Button></div></div> : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

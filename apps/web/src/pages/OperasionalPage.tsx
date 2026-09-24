import { useEffect, useMemo, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowLeft01Icon, ArrowRight01Icon, Package01Icon, RefreshIcon } from '@hugeicons/core-free-icons'

import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { readDashboardSummaryApi } from '@pakti/api-client'
import type { DashboardSummary } from '@pakti/types'
import { navigateTo } from '../app/uiState'

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount)
}

function jakartaToday(offsetDays = 0) {
  const now = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

function formatDateLabel(isoDate: string) {
  try {
    return new Date(`${isoDate}T12:00:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return isoDate
  }
}

// Sticker palette dekoratif: hanya untuk dot/tile kategori, bukan aksi.
const PACKER_STICKERS = [
  { bg: '#62aef0', fg: '#ffffff' },
  { bg: '#d6b6f6', fg: '#391c57' },
  { bg: '#ff64c8', fg: '#ffffff' },
  { bg: '#dd5b00', fg: '#ffffff' },
  { bg: '#2a9d99', fg: '#ffffff' },
  { bg: '#1aae39', fg: '#ffffff' },
] as const

function packerSticker(key: string) {
  let hash = 0
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return PACKER_STICKERS[hash % PACKER_STICKERS.length] ?? PACKER_STICKERS[0]
}

export function OperasionalPage() {
  const [dateOffset, setDateOffset] = useState(0)
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const dateKey = useMemo(() => jakartaToday(dateOffset), [dateOffset])

  async function load(offset: number) {
    setLoading(true)
    setError(null)
    try {
      const data = await readDashboardSummaryApi(jakartaToday(offset))
      setSummary(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat ringkasan operasional.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void load(dateOffset)
    })
  }, [dateOffset])

  const isToday = dateOffset === 0
  const maxPacking = Math.max(1, ...(summary?.operators.map((op) => op.packingCount) ?? [1]))
  const packingGap = Math.max(0, (summary?.qcCompleted ?? 0) - (summary?.packingCompleted ?? 0))

  return (
    <div className="packing-page mx-auto max-w-[1240px] bg-[#f6f5f4] px-4 py-8 font-['Inter'] sm:px-6 lg:py-10 xl:px-8">
      <section className="mb-7 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="font-['Inter'] text-[12px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Dashboard / Ringkasan Harian</div>
          <h1 className="mt-2 font-['Inter'] text-[32px] font-bold leading-[1.1] tracking-[-0.8px] text-[#000000] sm:text-[36px]">Dashboard</h1>
          <p className="mt-3 max-w-2xl font-['Inter'] text-[14px] leading-6 text-[#615d59] sm:text-[15px]">Target vs realisasi hari berjalan: QC, packing, upah, dan antrean chat dalam satu layar.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="ghost" onClick={() => setDateOffset((v) => v - 1)} className="grid h-10 w-10 place-items-center rounded-lg border border-[#dddddd] bg-white text-[#31302e] hover:bg-[#f6f5f4]" aria-label="Hari sebelumnya"><HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={1.9} /></Button>
          <span className="inline-flex h-10 items-center rounded-lg border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] font-medium text-[#000000]">{formatDateLabel(dateKey)}</span>
          <Button type="button" variant="ghost" onClick={() => setDateOffset((v) => Math.min(0, v + 1))} disabled={isToday} className="grid h-10 w-10 place-items-center rounded-lg border border-[#dddddd] bg-white text-[#31302e] hover:bg-[#f6f5f4] disabled:opacity-40" aria-label="Hari berikutnya"><HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={1.9} /></Button>
          {!isToday ? (
            <Button type="button" variant="ghost" onClick={() => setDateOffset(0)} className="h-10 rounded-lg border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] font-medium text-[#31302e] hover:bg-[#f6f5f4]">Hari ini</Button>
          ) : null}
          <Button type="button" variant="ghost" onClick={() => void load(dateOffset)} disabled={loading} className="grid h-10 w-10 place-items-center rounded-lg border border-[#dddddd] bg-white text-[#31302e] hover:bg-[#f6f5f4] disabled:opacity-40" aria-label="Refresh" title="Refresh"><HugeiconsIcon icon={RefreshIcon} size={16} strokeWidth={1.9} /></Button>
        </div>
      </section>

      {error ? <Alert variant="destructive" className="mb-5 rounded-[4px] border-[#dddddd] bg-white font-['Inter'] text-[13px]"><p className="text-[#31302e]">{error}</p></Alert> : null}

      {loading && !summary ? (
        <div className="grid gap-3">
          <div className="h-44 animate-pulse rounded-[12px] bg-white" />
          <div className="grid gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-[12px] bg-white" />)}
          </div>
        </div>
      ) : summary ? (
        <>
          <section className="overflow-hidden rounded-[12px] bg-[#000000] p-5 sm:p-6">
            <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
              <div className="min-w-0">
                <p className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">{isToday ? 'Hari ini' : formatDateLabel(summary.date)}</p>
                <p className="mt-2 font-['Inter'] text-[48px] font-bold leading-none tracking-[-1px] text-white hover:text-white tabular-nums sm:text-[56px]">{summary.packingCompleted}</p>
                <p className="mt-2 font-['Inter'] text-[14px] leading-6 text-white hover:text-white">paket packing selesai · {formatCurrency(summary.payTotal)} upah</p>
                <p className="mt-1 font-['Inter'] text-[12px] leading-5 text-[#a39e98]">
                  {summary.qcCompleted} QC selesai
                  {packingGap > 0 ? ` · ${packingGap} menunggu packing` : ' · semua QC sudah dipacking ✓'}
                  {summary.chat.pending > 0 ? ` · ${summary.chat.pending} chat menunggu` : ''}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button type="button" variant="ghost" onClick={() => navigateTo('scan')} className="h-10 rounded-lg bg-white px-5 font-['Inter'] text-[13px] font-semibold text-[#000000] hover:bg-[#f6f5f4]"><HugeiconsIcon icon={Package01Icon} size={16} strokeWidth={1.9} /> Ke Scan</Button>
                <Button type="button" variant="ghost" onClick={() => navigateTo('packing-sessions')} className="h-10 rounded-lg border border-white/30 bg-transparent px-5 font-['Inter'] text-[13px] font-medium text-white hover:text-white hover:bg-white/10">Sesi Packing</Button>
              </div>
            </div>
            <div className="mt-5 grid gap-px overflow-hidden rounded-[8px] bg-white/15 sm:grid-cols-3">
              <div className="grid gap-1 bg-[#000000] p-4">
                <span className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">QC selesai</span>
                <span className="font-['Inter'] text-[26px] font-bold leading-none tracking-[-0.5px] text-white hover:text-white tabular-nums">{summary.qcCompleted}</span>
              </div>
              <div className="grid gap-1 bg-[#000000] p-4">
                <span className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Chat terkirim</span>
                <span className="font-['Inter'] text-[26px] font-bold leading-none tracking-[-0.5px] text-white hover:text-white tabular-nums">{summary.chat.sent}</span>
              </div>
              <div className="grid gap-1 bg-[#000000] p-4">
                <span className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Chat gagal</span>
                <span className="font-['Inter'] text-[26px] font-bold leading-none tracking-[-0.5px] text-white hover:text-white tabular-nums">{summary.chat.failed}</span>
              </div>
            </div>
          </section>

          <section className="mt-5 overflow-hidden rounded-xl border border-[#dddddd] bg-white">
            <div className="flex flex-col gap-1 border-b border-[#dddddd] bg-[#fbfaf9] px-4 py-3 sm:px-5">
              <h2 className="font-['Inter'] text-[14px] font-semibold leading-none text-[#000000]">Peringkat petugas</h2>
              <p className="font-['Inter'] text-[12px] leading-none text-[#615d59]">{summary.operators.length} petugas · order Shopee update {summary.ordersUpdated}</p>
            </div>
            {summary.operators.length === 0 ? (
              <div className="grid justify-items-center gap-3 bg-[#f6f5f4] px-6 py-10 text-center">
                <p className="font-['Inter'] text-[14px] font-medium text-[#000000]">Belum ada packing tercatat pada tanggal ini.</p>
                <Button type="button" variant="ghost" onClick={() => navigateTo('scan')} className="h-9 rounded-lg bg-[#000000] px-5 font-['Inter'] text-[13px] font-medium text-white hover:text-white hover:bg-[#31302e]">Mulai scan</Button>
              </div>
            ) : (
              <ul className="divide-y divide-[#e6e6e6]">
                {summary.operators.map((op, idx) => {
                  const sticker = packerSticker(`${op.operatorName}::${op.operatorCode}`)
                  const displayName = op.displayName || op.name || op.operatorName || ''
                  return (
                    <li key={`${op.operatorName}::${op.operatorCode}`} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                      <span className="w-7 shrink-0 font-['Inter'] text-[13px] font-bold tabular-nums text-[#a39e98]">{String(idx + 1).padStart(2, '0')}</span>
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full font-['Inter'] text-[12px] font-semibold uppercase" style={{ backgroundColor: sticker.bg, color: sticker.fg }} aria-hidden="true">
                        {displayName.trim().charAt(0).toUpperCase()}
                      </span>
                      <div className="grid min-w-0 flex-1 gap-1.5">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate font-['Inter'] text-[13px] font-semibold text-[#000000]">{displayName} <span className="font-normal text-[#a39e98]">{op.operatorCode}</span></span>
                          <span className="shrink-0 font-['Inter'] text-[13px] font-semibold tabular-nums text-[#000000]">{formatCurrency(op.payAmount)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[#f0efed]" role="progressbar" aria-valuenow={op.packingCount} aria-valuemax={maxPacking} aria-label={`Paket ${displayName}`}>
                            <div className="h-full rounded-full bg-[#000000]" style={{ width: `${Math.max(4, Math.round((op.packingCount / maxPacking) * 100))}%` }} />
                          </div>
                          <span className="shrink-0 font-['Inter'] text-[12px] tabular-nums text-[#615d59]">{op.packingCount} pkt</span>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="mt-5 flex flex-wrap gap-2">
            <Button type="button" variant="ghost" onClick={() => navigateTo('packing-payments')} className="h-10 rounded-lg border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] font-medium text-[#31302e] hover:bg-[#f6f5f4]">Riwayat Bayar</Button>
            <Button type="button" variant="ghost" onClick={() => navigateTo('history')} className="h-10 rounded-lg border border-[#dddddd] bg-white px-4 font-['Inter'] text-[13px] font-medium text-[#31302e] hover:bg-[#f6f5f4]">History</Button>
          </section>
        </>
      ) : null}
    </div>
  )
}

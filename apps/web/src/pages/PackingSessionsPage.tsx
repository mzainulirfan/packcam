import { useEffect, useMemo, useState } from 'react'

import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { closePackingSessionApi, readPackingSessionsApi, readServerHistoryRecordingsApi } from '@pakti/api-client'
import type { PackingWorkSession } from '@pakti/types'
import { downloadTextFile } from '@pakti/shared'
import { recordsToCsv } from '@pakti/shared/exporters'

export function PackingSessionsPage() {
  const [sessions, setSessions] = useState<PackingWorkSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'closed' | 'cancelled'>('all')
  const [selected, setSelected] = useState<PackingWorkSession | null>(null)
  const [records, setRecords] = useState<Awaited<ReturnType<typeof readServerHistoryRecordingsApi>>['records']>([])
  const [detailLoading, setDetailLoading] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await readPackingSessionsApi(100)
      setSessions(data as PackingWorkSession[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat sesi packing.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return sessions.filter((s) => {
      const matchesSearch = !q || `${s.packerNameSnapshot} ${s.packerCodeSnapshot} ${s.id}`.toLowerCase().includes(q)
      const matchesStatus = statusFilter === 'all' || s.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [sessions, search, statusFilter])

  const totals = useMemo(() => {
    const totalPaket = filtered.reduce((acc, s) => acc + (s.completedPackingCount ?? 0), 0)
    const totalUpah = filtered.reduce((acc, s) => acc + (s.totalPayAmount ?? 0), 0)
    return { totalPaket, totalUpah }
  }, [filtered])

  async function handleClose(id: string) {
    if (!confirm('Tutup sesi packing ini?')) return
    try {
      const updated = await closePackingSessionApi(id)
      setSessions((prev) => prev.map((s) => (s.id === updated.id ? (updated as PackingWorkSession) : s)))
      if (selected?.id === id) setSelected(updated as PackingWorkSession)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal tutup sesi')
    }
  }

  async function handleOpenDetail(s: PackingWorkSession) {
    setSelected(s)
    setDetailLoading(true)
    try {
      const result = await readServerHistoryRecordingsApi({ taskType: 'packing' })
      const filteredRecords = result.records.filter((r) => (r as unknown as { packingSessionId?: string | null }).packingSessionId === s.id)
      setRecords(filteredRecords)
    } catch {
      setRecords([])
    } finally {
      setDetailLoading(false)
    }
  }

  function handleExportAll() {
    const csv = ['session_id,packer_name,packer_code,status,paket,upah,mulai,ended', ...filtered.map((s) => `${s.id},${s.packerNameSnapshot},${s.packerCodeSnapshot},${s.status},${s.completedPackingCount},${s.totalPayAmount},${s.startedAt},${s.endedAt ?? ''}`)].join('\n')
    downloadTextFile(`packing-sessions-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8')
  }

  function handleExportDetail() {
    if (!selected || records.length === 0) {
      alert('Tidak ada data untuk export.')
      return
    }
    const csv = recordsToCsv(records)
    downloadTextFile(`packing-session-${selected.packerCodeSnapshot}-${selected.id.slice(0, 8)}.csv`, csv, 'text/csv;charset=utf-8')
  }

  if (selected) {
    return (
      <div className="admin-opencode grid w-full gap-5 px-0 py-1">
        <section className="admin-opencode__summary flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="grid gap-2">
            <div className="admin-opencode__section-label">[←] Sesi Packing / Detail</div>
            <h1 className="admin-opencode__title">{selected.packerNameSnapshot} ({selected.packerCodeSnapshot})</h1>
            <p className="admin-opencode__lede">
              [{selected.status}] · {new Date(selected.startedAt).toLocaleString('id-ID')} → {selected.endedAt ? new Date(selected.endedAt).toLocaleString('id-ID') : 'masih aktif'} · {selected.completedPackingCount} paket · {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(selected.totalPayAmount)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setSelected(null)}>
              [← kembali ke daftar]
            </Button>
            <Button type="button" variant="outline" onClick={handleExportDetail}>
              [export csv sesi]
            </Button>
            {selected.status === 'active' ? (
              <Button type="button" variant="outline" onClick={() => void handleClose(selected.id)}>
                [tutup sesi]
              </Button>
            ) : null}
          </div>
        </section>

        <Card className="admin-opencode__panel">
          <CardHeader>
            <CardTitle>Detail paket sesi</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {detailLoading ? (
              <div className="text-sm">[~] Memuat detail sesi...</div>
            ) : records.length === 0 ? (
              <div className="text-sm">[-] Belum ada paket completed di sesi ini.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="history-opencode__table w-full min-w-[720px] border-collapse">
                  <thead>
                    <tr>
                      <th className="px-3 py-2">Resi</th>
                      <th className="px-3 py-2">Order</th>
                      <th className="px-3 py-2">Media</th>
                      <th className="px-3 py-2">Upah</th>
                      <th className="px-3 py-2">Waktu</th>
                      <th className="px-3 py-2">Breakdown</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((rec) => {
                      const r = rec as unknown as { resiNumber: string; orderNumber?: string | null; mediaType?: string; packingPayAmount?: number | null; packingPayBreakdown?: { ruleName?: string; payType?: string; amount?: number; quantity?: number; total?: number } | null; orderSnapshot?: { items?: Array<{ productName: string; variationName?: string | null; quantity: number }> } | null; startTime?: string }
                      return (
                        <tr key={r.resiNumber + rec.id} className="history-opencode__row">
                          <td className="px-3 py-2 font-mono text-xs">{r.resiNumber}</td>
                          <td className="px-3 py-2 text-xs">{r.orderNumber ?? '-'} {r.orderSnapshot?.items ? `· ${r.orderSnapshot.items.map((it) => `${it.productName}${it.variationName ? ` · ${it.variationName}` : ''} x${it.quantity}`).join(', ')}` : ''}</td>
                          <td className="px-3 py-2">[{r.mediaType ?? 'video'}]</td>
                          <td className="px-3 py-2">{r.packingPayAmount != null ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(r.packingPayAmount) : '-'}</td>
                          <td className="px-3 py-2 text-xs">{r.startTime ? new Date(r.startTime).toLocaleString('id-ID') : '-'}</td>
                          <td className="px-3 py-2 text-xs">{r.packingPayBreakdown ? `${r.packingPayBreakdown.ruleName ?? '-'} · ${r.packingPayBreakdown.payType ?? '-'} · Rp${r.packingPayBreakdown.amount ?? 0} x${r.packingPayBreakdown.quantity ?? 1} = Rp${r.packingPayBreakdown.total ?? 0}` : '-'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="admin-opencode grid w-full gap-5 px-0 py-1">
      <section className="admin-opencode__summary flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-2">
          <div className="admin-opencode__section-label">[+] Sesi Packing</div>
          <h1 className="admin-opencode__title">Riwayat Sesi Packing</h1>
          <p className="admin-opencode__lede">Lihat sesi kerja petugas packing, total paket & upah, dan detail payroll per sesi. Tutup sesi yang lupa ditutup dan export CSV.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="admin-opencode__badge">{loading ? '[~] loading' : '[x] ready'}</span>
          <Button type="button" variant="outline" onClick={() => void load()}>
            [refresh]
          </Button>
          <Button type="button" variant="outline" onClick={handleExportAll}>
            [export all csv]
          </Button>
        </div>
      </section>

      {error ? (
        <Alert variant="destructive">
          <p>{error}</p>
        </Alert>
      ) : null}

      <Card className="admin-opencode__panel">
        <CardHeader>
          <CardTitle>Ringkasan</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="admin-opencode__stats">
            <div className="admin-opencode__stat">
              <span>01</span>
              <p>Sesi tampil<br /><strong>{filtered.length}</strong></p>
            </div>
            <div className="admin-opencode__stat">
              <span>02</span>
              <p>Total paket<br /><strong>{totals.totalPaket}</strong></p>
            </div>
            <div className="admin-opencode__stat">
              <span>03</span>
              <p>Total upah<br /><strong>{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(totals.totalUpah)}</strong></p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="admin-opencode__panel">
        <CardHeader>
          <CardTitle>Filter</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 pt-4 sm:grid-cols-[1fr_auto_auto]">
          <Input placeholder="Cari packer / kode / ID sesi..." value={search} onChange={(e) => setSearch(e.target.value)} className="history-opencode__input" />
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="history-opencode__select w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua status</SelectItem>
              <SelectItem value="active">active</SelectItem>
              <SelectItem value="closed">closed</SelectItem>
              <SelectItem value="cancelled">cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" className="history-opencode__button" onClick={() => { setSearch(''); setStatusFilter('all') }}>
            [reset]
          </Button>
        </CardContent>
      </Card>

      <Card className="admin-opencode__panel">
        <CardHeader>
          <CardTitle>Daftar sesi</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {loading ? (
            <div className="admin-opencode__empty">[~] Memuat sesi...</div>
          ) : filtered.length === 0 ? (
            <div className="admin-opencode__empty">[-] Tidak ada sesi sesuai filter.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="history-opencode__table w-full min-w-[860px] border-collapse">
                <thead>
                  <tr>
                    <th className="px-3 py-2">Packer</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Paket</th>
                    <th className="px-3 py-2">Upah</th>
                    <th className="px-3 py-2">Mulai</th>
                    <th className="px-3 py-2">Selesai</th>
                    <th className="px-3 py-2 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.id} className="history-opencode__row">
                      <td className="px-3 py-2 font-medium">{s.packerNameSnapshot} ({s.packerCodeSnapshot})</td>
                      <td className="px-3 py-2">[{s.status}]</td>
                      <td className="px-3 py-2">{s.completedPackingCount}</td>
                      <td className="px-3 py-2">{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(s.totalPayAmount)}</td>
                      <td className="px-3 py-2 text-xs">{new Date(s.startedAt).toLocaleString('id-ID')}</td>
                      <td className="px-3 py-2 text-xs">{s.endedAt ? new Date(s.endedAt).toLocaleString('id-ID') : '-'}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button type="button" variant="outline" size="sm" className="history-opencode__button" onClick={() => void handleOpenDetail(s)}>
                            [detail]
                          </Button>
                          {s.status === 'active' ? (
                            <Button type="button" variant="outline" size="sm" className="history-opencode__button" onClick={() => void handleClose(s.id)}>
                              [tutup]
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

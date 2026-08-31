import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Copy, ExternalLink, Package, RefreshCw, Search, ShoppingBag, Truck } from 'lucide-react'

import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { ShopeeInspectionResultCard } from '../components/shopee/ShopeeInspectionResultCard'
import { readRecentShopeeOrdersApi, readServerAdminStatusApi } from '@pakti/api-client'
import type { ShopeeOrder } from '@pakti/types'
import { navigateTo } from '../app/uiState'

type AdminStatus = Awaited<ReturnType<typeof readServerAdminStatusApi>>

const PAGE_SIZE = 12

export function ShopeeInspectionPage() {
  const [orders, setOrders] = useState<ShopeeOrder[]>([])
  const [adminStatus, setAdminStatus] = useState<AdminStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [channelFilter, setChannelFilter] = useState<string>('all')
  const [verifiedFilter, setVerifiedFilter] = useState<'all' | 'verified' | 'unverified'>('all')
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | '7days' | 'custom'>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [page, setPage] = useState(1)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [fetchedOrders, status] = await Promise.all([readRecentShopeeOrdersApi(100), readServerAdminStatusApi().catch(() => null)])
      setOrders(fetchedOrders)
      if (status) setAdminStatus(status as AdminStatus)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat hasil inspek Shopee.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    queueMicrotask(() => void load())
  }, [])

  useEffect(() => {
    queueMicrotask(() => setPage(1))
  }, [search, channelFilter, verifiedFilter, dateFilter, customFrom, customTo])

  const channelOptions = useMemo(() => {
    const set = new Set<string>()
    for (const o of orders) if (o.shippingChannel?.trim()) set.add(o.shippingChannel.trim())
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [orders])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()

    function toLocalDateStr(d: Date) {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }
    function getOrderDateStr(o: ShopeeOrder): string | null {
      const raw = (o as unknown as { updatedAt?: string | null; createdAt?: string | null }).updatedAt ?? (o as unknown as { createdAt?: string | null }).createdAt ?? null
      if (!raw) return null
      const dd = new Date(raw)
      if (Number.isNaN(dd.getTime())) return null
      return toLocalDateStr(dd)
    }

    const today = new Date()
    const todayStr = toLocalDateStr(today)
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    const yesterdayStr = toLocalDateStr(yesterday)
    const sevenStart = new Date(today)
    sevenStart.setDate(today.getDate() - 6)
    const sevenStartStr = toLocalDateStr(sevenStart)

    return orders.filter((o) => {
      const matchesChannel = channelFilter === 'all' || (o.shippingChannel ?? '').trim() === channelFilter
      const isVerified = Boolean(o.orderNumber && o.trackingNumber)
      const matchesVerified =
        verifiedFilter === 'all' ? true : verifiedFilter === 'verified' ? isVerified : !isVerified
      if (!matchesChannel || !matchesVerified) return false

      const orderDateStr = getOrderDateStr(o)
      let matchesDate = true
      if (dateFilter === 'today') matchesDate = orderDateStr === todayStr
      else if (dateFilter === 'yesterday') matchesDate = orderDateStr === yesterdayStr
      else if (dateFilter === '7days') matchesDate = orderDateStr !== null && orderDateStr >= sevenStartStr && orderDateStr <= todayStr
      else if (dateFilter === 'custom') {
        if (customFrom && customTo) matchesDate = orderDateStr !== null && orderDateStr >= customFrom && orderDateStr <= customTo
        else if (customFrom) matchesDate = orderDateStr !== null && orderDateStr >= customFrom
        else if (customTo) matchesDate = orderDateStr !== null && orderDateStr <= customTo
        else matchesDate = true
      }
      if (!matchesDate) return false

      if (!q) return true
      const haystack = `${o.orderNumber} ${o.trackingNumber ?? ''} ${o.buyerUsername ?? ''} ${o.shippingChannel ?? ''} ${o.items?.map((it) => `${it.productName} ${it.variationName ?? ''} ${it.sku ?? ''}`).join(' ') ?? ''}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [orders, search, channelFilter, verifiedFilter, dateFilter, customFrom, customTo])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const totalQty = useMemo(() => orders.reduce((acc, o) => acc + (o.items?.reduce((a, it) => a + (it.quantity ?? 0), 0) ?? 0), 0), [orders])

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
      } catch {
        // ignore
      } finally {
        ta.remove()
      }
    }
  }

  function handleVerify(order: ShopeeOrder) {
    const resi = order.trackingNumber?.trim()
    if (resi) {
      try {
        window.sessionStorage.setItem('pakti.shopeeVerifyResi', resi)
      } catch {}
    }
    try {
      window.sessionStorage.setItem('pakti.shopeeVerifyOrder', order.orderNumber)
    } catch {}
    navigateTo('history')
  }

  function handleOpenShopee() {
    window.open('https://seller.shopee.co.id/portal/sale/order', '_blank', 'noopener,noreferrer')
  }

  function formatRelativeTime(value: string | null | undefined) {
    if (!value) return '-'
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return '-'
    const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000))
    if (s < 90) return `${s}s lalu`
    if (s < 3600) return `${Math.floor(s / 60)}m lalu`
    return `${Math.floor(s / 3600)}j lalu`
  }

  return (
    <div className="admin-opencode grid w-full gap-5 px-0 py-1">
      <section className="admin-opencode__summary flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-1">
          <div className="admin-opencode__section-label">[+] Shopee · Hasil Inspek</div>
          <h1 className="admin-opencode__title">Hasil Inspek Shopee</h1>
          <p className="admin-opencode__lede max-w-[68ch] text-[0.82rem] leading-snug">
            Card khusus menampilkan hasil grep/inspek dari <span className="font-mono font-bold">seller.shopee.co.id</span> yang tersimpan di Pakti. Terverifikasi via DB `orders` + `order_items` — bisa dicek di Scan / History / API.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="admin-opencode__badge">{loading ? '[~] loading' : `[x] ${filtered.length}/${orders.length}`}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleOpenShopee} className="gap-1.5">
            <ExternalLink className="h-3.5 w-3.5" />
            Buka Shopee
          </Button>
        </div>
      </section>

      {error ? (
        <Alert variant="destructive">
          <p>{error}</p>
        </Alert>
      ) : null}

      <Card className="admin-opencode__panel">
        <CardContent className="pt-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="admin-opencode__stat">
              <p>
                <strong className="tabular-nums">{orders.length}</strong>
                <br />
                Total order
              </p>
            </div>
            <div className="admin-opencode__stat">
              <p>
                <strong className="tabular-nums">{adminStatus?.shopeeAutomation.orders.updatedToday ?? '-'}</strong>
                <br />
                Update hari ini
              </p>
            </div>
            <div className="admin-opencode__stat">
              <p>
                <strong className="tabular-nums">{totalQty}</strong>
                <br />
                Total qty
              </p>
            </div>
            <div className="admin-opencode__stat">
              <p>
                <strong className="tabular-nums">{formatRelativeTime(adminStatus?.shopeeAutomation.orders.latestUpdatedAt ?? null)}</strong>
                <br />
                Last sync
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="admin-opencode__panel">
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2 text-[0.95rem]">
              <span className="grid h-7 w-7 place-items-center rounded-[6px] bg-[#201d1d] text-white">
                <ShoppingBag className="h-4 w-4" />
              </span>
              Filter hasil inspek
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              {filtered.length} dari {orders.length} · hal {currentPage}/{totalPages}
            </span>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 pt-2">
          <div className="grid gap-3 lg:grid-cols-[1fr_200px_200px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari buyer / order / resi / produk / SKU..." className="h-9 pl-8 font-mono text-xs" />
            </div>
            <Select value={channelFilter} onValueChange={(v) => setChannelFilter(v)}>
              <SelectTrigger className="h-9 bg-white text-xs">
                <SelectValue placeholder="Channel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua channel</SelectItem>
                {channelOptions.map((ch) => (
                  <SelectItem key={ch} value={ch}>
                    <span className="inline-flex items-center gap-1">
                      <Truck className="h-3 w-3" />
                      {ch}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={verifiedFilter} onValueChange={(v) => setVerifiedFilter(v as typeof verifiedFilter)}>
              <SelectTrigger className="h-9 bg-white text-xs">
                <SelectValue placeholder="Verifikasi" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua status</SelectItem>
                <SelectItem value="verified">Terverifikasi</SelectItem>
                <SelectItem value="unverified">Belum</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 font-mono text-xs font-medium text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" />
                Tanggal:
              </span>
              <div className="inline-flex overflow-hidden rounded-[6px] border bg-[#f8f7f7] p-1">
                {[
                  { v: 'all' as const, l: 'Semua' },
                  { v: 'today' as const, l: 'Hari ini' },
                  { v: 'yesterday' as const, l: 'Kemarin' },
                  { v: '7days' as const, l: '7 Hari' },
                  { v: 'custom' as const, l: 'Custom' },
                ].map((opt) => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setDateFilter(opt.v)}
                    className={`rounded-[4px] px-2.5 py-1 font-mono text-xs font-medium transition-colors ${dateFilter === opt.v ? 'bg-white text-foreground shadow-sm border border-[rgba(15,0,0,0.08)]' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {opt.l}
                  </button>
                ))}
              </div>
            </div>
            {dateFilter === 'custom' && (
              <div className="flex flex-wrap items-center gap-2">
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-7 w-[148px] bg-white font-mono text-xs" />
                <span className="font-mono text-xs text-muted-foreground">s.d.</span>
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-7 w-[148px] bg-white font-mono text-xs" />
              </div>
            )}
            {dateFilter !== 'all' && dateFilter !== 'custom' && <span className="font-mono text-[11px] text-muted-foreground">{filtered.length} hasil</span>}
          </div>

          {(search.trim() || channelFilter !== 'all' || verifiedFilter !== 'all' || dateFilter !== 'all' || customFrom || customTo) && (
            <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
              <span>
                Filter aktif:
                {search.trim() ? ` cari "${search.trim()}"` : ''}
                {channelFilter !== 'all' ? ` · channel ${channelFilter}` : ''}
                {verifiedFilter !== 'all' ? ` · ${verifiedFilter}` : ''}
                {dateFilter !== 'all' ? ` · ${dateFilter === 'today' ? 'hari ini' : dateFilter === 'yesterday' ? 'kemarin' : dateFilter === '7days' ? '7 hari' : customFrom && customTo ? `${customFrom} s.d. ${customTo}` : customFrom ? `≥ ${customFrom}` : customTo ? `≤ ${customTo}` : 'custom'}` : ''}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto h-7 gap-1 rounded-[6px] text-xs"
                onClick={() => {
                  setSearch('')
                  setChannelFilter('all')
                  setVerifiedFilter('all')
                  setDateFilter('all')
                  setCustomFrom('')
                  setCustomTo('')
                }}
              >
                Reset
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[220px] animate-pulse rounded-[8px] border bg-muted/20" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="admin-opencode__panel">
          <CardContent className="grid place-items-center gap-3 py-12 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-[#f1eeee] text-muted-foreground">
              <Package className="h-6 w-6" />
            </div>
            <div className="grid gap-1">
              <p className="font-mono text-sm font-bold text-foreground">Tidak ada hasil sesuai filter</p>
              <p className="max-w-[42ch] text-sm leading-relaxed text-muted-foreground">
                {orders.length === 0
                  ? 'Belum ada order Shopee di Pakti. Buka seller.shopee.co.id → extension Pakti → Sync.'
                  : 'Coba ubah kata kunci / channel / status verifikasi / tanggal.'}
              </p>
            </div>
            {orders.length === 0 ? (
              <Button type="button" variant="outline" size="sm" onClick={handleOpenShopee} className="gap-1.5">
                <ExternalLink className="h-3.5 w-3.5" /> Buka Shopee Seller
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch('')
                  setChannelFilter('all')
                  setVerifiedFilter('all')
                  setDateFilter('all')
                  setCustomFrom('')
                  setCustomTo('')
                }}
              >
                Reset filter
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pageItems.map((order) => (
              <ShopeeInspectionResultCard
                key={order.id ?? order.orderNumber}
                order={order}
                verified={Boolean(order.orderNumber && order.trackingNumber)}
                updatedAtLabel={order.updatedAt ? new Date(order.updatedAt).toLocaleString('id-ID') : null}
                onCopy={(text, label) => void copyText(text, `${label}-${order.orderNumber}`)}
                onVerify={handleVerify}
                onOpenShopee={handleOpenShopee}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex flex-col items-center justify-between gap-3 rounded-[8px] border bg-white px-4 py-3 sm:flex-row">
              <span className="font-mono text-xs text-muted-foreground">
                Menampilkan {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, filtered.length)} dari {filtered.length} hasil
              </span>
              <div className="flex flex-wrap items-center gap-1">
                <Button type="button" variant="outline" size="sm" className="h-7" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  ‹
                </Button>
                {Array.from({ length: totalPages }).map((_, idx) => {
                  const p = idx + 1
                  if (totalPages > 7 && Math.abs(p - currentPage) > 2 && p !== 1 && p !== totalPages) {
                    if (p === 2 && currentPage > 4) return <span key={p} className="px-1 text-muted-foreground">…</span>
                    if (p === totalPages - 1 && currentPage < totalPages - 3) return <span key={p} className="px-1 text-muted-foreground">…</span>
                    return null
                  }
                  return (
                    <Button
                      key={p}
                      type="button"
                      variant={p === currentPage ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 min-w-7"
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </Button>
                  )
                })}
                <Button type="button" variant="outline" size="sm" className="h-7" disabled={currentPage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                  ›
                </Button>
              </div>
            </div>
          )}

          <Card className="admin-opencode__panel border-dashed bg-[#fcfcfc]">
            <CardContent className="flex flex-col gap-2 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span className="inline-flex items-center gap-1.5">
                <Copy className="h-3 w-3" />
                {copiedKey ? `[copied ${copiedKey}]` : 'Klik Copy di card untuk salin resi/order.'}
              </span>
              <span className="inline-flex flex-wrap gap-2">
                <span className="rounded-full border bg-white px-2 py-0.5">Verifikasi → History (`GET /api/history/recordings?search=`)</span>
                <span className="rounded-full border bg-white px-2 py-0.5">Scan (`GET /api/orders/by-resi/:resi`)</span>
              </span>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

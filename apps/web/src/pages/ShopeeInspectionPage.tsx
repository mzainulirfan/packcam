import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowDown01Icon,
  Calendar03Icon,
  Copy01Icon,
  Delete02Icon,
  ExternalLinkIcon,
  Package01Icon,
  RefreshIcon,
  Search01Icon,
  ShoppingBag01Icon,
} from '@hugeicons/core-free-icons'

import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { deleteShopeeOrderByOrderNumberApi, readRecentShopeeOrdersApi, readServerAdminStatusApi } from '@pakti/api-client'
import type { ShopeeOrder } from '@pakti/types'
import { navigateTo } from '../app/uiState'

type AdminStatus = Awaited<ReturnType<typeof readServerAdminStatusApi>>

const PAGE_SIZE = 12
const SHOPEE_ORDER_SYNC_URL = 'https://seller.shopee.co.id/portal/sale/order?type=toship&source=processed'

export function ShopeeInspectionPage() {
  const [orders, setOrders] = useState<ShopeeOrder[]>([])
  const [adminStatus, setAdminStatus] = useState<AdminStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [channelFilter] = useState<string>('all')
  const [verifiedFilter] = useState<'all' | 'verified' | 'unverified'>('all')
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | '7days' | 'custom'>('today')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [page, setPage] = useState(1)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [deletingOrderNumber, setDeletingOrderNumber] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

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

  // @ts-ignore TS6133 - kept for future use
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
    window.open(SHOPEE_ORDER_SYNC_URL, '_blank', 'noopener,noreferrer')
  }

  async function handleDeleteOrder(order: ShopeeOrder) {
    const orderNumber = order.orderNumber?.trim()
    if (!orderNumber) {
      setError('Nomor pesanan tidak valid, data tidak bisa dihapus.')
      return
    }

    const confirmed = window.confirm(`Hapus data Shopee lokal untuk order ${orderNumber}? Data bisa masuk lagi saat extension sync ulang dari Shopee.`)
    if (!confirmed) return

    setDeletingOrderNumber(orderNumber)
    setError(null)
    setActionMessage(null)
    try {
      await deleteShopeeOrderByOrderNumberApi(orderNumber)
      setOrders((current) => current.filter((item) => item.orderNumber !== orderNumber))
      setActionMessage(`Order ${orderNumber} dihapus dari Pakti. Buka Shopee lalu jalankan sync ulang dari extension.`)
      void load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menghapus order Shopee.')
    } finally {
      setDeletingOrderNumber(null)
    }
  }

  function handleResyncOrder(order: ShopeeOrder) {
    if (order.orderNumber?.trim()) {
      try {
        window.sessionStorage.setItem('pakti.shopeeResyncOrder', order.orderNumber.trim())
      } catch {}
    }
    setActionMessage('Shopee Siap Dikirim dibuka. Jalankan sync dari extension di halaman type=toship&source=processed untuk mengambil ulang data terbaru.')
    handleOpenShopee()
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

  const hasActiveFilters = Boolean(search.trim()) || dateFilter !== 'today' || Boolean(customFrom) || Boolean(customTo)

  function clearFilters() {
    setSearch('')
    setDateFilter('today')
    setCustomFrom('')
    setCustomTo('')
  }

  return (
    <div className="shopee-inspection-page mx-auto max-w-[1240px] bg-[#f6f5f4] px-4 py-8 font-['Inter'] sm:px-6 lg:py-10 xl:px-8">
      <section className="mb-7 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Operasional / Hasil Shopee</div>
          <h1 className="mt-2 text-[32px] font-bold leading-[1.1] tracking-[-0.8px] text-[#000000] sm:text-[36px]">Hasil Inspek Shopee</h1>
          <p className="mt-3 max-w-2xl text-[14px] leading-6 text-[#615d59] sm:text-[15px]">Card hasil inspeksi dari seller.shopee.co.id yang tersimpan di Pakti dan bisa diverifikasi ke History atau Scan.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex h-11 items-center justify-center rounded-full border border-[#dddddd] bg-white px-4 text-[14px] font-medium text-[#0075de] shadow-[0_1px_2px_rgba(0,0,0,0.03),0_8px_24px_rgba(0,0,0,0.035)]">{loading ? 'Loading' : `${filtered.length}/${orders.length}`}</span>
          <Button type="button" variant="outline" onClick={() => void load()} disabled={loading} className="h-11 rounded-full border-[#dddddd] bg-white px-5 text-[14px] font-medium text-[#615d59] hover:bg-[#fbfaf9]">
            <HugeiconsIcon icon={RefreshIcon} size={18} strokeWidth={1.9} className={loading ? 'animate-spin' : ''} /> Refresh
          </Button>
          <Button type="button" variant="outline" onClick={handleOpenShopee} className="h-11 rounded-full border-[#dddddd] bg-white px-5 text-[14px] font-medium text-[#615d59] hover:bg-[#fbfaf9]">
            <HugeiconsIcon icon={ExternalLinkIcon} size={18} strokeWidth={1.9} /> Buka Shopee
          </Button>
        </div>
      </section>

      {error ? <Alert variant="destructive" className="mb-5 rounded-[4px] border-[#f2c8a4] bg-[#fff7ed] font-['Inter'] text-[14px]"><p className="text-[#31302e]">{error}</p></Alert> : null}
      {actionMessage ? <Alert variant="info" className="mb-5 rounded-lg border-[#dddddd] bg-white font-['Inter'] text-[14px]"><p className="text-[#31302e]">{actionMessage}</p></Alert> : null}

      <section className="mb-5 grid gap-3 sm:grid-cols-4">
        <InspectionStat label="Total order" value={String(orders.length)} detail="Order tersimpan" icon={ShoppingBag01Icon} />
        <InspectionStat label="Update hari ini" value={String(adminStatus?.shopeeAutomation.orders.updatedToday ?? '-')} detail="Dari worker Shopee" icon={RefreshIcon} />
        <InspectionStat label="Total qty" value={String(totalQty)} detail="Akumulasi item" icon={Package01Icon} />
        <InspectionStat label="Last sync" value={formatRelativeTime(adminStatus?.shopeeAutomation.orders.latestUpdatedAt ?? null)} detail="Sinkronisasi terakhir" icon={Calendar03Icon} />
      </section>

      <section className="relative z-20 mt-5 overflow-visible rounded-xl border border-[#dddddd] bg-white">
        <div className="flex flex-wrap items-center gap-2 p-2 sm:p-2.5 lg:flex-nowrap">
          <label className="relative flex min-w-[180px] max-w-[360px] flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-0 grid w-8 place-items-center text-[#a39e98]"><HugeiconsIcon icon={Search01Icon} size={16} strokeWidth={1.9} /></span>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari buyer / order / resi..." className="h-8 w-full rounded-[4px] border-[#dddddd] bg-white pl-8 pr-3 text-[13px] placeholder:text-[#a39e98] focus-visible:border-[#CFCBC7] focus-visible:ring-0" />
          </label>
          <div className="ml-auto flex shrink-0 items-center gap-1 rounded-lg border border-[#dddddd] bg-[#f6f5f4] p-1">
            <PeriodeDropdown value={dateFilter} onChange={setDateFilter} />
            {dateFilter === 'custom' ? (
              <div className="flex items-center gap-1">
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-7 rounded-[4px] border-[#dddddd] bg-white px-2 text-[12px] focus-visible:border-[#0075de] focus-visible:ring-0" />
                <span className="text-[11px] text-[#a39e98]">—</span>
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-7 rounded-[4px] border-[#dddddd] bg-white px-2 text-[12px] focus-visible:border-[#0075de] focus-visible:ring-0" />
              </div>
            ) : null}
            <Button type="button" variant="ghost" onClick={clearFilters} disabled={!hasActiveFilters} className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-white px-2.5 text-[12px] font-medium text-[#615d59] hover:bg-white disabled:opacity-40"><HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={1.9} /> Reset</Button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-[#dddddd] bg-[#fbfaf9] px-4 py-3 sm:px-5">
          <div><h2 className="text-[14px] font-semibold text-[#000000]">Daftar hasil inspek</h2><p className="mt-0.5 text-[12px] text-[#a39e98]">{filtered.length} dari {orders.length} · halaman {currentPage}/{totalPages}</p></div>
          <span className="inline-flex items-center rounded-full border border-[#dddddd] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#0075de]">{filtered.length} hasil</span>
        </div>
      </section>

      {loading ? <InspectionTableSkeleton /> : filtered.length === 0 ? <EmptyState ordersCount={orders.length} onOpenShopee={handleOpenShopee} onReset={clearFilters} /> : <>
        <section className="overflow-hidden rounded-xl border border-[#dddddd] bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] border-collapse">
              <thead className="bg-[#f6f5f4]">
                <tr className="text-left">
                  <Th className="px-5">Order</Th>
                  <Th>Produk</Th>
                  <Th>Kurir</Th>
                  <Th>Status</Th>
                  <Th className="px-5 text-right">Aksi</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e6e6e6] bg-white">
                {pageItems.map((order) => {
                  const verified = Boolean(order.orderNumber && order.trackingNumber)
                  return (
                    <tr key={order.id ?? order.orderNumber} className="transition-colors hover:bg-[#fbfaf9]">
                      <Td className="px-5 py-4">
                        <div className="grid gap-1.5">
                          <span className="font-['Inter'] text-[14px] font-semibold leading-tight text-[#000000]">{order.orderNumber || '-'}</span>
                          <CopyValue value={order.trackingNumber ?? '-'} label="Resi" copyKey={`Resi-${order.orderNumber}`} onCopy={copyText} />
                          <span className="truncate font-['Inter'] text-[12px] text-[#615d59]">{order.buyerUsername ?? '-'}</span>
                        </div>
                      </Td>
                      <Td>
                        <div className="flex max-w-[520px] items-start gap-2">
                          <OrderItemsSummary items={order.items} />
                        </div>
                      </Td>
                      <Td>
                        <span className="font-['Inter'] text-[13px] text-[#615d59]">{order.shippingChannel ?? '-'}</span>
                      </Td>
                      <Td>
                        <span className={`inline-flex rounded-lg border px-2 py-1 font-['Inter'] text-[12px] font-medium ${verified ? 'border-[#e6e6e6] bg-[#f6f5f4] text-[#31302e]' : 'border-[#f2c8a4] bg-[#fff7ed] text-[#dd5b00]'}`}>{verified ? 'Lengkap' : 'Belum lengkap'}</span>
                      </Td>
                      <Td className="px-5 py-4">
                        <div className="flex justify-end gap-1.5">
                          <Button type="button" variant="ghost" size="sm" className="h-8 rounded-lg border border-[#dddddd] bg-white px-3 text-[12px] font-medium text-[#31302e] hover:bg-[#f6f5f4]" onClick={() => handleVerify(order)}>
                            Verifikasi
                          </Button>
                          <Button type="button" variant="ghost" size="sm" className="h-8 rounded-lg border border-[#dddddd] bg-white px-3 text-[12px] font-medium text-[#31302e] hover:bg-[#f6f5f4]" onClick={() => handleResyncOrder(order)}>
                            Sync ulang
                          </Button>
                          <Button type="button" variant="ghost" size="sm" className="h-8 rounded-lg border border-[#dddddd] bg-white px-3 text-[12px] font-medium text-[#615d59] hover:bg-[#f6f5f4] disabled:opacity-40" disabled={deletingOrderNumber === order.orderNumber} onClick={() => void handleDeleteOrder(order)}>
                            {deletingOrderNumber === order.orderNumber ? 'Menghapus...' : 'Hapus'}
                          </Button>
                        </div>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
        {totalPages > 1 ? <Pagination currentPage={currentPage} totalPages={totalPages} total={filtered.length} onPageChange={setPage} /> : null}
        <div className="mt-3 flex flex-col gap-2 rounded-xl border border-dashed border-[#dddddd] bg-white px-4 py-3 text-[12px] text-[#615d59] sm:flex-row sm:items-center sm:justify-between">
          <span className="inline-flex items-center gap-1.5"><HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={1.9} />{copiedKey ? `Copied ${copiedKey}` : 'Klik ikon di nomor resi untuk salin resi.'}</span>
          <span className="text-[#a39e98]">Verifikasi membuka History dengan konteks order/resi.</span>
        </div>
      </>}
    </div>
  )
}

function formatItemsTitle(items: ShopeeOrder['items']) {
  if (!items || items.length === 0) return '-'
  const labels = items.slice(0, 2).map((item) => `${item.productName}${item.variationName?.trim() ? ` | ${item.variationName.trim()}` : ''} x${item.quantity}`)
  if (items.length > 2) labels.push(`+${items.length - 2} item lagi`)
  return labels.join(' · ')
}

function OrderItemsSummary({ items }: { items: ShopeeOrder['items'] }) {
  if (!items || items.length === 0) return <span className="font-['Inter'] text-[13px] text-[#a39e98]">-</span>

  return (
    <div className="grid min-w-0 flex-1 gap-1" title={formatItemsTitle(items)}>
      {items.slice(0, 2).map((item, index) => {
        const variation = item.variationName?.trim()
        return (
          <div key={item.id ?? `${item.productName}-${variation ?? ''}-${index}`} className="flex min-w-0 items-start justify-between gap-2">
            <span className="grid min-w-0 gap-0.5">
              <span className="line-clamp-2 font-['Inter'] text-[13px] font-medium leading-5 text-[#31302e]">{item.productName}</span>
              {variation ? <span className="truncate font-['Inter'] text-[11px] leading-4 text-[#615d59]">{variation}</span> : null}
            </span>
            <span className="shrink-0 rounded-md bg-[#f6f5f4] px-1.5 py-0.5 font-['Inter'] text-[11px] font-semibold text-[#31302e] ring-1 ring-[#e6e6e6]">x{item.quantity}</span>
          </div>
        )
      })}
      {items.length > 2 ? <span className="font-['Inter'] text-[11px] text-[#a39e98]">+{items.length - 2} item lagi</span> : null}
    </div>
  )
}

function CopyValue({ value, label, copyKey, onCopy }: { value: string; label: string; copyKey: string; onCopy: (text: string, key: string) => Promise<void> }) {
  const canCopy = value !== '-'
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="truncate font-['Inter'] text-[13px] text-[#31302e]" title={value}>{value}</span>
      {canCopy ? (
        <button type="button" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[#615d59] hover:bg-[#f6f5f4] hover:text-[#000000]" onClick={() => void onCopy(value, copyKey)} title={`Copy ${label.toLowerCase()}`}>
          <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={1.9} />
        </button>
      ) : null}
    </div>
  )
}

function InspectionTableSkeleton() {
  return (
    <section className="overflow-hidden rounded-xl border border-[#dddddd] bg-white">
      <div className="grid gap-2 p-4" aria-label="Memuat hasil inspek Shopee">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex justify-between gap-3 rounded-lg border border-[#e6e6e6] bg-[#f6f5f4] p-3">
            <span className="h-4 w-36 animate-pulse rounded bg-[#e6e6e6]" />
            <span className="h-4 w-48 animate-pulse rounded bg-[#e6e6e6]" />
          </div>
        ))}
      </div>
    </section>
  )
}

function Th({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <th className={`bg-[#f6f5f4] px-4 py-3 text-left font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98] ${className}`}>{children}</th>
}

function Td({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <td className={`bg-transparent px-4 py-3 align-middle font-['Inter'] text-[13px] text-[#31302e] ${className}`}>{children}</td>
}

function InspectionStat({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: typeof ShoppingBag01Icon }) {
  return (
    <article className="rounded-xl border border-[#dddddd] bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">{label}</div>
          <div className="mt-3 text-[28px] font-bold leading-none tracking-[-0.5px] text-[#000000]">{value}</div>
          <p className="mt-2 text-[12px] leading-5 text-[#615d59]">{detail}</p>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#f6f5f4] text-[#31302e]"><HugeiconsIcon icon={icon} size={19} strokeWidth={1.9} /></span>
      </div>
    </article>
  )
}

// @ts-ignore TS6133 - kept for future use
function NativeSelect({ value, onChange, icon, children, compact = false }: { value: string; onChange: (value: string) => void; icon: typeof ShoppingBag01Icon; children: ReactNode; compact?: boolean }) {
  return (
    <label className={`relative inline-flex items-center rounded-lg border border-[#dddddd] bg-white text-[#000000] ${compact ? 'h-8' : 'h-10'}`}>
      <span className={`pointer-events-none absolute left-3 grid place-items-center text-[#31302e] ${compact ? '[&>svg]:h-[15px] [&>svg]:w-[15px]' : ''}`}><HugeiconsIcon icon={icon} size={compact ? 15 : 17} strokeWidth={1.9} /></span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className={`h-full appearance-none rounded-lg bg-transparent pr-9 font-medium focus:outline-none focus:ring-0 ${compact ? 'min-w-[130px] pl-8 text-[12px]' : 'min-w-[180px] pl-9 text-[13px]'}`}>
        {children}
      </select>
      <span className="pointer-events-none absolute right-3 grid place-items-center text-[#a39e98]"><HugeiconsIcon icon={ArrowDown01Icon} size={compact ? 13 : 15} strokeWidth={1.9} /></span>
    </label>
  )
}

function PeriodeDropdown({ value, onChange }: { value: string; onChange: (v: any) => void }) {
  return (
    <label className="relative inline-flex h-8 items-center rounded-lg border border-[#dddddd] bg-white text-[#000000]">
      <span className="pointer-events-none absolute left-2.5 grid place-items-center text-[#31302e]"><HugeiconsIcon icon={Calendar03Icon} size={15} strokeWidth={1.9} /></span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-full min-w-[130px] appearance-none rounded-lg bg-transparent pl-8 pr-7 text-[12px] font-medium focus:outline-none focus:ring-0">
        <option value="all">Semua tanggal</option>
        <option value="today">Hari ini</option>
        <option value="yesterday">Kemarin</option>
        <option value="7days">7 hari</option>
        <option value="custom">Custom</option>
      </select>
      <span className="pointer-events-none absolute right-2 grid place-items-center text-[#a39e98]"><HugeiconsIcon icon={ArrowDown01Icon} size={13} strokeWidth={1.9} /></span>
    </label>
  )
}

function EmptyState({ ordersCount, onOpenShopee, onReset }: { ordersCount: number; onOpenShopee: () => void; onReset: () => void }) {
  return (
    <section className="grid place-items-center gap-3 rounded-xl border border-[#dddddd] bg-white px-6 py-14 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-xl bg-[#f6f5f4] text-[#615d59]"><HugeiconsIcon icon={Package01Icon} size={22} strokeWidth={1.9} /></div>
      <div className="grid gap-1"><p className="text-[14px] font-semibold text-[#000000]">Tidak ada hasil sesuai filter</p><p className="max-w-[42ch] text-[13px] leading-6 text-[#615d59]">{ordersCount === 0 ? 'Belum ada order Shopee di Pakti. Buka seller.shopee.co.id, jalankan extension Pakti, lalu Sync.' : 'Coba ubah kata kunci, channel, status verifikasi, atau tanggal.'}</p></div>
      <Button type="button" variant="outline" size="sm" onClick={ordersCount === 0 ? onOpenShopee : onReset} className="h-9 rounded-lg border-[#dddddd] bg-white px-3 text-[13px] font-medium text-[#615d59] hover:bg-[#f6f5f4]">
        <HugeiconsIcon icon={ordersCount === 0 ? ExternalLinkIcon : Delete02Icon} size={15} strokeWidth={1.9} /> {ordersCount === 0 ? 'Buka Shopee Seller' : 'Reset filter'}
      </Button>
    </section>
  )
}

function Pagination({ currentPage, totalPages, total, onPageChange }: { currentPage: number; totalPages: number; total: number; onPageChange: (page: number) => void }) {
  return (
    <div className="mt-3 flex flex-col items-center justify-between gap-3 rounded-xl border border-[#dddddd] bg-white px-4 py-3 text-[13px] text-[#615d59] sm:flex-row">
      <span>Menampilkan {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, total)} dari {total} hasil</span>
      <div className="flex flex-wrap items-center gap-1">
        <Button type="button" variant="outline" size="sm" className="h-8 min-w-8 rounded-lg border-[#dddddd] bg-white px-2" disabled={currentPage <= 1} onClick={() => onPageChange(Math.max(1, currentPage - 1))}>‹</Button>
        {Array.from({ length: totalPages }).map((_, idx) => {
          const p = idx + 1
          if (totalPages > 7 && Math.abs(p - currentPage) > 2 && p !== 1 && p !== totalPages) {
            if (p === 2 && currentPage > 4) return <span key={p} className="px-1 text-[#a39e98]">...</span>
            if (p === totalPages - 1 && currentPage < totalPages - 3) return <span key={p} className="px-1 text-[#a39e98]">...</span>
            return null
          }
          return <Button key={p} type="button" variant={p === currentPage ? 'default' : 'outline'} size="sm" className={`h-8 min-w-8 rounded-lg px-2 text-[12px] ${p === currentPage ? 'bg-[#0075de] text-white hover:bg-[#005bab]' : 'border-[#dddddd] bg-white text-[#615d59]'}`} onClick={() => onPageChange(p)}>{p}</Button>
        })}
        <Button type="button" variant="outline" size="sm" className="h-8 min-w-8 rounded-lg border-[#dddddd] bg-white px-2" disabled={currentPage >= totalPages} onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}>›</Button>
      </div>
    </div>
  )
}

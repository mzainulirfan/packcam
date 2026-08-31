import { Copy, ExternalLink, Package, Search, ShoppingBag, Truck, User } from 'lucide-react'

import { Button } from '../ui/button'
import type { ShopeeOrder } from '@pakti/types'

type ShopeeInspectionResultCardProps = {
  order: ShopeeOrder
  variant?: 'default' | 'compact'
  verified?: boolean | null
  updatedAtLabel?: string | null
  onCopy?: (text: string, label: string) => void
  onVerify?: (order: ShopeeOrder) => void
  onOpenShopee?: (order: ShopeeOrder) => void
}

function formatItemsSummary(items: ShopeeOrder['items']) {
  if (!items || items.length === 0) return '-'
  const seen = new Set<string>()
  const labels: string[] = []
  for (const it of items.slice(0, 3)) {
    const key = `${it.productName}-${it.variationName ?? ''}-${it.quantity}`
    if (seen.has(key)) continue
    seen.add(key)
    const varName = it.variationName?.trim() ? ` (${it.variationName})` : ''
    labels.push(`${it.productName}${varName} x${it.quantity}`)
  }
  if (items.length > 3) labels.push(`+${items.length - 3} item lagi`)
  return labels.join(' · ')
}

export function ShopeeInspectionResultCard({
  order,
  variant = 'default',
  verified,
  updatedAtLabel,
  onCopy,
  onVerify,
  onOpenShopee,
}: ShopeeInspectionResultCardProps) {
  const isCompact = variant === 'compact'
  const totalQty = order.items?.reduce((acc, it) => acc + (it.quantity ?? 0), 0) ?? 0
  const verificationTone =
    verified === true
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : verified === false
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-[rgba(15,0,0,0.12)] bg-[#f8f7f7] text-muted-foreground'

  const verificationLabel = verified === true ? 'Terverifikasi di Pakti' : verified === false ? 'Belum ada di Pakti' : 'Hasil inspek'

  return (
    <div className="group flex flex-col gap-0 overflow-hidden rounded-[8px] border border-[rgba(15,0,0,0.12)] bg-[#fdfcfc] shadow-[0_1px_2px_rgba(15,0,0,0.04)] transition-colors hover:border-[rgba(15,0,0,0.18)]">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-[rgba(15,0,0,0.06)] bg-white px-3 py-3 sm:px-4">
        <div className="grid min-w-0 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-[6px] bg-[#201d1d] px-2 py-1 font-mono text-xs font-bold text-white">
              <ShoppingBag className="h-3 w-3" />
              #{order.orderNumber}
            </span>
            {order.shippingChannel ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(15,0,0,0.08)] bg-[#f8f7f7] px-2 py-0.5 text-[11px] font-medium text-foreground">
                <Truck className="h-3 w-3" />
                {order.shippingChannel}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded bg-[#f1eeee] px-1.5 py-0.5 text-foreground" title={order.trackingNumber ?? '-'}>
              <Package className="h-3 w-3" />
              {order.trackingNumber ?? '-'}
            </span>
            {order.trackingNumber && onCopy ? (
              <button
                type="button"
                className="grid h-5 w-5 place-items-center rounded hover:bg-muted"
                onClick={() => onCopy(order.trackingNumber!, 'Resi')}
                title="Copy resi"
              >
                <Copy className="h-3 w-3" />
              </button>
            ) : null}
            <span className="hidden sm:inline">·</span>
            <span className="inline-flex items-center gap-1">
              <User className="h-3 w-3" />
              {order.buyerUsername ?? '-'}
            </span>
          </div>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium ${verificationTone}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${verified === true ? 'bg-emerald-500' : verified === false ? 'bg-amber-500' : 'bg-muted-foreground'}`} />
          {verificationLabel}
        </span>
      </div>

      {/* Body */}
      <div className="grid gap-2 px-3 py-3 sm:px-4">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            <Package className="h-3 w-3" />
            {order.items?.length ?? 0} produk · {totalQty} qty
          </p>
          {updatedAtLabel ? <span className="font-mono text-[11px] text-muted-foreground">{updatedAtLabel}</span> : null}
        </div>

        <div className={isCompact ? 'line-clamp-2 text-xs leading-relaxed text-foreground [overflow-wrap:anywhere]' : 'grid gap-1.5'}>
          {isCompact ? (
            <p className="text-xs leading-relaxed text-foreground [overflow-wrap:anywhere]" title={formatItemsSummary(order.items)}>
              {formatItemsSummary(order.items)}
            </p>
          ) : (
            (order.items ?? []).slice(0, 6).map((it, idx) => (
              <div key={`${it.sku ?? it.productName}-${idx}`} className="flex items-start justify-between gap-2 rounded-[6px] border border-[rgba(15,0,0,0.06)] bg-[#fcfcfc] px-2.5 py-2">
                <div className="grid min-w-0 gap-0.5">
                  <span className="line-clamp-1 font-mono text-xs font-medium text-foreground" title={it.productName}>
                    {it.productName}
                  </span>
                  <span className="flex flex-wrap gap-1 font-mono text-[11px] text-muted-foreground">
                    {it.variationName ? <span className="rounded bg-white px-1 py-0.5">{it.variationName}</span> : null}
                    {it.sku ? <span className="rounded bg-white px-1 py-0.5">{it.sku}</span> : null}
                  </span>
                </div>
                <span className="shrink-0 rounded-full bg-[#201d1d] px-2 py-0.5 font-mono text-xs font-bold text-white">x{it.quantity}</span>
              </div>
            ))
          )}
          {!isCompact && (order.items?.length ?? 0) > 6 ? (
            <p className="font-mono text-[11px] text-muted-foreground">+{order.items.length - 6} item lagi</p>
          ) : null}
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[rgba(15,0,0,0.06)] bg-[#fcfcfc] px-3 py-2.5 sm:px-4">
        <div className="flex flex-wrap gap-1.5">
          {order.orderNumber && onCopy ? (
            <Button type="button" variant="outline" size="sm" className="h-7 gap-1 rounded-[6px] bg-white px-2 text-xs" onClick={() => onCopy(order.orderNumber, 'Order')}>
              <Copy className="h-3 w-3" /> Order
            </Button>
          ) : null}
          {order.trackingNumber && onCopy ? (
            <Button type="button" variant="outline" size="sm" className="h-7 gap-1 rounded-[6px] bg-white px-2 text-xs" onClick={() => onCopy(order.trackingNumber!, 'Resi')}>
              <Copy className="h-3 w-3" /> Resi
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {onVerify ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 rounded-[6px] bg-white px-2 text-xs"
              onClick={() => onVerify(order)}
              title="Verifikasi di Pakti (buka Scan/History)"
            >
              <Search className="h-3 w-3" /> Verifikasi
            </Button>
          ) : null}
          {onOpenShopee ? (
            <Button type="button" variant="outline" size="sm" className="h-7 gap-1 rounded-[6px] bg-white px-2 text-xs" onClick={() => onOpenShopee(order)}>
              <ExternalLink className="h-3 w-3" /> Shopee
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

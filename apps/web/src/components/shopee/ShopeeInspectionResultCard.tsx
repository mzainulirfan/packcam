import { HugeiconsIcon } from '@hugeicons/react'
import { CheckmarkCircle01Icon, Copy01Icon, ExternalLinkIcon, Package01Icon, Search01Icon, ShoppingBag01Icon, TruckDeliveryIcon, UserIcon } from '@hugeicons/core-free-icons'

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
  const verificationTone = verified === true ? 'border-[#e6e6e6] bg-white text-[#0075de]' : verified === false ? 'border-[#f2c8a4] bg-[#fff7ed] text-[#dd5b00]' : 'border-[#e6e6e6] bg-white text-[#615d59]'

  const verificationLabel = verified === true ? 'Terverifikasi di Pakti' : verified === false ? 'Belum ada di Pakti' : 'Hasil inspek'

  return (
    <div className="group flex flex-col gap-0 overflow-hidden rounded-xl border border-[#e6e6e6] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03),0_8px_24px_rgba(0,0,0,0.035)] transition-colors hover:border-[#d8d5d1]">
      <div className="flex items-start justify-between gap-3 border-b border-[#e6e6e6] bg-white px-3 py-3 sm:px-4">
        <div className="grid min-w-0 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-[6px] bg-[#000000] px-2 py-1 text-xs font-bold text-white">
              <HugeiconsIcon icon={ShoppingBag01Icon} size={13} strokeWidth={1.9} />
              #{order.orderNumber}
            </span>
            {order.shippingChannel ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-[#e6e6e6] bg-[#f6f5f4] px-2 py-0.5 text-[11px] font-medium text-[#31302e]">
                <HugeiconsIcon icon={TruckDeliveryIcon} size={13} strokeWidth={1.9} />
                {order.shippingChannel}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#a39e98]">
            <span className="inline-flex items-center gap-1 rounded bg-[#f6f5f4] px-1.5 py-0.5 text-[#31302e]" title={order.trackingNumber ?? '-'}>
              <HugeiconsIcon icon={Package01Icon} size={13} strokeWidth={1.9} />
              {order.trackingNumber ?? '-'}
            </span>
            {order.trackingNumber && onCopy ? (
              <button
                type="button"
                className="grid h-5 w-5 place-items-center rounded hover:bg-[#f6f5f4]"
                onClick={() => onCopy(order.trackingNumber!, 'Resi')}
                title="Copy resi"
              >
                <HugeiconsIcon icon={Copy01Icon} size={13} strokeWidth={1.9} />
              </button>
            ) : null}
            <span className="hidden sm:inline">·</span>
            <span className="inline-flex items-center gap-1">
              <HugeiconsIcon icon={UserIcon} size={13} strokeWidth={1.9} />
              {order.buyerUsername ?? '-'}
            </span>
          </div>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium ${verificationTone}`}>
          {verified === true ? <HugeiconsIcon icon={CheckmarkCircle01Icon} size={13} strokeWidth={1.9} /> : <span className={`h-1.5 w-1.5 rounded-full ${verified === false ? 'bg-[#dd5b00]' : 'bg-[#a39e98]'}`} />}
          {verificationLabel}
        </span>
      </div>

      <div className="grid gap-2 px-3 py-3 sm:px-4">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">
            <HugeiconsIcon icon={Package01Icon} size={13} strokeWidth={1.9} />
            {order.items?.length ?? 0} produk · {totalQty} qty
          </p>
          {updatedAtLabel ? <span className="text-[11px] text-[#a39e98]">{updatedAtLabel}</span> : null}
        </div>

        <div className={isCompact ? 'line-clamp-2 text-xs leading-relaxed text-[#31302e] [overflow-wrap:anywhere]' : 'grid gap-1.5'}>
          {isCompact ? (
            <p className="text-xs leading-relaxed text-[#31302e] [overflow-wrap:anywhere]" title={formatItemsSummary(order.items)}>
              {formatItemsSummary(order.items)}
            </p>
          ) : (
            (order.items ?? []).slice(0, 6).map((it, idx) => (
              <div key={`${it.sku ?? it.productName}-${idx}`} className="flex items-start justify-between gap-2 rounded-[8px] border border-[#e6e6e6] bg-[#f6f5f4] px-2.5 py-2">
                <div className="grid min-w-0 gap-0.5">
                  <span className="line-clamp-1 text-xs font-medium text-[#000000]" title={it.productName}>
                    {it.productName}
                  </span>
                  <span className="flex flex-wrap gap-1 text-[11px] text-[#615d59]">
                    {it.variationName ? <span className="rounded bg-white px-1 py-0.5">{it.variationName}</span> : null}
                    {it.sku ? <span className="rounded bg-white px-1 py-0.5">{it.sku}</span> : null}
                  </span>
                </div>
                <span className="shrink-0 rounded-full bg-[#000000] px-2 py-0.5 text-xs font-bold text-white">x{it.quantity}</span>
              </div>
            ))
          )}
          {!isCompact && (order.items?.length ?? 0) > 6 ? (
            <p className="text-[11px] text-[#a39e98]">+{order.items.length - 6} item lagi</p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e6e6e6] bg-[#fbfaf9] px-3 py-2.5 sm:px-4">
        <div className="flex flex-wrap gap-1.5">
          {order.orderNumber && onCopy ? (
            <Button type="button" variant="outline" size="sm" className="h-7 gap-1 rounded-[6px] border-[#e6e6e6] bg-white px-2 text-xs" onClick={() => onCopy(order.orderNumber, 'Order')}>
              <HugeiconsIcon icon={Copy01Icon} size={13} strokeWidth={1.9} /> Order
            </Button>
          ) : null}
          {order.trackingNumber && onCopy ? (
            <Button type="button" variant="outline" size="sm" className="h-7 gap-1 rounded-[6px] border-[#e6e6e6] bg-white px-2 text-xs" onClick={() => onCopy(order.trackingNumber!, 'Resi')}>
              <HugeiconsIcon icon={Copy01Icon} size={13} strokeWidth={1.9} /> Resi
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {onVerify ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 rounded-[6px] border-[#e6e6e6] bg-white px-2 text-xs"
              onClick={() => onVerify(order)}
              title="Verifikasi di Pakti (buka Scan/History)"
            >
              <HugeiconsIcon icon={Search01Icon} size={13} strokeWidth={1.9} /> Verifikasi
            </Button>
          ) : null}
          {onOpenShopee ? (
            <Button type="button" variant="outline" size="sm" className="h-7 gap-1 rounded-[6px] border-[#e6e6e6] bg-white px-2 text-xs" onClick={() => onOpenShopee(order)}>
              <HugeiconsIcon icon={ExternalLinkIcon} size={13} strokeWidth={1.9} /> Shopee
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

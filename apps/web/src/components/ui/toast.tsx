import { Card, CardContent } from '@/components/ui/card'
import { dismissToast, useToasts } from '@/app/toastState'

function getToastMarker(variant: 'default' | 'info' | 'success' | 'destructive') {
  switch (variant) {
    case 'destructive':
      return '[!]'
    case 'success':
      return '[x]'
    case 'info':
      return '[+]'
    default:
      return '[-]'
  }
}

function getToastLabel(variant: 'default' | 'info' | 'success' | 'destructive') {
  switch (variant) {
    case 'destructive':
      return 'error'
    case 'success':
      return 'ok'
    case 'info':
      return 'info'
    default:
      return 'note'
  }
}

export function ToastViewport() {
  const { toasts } = useToasts()

  if (!toasts.length) {
    return null
  }

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[80] grid w-[min(26rem,calc(100vw-2rem))] gap-3 font-['Inter']">
      {toasts.map((toast) => (
        <Card key={toast.id} className="pointer-events-auto overflow-hidden rounded-[12px] border border-[#e6e6e6] bg-white shadow-[0_23px_52px_rgba(0,0,0,0.08),0_4px_18px_rgba(0,0,0,0.06)]" data-variant={toast.variant}>
          <CardContent className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 p-4">
            <span className="grid h-7 w-7 place-items-center rounded-[8px] bg-[#f6f5f4] font-['Inter'] text-[11px] font-bold text-[#31302e]">{getToastMarker(toast.variant)}</span>
            <div className="min-w-0">
              <div className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">{getToastLabel(toast.variant)}</div>
              <p className="mt-0.5 font-['Inter'] text-[13px] font-semibold leading-5 text-[#000000]">{toast.title}</p>
              {toast.description ? <p className="mt-1 font-['Inter'] text-[12px] leading-5 text-[#615d59]">{toast.description}</p> : null}
            </div>
            <button
              type="button"
              className="grid h-7 w-7 place-items-center rounded-[8px] border border-[#e6e6e6] bg-white font-['Inter'] text-[12px] text-[#615d59] hover:bg-[#f6f5f4] hover:text-[#000000]"
              onClick={() => dismissToast(toast.id)}
              aria-label="Tutup toast"
            >
              ×
            </button>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

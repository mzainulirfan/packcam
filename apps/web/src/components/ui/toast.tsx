import { AlertCircle, CheckCircle2, Info } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { useToasts, dismissToast } from '@/app/toastState'

function getToastIcon(variant: 'default' | 'info' | 'success' | 'destructive') {
  switch (variant) {
    case 'destructive':
      return AlertCircle
    case 'success':
      return CheckCircle2
    case 'info':
      return Info
    default:
      return Info
  }
}

function getToastTone(variant: 'default' | 'info' | 'success' | 'destructive') {
  switch (variant) {
    case 'destructive':
      return 'border-rose-200 bg-rose-50 text-rose-950'
    case 'success':
      return 'border-emerald-200 bg-emerald-50 text-emerald-950'
    case 'info':
      return 'border-sky-200 bg-sky-50 text-sky-950'
    default:
      return 'border-slate-200 bg-white text-slate-950'
  }
}

export function ToastViewport() {
  const { toasts } = useToasts()

  if (!toasts.length) {
    return null
  }

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[80] grid w-[min(24rem,calc(100vw-2rem))] gap-3">
      {toasts.map((toast) => {
        const Icon = getToastIcon(toast.variant)

        return (
          <Card key={toast.id} className={`pointer-events-auto shadow-xl shadow-slate-900/10 ${getToastTone(toast.variant)}`}>
            <CardContent className="flex items-start gap-3 p-4">
              <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-slate-950 text-white">
                <Icon className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-6">{toast.title}</p>
                {toast.description ? <p className="mt-1 text-sm leading-6 text-current/75">{toast.description}</p> : null}
              </div>
              <button
                type="button"
                className="rounded-full border border-transparent px-2 py-1 text-sm text-current/60 transition hover:text-current"
                onClick={() => dismissToast(toast.id)}
                aria-label="Tutup toast"
              >
                ×
              </button>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

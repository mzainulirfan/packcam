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
    <div className="pointer-events-none fixed right-4 top-4 z-[80] grid w-[min(26rem,calc(100vw-2rem))] gap-3">
      {toasts.map((toast) => (
        <Card key={toast.id} className="toast-opencode pointer-events-auto overflow-hidden" data-variant={toast.variant}>
          <CardContent className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 px-4 py-3">
            <span className="toast-opencode__marker">{getToastMarker(toast.variant)}</span>
            <div className="min-w-0">
              <div className="toast-opencode__meta">{getToastLabel(toast.variant)}</div>
              <p className="toast-opencode__title">{toast.title}</p>
              {toast.description ? <p className="toast-opencode__description">{toast.description}</p> : null}
            </div>
            <button
              type="button"
              className="toast-opencode__close"
              onClick={() => dismissToast(toast.id)}
              aria-label="Tutup toast"
            >
              [x]
            </button>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

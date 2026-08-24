import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { HugeiconsIcon } from '@hugeicons/react'
import { AlertCircleIcon, Tick02Icon, InformationCircleIcon } from '@hugeicons/core-free-icons'

import { cn } from '@/lib/utils'

const alertVariants = cva('relative w-full rounded-2xl border px-4 py-3 text-sm', {
  variants: {
    variant: {
      default: 'border-border bg-card text-card-foreground',
      info: 'border-sky-500/30 bg-sky-500/10 text-sky-50',
      success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-50',
      destructive: 'border-rose-500/30 bg-rose-500/10 text-rose-50',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})

function getAlertIcon(variant?: AlertVariants['variant']) {
  switch (variant) {
    case 'destructive':
      return AlertCircleIcon
    case 'success':
      return Tick02Icon
    case 'info':
      return InformationCircleIcon
    default:
      return InformationCircleIcon
  }
}

type AlertVariants = VariantProps<typeof alertVariants>

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & AlertVariants
>(({ className, variant, children, ...props }, ref) => {
  const Icon = getAlertIcon(variant)

  return (
    <div ref={ref} role="alert" data-slot="alert" className={cn(alertVariants({ variant }), className)} {...props}>
      <div className="flex items-start gap-3">
        <HugeiconsIcon icon={Icon} size={16} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  )
})
Alert.displayName = 'Alert'

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} data-slot="alert-title" className={cn('mb-1 font-medium leading-none tracking-tight', className)} {...props} />
  ),
)
AlertTitle.displayName = 'AlertTitle'

const AlertDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} data-slot="alert-description" className={cn('text-sm leading-6 text-current/80', className)} {...props} />
  ),
)
AlertDescription.displayName = 'AlertDescription'

export { Alert, AlertDescription, AlertTitle }

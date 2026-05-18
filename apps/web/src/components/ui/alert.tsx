import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { AlertCircle, CheckCircle2, Info } from "lucide-react"

import { cn } from "@/lib/utils"

const alertVariants = cva("relative w-full rounded-2xl border px-4 py-3 text-sm", {
  variants: {
    variant: {
      default: "border-slate-200 bg-slate-50 text-slate-900",
      info: "border-sky-200 bg-sky-50 text-sky-950",
      success: "border-emerald-200 bg-emerald-50 text-emerald-950",
      destructive: "border-rose-200 bg-rose-50 text-rose-950",
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

function getAlertIcon(variant?: AlertVariants["variant"]) {
  switch (variant) {
    case "destructive":
      return AlertCircle
    case "success":
      return CheckCircle2
    case "info":
      return Info
    default:
      return Info
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
        <Icon className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  )
})
Alert.displayName = "Alert"

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} data-slot="alert-title" className={cn("mb-1 font-medium leading-none tracking-tight", className)} {...props} />
  ),
)
AlertTitle.displayName = "AlertTitle"

const AlertDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} data-slot="alert-description" className={cn("text-sm leading-6 text-current/80", className)} {...props} />
  ),
)
AlertDescription.displayName = "AlertDescription"

export { Alert, AlertDescription, AlertTitle }

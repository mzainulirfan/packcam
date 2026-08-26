import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const alertVariants = cva(
  "relative w-full border px-4 py-3 font-mono text-sm leading-6",
  {
  variants: {
    variant: {
      default: "border-[rgba(15,0,0,0.12)] bg-[#fdfcfc] text-[#201d1d]",
      info: "border-[rgba(15,0,0,0.12)] bg-[#f8f7f7] text-[#201d1d]",
      success: "border-[rgba(15,0,0,0.12)] bg-[#f8f7f7] text-[#201d1d]",
      destructive: "border-[rgba(15,0,0,0.22)] bg-[#f8f7f7] text-[#201d1d]",
    },
  },
  defaultVariants: {
    variant: "default",
  },
  }
)

type AlertVariants = VariantProps<typeof alertVariants>

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & AlertVariants
>(({ className, variant, children, ...props }, ref) => {
  const marker = variant === "destructive" ? "[!]" : variant === "success" ? "[x]" : variant === "info" ? "[+]" : "[-]"

  return (
    <div ref={ref} role="alert" data-slot="alert" className={cn(alertVariants({ variant }), className)} {...props}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 text-[#646262]" aria-hidden="true">{marker}</span>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  )
})
Alert.displayName = "Alert"

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} data-slot="alert-title" className={cn("mb-1 font-bold leading-6 tracking-normal text-[#201d1d]", className)} {...props} />
  ),
)
AlertTitle.displayName = "AlertTitle"

const AlertDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} data-slot="alert-description" className={cn("text-sm leading-6 text-[#646262]", className)} {...props} />
  ),
)
AlertDescription.displayName = "AlertDescription"

export { Alert, AlertDescription, AlertTitle }

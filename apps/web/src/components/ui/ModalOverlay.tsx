import type { ReactNode } from 'react'

import { Dialog, DialogContent } from '@/components/ui/dialog'

type ModalOverlayProps = {
  children: ReactNode
  onClose: () => void
  contentClassName?: string
  staticBackdrop?: boolean
}

export function ModalOverlay({
  children,
  onClose,
  contentClassName,
  staticBackdrop = true,
}: ModalOverlayProps) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className={contentClassName ?? 'max-w-6xl'}
        onEscapeKeyDown={staticBackdrop ? (event) => event.preventDefault() : undefined}
        onInteractOutside={staticBackdrop ? (event) => event.preventDefault() : undefined}
        onPointerDownOutside={staticBackdrop ? (event) => event.preventDefault() : undefined}
      >
        {children}
      </DialogContent>
    </Dialog>
  )
}

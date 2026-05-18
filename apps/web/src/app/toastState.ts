import { useEffect, useState } from 'react'

type ToastVariant = 'default' | 'info' | 'success' | 'destructive'

type ToastItem = {
  id: number
  title: string
  description?: string
  variant: ToastVariant
}

type ToastInput = Omit<ToastItem, 'id'>

type Listener = (toasts: ToastItem[]) => void

const toastListeners = new Set<Listener>()
let toastId = 0
let toastItems: ToastItem[] = []

function emitToastState() {
  for (const listener of toastListeners) {
    listener(toastItems)
  }
}

function scheduleDismiss(id: number, timeoutMs: number) {
  window.setTimeout(() => {
    dismissToast(id)
  }, timeoutMs)
}

export function showToast(input: ToastInput) {
  const item: ToastItem = {
    id: ++toastId,
    title: input.title,
    description: input.description,
    variant: input.variant,
  }

  toastItems = [item, ...toastItems].slice(0, 4)
  emitToastState()
  scheduleDismiss(item.id, 2500)
  return item.id
}

export function dismissToast(id: number) {
  const nextItems = toastItems.filter((item) => item.id !== id)

  if (nextItems.length === toastItems.length) {
    return
  }

  toastItems = nextItems
  emitToastState()
}

export function useToasts() {
  const [toasts, setToasts] = useState(() => toastItems)

  useEffect(() => {
    const listener: Listener = (nextToasts) => {
      setToasts(nextToasts)
    }

    toastListeners.add(listener)

    return () => {
      toastListeners.delete(listener)
    }
  }, [])

  return { toasts, dismissToast }
}

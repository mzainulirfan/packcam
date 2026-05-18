import { showToast } from './toastState'

type NotifyVariant = 'default' | 'info' | 'success' | 'destructive'

function baseNotifyToast(title: string, description?: string, variant: NotifyVariant = 'info') {
  showToast({
    title,
    description,
    variant,
  })
}

export const notify = {
  toast: baseNotifyToast,
  success(title: string, description?: string) {
    baseNotifyToast(title, description, 'success')
  },
  info(title: string, description?: string) {
    baseNotifyToast(title, description, 'info')
  },
  error(title: string, description?: string) {
    baseNotifyToast(title, description, 'destructive')
  },
  copy(title: string, description?: string) {
    baseNotifyToast(title, description, 'success')
  },
  save(title: string, description?: string) {
    baseNotifyToast(title, description, 'success')
  },
  reset(title: string, description?: string) {
    baseNotifyToast(title, description, 'success')
  },
  load(title: string, description?: string) {
    baseNotifyToast(title, description, 'success')
  },
} as const

export const notifyToast = notify.toast
export const notifySuccess = notify.success
export const notifyInfo = notify.info
export const notifyError = notify.error
export const notifyCopy = notify.copy
export const notifySave = notify.save
export const notifyReset = notify.reset
export const notifyLoad = notify.load

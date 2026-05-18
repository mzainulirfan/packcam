import type { OperatorSession } from '@pakti/types'

export type StartupMode = 'setup-admin' | 'login' | 'dashboard'

export function resolveStartupMode({
  bootstrapNeedsSetup,
  operatorSession,
}: {
  bootstrapNeedsSetup: boolean | null
  operatorSession: OperatorSession | null
}): StartupMode {
  if (bootstrapNeedsSetup === null) {
    return 'login'
  }

  if (bootstrapNeedsSetup) {
    return 'setup-admin'
  }

  if (operatorSession) {
    return 'dashboard'
  }

  return 'login'
}

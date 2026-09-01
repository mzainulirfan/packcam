import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'

type Highlight = {
  marker?: string
  title: string
  description: string
}

type AuthShellProps = {
  appName: string
  brandMark: string
  eyebrow: string
  title: string
  description: string
  highlights: readonly Highlight[]
  children: ReactNode
  footerNote?: string
  className?: string
}

export function AuthShell({
  appName,
  brandMark,
  eyebrow,
  title,
  description,
  children,
  className,
}: AuthShellProps) {
  return (
    <div
      className={cn(
        'auth-opencode min-h-screen overflow-hidden bg-[#f6f5f4] text-[#000000]',
        className,
      )}
    >
      <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-4 py-8 sm:px-6">
        <header className="mb-5 flex items-start gap-3">
          <div className="auth-opencode__mark grid size-10 shrink-0 place-items-center">
            {brandMark}
          </div>
          <div className="min-w-0">
            <p className="auth-opencode__app-name">{appName}</p>
            <p className="auth-opencode__eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p className="auth-opencode__description">{description}</p>
          </div>
        </header>
        {children}
      </div>
    </div>
  )
}

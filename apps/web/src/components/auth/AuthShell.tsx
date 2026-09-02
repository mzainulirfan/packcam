import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'

type Highlight = {
  marker?: string
  title: string
  description: string
}
void Highlight;

type AuthShellProps = {
  appName?: string
  brandMark: string
  eyebrow: string
  title: string
  description: string
  highlights?: readonly Highlight[]
  children: ReactNode
  footerNote?: string
  className?: string
}

export function AuthShell({
  brandMark,
  eyebrow,
  title,
  description,
  highlights,
  appName,
  children,
  className,
}: AuthShellProps) {
  void highlights;
  void appName;
  return (
    <div className={cn('min-h-screen overflow-hidden bg-[#f6f5f4] font-[\'Inter\'] text-[#000000]', className)}>
      <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col justify-center px-4 py-8 sm:px-6">
        <header className="mb-6 flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[8px] bg-[#000000] font-['Inter'] text-[14px] font-bold text-white">
            {brandMark}
          </div>
          <div className="min-w-0">
            <p className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">{eyebrow}</p>
            <h1 className="mt-1 font-['Inter'] text-[22px] font-semibold leading-none tracking-[-0.5px] text-[#000000]">{title}</h1>
            <p className="mt-2 max-w-[420px] font-['Inter'] text-[13px] leading-5 text-[#615d59]">{description}</p>
          </div>
        </header>
        {children}
      </div>
    </div>
  )
}

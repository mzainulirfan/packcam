import type { CSSProperties, ReactNode } from 'react'

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
  highlights,
  children,
  footerNote,
  className,
}: AuthShellProps) {
  const shellStyle = {
    '--auth-brand': 'var(--brand)',
    '--auth-brand-contrast': 'var(--brand-contrast)',
  } as CSSProperties

  return (
    <div
      className={cn(
        'auth-opencode min-h-screen overflow-hidden bg-[#fdfcfc] text-[#201d1d]',
        className,
      )}
      style={shellStyle}
    >
      <div className="relative mx-auto grid min-h-screen w-full max-w-7xl gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] lg:gap-6 lg:px-6 lg:py-6">
        <section className="auth-opencode__hero relative overflow-hidden border border-[rgba(15,0,0,0.12)] bg-[#fdfcfc] p-6 text-[#201d1d] lg:p-8">
          <div className="relative z-10 flex h-full flex-col justify-between gap-10">
            <div className="space-y-6">
              <div className="auth-opencode__eyebrow">
                [+] {eyebrow}
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="auth-opencode__mark grid size-14 place-items-center">
                    {brandMark}
                  </div>
                  <div className="space-y-1">
                    <p className="auth-opencode__app-name">{appName}</p>
                    <h1>
                      {title}
                    </h1>
                  </div>
                </div>

                <p className="auth-opencode__description">
                  {description}
                </p>
              </div>
            </div>

            <div className="auth-opencode__highlights">
              {highlights.map((item, index) => (
                <article key={item.title}>
                  <span>{item.marker ?? (index === 0 ? '[+]' : '[-]')}</span>
                  <div>
                    <h2>{item.title}</h2>
                    <p>{item.description}</p>
                  </div>
                </article>
              ))}
            </div>

            <div className="auth-opencode__footer">
              <span>[x] Desain ringkas untuk desktop dan mobile</span>
              {footerNote ? (
                <>
                  <span>{footerNote}</span>
                </>
              ) : null}
            </div>
          </div>
        </section>

        <div className="flex items-center justify-center py-2 lg:py-0">{children}</div>
      </div>
    </div>
  )
}

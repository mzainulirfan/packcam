import type { CSSProperties, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ShieldCheck, Sparkles } from 'lucide-react'

import { cn } from '../../lib/utils'

type Highlight = {
  icon: LucideIcon
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
        'min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(15,23,42,0.08),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(15,23,42,0.06),_transparent_28%),linear-gradient(180deg,_#fbfbfa_0%,_#f4f4f2_100%)] text-slate-950',
        className,
      )}
      style={shellStyle}
    >
      <div className="relative mx-auto grid min-h-screen w-full max-w-7xl gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] lg:gap-6 lg:px-6 lg:py-6">
        <section className="relative overflow-hidden rounded-[2rem] border border-slate-200/80 bg-slate-950 p-6 text-white shadow-2xl shadow-slate-950/20 lg:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.12),_transparent_24%),radial-gradient(circle_at_bottom_left,_rgba(255,255,255,0.08),_transparent_26%)]" />
          <div className="absolute -right-20 top-12 h-44 w-44 rounded-full bg-[var(--auth-brand)] opacity-10 blur-3xl" />
          <div className="absolute -bottom-16 left-0 h-40 w-40 rounded-full bg-white opacity-10 blur-3xl" />

          <div className="relative z-10 flex h-full flex-col justify-between gap-10">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.22em] text-white/70">
                <Sparkles className="size-3.5" />
                {eyebrow}
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="grid size-14 place-items-center rounded-2xl bg-[var(--auth-brand)] text-lg font-semibold text-[var(--auth-brand-contrast)] shadow-lg shadow-black/25">
                    {brandMark}
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-[0.24em] text-white/55">{appName}</p>
                    <h1 className="max-w-xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                      {title}
                    </h1>
                  </div>
                </div>

                <p className="max-w-2xl text-sm leading-6 text-white/72 sm:text-base">
                  {description}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {highlights.map((item) => {
                const Icon = item.icon

                return (
                  <article key={item.title} className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                    <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-white/10 text-white">
                      <Icon className="size-5" />
                    </div>
                    <h2 className="text-sm font-semibold text-white">{item.title}</h2>
                    <p className="mt-1 text-sm leading-6 text-white/60">{item.description}</p>
                  </article>
                )
              })}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.18em] text-white/50">
              <ShieldCheck className="size-4" />
              <span>Desain ringkas untuk desktop dan mobile</span>
              {footerNote ? (
                <>
                  <span className="hidden h-1 w-1 rounded-full bg-white/40 sm:inline-block" />
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

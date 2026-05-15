import type { ReactNode } from 'react'

type StageCardProps = {
  title: string
  children?: ReactNode
}

export function StageCard({ title, children }: StageCardProps) {
  return (
    <section className="stage-card">
      <div className="stage-card__header">
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  )
}

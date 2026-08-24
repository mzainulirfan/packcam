import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

type StageCardProps = {
  title: string
  children?: ReactNode
}

export function StageCard({ title, children }: StageCardProps) {
  return (
    <Card className="rounded-[4px] border-slate-300 shadow-none">
      <CardHeader className="space-y-1 border-b border-slate-200 pb-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">[ Section ]</p>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">{children}</CardContent>
    </Card>
  )
}

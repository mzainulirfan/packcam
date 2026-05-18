import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

type StageCardProps = {
  title: string
  children?: ReactNode
}

export function StageCard({ title, children }: StageCardProps) {
  return (
    <Card className="border-slate-200/80 shadow-xl shadow-slate-900/5">
      <CardHeader className="space-y-2">
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">{children}</CardContent>
    </Card>
  )
}

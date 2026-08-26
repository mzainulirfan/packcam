import { HugeiconsIcon } from '@hugeicons/react'
import { Logout02Icon, UserIcon } from '@hugeicons/core-free-icons'
import type { OperatorSession, WorkTask } from '@pakti/types'
import { Button } from '@/components/ui/button'

type SessionTabProps = {
  session: OperatorSession
  isAdmin: boolean
  taskBusy: boolean
  formatDateTime: (value: string | null | undefined) => string
  formatTask: (taskType: WorkTask) => string
  onTaskChange: (taskType: WorkTask) => void
  onLogoutClick: () => void
}

export function SessionTab({
  session,
  isAdmin,
  taskBusy,
  formatDateTime,
  formatTask,
  onTaskChange,
  onLogoutClick,
}: SessionTabProps) {
  return (
    <div className="grid gap-3 pt-1" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
      <div className="flex items-start justify-between gap-3 border-b border-[var(--op-hairline)] pb-3">
        <div className="grid gap-1">
          <p className="text-[12px] font-bold tracking-wide">[ Session ]</p>
          <h2 className="text-[16px] font-bold leading-none">Sesi operator</h2>
          <p className="text-[14px] leading-relaxed text-[var(--op-mute)]">Cek akun dan mode sebelum scan.</p>
        </div>
        <span className="grid size-9 place-items-center rounded-[4px] bg-[var(--op-ink)] text-[var(--op-canvas)]">
          <HugeiconsIcon icon={UserIcon} size={16} />
        </span>
      </div>

      <div className="grid gap-3">
        <section className="grid gap-3 border border-[var(--op-hairline)] bg-[var(--op-canvas)] p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--op-mute)]">Akun aktif</p>
              <h3 className="mt-1 truncate text-[20px] font-bold leading-none tracking-tight">{session.operatorName}</h3>
            </div>
            <span className="shrink-0 rounded-[4px] bg-[var(--op-ink)] px-2 py-0.5 text-[12px] font-medium text-[var(--op-canvas)]">
              {session.role === 'admin' ? 'Admin' : 'Operator'}
            </span>
          </div>

          <div className="grid gap-2 border-t border-[var(--op-hairline)] pt-3 text-[13px]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[var(--op-mute)]">Kode operator</span>
              <strong className="truncate text-right font-medium">{session.operatorCode || '-'}</strong>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[var(--op-mute)]">Akses</span>
              <strong className="font-medium">{session.role === 'admin' ? 'Admin' : 'Operator'}</strong>
            </div>
            <div className="grid gap-1 rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-surface-soft)] px-3 py-2">
              <span className="text-[var(--op-mute)]">Login</span>
              <strong className="font-medium leading-tight">{formatDateTime(session.loggedInAt)}</strong>
            </div>
          </div>
        </section>

        <section className="grid gap-3 border border-[var(--op-hairline)] bg-[var(--op-surface-soft)] p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--op-mute)]">Mode kerja aktif</p>
              <h3 className="mt-1 text-[18px] font-bold leading-none">{formatTask(session.taskType)}</h3>
            </div>
            <span className="shrink-0 rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-canvas)] px-2 py-0.5 text-[12px] font-medium text-[var(--op-mute)]">
              Scan berikutnya
            </span>
          </div>

          {isAdmin ? (
            <div className="grid grid-cols-2 gap-2 rounded-[4px] border border-[var(--op-hairline)] bg-[var(--op-canvas)] p-1">
              <Button
                type="button"
                variant="ghost"
                className={session.taskType === 'qc'
                  ? 'h-10 rounded-[4px] bg-[var(--op-ink)] text-[var(--op-canvas)] hover:bg-[var(--op-ink)] hover:text-[var(--op-canvas)]'
                  : 'h-10 rounded-[4px] text-[var(--op-mute)] hover:bg-[var(--op-surface-soft)] hover:text-[var(--op-ink)]'}
                onClick={() => onTaskChange('qc')}
                disabled={taskBusy}
              >
                QC
              </Button>
              <Button
                type="button"
                variant="ghost"
                className={session.taskType === 'packing'
                  ? 'h-10 rounded-[4px] bg-[var(--op-ink)] text-[var(--op-canvas)] hover:bg-[var(--op-ink)] hover:text-[var(--op-canvas)]'
                  : 'h-10 rounded-[4px] text-[var(--op-mute)] hover:bg-[var(--op-surface-soft)] hover:text-[var(--op-ink)]'}
                onClick={() => onTaskChange('packing')}
                disabled={taskBusy}
              >
                Packing
              </Button>
            </div>
          ) : (
            <div className="rounded-[4px] bg-[var(--op-ink)] px-3 py-3 text-center text-sm font-medium text-[var(--op-canvas)]">
              {formatTask(session.taskType)}
            </div>
          )}

          <p className="text-[12px] leading-relaxed text-[var(--op-mute)]">
            {isAdmin ? 'Mode baru dipakai saat scan berikutnya.' : 'Mode ditentukan admin. Hubungi admin jika mode kerja perlu diganti.'}
          </p>
        </section>

        <Button
          type="button"
          variant="outline"
          className="h-11 rounded-[4px] border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onLogoutClick}
        >
          <HugeiconsIcon icon={Logout02Icon} size={16} />
          Keluar
        </Button>
      </div>
    </div>
  )
}

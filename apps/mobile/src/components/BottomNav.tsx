import { ScanLine, History, UserRound, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type MobileTab = 'scan' | 'history' | 'session'

const tabs: Array<{ key: MobileTab; label: string; icon: LucideIcon }> = [
  { key: 'scan', label: 'Scan', icon: ScanLine },
  { key: 'history', label: 'History', icon: History },
  { key: 'session', label: 'Akun', icon: UserRound },
]

export function BottomNav({
  activeTab,
  onChange,
}: {
  activeTab: MobileTab
  onChange: (tab: MobileTab) => void
}) {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-[var(--op-hairline)] bg-[var(--op-canvas)] safe-pb">
      <div className="mx-auto flex max-w-[480px] items-center justify-around gap-1 px-2 py-2">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChange(tab.key)}
              className={
                isActive
                  ? 'flex flex-1 flex-col items-center gap-1 rounded-[4px] bg-[var(--op-ink)] px-3 py-2 text-[var(--op-canvas)]'
                  : 'flex flex-1 flex-col items-center gap-1 rounded-[4px] px-3 py-2 text-[var(--op-mute)] hover:bg-[var(--op-surface-soft)]'
              }
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={16} />
              <span className="text-[14px] font-medium leading-none">[ {tab.label} ]</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

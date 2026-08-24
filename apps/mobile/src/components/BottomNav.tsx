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
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/90 backdrop-blur-xl safe-pb">
      <div className="mx-auto flex max-w-[820px] items-center justify-around gap-1 px-2 py-2">
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
                  ? 'flex flex-1 flex-col items-center gap-1 rounded-2xl bg-primary px-3 py-2 text-primary-foreground'
                  : 'flex flex-1 flex-col items-center gap-1 rounded-2xl px-3 py-2 text-muted-foreground hover:bg-muted'
              }
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={18} />
              <span className="text-[0.68rem] font-semibold tracking-wide">{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

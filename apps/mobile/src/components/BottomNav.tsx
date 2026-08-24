import { HugeiconsIcon } from '@hugeicons/react'
import { HistoryIcon, ScanIcon, UserIcon } from '@hugeicons/core-free-icons'

export type MobileTab = 'scan' | 'history' | 'session'

const tabs: Array<{ key: MobileTab; label: string; icon: typeof ScanIcon }> = [
  { key: 'scan', label: 'Scan', icon: ScanIcon },
  { key: 'history', label: 'History', icon: HistoryIcon },
  { key: 'session', label: 'Akun', icon: UserIcon },
]

export function BottomNav({
  activeTab,
  onChange,
}: {
  activeTab: MobileTab
  onChange: (tab: MobileTab) => void
}) {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-[#646262] bg-[#fdfcfc] dark:bg-[#201d1d] shadow-[0_-8px_24px_rgba(0,0,0,0.08)] safe-pb">
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
              <HugeiconsIcon icon={Icon} size={16} />
              <span className="text-[14px] font-medium leading-none">[ {tab.label} ]</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

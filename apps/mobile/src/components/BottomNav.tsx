import { HugeiconsIcon } from '@hugeicons/react'
import { HistoryIcon, ScanIcon, UserIcon } from '@hugeicons/core-free-icons'

export type MobileTab = 'scan' | 'history' | 'session'

type TabDef = { key: MobileTab; label: string; icon: typeof ScanIcon }

const tabs: TabDef[] = [
  { key: 'scan', label: 'Scan', icon: ScanIcon },
  { key: 'history', label: 'History', icon: HistoryIcon },
  { key: 'session', label: 'Akun', icon: UserIcon },
]

export function BottomNav({ activeTab, onChange }: {
  activeTab: MobileTab
  onChange: (tab: MobileTab) => void
}) {
  return (
    <nav className="mobile-bottom-nav" aria-label="Navigasi utama">
      <div className="mobile-bottom-nav-inner">
        {tabs.map((tab) => (
          <button key={tab.key} type="button" onClick={() => onChange(tab.key)}
            aria-current={activeTab === tab.key ? 'page' : undefined} aria-label={tab.label}>
            <span className="mobile-nav-icon" aria-hidden="true">
              <HugeiconsIcon icon={tab.icon} size={20} />
            </span>
            <span className="mobile-nav-label">{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}

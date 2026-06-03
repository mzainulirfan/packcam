import { useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { NAV_ITEMS, type NavGroupId, type PageId } from './app/navigation'
import { readBootstrapNeedsSetupCache, writeBootstrapNeedsSetupCache } from './app/bootstrapState'
import { logoutOperator, useOperatorSession } from './app/operatorSession'
import { navigateTo, useActivePage } from './app/uiState'
import { startRealtimeBridge, stopRealtimeBridge } from './app/realtime'
import { resolveStartupMode } from './app/startupFlow'
import { getBootstrapStatusApi } from '@pakti/api-client'
import { getSystemConfigCssVars, useSystemConfig } from '@pakti/shared/systemConfig'
import { AdminPage } from './pages/AdminPage'
import { HistoryPage } from './pages/HistoryPage'
import { HealthPage } from './pages/HealthPage'
import { OperatorLoginPage } from './pages/OperatorLoginPage'
import { WelcomePage } from './pages/WelcomePage'
import { ScanPage } from './pages/ScanPage'
import { SettingsPage } from './pages/SettingsPage'
import { UsersPage } from './pages/UsersPage'
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card'
import { ToastViewport } from './components/ui/toast'
import 'boxicons/css/boxicons.min.css'
import './App.css'

const PAGE_COMPONENTS: Record<PageId, ReactElement> = {
  scan: <ScanPage />,
  history: <HistoryPage />,
  settings: <SettingsPage />,
  users: <UsersPage />,
  health: <HealthPage />,
  admin: <AdminPage />,
}

const ICONS = {
  scan: 'bx-scan',
  history: 'bx-history',
  settings: 'bx-cog',
  users: 'bx-user-circle',
  health: 'bx-health',
  admin: 'bx-shield-alt-2',
} satisfies Record<(typeof NAV_ITEMS)[number]['icon'], string>

const ADMIN_ONLY_PAGES = new Set<PageId>(['users', 'settings', 'health', 'admin'])

function App() {
  const activePage = useActivePage()
  const operatorSession = useOperatorSession()
  const systemConfig = useSystemConfig()
  const [bootstrapNeedsSetup, setBootstrapNeedsSetup] = useState<boolean | null>(() => readBootstrapNeedsSetupCache())
  const startupMode = resolveStartupMode({
    bootstrapNeedsSetup,
    operatorSession,
  })
  const [hasScrolled, setHasScrolled] = useState(() => window.scrollY > 0)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const isAdmin = operatorSession?.role === 'admin'

  const activeItem = useMemo(
    () => NAV_ITEMS.find((item) => item.id === activePage) ?? NAV_ITEMS[0],
    [activePage],
  )
  const visibleNavItems = useMemo(
    () => NAV_ITEMS.filter((item) => !ADMIN_ONLY_PAGES.has(item.id) || isAdmin),
    [isAdmin],
  )
  const sidebarSections = useMemo(() => {
    const sectionOrder: Array<{ id: NavGroupId; label: string }> = [
      { id: 'operasional', label: 'Operasional' },
      { id: 'administrasi', label: 'Administrasi' },
    ]

    return sectionOrder
      .map((section) => ({
        ...section,
        items: visibleNavItems.filter((item) => item.group === section.id),
      }))
      .filter((section) => section.items.length > 0)
  }, [visibleNavItems])
  const pageContent = useMemo(() => {
    if (ADMIN_ONLY_PAGES.has(activePage) && !isAdmin) {
      return (
        <AccessDeniedPanel
          title={activeItem.label}
          message="Halaman ini hanya bisa diakses oleh admin."
          actionLabel="Kembali ke Scan"
          onAction={() => navigateTo('scan')}
        />
      )
    }

    return PAGE_COMPONENTS[activePage]
  }, [activePage, activeItem.label, isAdmin])

  useEffect(() => {
    let cancelled = false

    void getBootstrapStatusApi()
      .then((status) => {
        if (cancelled) {
          return
        }

        setBootstrapNeedsSetup(status.needsSetup)
        writeBootstrapNeedsSetupCache(status.needsSetup)
      })
      .catch(() => {
        if (cancelled) {
          return
        }

        setBootstrapNeedsSetup((current) => current ?? null)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    function handleScroll() {
      setHasScrolled(window.scrollY > 0)
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const mobileQuery = window.matchMedia('(max-width: 960px)')

    function syncSidebarVisibility() {
      if (!mobileQuery.matches) {
        setIsMobileSidebarOpen(false)
      }
    }

    syncSidebarVisibility()
    mobileQuery.addEventListener('change', syncSidebarVisibility)

    return () => {
      mobileQuery.removeEventListener('change', syncSidebarVisibility)
    }
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }

    const titleSuffix =
      startupMode === 'setup-admin'
        ? 'Setup Admin'
        : activePage === 'scan' && !operatorSession
          ? 'Login'
          : activeItem.label

    document.title = `${systemConfig.appName} · ${titleSuffix}`

    const description = document.querySelector('meta[name="description"]')
    if (description) {
      description.setAttribute('content', systemConfig.tagline)
    }

    const root = document.documentElement
    const cssVars = getSystemConfigCssVars()
    Object.entries(cssVars).forEach(([key, value]) => {
      root.style.setProperty(key, value)
    })
  }, [activeItem.label, activePage, operatorSession, startupMode, systemConfig])

  useEffect(() => {
    if (!operatorSession) {
      stopRealtimeBridge()
      return undefined
    }

    const stop = startRealtimeBridge()
    return () => {
      stop()
    }
  }, [operatorSession])

  let content: ReactElement

  if (startupMode === 'setup-admin') {
    content = <WelcomePage />
  } else if (!operatorSession) {
    content = <OperatorLoginPage />
  } else {
    content = (
      <div className={isMobileSidebarOpen ? 'dashboard-shell dashboard-shell--sidebar-open' : 'dashboard-shell'}>
        <button
          type="button"
          className="dashboard-sidebar-backdrop"
          aria-label="Tutup sidebar"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
        <aside className="dashboard-sidebar">
          <div className="sidebar-brand">
            <div className="sidebar-brand__row">
              <div className="sidebar-brand__mark" aria-hidden="true">
                {systemConfig.brandMark || systemConfig.appName.charAt(0).toUpperCase()}
              </div>
              <div className="sidebar-brand__text">
                <h1>{systemConfig.appName}</h1>
                <p>{systemConfig.tagline}</p>
              </div>
            </div>
          </div>

          <nav className="sidebar-nav" aria-label="Navigasi utama">
            {sidebarSections.map((section) => (
              <div className="sidebar-nav__group" key={section.id}>
                <p className="sidebar-nav__group-title">{section.label}</p>
                <ul className="sidebar-nav__list">
                  {section.items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={item.id === activePage ? 'nav-tab active' : 'nav-tab'}
                        onClick={() => {
                          navigateTo(item.id)
                          setIsMobileSidebarOpen(false)
                        }}
                      >
                        <i className={`bx ${ICONS[item.icon]} nav-tab__icon`} aria-hidden="true" />
                        <span className="nav-tab__content">
                          <span className="nav-tab__label">{item.label}</span>
                          <small className="nav-tab__hint">{item.hint}</small>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        <section className="dashboard-main">
          <header
            className={
              hasScrolled ? 'dashboard-header dashboard-header--scrolled' : 'dashboard-header'
            }
          >
            <div className="dashboard-header__title">
              <button
                type="button"
                className="dashboard-header__menu"
                aria-label="Buka menu"
                aria-expanded={isMobileSidebarOpen}
                onClick={() => setIsMobileSidebarOpen((current) => !current)}
              >
                <i className="bx bx-menu" aria-hidden="true" />
              </button>
              <h2>{activeItem.label}</h2>
            </div>
            <div className="dashboard-header__actions">
              <div className="operator-chip" title={operatorSession.operatorName}>
                <i className="bx bx-user" aria-hidden="true" />
                <strong>{operatorSession.operatorName}</strong>
                <button
                  type="button"
                  className="operator-chip__logout"
                  onClick={() => {
                    logoutOperator()
                  }}
                  aria-label="Keluar"
                  title="Keluar"
                >
                  <i className="bx bx-log-out" aria-hidden="true" />
                </button>
              </div>
            </div>
          </header>

          <main className="dashboard-content">{pageContent}</main>
        </section>
      </div>
    )
  }

  return (
    <>
      {content}
      <ToastViewport />
    </>
  )
}

export default App

function AccessDeniedPanel({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string
  message: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <div className="access-denied">
      <Card className="access-denied__card border-slate-200/80 shadow-xl shadow-slate-900/5">
        <CardHeader className="space-y-2">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Access restricted</p>
          <CardTitle className="text-2xl text-slate-950">{title}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 pt-0">
          <p className="text-sm leading-6 text-slate-500">{message}</p>
          <div>
            <button type="button" className="action-button action-button--primary" onClick={onAction}>
              {actionLabel}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}


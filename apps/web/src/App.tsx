import { useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { NAV_ITEMS, type NavGroupId, type PageId } from './app/navigation'
import { logoutOperator, useOperatorSession } from './app/operatorSession'
import { navigateTo, useActivePage } from './app/uiState'
import { startRealtimeBridge, stopRealtimeBridge } from './app/realtime'
import { resolveStartupMode } from './app/startupFlow'
import { getBootstrapStatusApi } from '@pakti/api-client'
import { getSystemConfigCssVars, useSystemConfig } from '@pakti/shared/systemConfig'
import { AdminPage } from './pages/AdminPage'
import { HistoryPage } from './pages/HistoryPage'
import { PackingSessionsPage } from './pages/PackingSessionsPage'
import { HealthPage } from './pages/HealthPage'
import { OperatorLoginPage } from './pages/OperatorLoginPage'
import { WelcomePage } from './pages/WelcomePage'
import { ScanPage } from './pages/ScanPage'
import { SettingsPage } from './pages/SettingsPage'
import { ShopeePage } from './pages/ShopeePage'
import { ShopeeInspectionPage } from './pages/ShopeeInspectionPage'
import { UsersPage } from './pages/UsersPage'
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card'
import { ToastViewport } from './components/ui/toast'
import 'boxicons/css/boxicons.min.css'
import './App.css'

const PAGE_COMPONENTS: Record<PageId, ReactElement> = {
  scan: <ScanPage />,
  history: <HistoryPage />,
  'packing-sessions': <PackingSessionsPage />,
  shopee: <ShopeePage />,
  'shopee-inspection': <ShopeeInspectionPage />,
  settings: <SettingsPage />,
  users: <UsersPage />,
  health: <HealthPage />,
  admin: <AdminPage />,
}

const ADMIN_ONLY_PAGES = new Set<PageId>(['shopee', 'users', 'settings', 'health', 'admin'])

function App() {
  const activePage = useActivePage()
  const operatorSession = useOperatorSession()
  const systemConfig = useSystemConfig()
  const [bootstrapNeedsSetup, setBootstrapNeedsSetup] = useState<boolean | null>(null)
  const startupMode = resolveStartupMode({
    bootstrapNeedsSetup,
    operatorSession,
  })
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
    const sectionOrder: Array<{ id: NavGroupId | 'system'; label: string; items: PageId[] }> = [
      { id: 'operasional', label: 'Operasional', items: ['scan', 'history', 'packing-sessions', 'shopee-inspection'] },
      { id: 'administrasi', label: 'Administrasi', items: ['shopee', 'users', 'settings'] },
      { id: 'system', label: 'System', items: ['health', 'admin'] },
    ]

    return sectionOrder
      .map((section) => ({
        ...section,
        items: visibleNavItems.filter((item) => section.items.includes(item.id)),
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
          <div className="sidebar-inner">
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
                          <span className="nav-tab__marker" aria-hidden="true">
                            {item.id === activePage ? '[x]' : '[+]'}
                          </span>
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

            <div className="sidebar-session">
              <button
                type="button"
                className="sidebar-session__button"
                onClick={() => {
                  logoutOperator()
                }}
                title="Keluar"
              >
                <div className="sidebar-session__avatar" aria-hidden="true">
                  {getInitials(operatorSession.operatorName)}
                </div>
                <div className="sidebar-session__identity">
                  <div>{operatorSession.operatorName}</div>
                  <span>{operatorSession.role}{operatorSession.operatorCode ? ` · ${operatorSession.operatorCode}` : ''}</span>
                </div>
                <span className="sidebar-session__logout" aria-hidden="true">[x]</span>
              </button>
            </div>
          </div>
        </aside>

        <section className="dashboard-main">
          <header className="dashboard-header">
            <div className="dashboard-header__title">
              <button
                type="button"
                className="dashboard-header__menu"
                aria-label="Buka menu"
                aria-expanded={isMobileSidebarOpen}
                onClick={() => setIsMobileSidebarOpen((current) => !current)}
              >
                <span className="dashboard-header__menu-icon" aria-hidden="true">[=]</span>
              </button>
              <div className="dashboard-header__heading">
                <h2>{systemConfig.appName}</h2>
                <p>{activePage === 'history' ? 'History Dokumentasi' : activeItem.label}</p>
              </div>
            </div>
            <button className="dashboard-header__avatar" type="button" onClick={() => logoutOperator()} title="Keluar">
              {getInitials(operatorSession.operatorName)}
            </button>
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

function getInitials(value: string) {
  const initials = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')

  return initials || 'AD'
}


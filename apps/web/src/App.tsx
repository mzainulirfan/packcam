import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Activity01Icon,
  ArrowRightFromLineIcon,
  Clock01Icon,
  Package01Icon,
  QrCodeIcon,
  Settings01Icon,
  Shield01Icon,
  ShoppingBag01Icon,
  ShoppingBagCheckIcon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'
import { getPagePath, NAV_ITEMS, type NavGroupId, type PageId } from './app/navigation'
import { logoutOperator, useOperatorSession } from './app/operatorSession'
import { navigateTo, useActivePage, useRouteState } from './app/uiState'
import { startRealtimeBridge, stopRealtimeBridge } from './app/realtime'
import { resolveStartupMode } from './app/startupFlow'
import { getBootstrapStatusApi } from '@pakti/api-client'
import { getSystemConfigCssVars, useSystemConfig } from '@pakti/shared/systemConfig'
import { OperatorLoginPage } from './pages/OperatorLoginPage'
import { WelcomePage } from './pages/WelcomePage'
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card'
import { ToastViewport } from './components/ui/toast'
import 'boxicons/css/boxicons.min.css'
import './App.css'

const PAGE_ICONS: Record<PageId, typeof QrCodeIcon> = {
  scan: QrCodeIcon,
  history: Clock01Icon,
  'packing-sessions': Package01Icon,
  'packing-session-detail': Package01Icon,
  'shopee-inspection': ShoppingBagCheckIcon,
  shopee: ShoppingBag01Icon,
  settings: Settings01Icon,
  users: UserGroupIcon,
  health: Activity01Icon,
  admin: Shield01Icon,
}

const ScanPage = lazy(() => import('./pages/ScanPage').then((module) => ({ default: module.ScanPage })))
const HistoryPage = lazy(() => import('./pages/HistoryPage').then((module) => ({ default: module.HistoryPage })))
const PackingSessionsPage = lazy(() => import('./pages/PackingSessionsPage').then((module) => ({ default: module.PackingSessionsPage })))
const PackingSessionDetailPage = lazy(() => import('./pages/PackingSessionDetailPage').then((module) => ({ default: module.PackingSessionDetailPage })))
const ShopeePage = lazy(() => import('./pages/ShopeePage').then((module) => ({ default: module.ShopeePage })))
const ShopeeInspectionPage = lazy(() => import('./pages/ShopeeInspectionPage').then((module) => ({ default: module.ShopeeInspectionPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })))
const UsersPage = lazy(() => import('./pages/UsersPage').then((module) => ({ default: module.UsersPage })))
const HealthPage = lazy(() => import('./pages/HealthPage').then((module) => ({ default: module.HealthPage })))
const AdminPage = lazy(() => import('./pages/AdminPage').then((module) => ({ default: module.AdminPage })))

const PAGE_COMPONENTS: Record<PageId, ReactElement> = {
  scan: <ScanPage />,
  history: <HistoryPage />,
  'packing-sessions': <PackingSessionsPage />,
  'packing-session-detail': <PackingSessionDetailPage />,
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
  const routeState = useRouteState()
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
    () => {
      if (activePage === 'packing-session-detail') return NAV_ITEMS.find((item) => item.id === 'packing-sessions') ?? NAV_ITEMS[0]
      return NAV_ITEMS.find((item) => item.id === activePage) ?? NAV_ITEMS[0]
    },
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
  }, [activePage, activeItem.label, isAdmin, routeState.packingSessionId])

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
        : activePage === 'packing-session-detail'
          ? `Detail Sesi ${routeState.packingSessionId ? routeState.packingSessionId.slice(0, 8) : ''}`
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
                    {section.items.map((item) => {
                      const isActive = item.id === activePage || (item.id === 'packing-sessions' && activePage === 'packing-session-detail')
                      return (
                      <li key={item.id}>
                        <a
                          href={getPagePath(item.id)}
                          className={isActive ? 'nav-tab active' : 'nav-tab'}
                          onClick={(event) => {
                            event.preventDefault()
                            navigateTo(item.id)
                            setIsMobileSidebarOpen(false)
                          }}
                          aria-current={isActive ? 'page' : undefined}
                        >
                          <span className="nav-tab__icon" aria-hidden="true">
                            <HugeiconsIcon icon={PAGE_ICONS[item.id]} size={18} strokeWidth={1.9} />
                          </span>
                          <span className="nav-tab__text">
                            <span className="nav-tab__label">{item.label}</span>
                            <span className="nav-tab__hint">{item.hint}</span>
                          </span>
                        </a>
                      </li>
                    )})}
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
                  setIsMobileSidebarOpen(false)
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
                <span className="sidebar-session__logout" aria-hidden="true">
                  <HugeiconsIcon icon={ArrowRightFromLineIcon} size={14} strokeWidth={1.9} />
                </span>
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

          <main className={activePage === 'users' || activePage === 'settings' || activePage === 'health' || activePage === 'admin' || activePage === 'shopee' || activePage === 'shopee-inspection' || activePage === 'packing-sessions' || activePage === 'packing-session-detail' || activePage === 'history' || activePage === 'scan' ? 'dashboard-content dashboard-content--notion' : 'dashboard-content'}>
            <Suspense fallback={<PageLoadingPanel />}>{pageContent}</Suspense>
          </main>
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

function PageLoadingPanel() {
  return (
    <div className="access-denied">
      <Card className="access-denied__card border-slate-200/80 shadow-xl shadow-slate-900/5">
        <CardContent className="grid gap-2 pt-6">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Loading</p>
          <p className="text-sm leading-6 text-slate-500">Memuat halaman...</p>
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


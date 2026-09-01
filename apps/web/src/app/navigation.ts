export type PageId = 'scan' | 'history' | 'packing-sessions' | 'packing-session-detail' | 'shopee' | 'shopee-inspection' | 'settings' | 'users' | 'health' | 'admin'
export type NavGroupId = 'operasional' | 'administrasi'

export const PAGE_PATHS: Record<PageId, string> = {
  scan: '/scan',
  history: '/history',
  'packing-sessions': '/packing-sessions',
  'packing-session-detail': '/packing-sessions/:id',
  shopee: '/shopee',
  'shopee-inspection': '/shopee-inspection',
  settings: '/settings',
  users: '/users',
  health: '/health',
  admin: '/admin',
}

export function getPagePath(page: PageId) {
  if (page === 'packing-session-detail') return '/packing-sessions'
  return PAGE_PATHS[page]
}

export function getPackingSessionDetailPath(id: string) {
  return `/packing-sessions/${encodeURIComponent(id)}`
}

export function getHistorySessionPath(sessionId: string) {
  return `/history?session=${encodeURIComponent(sessionId)}`
}

export function getPackingSessionIdFromPath(pathname: string): string | null {
  const normalized = pathname.replace(/\/+$/, '') || '/'
  const match = normalized.match(/^\/packing-sessions\/([^/]+)$/)
  if (!match?.[1]) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

export function getPageFromPath(pathname: string): PageId {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/'

  if (normalizedPath === '/') {
    return 'scan'
  }

  if (/^\/packing-sessions\/[^/]+$/.test(normalizedPath)) {
    return 'packing-session-detail'
  }

  const match = Object.entries(PAGE_PATHS).find(([, path]) => path === normalizedPath)
  return match?.[0] as PageId | undefined ?? 'scan'
}

export const NAV_ITEMS: Array<{
  id: PageId
  label: string
  hint: string
  icon: 'scan' | 'history' | 'settings' | 'users' | 'health' | 'admin'
  group: NavGroupId
}> = [
  {
    id: 'scan',
    label: 'Scan',
    hint: 'Pintu masuk operator',
    icon: 'scan',
    group: 'operasional',
  },
  {
    id: 'history',
    label: 'History',
    hint: 'Riwayat dokumentasi',
    icon: 'history',
    group: 'operasional',
  },
  {
    id: 'packing-sessions',
    label: 'Sesi Packing',
    hint: 'Riwayat sesi & payroll',
    icon: 'history',
    group: 'operasional',
  },
  {
    id: 'shopee',
    label: 'Shopee',
    hint: 'Auto chat & order sync',
    icon: 'admin',
    group: 'administrasi',
  },
  {
    id: 'shopee-inspection',
    label: 'Hasil Shopee',
    hint: 'Hasil grep/inspek',
    icon: 'history',
    group: 'operasional',
  },
  {
    id: 'users',
    label: 'Users',
    hint: 'Kelola operator',
    icon: 'users',
    group: 'administrasi',
  },
  {
    id: 'settings',
    label: 'Settings',
    hint: 'Konfigurasi dasar',
    icon: 'settings',
    group: 'administrasi',
  },
  {
    id: 'health',
    label: 'Health',
    hint: 'Diagnosa runtime',
    icon: 'health',
    group: 'administrasi',
  },
  {
    id: 'admin',
    label: 'Admin',
    hint: 'Audit server',
    icon: 'admin',
    group: 'administrasi',
  },
]

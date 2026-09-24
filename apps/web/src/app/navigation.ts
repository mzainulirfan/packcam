export type PageId = 'scan' | 'history' | 'operasional' | 'packing-sessions' | 'packing-session-detail' | 'packing-payments' | 'shopee' | 'shopee-inspection' | 'settings' | 'users' | 'health' | 'admin'
export type NavGroupId = 'operasional' | 'packing' | 'shopee' | 'administrasi' | 'system'

export const NAV_GROUPS: Array<{ id: NavGroupId; label: string }> = [
  { id: 'operasional', label: 'Operasional' },
  { id: 'packing', label: 'Packing & Upah' },
  { id: 'shopee', label: 'Shopee' },
  { id: 'administrasi', label: 'Administrasi' },
  { id: 'system', label: 'System' },
]

export const PAGE_PATHS: Record<PageId, string> = {
  scan: '/scan',
  history: '/history',
  operasional: '/operasional',
  'packing-sessions': '/packing-sessions',
  'packing-session-detail': '/packing-sessions/:id',
  'packing-payments': '/packing-payments',
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
  group: NavGroupId
}> = [
  {
    id: 'scan',
    label: 'Scan',
    hint: 'Scan resi & rekam',
    group: 'operasional',
  },
  {
    id: 'history',
    label: 'History',
    hint: 'Arsip dokumentasi',
    group: 'operasional',
  },
  {
    id: 'operasional',
    label: 'Dashboard',
    hint: 'Ringkasan harian',
    group: 'operasional',
  },
  {
    id: 'packing-sessions',
    label: 'Sesi Packing',
    hint: 'Sesi kerja & upah',
    group: 'packing',
  },
  {
    id: 'packing-payments',
    label: 'Riwayat Bayar',
    hint: 'Arsip pembayaran upah',
    group: 'packing',
  },
  {
    id: 'shopee',
    label: 'Shopee',
    hint: 'Order sync & auto chat',
    group: 'shopee',
  },
  {
    id: 'shopee-inspection',
    label: 'Hasil Shopee',
    hint: 'Verifikasi order tersync',
    group: 'shopee',
  },
  {
    id: 'users',
    label: 'Users',
    hint: 'Kelola operator',
    group: 'administrasi',
  },
  {
    id: 'settings',
    label: 'Settings',
    hint: 'Konfigurasi dasar',
    group: 'administrasi',
  },
  {
    id: 'health',
    label: 'Health',
    hint: 'Diagnosa runtime',
    group: 'system',
  },
  {
    id: 'admin',
    label: 'Admin',
    hint: 'Audit server',
    group: 'system',
  },
]

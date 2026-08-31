export type PageId = 'scan' | 'history' | 'packing-sessions' | 'shopee' | 'shopee-inspection' | 'settings' | 'users' | 'health' | 'admin'
export type NavGroupId = 'operasional' | 'administrasi'

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

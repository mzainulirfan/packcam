export type PageId = 'scan' | 'history' | 'settings' | 'users' | 'health'
export type NavGroupId = 'operasional' | 'administrasi'

export const NAV_ITEMS: Array<{
  id: PageId
  label: string
  hint: string
  icon: 'scan' | 'history' | 'settings' | 'users' | 'health'
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
    hint: 'Riwayat rekaman',
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
]

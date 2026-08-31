import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowDown01Icon,
  Cancel01Icon,
  Edit02Icon,
  Key01Icon,
  MoreHorizontalIcon,
  RefreshIcon,
  Search01Icon,
  ShieldUserIcon,
  Task01Icon,
  UserAdd01Icon,
  UserCircleIcon,
  UserGroupIcon,
  UserMultiple02Icon,
} from '@hugeicons/core-free-icons'
import { removeOperatorProfile, updateOperatorPassword, upsertOperatorProfile, useOperatorProfiles, useOperatorSession } from '../app/operatorSession'
import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Dialog, DialogContent } from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { notify } from '../app/notify'
import type { OperatorProfile, OperatorRole, WorkTask } from '@pakti/types'

const ROLE_OPTIONS: Array<{ value: OperatorRole; label: string }> = [
  { value: 'operator', label: 'Operator' },
  { value: 'admin', label: 'Admin' },
]

const TASK_OPTIONS: Array<{ value: WorkTask; label: string; description: string }> = [
  { value: 'qc', label: 'QC', description: 'Wajib QC lebih dulu.' },
  { value: 'packing', label: 'Packing', description: 'Task ini hanya aktif setelah QC selesai.' },
]

type FormMode = 'create' | 'edit' | null
type MessageTone = 'info' | 'error'
type DialogState = 'form' | 'reset' | 'delete' | 'confirm-save' | null
type UserRoleFilter = 'all' | OperatorRole
type UserTaskFilter = 'all' | WorkTask

type PendingSaveAction = {
  name: string
  code: string
  role: OperatorRole
  taskType: WorkTask
  fullNameValue: string
  isEditMode: boolean
  sourceProfile: OperatorProfile | null
}

type UserFilterState = {
  searchText: string
  roleFilter: UserRoleFilter
  taskFilter: UserTaskFilter
}

const USERS_FILTERS_KEY = 'pakti.usersFilters'
const DEFAULT_NEW_USER_PASSWORD = 'user123'

const defaultUserFilterState: UserFilterState = {
  searchText: '',
  roleFilter: 'all',
  taskFilter: 'all',
}

function readStoredUserFilters(): UserFilterState {
  if (typeof window === 'undefined') return defaultUserFilterState
  const raw = window.sessionStorage.getItem(USERS_FILTERS_KEY)
  if (!raw) return defaultUserFilterState
  try {
    const parsed = JSON.parse(raw) as Partial<UserFilterState>
    return {
      searchText: typeof parsed.searchText === 'string' ? parsed.searchText : '',
      roleFilter: parsed.roleFilter === 'admin' || parsed.roleFilter === 'operator' ? parsed.roleFilter : 'all',
      taskFilter: parsed.taskFilter === 'qc' || parsed.taskFilter === 'packing' ? parsed.taskFilter : 'all',
    }
  } catch {
    return defaultUserFilterState
  }
}

function writeStoredUserFilters(filters: UserFilterState) {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(USERS_FILTERS_KEY, JSON.stringify(filters))
}

export function UsersPage() {
  const operatorSession = useOperatorSession()
  const operatorProfiles = useOperatorProfiles()
  const initialFilters = useMemo(() => readStoredUserFilters(), [])
  const [searchText, setSearchText] = useState(initialFilters.searchText)
  const [roleFilter, setRoleFilter] = useState<UserRoleFilter>(initialFilters.roleFilter)
  const [taskFilter, setTaskFilter] = useState<UserTaskFilter>(initialFilters.taskFilter)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [dialogState, setDialogState] = useState<DialogState>(null)
  const [formMode, setFormMode] = useState<FormMode>(null)
  const [formSourceProfile, setFormSourceProfile] = useState<OperatorProfile | null>(null)
  const [fullName, setFullName] = useState('')
  const [operatorName, setOperatorName] = useState('')
  const [operatorCode, setOperatorCode] = useState('')
  const [operatorRole, setOperatorRole] = useState<OperatorRole>('operator')
  const [operatorTaskType, setOperatorTaskType] = useState<WorkTask>('qc')
  const [message, setMessage] = useState('Kelola akun operator dari sini.')
  const [messageTone, setMessageTone] = useState<MessageTone>('info')
  const [resetTarget, setResetTarget] = useState<OperatorProfile | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('')
  const [resetShowPassword, setResetShowPassword] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<OperatorProfile | null>(null)
  const [pendingSaveAction, setPendingSaveAction] = useState<PendingSaveAction | null>(null)
  const shouldShowStatusAlert = messageTone === 'error' || message.includes('sudah dipakai') || message.includes('wajib') || message.includes('Minimal satu akun admin')

  useEffect(() => {
    writeStoredUserFilters({ searchText, roleFilter, taskFilter })
  }, [roleFilter, searchText, taskFilter])

  const filteredProfiles = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase()
    return operatorProfiles.filter((profile) => {
      const matchesRole = roleFilter === 'all' || profile.role === roleFilter
      const matchesTask = taskFilter === 'all' || profile.taskType === taskFilter
      const matchesSearch =
        !normalizedSearch ||
        (profile.fullName ?? '').toLowerCase().includes(normalizedSearch) ||
        profile.operatorName.toLowerCase().includes(normalizedSearch) ||
        profile.operatorCode.toLowerCase().includes(normalizedSearch) ||
        profile.role.toLowerCase().includes(normalizedSearch) ||
        profile.taskType.toLowerCase().includes(normalizedSearch)
      return matchesSearch && matchesRole && matchesTask
    })
  }, [operatorProfiles, roleFilter, searchText, taskFilter])

  const totalAdmins = operatorProfiles.filter((profile) => profile.role === 'admin').length
  const totalOperators = operatorProfiles.filter((profile) => profile.role === 'operator').length
  const nextCreateCode = useMemo(() => generateNextOperatorCode(operatorProfiles), [operatorProfiles])
  const hasActiveFilters = Boolean(searchText.trim()) || roleFilter !== 'all' || taskFilter !== 'all'
  const currentSessionKey = operatorSession ? profileKey({ operatorName: operatorSession.operatorName, operatorCode: operatorSession.operatorCode, role: operatorSession.role }) : null

  const nameConflict = useMemo(() => {
    const normalizedName = operatorName.trim().toLowerCase()
    if (!normalizedName) return null
    const sourceKey = formSourceProfile ? profileKey(formSourceProfile) : null
    return operatorProfiles.find((profile) => profile.operatorName.trim().toLowerCase() === normalizedName && profileKey(profile) !== sourceKey) ?? null
  }, [formSourceProfile, operatorName, operatorProfiles])

  const codeConflict = useMemo(() => {
    const normalizedCode = operatorCode.trim().toLowerCase()
    if (!normalizedCode) return null
    const sourceKey = formSourceProfile ? profileKey(formSourceProfile) : null
    return operatorProfiles.find((profile) => profile.operatorCode.trim().toLowerCase() === normalizedCode && profileKey(profile) !== sourceKey) ?? null
  }, [formSourceProfile, operatorCode, operatorProfiles])

  const nameFieldHelp = useMemo(() => {
    if (!operatorName.trim()) return 'Username wajib diisi.'
    if (/\s/.test(operatorName)) return 'Username tidak boleh mengandung spasi.'
    if (nameConflict) return `Username "${nameConflict.operatorName}" sudah dipakai user lain.`
    return 'Username tersedia.'
  }, [nameConflict, operatorName])

  const codeFieldHelp = useMemo(() => {
    if (!operatorCode.trim()) return 'Kode user wajib diisi.'
    if (codeConflict) return `Kode "${codeConflict.operatorCode}" sudah dipakai user lain.`
    return 'Kode user tersedia.'
  }, [codeConflict, operatorCode])

  const isEditingCurrentSession = useMemo(() => {
    if (!operatorSession || !formSourceProfile) return false
    return profileKey(formSourceProfile) === currentSessionKey
  }, [currentSessionKey, formSourceProfile, operatorSession])

  function openCreateModal() {
    setDialogState('form')
    setFormMode('create')
    setFormSourceProfile(null)
    setFullName('')
    setOperatorName('')
    setOperatorRole('operator')
    setOperatorTaskType('qc')
    setOperatorCode(nextCreateCode)
    setSelectedKey(null)
    setMessageTone('info')
    setMessage('Lengkapi data untuk menambah operator baru.')
  }

  function openEditModal(profile: OperatorProfile) {
    setDialogState('form')
    setFormMode('edit')
    setFormSourceProfile(profile)
    setFullName(profile.fullName ?? '')
    setOperatorName(profile.operatorName)
    setOperatorCode(profile.operatorCode)
    setOperatorRole(profile.role)
    setOperatorTaskType(profile.taskType)
    setSelectedKey(profileKey(profile))
    setMessageTone('info')
    setMessage(`Edit profil ${profile.operatorName}.`)
  }

  function closeFormModal() {
    setDialogState(null)
    setFormMode(null)
    setFormSourceProfile(null)
    setFullName('')
    setOperatorName('')
    setOperatorCode('')
    setOperatorRole('operator')
    setOperatorTaskType('qc')
    setPendingSaveAction(null)
  }

  function closeConfirmSaveModal() {
    setDialogState('form')
    setPendingSaveAction(null)
  }

  function clearFilters() {
    setSearchText(defaultUserFilterState.searchText)
    setRoleFilter(defaultUserFilterState.roleFilter)
    setTaskFilter(defaultUserFilterState.taskFilter)
    setMessageTone('info')
    setMessage('Filter dibersihkan.')
  }

  function openResetModal(profile: OperatorProfile) {
    setDialogState('reset')
    setResetTarget(profile)
    setResetPassword('')
    setResetPasswordConfirm('')
    setResetShowPassword(false)
    setMessageTone('info')
    setMessage(`Reset kata sandi untuk ${profile.operatorName}.`)
  }

  function openDeleteModal(profile: OperatorProfile) {
    if (profileKey(profile) === currentSessionKey) {
      setMessageTone('error')
      setMessage('Akun yang sedang aktif tidak boleh dihapus dari sesi ini.')
      return
    }
    if (isLastAdminProfile(profile, operatorProfiles)) {
      setMessageTone('error')
      setMessage('Minimal satu akun admin harus tetap ada.')
      return
    }
    setDialogState('delete')
    setDeleteTarget(profile)
    setMessageTone('info')
    setMessage(`Hapus profil ${profile.operatorName}.`)
  }

  async function commitSaveAction(action: PendingSaveAction) {
    const { name, code, role, taskType, fullNameValue, isEditMode, sourceProfile } = action
    const sourceKey = sourceProfile ? profileKey(sourceProfile) : null
    if (!name) {
      setMessageTone('error')
      setMessage('Username wajib diisi.')
      return
    }
    if (/\s/.test(name)) {
      setMessageTone('error')
      setMessage('Username tidak boleh mengandung spasi.')
      return
    }
    if (nameConflict && profileKey(nameConflict) !== sourceKey) {
      setMessageTone('error')
      setMessage(`Nama "${nameConflict.operatorName}" sudah dipakai user lain.`)
      return
    }
    if (!fullNameValue) {
      setMessageTone('error')
      setMessage('Nama lengkap wajib diisi.')
      return
    }
    if (isEditMode && sourceProfile && isLastAdminProfile(sourceProfile, operatorProfiles) && role !== 'admin') {
      setMessageTone('error')
      setMessage('Minimal satu akun admin harus tetap ada.')
      return
    }
    try {
      const savedProfile = await upsertOperatorProfile(name, code, taskType, isEditMode, isEditMode ? undefined : DEFAULT_NEW_USER_PASSWORD, fullNameValue, role, sourceProfile)
      setSelectedKey(profileKey(savedProfile))
      setMessage(`Profil ${savedProfile.operatorName} tersimpan di server.`)
      setMessageTone('info')
      notify.save('Profil tersimpan', `${savedProfile.operatorName} berhasil disimpan ke server.`)
      closeFormModal()
      setPendingSaveAction(null)
    } catch (error) {
      setMessageTone('error')
      const errorMessage = error instanceof Error ? error.message : 'Gagal menyimpan profil.'
      setMessage(errorMessage)
      notify.error('Gagal menyimpan profil', errorMessage)
    }
  }

  async function handleSaveForm() {
    const name = operatorName.trim()
    const isEditMode = formMode === 'edit'
    const fullNameValue = fullName.trim()
    const code = isEditMode ? operatorCode.trim() : generateNextOperatorCode(operatorProfiles)
    const role = operatorRole
    const taskType = operatorTaskType
    const sourceKey = formSourceProfile ? profileKey(formSourceProfile) : null
    if (!name) {
      setMessageTone('error')
      setMessage('Username wajib diisi.')
      return
    }
    if (/\s/.test(name)) {
      setMessageTone('error')
      setMessage('Username tidak boleh mengandung spasi.')
      return
    }
    if (nameConflict && profileKey(nameConflict) !== sourceKey) {
      setMessageTone('error')
      setMessage(`Nama "${nameConflict.operatorName}" sudah dipakai user lain.`)
      return
    }
    if (!fullNameValue) {
      setMessageTone('error')
      setMessage('Nama lengkap wajib diisi.')
      return
    }
    if (isEditMode && formSourceProfile && isLastAdminProfile(formSourceProfile, operatorProfiles) && operatorRole !== 'admin') {
      setMessageTone('error')
      setMessage('Minimal satu akun admin harus tetap ada.')
      return
    }
    if (isEditMode && formSourceProfile && ((operatorRole === 'admin' && formSourceProfile.role !== 'admin') || isEditingCurrentSession)) {
      setPendingSaveAction({ name, code, role, taskType, fullNameValue, isEditMode, sourceProfile: formSourceProfile })
      setDialogState('confirm-save')
      return
    }
    await commitSaveAction({ name, code, role, taskType, fullNameValue, isEditMode, sourceProfile: formSourceProfile })
  }

  async function handleDeleteProfile(profile: OperatorProfile) {
    try {
      await removeOperatorProfile(profile.operatorName, profile.operatorCode, profile.role)
      if (selectedKey === profileKey(profile)) setSelectedKey(null)
      if (formSourceProfile && profileKey(formSourceProfile) === profileKey(profile)) closeFormModal()
      setMessage(`Profil ${profile.operatorName} dihapus dari server.`)
      setMessageTone('info')
      notify.save('Profil dihapus', `${profile.operatorName} berhasil dihapus dari server.`)
      setDeleteTarget(null)
      setDialogState(null)
    } catch (error) {
      setMessageTone('error')
      const errorMessage = error instanceof Error ? error.message : 'Gagal menghapus profil.'
      setMessage(errorMessage)
      notify.error('Gagal menghapus profil', errorMessage)
    }
  }

  async function handleResetPassword() {
    if (!resetTarget) return
    const password = resetPassword.trim()
    const passwordConfirm = resetPasswordConfirm.trim()
    if (!password || !passwordConfirm) {
      setMessageTone('error')
      setMessage('Kata sandi baru dan konfirmasi wajib diisi.')
      return
    }
    if (password !== passwordConfirm) {
      setMessageTone('error')
      setMessage('Konfirmasi kata sandi tidak cocok.')
      return
    }
    setIsResetting(true)
    try {
      await updateOperatorPassword(resetTarget.operatorName, resetTarget.operatorCode, password, resetTarget.role)
      setMessage(`Kata sandi ${resetTarget.operatorName} direset di server.`)
      setMessageTone('info')
      notify.reset('Password direset', `Kata sandi ${resetTarget.operatorName} berhasil direset.`)
      setResetTarget(null)
      setDialogState(null)
      setResetPassword('')
      setResetPasswordConfirm('')
    } catch (error) {
      setMessageTone('error')
      const errorMessage = error instanceof Error ? error.message : 'Gagal reset kata sandi.'
      setMessage(errorMessage)
      notify.error('Gagal reset password', errorMessage)
    } finally {
      setIsResetting(false)
    }
  }

  return (
    <div className="users-page mx-auto max-w-[1240px] bg-[#f6f5f4] px-4 py-8 font-['Inter'] sm:px-6 lg:py-10 xl:px-8">
      <section className="mb-7 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="font-['Inter'] text-[12px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Administrasi / Users</div>
          <h1 className="mt-2 font-['Inter'] text-[32px] font-bold leading-[1.1] tracking-[-0.8px] text-[#000000] sm:text-[36px]">Kelola pengguna</h1>
          <p className="mt-3 max-w-2xl font-['Inter'] text-[14px] leading-6 text-[#615d59] sm:text-[15px]">Tambah akun, atur role dan tugas, reset password, atau nonaktifkan akses operator dari satu tempat.</p>
        </div>
        <Button type="button" onClick={openCreateModal} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[#0075de] px-5 font-['Inter'] text-[14px] font-medium text-white shadow-[0_1px_2px_rgba(0,0,0,0.03),0_8px_24px_rgba(0,0,0,0.035)] hover:bg-[#005bab] active:scale-[0.98]">
          <HugeiconsIcon icon={UserAdd01Icon} size={18} strokeWidth={1.9} /> Tambah user
        </Button>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl border border-[#e6e6e6] bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Total user</div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-['Inter'] text-[28px] font-bold leading-none tracking-[-0.5px] text-[#000000]">{operatorProfiles.length}</span>
                <span className="font-['Inter'] text-[13px] text-[#615d59]">akun</span>
              </div>
            </div>
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#f6f5f4] text-[#31302e]">
              <HugeiconsIcon icon={UserGroupIcon} size={19} strokeWidth={1.9} />
            </span>
          </div>
        </article>
        <article className="rounded-xl border border-[#e6e6e6] bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Admin</div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-['Inter'] text-[28px] font-bold leading-none tracking-[-0.5px] text-[#000000]">{totalAdmins}</span>
                <span className="font-['Inter'] text-[13px] text-[#615d59]">akun</span>
              </div>
            </div>
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#f6f5f4] text-[#31302e]">
              <HugeiconsIcon icon={ShieldUserIcon} size={19} strokeWidth={1.9} />
            </span>
          </div>
        </article>
        <article className="rounded-xl border border-[#e6e6e6] bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Operator</div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-['Inter'] text-[28px] font-bold leading-none tracking-[-0.5px] text-[#000000]">{totalOperators}</span>
                <span className="font-['Inter'] text-[13px] text-[#615d59]">akun</span>
              </div>
            </div>
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#f6f5f4] text-[#31302e]">
              <HugeiconsIcon icon={UserMultiple02Icon} size={19} strokeWidth={1.9} />
            </span>
          </div>
        </article>
      </section>

      <section className="mt-5 overflow-hidden rounded-xl border border-[#e6e6e6] bg-white">
        <div className="border-b border-[#e6e6e6] p-4 sm:p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <label className="relative flex flex-1 min-w-[240px]">
              <span className="pointer-events-none absolute inset-y-0 left-0 grid w-10 place-items-center text-[#a39e98]">
                <HugeiconsIcon icon={Search01Icon} size={18} strokeWidth={1.9} />
              </span>
              <Input id="users-search" value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Cari nama, username, atau kode..." className="h-10 w-full rounded-[8px] border-[#e6e6e6] bg-white pl-10 pr-3 font-['Inter'] text-[14px] placeholder:text-[#a39e98] focus-visible:border-[#CFCBC7] focus-visible:ring-0" aria-label="Cari user" />
            </label>
            <div className="flex flex-wrap gap-2">
              <label className="relative inline-flex h-10 items-center rounded-lg border border-[#e6e6e6] bg-[#f6f5f4] text-[#000000]">
                <span className="pointer-events-none absolute left-3 grid place-items-center text-[#31302e]">
                  <HugeiconsIcon icon={UserCircleIcon} size={17} strokeWidth={1.9} />
                </span>
                <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as UserRoleFilter)} className="h-full appearance-none rounded-lg bg-transparent pl-9 pr-8 font-['Inter'] text-[13px] font-medium focus:outline-none focus:ring-0">
                  <option value="all">Semua role</option>
                  <option value="admin">Admin</option>
                  <option value="operator">Operator</option>
                </select>
                <span className="pointer-events-none absolute right-3 grid place-items-center text-[#a39e98]">
                  <HugeiconsIcon icon={ArrowDown01Icon} size={15} strokeWidth={1.9} />
                </span>
              </label>
              <label className="relative inline-flex h-10 items-center rounded-lg border border-[#e6e6e6] bg-white text-[#000000]">
                <span className="pointer-events-none absolute left-3 grid place-items-center text-[#31302e]">
                  <HugeiconsIcon icon={Task01Icon} size={17} strokeWidth={1.9} />
                </span>
                <select value={taskFilter} onChange={(e) => setTaskFilter(e.target.value as UserTaskFilter)} className="h-full appearance-none rounded-lg bg-transparent pl-9 pr-8 font-['Inter'] text-[13px] font-medium focus:outline-none focus:ring-0">
                  <option value="all">Semua tugas</option>
                  <option value="qc">QC</option>
                  <option value="packing">Packing</option>
                </select>
                <span className="pointer-events-none absolute right-3 grid place-items-center text-[#a39e98]">
                  <HugeiconsIcon icon={ArrowDown01Icon} size={15} strokeWidth={1.9} />
                </span>
              </label>
              <Button type="button" variant="ghost" onClick={clearFilters} disabled={!hasActiveFilters} className="h-10 inline-flex items-center gap-2 rounded-lg px-3 font-['Inter'] text-[13px] font-medium text-[#615d59] hover:bg-[#f6f5f4] disabled:opacity-40">
                <HugeiconsIcon icon={RefreshIcon} size={16} strokeWidth={1.9} /> Reset
              </Button>
            </div>
          </div>
          {shouldShowStatusAlert ? (
            <Alert variant={messageTone === 'error' ? 'destructive' : 'default'} className="mt-3 rounded-[8px] border-[#e6e6e6] bg-[#f6f5f4] font-['Inter'] text-[14px]">
              <p className="font-semibold text-[#000000]">{messageTone === 'error' ? 'Perlu perhatian' : 'Status'}</p>
              <p className="text-[#31302e]">{message}</p>
            </Alert>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
          <div>
            <h2 className="font-['Inter'] text-[16px] font-semibold text-[#000000]">Daftar pengguna</h2>
            <p className="mt-1 font-['Inter'] text-[12px] text-[#a39e98]">Klik nama untuk melihat atau mengubah detail akun.</p>
          </div>
          <span className="inline-flex items-center rounded-full border border-[#e6e6e6] bg-white px-2.5 py-1 font-['Inter'] text-[11px] font-semibold text-[#0075de]">{filteredProfiles.length} hasil</span>
        </div>

        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[900px] border-collapse">
            <thead className="bg-[#f6f5f4]">
              <tr className="text-left">
                <Th className="px-5 font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Pengguna</Th>
                <Th className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Kode</Th>
                <Th className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Role</Th>
                <Th className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Tugas</Th>
                <Th className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Terakhir aktif</Th>
                <Th className="px-5 text-right font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Aksi</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e6e6e6]">
              {filteredProfiles.length ? (
                filteredProfiles.map((profile) => {
                  const key = profileKey(profile)
                  return (
                    <tr key={key} className={`bg-white transition-colors hover:bg-[#fbfaf9] ${selectedKey === key ? 'bg-[#f6f5f4]' : ''}`}>
                      <Td className="px-5 py-4">
                        <button type="button" onClick={() => openEditModal(profile)} className="group flex items-center gap-3 text-left">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-black text-[12px] font-semibold text-white">{getInitials(profile.fullName ?? profile.operatorName)}</span>
                          <span className="min-w-0 text-left">
                            <span className="block font-['Inter'] text-[14px] font-medium text-[#000000] underline-offset-2 group-hover:underline">{profile.fullName ?? profile.operatorName}</span>
                            <span className="mt-0.5 block font-['Inter'] text-[12px] text-[#a39e98]">@{profile.operatorName}</span>
                          </span>
                        </button>
                      </Td>
                      <Td className="py-4 font-['Inter'] text-[13px] text-[#615d59]">{profile.operatorCode}</Td>
                      <Td>
                        <span className={`inline-flex rounded-[5px] border px-2 py-1 font-['Inter'] text-[12px] font-medium ${profile.role === 'admin' ? 'border-[#e6e6e6] bg-white text-[#000000]' : 'border-[#e6e6e6] bg-white text-[#615d59]'}`}>{profile.role === 'admin' ? 'Admin' : 'Operator'}</span>
                      </Td>
                      <Td>
                        <span className="inline-flex rounded-[5px] bg-[#f6f5f4] px-2 py-1 font-['Inter'] text-[12px] font-medium text-[#000000] ring-1 ring-[#e6e6e6]">{profile.taskType === 'qc' ? 'QC' : 'Packing'}</span>
                      </Td>
                      <Td>
                        <DateTimeCell value={profile.lastUsedAt} />
                      </Td>
                      <Td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-[#615d59] hover:bg-[#f6f5f4] hover:text-[#000000]" onClick={() => openEditModal(profile)} title="Edit user">
                            <HugeiconsIcon icon={Edit02Icon} size={18} strokeWidth={1.9} />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-[#615d59] hover:bg-[#f6f5f4] hover:text-[#000000]" onClick={() => openResetModal(profile)} title="Reset password">
                            <HugeiconsIcon icon={Key01Icon} size={18} strokeWidth={1.9} />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-[#615d59] hover:bg-[#f6f5f4] hover:text-[#000000]" onClick={() => openDeleteModal(profile)} title="Menu lainnya">
                            <HugeiconsIcon icon={MoreHorizontalIcon} size={18} strokeWidth={1.9} />
                          </Button>
                        </div>
                      </Td>
                    </tr>
                  )
                })
              ) : null}
            </tbody>
          </table>
        </div>

        {!filteredProfiles.length ? (
          <div className="border-t border-[#e6e6e6] px-6 py-14 text-center">
            <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-[#f6f5f4] text-[#615d59]">
              <HugeiconsIcon icon={Search01Icon} size={20} strokeWidth={1.9} />
            </div>
            <div className="mt-3 font-['Inter'] text-[14px] font-medium text-[#000000]">Pengguna tidak ditemukan</div>
            <div className="mt-1 font-['Inter'] text-[12px] text-[#a39e98]">Coba gunakan kata kunci yang berbeda.</div>
          </div>
        ) : null}
      </section>

      <p className="font-['Inter'] text-[12px] text-[#a39e98]">Catatan: hapus/nonaktifkan akun dipindahkan ke menu lanjutan untuk mengurangi risiko klik tidak sengaja.</p>

      <Dialog open={dialogState === 'form'} onOpenChange={(open) => !open && closeFormModal()}>
        <DialogContent showCloseButton={false} className="users-modal max-w-[520px] gap-0 overflow-hidden rounded-2xl border-[#e6e6e6] bg-white p-0 font-['Inter'] shadow-[0_10px_28px_rgba(0,0,0,0.08)]">
          <div className="border-b border-[#e6e6e6] p-6">
            <div className="flex items-start justify-between gap-5">
              <div className="grid gap-1">
                <h3 className="font-['Inter'] text-[20px] font-semibold tracking-[-0.2px] text-[#000000]">{formMode === 'edit' ? `Edit ${formSourceProfile?.operatorName ?? 'user'}` : 'Tambah user'}</h3>
                <p className="font-['Inter'] text-[13px] leading-5 text-[#615d59]">{formMode === 'edit' ? 'Perbarui data operator dengan hati-hati.' : 'Buat akun baru dan tentukan akses awalnya.'}</p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={closeFormModal} className="h-9 w-9 shrink-0 rounded-lg text-[#615d59] hover:bg-[#f6f5f4] hover:text-[#000000]" title="Tutup modal">
                <HugeiconsIcon icon={Cancel01Icon} size={19} strokeWidth={1.9} />
              </Button>
            </div>
          </div>
          <div className="max-h-[64vh] overflow-y-auto p-6">
            <div className="grid gap-4">
              {formMode === 'edit' && formSourceProfile && (
                <div className="rounded-[8px] border border-[#e6e6e6] bg-[#f6f5f4] px-3 py-3">
                  <p className="font-['Inter'] text-[13px] font-semibold text-[#000000]">{isEditingCurrentSession ? 'Akun aktif sedang diedit' : 'Mode edit aktif'}</p>
                  <p className="mt-1 font-['Inter'] text-[13px] leading-5 text-[#615d59]">{isEditingCurrentSession ? 'Akun ini sedang dipakai pada sesi login saat ini.' : `Perubahan akan diterapkan ke ${formatOperator(formSourceProfile.operatorName, formSourceProfile.operatorCode)}.`}</p>
                </div>
              )}
              <div className="grid gap-1.5">
                <Label className="font-['Inter'] text-[12px] font-medium text-[#000000]">Nama</Label>
                <Input id="user-fullname" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Contoh: Sani" className="h-10 rounded-[5px] border-[#e6e6e6] bg-white px-3 font-['Inter'] text-[14px] placeholder:text-[#a39e98] focus-visible:border-[#0075de] focus-visible:ring-0" />
                <p className="font-['Inter'] text-[12px] text-[#615d59]">Nama lengkap wajib diisi.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="user-username" className="font-['Inter'] text-[12px] font-medium text-[#000000]">Username</Label>
                  <Input id="user-username" value={operatorName} onChange={(e) => setOperatorName(e.target.value.replace(/\s+/g, ''))} placeholder="sani" readOnly={formMode === 'edit'} className={`h-10 rounded-[5px] border bg-white px-3 font-['Inter'] text-[14px] placeholder:text-[#a39e98] focus-visible:border-[#0075de] focus-visible:ring-0 ${nameConflict ? 'border-[#dd5b00] bg-[#fff7ed]' : 'border-[#e6e6e6]'}`} />
                  <p className={`font-['Inter'] text-[12px] ${nameConflict ? 'text-[#dd5b00]' : 'text-[#a39e98]'}`}>{nameFieldHelp}</p>
                </div>
                {formMode === 'edit' ? (
                  <div className="grid gap-1.5">
                    <Label htmlFor="user-code" className="font-['Inter'] text-[12px] font-medium text-[#000000]">Kode</Label>
                    <Input id="user-code" value={operatorCode} onChange={(e) => setOperatorCode(e.target.value)} placeholder="001" readOnly className={`h-10 rounded-[5px] border bg-white px-3 font-['Inter'] text-[14px] placeholder:text-[#a39e98] focus-visible:border-[#0075de] focus-visible:ring-0 ${codeConflict ? 'border-[#dd5b00] bg-[#fff7ed]' : 'border-[#e6e6e6]'}`} />
                    <p className={`font-['Inter'] text-[12px] ${codeConflict ? 'text-[#dd5b00]' : 'text-[#a39e98]'}`}>{codeFieldHelp}</p>
                  </div>
                ) : (
                  <div className="grid gap-1.5">
                    <Label className="font-['Inter'] text-[12px] font-medium text-[#000000]">Kode</Label>
                    <div className="flex h-10 items-center justify-between rounded-[5px] border border-[#e6e6e6] bg-[#f6f5f4] px-3 font-['Inter'] text-[14px]">
                      <span className="font-['Inter'] font-semibold text-[#000000]">{nextCreateCode}</span>
                      <span className="rounded-full bg-white px-2 py-0.5 font-['Inter'] text-[11px] font-medium text-[#615d59] ring-1 ring-[#e6e6e6]">pass: user123</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label className="font-['Inter'] text-[12px] font-medium text-[#000000]">Role</Label>
                  <select value={operatorRole} onChange={(e) => setOperatorRole(e.target.value as OperatorRole)} className="h-10 w-full rounded-[5px] border border-[#e6e6e6] bg-white px-3 font-['Inter'] text-[14px] focus:border-[#0075de] focus:outline-none">
                    {ROLE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="font-['Inter'] text-[12px] font-medium text-[#000000]">Tugas</Label>
                  <select value={operatorTaskType} onChange={(e) => setOperatorTaskType(e.target.value as WorkTask)} className="h-10 w-full rounded-[5px] border border-[#e6e6e6] bg-white px-3 font-['Inter'] text-[14px] focus:border-[#0075de] focus:outline-none">
                    {TASK_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-[#e6e6e6] bg-white p-4">
            <Button type="button" variant="ghost" onClick={closeFormModal} className="h-10 rounded-lg border border-[#e6e6e6] bg-white px-4 font-['Inter'] text-[13px] font-medium hover:bg-[#f6f5f4]">Batal</Button>
            <Button type="button" onClick={() => void handleSaveForm()} disabled={!!nameConflict || !!codeConflict || !fullName.trim() || !operatorName.trim()} className="h-10 rounded-full bg-[#0075de] px-5 font-['Inter'] text-[13px] font-medium text-white hover:bg-[#005bab] disabled:opacity-40">Simpan user</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogState === 'confirm-save' && !!pendingSaveAction} onOpenChange={(open) => !open && closeConfirmSaveModal()}>
        <DialogContent showCloseButton={false} className="users-modal max-w-md gap-0 overflow-hidden rounded-2xl border-[#e6e6e6] bg-white p-0 font-['Inter'] shadow-[0_10px_28px_rgba(0,0,0,0.08)]">
          <div className="border-b border-[#e6e6e6] p-6">
            <div className="flex items-start justify-between gap-5">
              <div className="grid gap-1">
                <h3 className="font-['Inter'] text-[18px] font-semibold text-[#000000]">{pendingSaveAction?.isEditMode ? `Simpan perubahan ${pendingSaveAction?.name}` : `Buat ${pendingSaveAction?.name}`}</h3>
                <p className="font-['Inter'] text-[13px] leading-5 text-[#615d59]">Lanjutkan hanya jika perubahan ini memang sudah benar.</p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={closeConfirmSaveModal} className="h-9 w-9 shrink-0 rounded-lg text-[#615d59] hover:bg-[#f6f5f4] hover:text-[#000000]" title="Tutup modal">
                <HugeiconsIcon icon={Cancel01Icon} size={19} strokeWidth={1.9} />
              </Button>
            </div>
          </div>
          <div className="grid gap-4 p-6">
            <div className="rounded-[8px] border border-[#e6e6e6] bg-[#f6f5f4] px-3 py-3">
              <p className="font-['Inter'] text-[13px] font-semibold text-[#000000]">Alasan konfirmasi</p>
              <p className="mt-1 font-['Inter'] text-[13px] leading-5 text-[#615d59]">{[isEditingCurrentSession ? 'Akun ini sedang dipakai pada sesi login aktif.' : null, pendingSaveAction?.role === 'admin' && pendingSaveAction?.sourceProfile?.role !== 'admin' ? `Perubahan ini akan mempromosikan ${pendingSaveAction?.sourceProfile?.operatorName ?? 'user'} menjadi admin.` : null].filter(Boolean).join(' ') || 'Tidak ada catatan khusus.'}</p>
            </div>
            <dl className="grid gap-2 rounded-[8px] border border-[#e6e6e6] bg-[#f6f5f4] p-3 font-['Inter'] text-[13px] md:grid-cols-2">
              <DetailRow label="Nama lengkap" value={pendingSaveAction?.fullNameValue} />
              <DetailRow label="Username" value={pendingSaveAction?.name} />
              <DetailRow label="Kode" value={pendingSaveAction?.code} />
              <DetailRow label="Role" value={pendingSaveAction?.role} />
              <DetailRow label="Tugas" value={pendingSaveAction?.taskType} />
            </dl>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-[#e6e6e6] bg-white p-4">
            <Button type="button" variant="ghost" onClick={closeConfirmSaveModal} className="h-9 rounded-full border border-[#e6e6e6] bg-white px-5 font-['Inter'] text-[13px]">Kembali</Button>
            <Button type="button" onClick={() => { if (!pendingSaveAction) return; void commitSaveAction(pendingSaveAction) }} className="h-9 rounded-full bg-[#0075de] px-6 font-['Inter'] text-[13px] font-medium text-white hover:bg-[#005bab]">Simpan sekarang</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogState === 'reset' && !!resetTarget} onOpenChange={(open) => !open && (setResetTarget(null), setDialogState(null))}>
        <DialogContent showCloseButton={false} className="users-modal max-w-[420px] gap-0 overflow-hidden rounded-2xl border-[#e6e6e6] bg-white p-0 font-['Inter'] shadow-[0_10px_28px_rgba(0,0,0,0.08)]">
          <div className="border-b border-[#e6e6e6] p-6">
            <div className="flex items-start justify-between gap-5">
              <div className="grid gap-1">
                <h3 className="font-['Inter'] text-[20px] font-semibold tracking-[-0.2px] text-[#000000]">Reset password</h3>
                <p className="font-['Inter'] text-[13px] leading-5 text-[#615d59]">{resetTarget ? `${formatOperator(resetTarget.operatorName, resetTarget.operatorCode)} · ${resetTarget.role}` : 'Atur ulang kata sandi'}</p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => (setResetTarget(null), setDialogState(null))} className="h-9 w-9 shrink-0 rounded-lg text-[#615d59] hover:bg-[#f6f5f4] hover:text-[#000000]" title="Tutup modal">
                <HugeiconsIcon icon={Cancel01Icon} size={19} strokeWidth={1.9} />
              </Button>
            </div>
          </div>
          <div className="grid gap-4 p-6">
            <div className="grid gap-1.5">
              <Label className="font-['Inter'] text-[12px] font-medium text-[#000000]">Password baru</Label>
              <div className="relative">
                <Input id="reset-password" type={resetShowPassword ? 'text' : 'password'} value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} placeholder="Password baru" className="h-10 rounded-[5px] border-[#e6e6e6] bg-white pr-20 font-['Inter'] text-[14px] focus-visible:border-[#0075de] focus-visible:ring-0" />
                <button type="button" onClick={() => setResetShowPassword((v) => !v)} className="absolute right-1 top-1/2 h-7 -translate-y-1/2 rounded-[6px] bg-white px-2 font-['Inter'] text-[12px] font-medium text-[#615d59] hover:bg-[#f6f5f4]">{resetShowPassword ? 'Sembunyi' : 'Lihat'}</button>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="font-['Inter'] text-[12px] font-medium text-[#000000]">Konfirmasi password</Label>
              <div className="relative">
                <Input id="reset-password-confirm" type={resetShowPassword ? 'text' : 'password'} value={resetPasswordConfirm} onChange={(e) => setResetPasswordConfirm(e.target.value)} placeholder="Ulangi password baru" className="h-10 rounded-[5px] border-[#e6e6e6] bg-white pr-20 font-['Inter'] text-[14px] focus-visible:border-[#0075de] focus-visible:ring-0" />
                <button type="button" onClick={() => setResetShowPassword((v) => !v)} className="absolute right-1 top-1/2 h-7 -translate-y-1/2 rounded-[6px] bg-white px-2 font-['Inter'] text-[12px] font-medium text-[#615d59] hover:bg-[#f6f5f4]">{resetShowPassword ? 'Sembunyi' : 'Lihat'}</button>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-[#e6e6e6] bg-white p-4">
            <Button type="button" variant="ghost" onClick={() => (setResetTarget(null), setDialogState(null))} disabled={isResetting} className="h-9 rounded-full border border-[#e6e6e6] bg-white px-5 font-['Inter'] text-[13px]">Batal</Button>
            <Button type="button" onClick={() => void handleResetPassword()} disabled={isResetting} className="h-9 rounded-full bg-[#0075de] px-6 font-['Inter'] text-[13px] font-medium text-white hover:bg-[#005bab] disabled:opacity-40">{isResetting ? 'Menyimpan...' : 'Simpan password'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogState === 'delete' && !!deleteTarget} onOpenChange={(open) => !open && (setDeleteTarget(null), setDialogState(null))}>
        <DialogContent showCloseButton={false} className="users-modal max-w-[420px] gap-0 overflow-hidden rounded-2xl border-[#e6e6e6] bg-white p-0 font-['Inter'] shadow-[0_10px_28px_rgba(0,0,0,0.08)]">
          <div className="border-b border-[#e6e6e6] p-6">
            <div className="flex items-start justify-between gap-5">
              <div className="grid gap-1">
                <h3 className="font-['Inter'] text-[18px] font-semibold text-[#000000]">Hapus user</h3>
                <p className="font-['Inter'] text-[13px] leading-5 text-[#615d59]">{deleteTarget ? `${deleteTarget.fullName ?? deleteTarget.operatorName} · ${deleteTarget.operatorCode} · ${deleteTarget.role}` : ''}</p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => (setDeleteTarget(null), setDialogState(null))} className="h-9 w-9 shrink-0 rounded-lg text-[#615d59] hover:bg-[#f6f5f4] hover:text-[#000000]" title="Tutup modal">
                <HugeiconsIcon icon={Cancel01Icon} size={19} strokeWidth={1.9} />
              </Button>
            </div>
          </div>
          <div className="p-6">
            <div className="rounded-[8px] border border-[#e6e6e6] bg-[#f6f5f4] px-3 py-3">
              <p className="font-['Inter'] text-[13px] font-semibold text-[#000000]">Konfirmasi hapus</p>
              <p className="mt-1 font-['Inter'] text-[13px] leading-5 text-[#615d59]">Data user ini akan dihapus dari daftar operator. Tindakan tidak bisa dibatalkan.</p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-[#e6e6e6] bg-white p-4">
            <Button type="button" variant="ghost" onClick={() => (setDeleteTarget(null), setDialogState(null))} className="h-9 rounded-full border border-[#e6e6e6] bg-white px-5 font-['Inter'] text-[13px]">Batal</Button>
            <Button type="button" onClick={() => deleteTarget && void handleDeleteProfile(deleteTarget)} className="h-9 rounded-full bg-black px-6 font-['Inter'] text-[13px] font-medium text-white hover:bg-[#31302e]">Hapus user</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Th({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <th className={`bg-[#f6f5f4] px-4 py-3 text-left font-['Inter'] ${className}`}>{children}</th>
}

function Td({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <td className={`bg-white px-4 py-3 align-top font-['Inter'] text-[14px] text-[#31302e] ${className}`}>{children}</td>
}

function DateTimeCell({ value, compact = false }: { value: string; compact?: boolean }) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return <span className="font-['Inter'] text-[#615d59]">{value}</span>
  const dateLabel = new Intl.DateTimeFormat('id-ID', { dateStyle: compact ? 'short' : 'medium' }).format(date)
  const timeLabel = new Intl.DateTimeFormat('id-ID', { timeStyle: 'short' }).format(date)
  if (compact) return <span className="font-['Inter'] text-[13px] text-[#615d59]">{dateLabel} · {timeLabel}</span>
  return (
    <div className="grid gap-0.5">
      <div className="font-['Inter'] text-[13px] font-medium text-[#000000]">{dateLabel}</div>
      <div className="font-['Inter'] text-[12px] text-[#a39e98]">{timeLabel}</div>
    </div>
  )
}

function getInitials(value: string) {
  const initials = value.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('')
  return initials || 'US'
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1 rounded-[8px] border border-[#e6e6e6] bg-[#f6f5f4] px-3 py-2.5">
      <dt className="font-['Inter'] text-[12px] font-medium text-[#615d59]">{label}</dt>
      <dd className="font-['Inter'] text-[13px] font-medium text-[#000000]">{value ?? '-'}</dd>
    </div>
  )
}

function profileKey(profile: Pick<OperatorProfile, 'operatorName' | 'operatorCode' | 'role'>) {
  return `${profile.operatorName.trim()}::${profile.operatorCode.trim()}::${profile.role}`
}

function generateNextOperatorCode(profiles: OperatorProfile[]) {
  const nextNumber = profiles.reduce((max, profile) => {
    const numeric = Number.parseInt(profile.operatorCode.trim(), 10)
    return Number.isFinite(numeric) ? Math.max(max, numeric) : max
  }, 0) + 1
  return String(nextNumber).padStart(3, '0')
}

function formatOperator(operatorName: string, operatorCode: string) {
  if (operatorName && operatorCode) return `${operatorName} (${operatorCode})`
  return operatorName || operatorCode || '-'
}

function isLastAdminProfile(profile: OperatorProfile, profiles: OperatorProfile[]) {
  return profile.role === 'admin' && profiles.filter((item) => item.role === 'admin').length <= 1
}

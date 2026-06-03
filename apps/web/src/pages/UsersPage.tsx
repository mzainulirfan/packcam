import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  BadgeCheck,
  Eye,
  EyeOff,
  LoaderCircle,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  Trash2,
  UserRoundCog,
  Users,
} from 'lucide-react'

import {
  removeOperatorProfile,
  updateOperatorPassword,
  upsertOperatorProfile,
  useOperatorProfiles,
  useOperatorSession,
} from '../app/operatorSession'
import { StageCard } from '../components/StageCard'
import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { ModalOverlay } from '../components/ui/ModalOverlay'
import { DialogCloseButton, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog'
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

const QUICK_FILTERS: Array<{
  id: string
  label: string
  apply: (current: UserFilterState) => UserFilterState
}> = [
  {
    id: 'all',
    label: 'Semua',
    apply: () => ({ ...defaultUserFilterState }),
  },
  {
    id: 'admin',
    label: 'Admin only',
    apply: (current) => ({ ...current, roleFilter: 'admin' }),
  },
  {
    id: 'operator',
    label: 'Operator only',
    apply: (current) => ({ ...current, roleFilter: 'operator' }),
  },
  {
    id: 'qc',
    label: 'QC only',
    apply: (current) => ({ ...current, taskFilter: 'qc' }),
  },
  {
    id: 'packing',
    label: 'Packing only',
    apply: (current) => ({ ...current, taskFilter: 'packing' }),
  },
]

function readStoredUserFilters(): UserFilterState {
  if (typeof window === 'undefined') {
    return defaultUserFilterState
  }

  const raw = window.sessionStorage.getItem(USERS_FILTERS_KEY)
  if (!raw) {
    return defaultUserFilterState
  }

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
  if (typeof window === 'undefined') {
    return
  }

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
  const shouldShowStatusAlert =
    messageTone === 'error' ||
    message.includes('sudah dipakai') ||
    message.includes('wajib') ||
    message.includes('Minimal satu akun admin')

  useEffect(() => {
    writeStoredUserFilters({
      searchText,
      roleFilter,
      taskFilter,
    })
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
  const hasSearch = Boolean(searchText.trim())
  const currentSessionKey = operatorSession
    ? profileKey({
        operatorName: operatorSession.operatorName,
        operatorCode: operatorSession.operatorCode,
        role: operatorSession.role,
      })
    : null

  const nameConflict = useMemo(() => {
    const normalizedName = operatorName.trim().toLowerCase()

    if (!normalizedName) {
      return null
    }

    const sourceKey = formSourceProfile ? profileKey(formSourceProfile) : null
    return (
      operatorProfiles.find((profile) => {
        return (
          profile.operatorName.trim().toLowerCase() === normalizedName &&
          profileKey(profile) !== sourceKey
        )
      }) ?? null
    )
  }, [formSourceProfile, operatorName, operatorProfiles])

  const codeConflict = useMemo(() => {
    const normalizedCode = operatorCode.trim().toLowerCase()

    if (!normalizedCode) {
      return null
    }

    const sourceKey = formSourceProfile ? profileKey(formSourceProfile) : null
    return (
      operatorProfiles.find((profile) => {
        return (
          profile.operatorCode.trim().toLowerCase() === normalizedCode &&
          profileKey(profile) !== sourceKey
        )
      }) ?? null
    )
  }, [formSourceProfile, operatorCode, operatorProfiles])

  const nameFieldHelp = useMemo(() => {
    if (!operatorName.trim()) {
      return 'Username wajib diisi.'
    }

    if (/\s/.test(operatorName)) {
      return 'Username tidak boleh mengandung spasi.'
    }

    if (nameConflict) {
      return `Username "${nameConflict.operatorName}" sudah dipakai user lain.`
    }

    return 'Username tersedia.'
  }, [nameConflict, operatorName])

  const codeFieldHelp = useMemo(() => {
    if (!operatorCode.trim()) {
      return 'Kode user wajib diisi.'
    }

    if (codeConflict) {
      return `Kode "${codeConflict.operatorCode}" sudah dipakai user lain.`
    }

    return 'Kode user tersedia.'
  }, [codeConflict, operatorCode])

  const isEditingCurrentSession = useMemo(() => {
    if (!operatorSession || !formSourceProfile) {
      return false
    }

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

  function applyQuickFilter(filterId: string) {
    const target = QUICK_FILTERS.find((item) => item.id === filterId)

    if (!target) {
      return
    }

    const nextFilters = target.apply({
      searchText,
      roleFilter,
      taskFilter,
    })

    setSearchText(nextFilters.searchText)
    setRoleFilter(nextFilters.roleFilter)
    setTaskFilter(nextFilters.taskFilter)
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
      const savedProfile = await upsertOperatorProfile(
        name,
        code,
        taskType,
        isEditMode,
        isEditMode ? undefined : DEFAULT_NEW_USER_PASSWORD,
        fullNameValue,
        role,
        sourceProfile,
      )

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
    const role = isEditMode ? operatorRole : 'operator'
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

    if (
      isEditMode &&
      formSourceProfile &&
      isLastAdminProfile(formSourceProfile, operatorProfiles) &&
      operatorRole !== 'admin'
    ) {
      setMessageTone('error')
      setMessage('Minimal satu akun admin harus tetap ada.')
      return
    }

    if (
      isEditMode &&
      formSourceProfile &&
      (
        (operatorRole === 'admin' && formSourceProfile.role !== 'admin') ||
        isEditingCurrentSession
      )
    ) {
      setPendingSaveAction({
        name,
        code,
        role,
        taskType,
        fullNameValue,
        isEditMode,
        sourceProfile: formSourceProfile,
      })
      setDialogState('confirm-save')
      return
    }

    await commitSaveAction({
      name,
      code,
      role,
      taskType,
      fullNameValue,
      isEditMode,
      sourceProfile: formSourceProfile,
    })
  }

  async function handleDeleteProfile(profile: OperatorProfile) {
    try {
      await removeOperatorProfile(profile.operatorName, profile.operatorCode, profile.role)

      if (selectedKey === profileKey(profile)) {
        setSelectedKey(null)
      }

      if (formSourceProfile && profileKey(formSourceProfile) === profileKey(profile)) {
        closeFormModal()
      }

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
    if (!resetTarget) {
      return
    }

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
      await updateOperatorPassword(
        resetTarget.operatorName,
        resetTarget.operatorCode,
        password,
        resetTarget.role,
      )
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
    <StageCard title="Users">
      <div className="grid gap-4">
        <section className="grid gap-4 rounded-[2rem] border border-slate-200/80 bg-gradient-to-br from-white to-slate-50 p-4 shadow-xl shadow-slate-900/5 lg:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid gap-2">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs uppercase tracking-[0.22em] text-slate-500">
                <Users className="size-3.5" />
                QC / packing operators
              </div>
              <h3 className="text-2xl font-semibold tracking-tight text-slate-950">Kelola akun operator QC / packing</h3>
              <p className="max-w-3xl text-sm leading-6 text-slate-500">
                Tambah, edit, reset password, atau hapus akun operator dengan alur yang tetap ringkas dan mudah
                dipindai.
              </p>
            </div>

            <Card className="border-slate-200/80 bg-white shadow-sm shadow-slate-900/5">
              <CardContent className="grid gap-2 p-4 text-sm text-slate-500">
                <div className="flex items-center justify-between gap-10">
                  <span>Total user</span>
                  <strong className="text-slate-950">{operatorProfiles.length}</strong>
                </div>
                <div className="flex items-center justify-between gap-10">
                  <span>Admin</span>
                  <strong className="text-slate-950">{totalAdmins}</strong>
                </div>
                <div className="flex items-center justify-between gap-10">
                  <span>Operator</span>
                  <strong className="text-slate-950">{totalOperators}</strong>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="border-slate-200/80 shadow-sm shadow-slate-900/5">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Total user</p>
                  <div className="grid size-9 place-items-center rounded-xl bg-slate-950 text-white">
                    <Users className="size-4" />
                  </div>
                </div>
                <div className="text-3xl font-semibold tracking-tight text-slate-950">{operatorProfiles.length}</div>
              </CardContent>
            </Card>
            <Card className="border-slate-200/80 shadow-sm shadow-slate-900/5">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Admin</p>
                  <div className="grid size-9 place-items-center rounded-xl bg-slate-950 text-white">
                    <ShieldCheck className="size-4" />
                  </div>
                </div>
                <div className="text-3xl font-semibold tracking-tight text-slate-950">{totalAdmins}</div>
              </CardContent>
            </Card>
            <Card className="border-slate-200/80 shadow-sm shadow-slate-900/5">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Operator</p>
                  <div className="grid size-9 place-items-center rounded-xl bg-slate-950 text-white">
                    <UserRoundCog className="size-4" />
                  </div>
                </div>
                <div className="text-3xl font-semibold tracking-tight text-slate-950">{totalOperators}</div>
              </CardContent>
            </Card>
          </div>
        </section>

        <Card className="border-slate-200/80 shadow-xl shadow-slate-900/5">
          <CardHeader className="space-y-2">
            <CardTitle className="text-lg">Toolbar</CardTitle>
            <CardDescription>Cari operator, tambahkan akun baru, atau bersihkan pencarian.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="flex flex-wrap gap-2">
              {QUICK_FILTERS.map((filter) => {
                const isActive =
                  (filter.id === 'all' && roleFilter === 'all' && taskFilter === 'all') ||
                  (filter.id === 'admin' && roleFilter === 'admin') ||
                  (filter.id === 'operator' && roleFilter === 'operator') ||
                  (filter.id === 'qc' && taskFilter === 'qc') ||
                  (filter.id === 'packing' && taskFilter === 'packing')

                return (
                  <Button
                    key={filter.id}
                    type="button"
                    size="sm"
                    variant={isActive ? 'default' : 'secondary'}
                    onClick={() => applyQuickFilter(filter.id)}
                    aria-pressed={isActive}
                  >
                    {filter.label}
                  </Button>
                )
              })}
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="Nama, kode, role, atau task"
                  className="h-12 pl-11"
                />
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button type="button" size="lg" onClick={openCreateModal}>
                  <Plus className="size-4" />
                  Tambah operator
                </Button>
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  className="border-slate-200"
                  onClick={clearFilters}
                  disabled={!hasSearch && roleFilter === 'all' && taskFilter === 'all'}
                >
                  Bersihkan filter
                </Button>
              </div>
            </div>

            {shouldShowStatusAlert ? (
              <Alert variant={messageTone === 'error' ? 'destructive' : 'default'}>
                <div className="grid gap-1">
                  <p className="font-medium">Status</p>
                  <p className="text-sm leading-6 text-current/80">{message}</p>
                </div>
              </Alert>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-xl shadow-slate-900/5">
          <CardHeader className="space-y-2">
            <CardTitle className="text-lg">Daftar operator</CardTitle>
            <CardDescription>
              Klik nama operator untuk edit. Tabel ini tetap menampilkan last used dan role dengan jelas.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
              <div className="grid gap-4 md:hidden">
                {filteredProfiles.length ? (
                  filteredProfiles.map((profile) => {
                    const key = profileKey(profile)
                    const isSelected = selectedKey === key

                    return (
                      <article
                        key={key}
                        className={
                          isSelected
                            ? 'grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm'
                            : 'grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm'
                        }
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 grid gap-1">
                            <button
                              type="button"
                              className="truncate text-left text-base font-semibold tracking-tight text-slate-950 hover:underline"
                              onClick={() => openEditModal(profile)}
                            >
                              {profile.fullName ?? profile.operatorName}
                            </button>
                            <p className="truncate text-sm text-slate-500">{profile.operatorCode}</p>
                          </div>
                          <span
                            className={
                              profile.role === 'admin'
                                ? 'inline-flex rounded-full border border-slate-200 bg-slate-950 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-white'
                                : 'inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-slate-700'
                            }
                          >
                            {profile.role}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                          <span>Tugas</span>
                          <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-slate-700">
                            {profile.taskType}
                          </span>
                        </div>

                        <div className="grid gap-2 text-sm">
                          <div className="flex items-start justify-between gap-4">
                            <span className="text-slate-500">Last used</span>
                            <span className="text-right font-medium text-slate-950">{formatTableDateTime(profile.lastUsedAt)}</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={() => openEditModal(profile)}
                          >
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={() => openResetModal(profile)}
                          >
                            Reset
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="w-full"
                            onClick={() => openDeleteModal(profile)}
                          >
                            Hapus
                          </Button>
                        </div>
                      </article>
                    )
                  })
                ) : (
                  <div className="grid gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-slate-500">
                    <strong className="text-slate-950">Belum ada operator yang cocok.</strong>
                    <p>Ubah kata kunci pencarian atau buat operator baru.</p>
                  </div>
                )}
              </div>

              <div className="hidden overflow-hidden rounded-[1.5rem] border border-slate-200 md:block">
                <div className="overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-0">
                    <thead className="bg-slate-50">
                      <tr className="text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                        <Th>Nama</Th>
                        <Th>Kode</Th>
                        <Th>Role</Th>
                        <Th>Tugas</Th>
                        <Th>Last used</Th>
                        <Th className="text-right">Aksi</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProfiles.length ? (
                        filteredProfiles.map((profile) => {
                          const key = profileKey(profile)

                          return (
                            <tr
                              key={key}
                              className={selectedKey === key ? 'bg-slate-50/80' : 'bg-white hover:bg-slate-50/60'}
                            >
                              <Td>
                                <button
                                  type="button"
                                  className="font-medium text-slate-950 hover:underline"
                                  onClick={() => openEditModal(profile)}
                                >
                                  {profile.fullName ?? profile.operatorName}
                                </button>
                              </Td>
                              <Td>{profile.operatorCode}</Td>
                              <Td>
                                <span
                                  className={
                                    profile.role === 'admin'
                                      ? 'inline-flex rounded-full border border-slate-200 bg-slate-950 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-white'
                                      : 'inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-slate-700'
                                  }
                                >
                                  {profile.role}
                                </span>
                              </Td>
                              <Td>
                                <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-slate-700">
                                  {profile.taskType}
                                </span>
                              </Td>
                              <Td className="whitespace-nowrap text-slate-500">{formatTableDateTime(profile.lastUsedAt)}</Td>
                              <Td>
                                <div className="flex flex-wrap justify-end gap-2">
                                  <Button type="button" variant="outline" size="sm" onClick={() => openEditModal(profile)}>
                                    Edit
                                  </Button>
                                  <Button type="button" variant="outline" size="sm" onClick={() => openResetModal(profile)}>
                                    Reset
                                  </Button>
                                  <Button type="button" variant="destructive" size="sm" onClick={() => openDeleteModal(profile)}>
                                    Hapus
                                  </Button>
                                </div>
                              </Td>
                            </tr>
                          )
                        })
                      ) : (
                        <tr>
                          <td colSpan={6} className="p-6">
                            <div className="grid gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-slate-500">
                              <strong className="text-slate-950">Belum ada operator yang cocok.</strong>
                              <p>Ubah kata kunci pencarian atau buat operator baru.</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
        </Card>

        {dialogState === 'form' ? (
          <ModalOverlay onClose={closeFormModal}>
            <div className="grid gap-4">
              <DialogHeader className="flex items-start justify-between gap-4 text-left">
                <div className="grid gap-1">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    {formMode === 'edit' ? 'Edit user' : 'Tambah user'}
                  </p>
                  <DialogTitle className="text-xl">
                    {formMode === 'edit'
                      ? `Edit ${formSourceProfile?.operatorName ?? 'user'}`
                      : 'Buat operator baru'}
                  </DialogTitle>
                  <DialogDescription className="text-sm leading-6 text-slate-500">
                    {formMode === 'edit' ? 'Edit akun operator.' : 'Tambah akun operator.'}
                  </DialogDescription>
                </div>
                <DialogCloseButton onClick={closeFormModal} />
              </DialogHeader>

              {formMode === 'edit' && formSourceProfile ? (
                <Alert variant={isEditingCurrentSession ? 'info' : 'default'}>
                  <div className="grid gap-1">
                    <p className="font-medium">
                      {isEditingCurrentSession ? 'Akun aktif sedang diedit' : 'Mode edit aktif'}
                    </p>
                    <p className="text-sm leading-6 text-current/80">
                      {isEditingCurrentSession
                        ? 'Akun ini sedang dipakai pada sesi login saat ini. Simpan perubahan dengan hati-hati.'
                        : `Perubahan akan diterapkan ke ${formatOperator(formSourceProfile.operatorName, formSourceProfile.operatorCode)}.`}
                    </p>
                    <p className="text-sm leading-6 text-current/70">
                      Username dan operator code dikunci saat edit. Gunakan reset password bila hanya ingin mengganti kata sandi.
                    </p>
                  </div>
                </Alert>
              ) : null}

              <div className="grid gap-4">
                <Field
                  id="user-fullname"
                  label="nama_lengkap"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Nama lengkap"
                  helperText="Nama lengkap wajib diisi."
                />

                <Field
                  id="user-username"
                  label="username"
                  value={operatorName}
                  onChange={(event) => setOperatorName(event.target.value.replace(/\s+/g, ''))}
                  placeholder="Username"
                  helperText={nameFieldHelp}
                  tone={nameConflict ? 'error' : 'default'}
                  readOnly={formMode === 'edit'}
                />

                <div className="grid gap-2">
                  <Label className="text-xs uppercase tracking-[0.18em] text-slate-500">Tugas operator</Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {TASK_OPTIONS.map((option) => {
                      const checked = operatorTaskType === option.value

                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={
                            checked
                              ? 'grid gap-1 rounded-2xl border border-slate-950 bg-slate-950 px-4 py-3 text-left text-white'
                              : 'grid gap-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-slate-950'
                          }
                          onClick={() => setOperatorTaskType(option.value)}
                        >
                          <strong className="text-sm uppercase tracking-[0.14em]">{option.label}</strong>
                          <span className={checked ? 'text-xs text-white/75' : 'text-xs text-slate-500'}>
                            {option.description}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {formMode === 'edit' ? (
                  <>
                    <Field
                      id="user-code"
                      label="operator_code"
                      value={operatorCode}
                      onChange={(event) => setOperatorCode(event.target.value)}
                      placeholder="001"
                      readOnly
                      helperText={codeFieldHelp}
                      tone={codeConflict ? 'error' : 'default'}
                    />

                    <div className="grid gap-2">
                      <Label className="text-xs uppercase tracking-[0.18em] text-slate-500">operator_role</Label>
                      <div className="flex flex-wrap gap-2">
                        {ROLE_OPTIONS.map((option) => {
                          const checked = operatorRole === option.value

                          return (
                            <Button
                              key={option.value}
                              type="button"
                              variant={checked ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setOperatorRole(option.value)}
                            >
                              {option.label}
                            </Button>
                          )
                        })}
                      </div>
                    </div>

                  </>
                ) : (
                  <div className="grid gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4">
                    <Label className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      operator_code otomatis
                    </Label>
                    <strong className="text-2xl tracking-tight text-slate-950">{nextCreateCode}</strong>
                    <p className="text-sm leading-6 text-slate-500">Kode ini akan dipakai untuk operator baru.</p>
                    <p className="text-xs leading-5 text-slate-500">
                      Password awal untuk user baru adalah <span className="font-medium text-slate-950">user123</span>.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={closeFormModal}>
                  Batal
                </Button>
                <Button type="button" onClick={() => void handleSaveForm()}>
                  <SaveIcon />
                  Simpan
                </Button>
              </div>
            </div>
          </ModalOverlay>
        ) : null}

        {dialogState === 'confirm-save' && pendingSaveAction ? (
          <ModalOverlay onClose={closeConfirmSaveModal}>
            <div className="grid gap-4">
              <DialogHeader className="flex items-start justify-between gap-4 text-left">
                <div className="grid gap-1">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Konfirmasi simpan</p>
                  <DialogTitle className="text-xl">
                    {pendingSaveAction.isEditMode ? `Simpan perubahan ${pendingSaveAction.name}` : `Buat ${pendingSaveAction.name}`}
                  </DialogTitle>
                  <DialogDescription className="text-sm leading-6 text-slate-500">
                    Lanjutkan hanya jika perubahan ini memang sudah benar.
                  </DialogDescription>
                </div>
                <DialogCloseButton onClick={closeConfirmSaveModal} />
              </DialogHeader>

              <Alert variant="info">
                <div className="grid gap-1">
                  <p className="font-medium">Alasan konfirmasi</p>
                  <p className="text-sm leading-6 text-current/80">
                    {[
                      isEditingCurrentSession ? 'Akun ini sedang dipakai pada sesi login aktif.' : null,
                      pendingSaveAction.role === 'admin' && pendingSaveAction.sourceProfile?.role !== 'admin'
                        ? `Perubahan ini akan mempromosikan ${pendingSaveAction.sourceProfile?.operatorName ?? 'user'} menjadi admin.`
                        : null,
                    ]
                      .filter((item): item is string => Boolean(item))
                      .join(' ')}
                  </p>
                </div>
              </Alert>

              <dl className="grid gap-3 md:grid-cols-2">
                <DetailRow label="Nama lengkap" value={pendingSaveAction.fullNameValue} />
                <DetailRow label="Username" value={pendingSaveAction.name} />
                <DetailRow label="Operator code" value={pendingSaveAction.code} />
                <DetailRow label="Role" value={pendingSaveAction.role} />
                <DetailRow label="Task" value={pendingSaveAction.taskType} />
              </dl>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={closeConfirmSaveModal}>
                  Kembali
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    if (!pendingSaveAction) {
                      return
                    }

                    void commitSaveAction(pendingSaveAction)
                  }}
                >
                  Simpan sekarang
                </Button>
              </div>
            </div>
          </ModalOverlay>
        ) : null}

        {dialogState === 'reset' && resetTarget ? (
          <ModalOverlay onClose={() => setResetTarget(null)}>
            <div className="grid gap-4">
              <DialogHeader className="flex items-start justify-between gap-4 text-left">
                <div className="grid gap-1">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Reset password</p>
                  <DialogTitle className="text-xl">
                    {formatOperator(resetTarget.operatorName, resetTarget.operatorCode)}
                  </DialogTitle>
                  <DialogDescription className="text-sm leading-6 text-slate-500">{resetTarget.role}</DialogDescription>
                </div>
                <DialogCloseButton onClick={() => setResetTarget(null)} />
              </DialogHeader>

              <div className="grid gap-4">
                <PasswordField
                  id="reset-password"
                  label="password_baru"
                  value={resetPassword}
                  onChange={(event) => setResetPassword(event.target.value)}
                  placeholder="Password baru"
                  showPassword={resetShowPassword}
                  onToggle={() => setResetShowPassword((current) => !current)}
                />

                <PasswordField
                  id="reset-password-confirm"
                  label="konfirmasi_password"
                  value={resetPasswordConfirm}
                  onChange={(event) => setResetPasswordConfirm(event.target.value)}
                  placeholder="Ulangi password baru"
                  showPassword={resetShowPassword}
                  onToggle={() => setResetShowPassword((current) => !current)}
                />
              </div>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setResetTarget(null)} disabled={isResetting}>
                  Batal
                </Button>
                <Button type="button" onClick={() => void handleResetPassword()} disabled={isResetting}>
                  {isResetting ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
                  {isResetting ? 'Menyimpan...' : 'Simpan password'}
                </Button>
              </div>
            </div>
          </ModalOverlay>
        ) : null}

        {dialogState === 'delete' && deleteTarget ? (
          <ModalOverlay onClose={() => setDeleteTarget(null)}>
            <div className="grid gap-4">
              <DialogHeader className="flex items-start justify-between gap-4 text-left">
                <div className="grid gap-1">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Hapus user</p>
                  <DialogTitle className="text-xl">
                    {deleteTarget.fullName ?? deleteTarget.operatorName}
                  </DialogTitle>
                  <DialogDescription className="text-sm leading-6 text-slate-500">
                    {deleteTarget.operatorCode} · {deleteTarget.role}
                  </DialogDescription>
                </div>
                <DialogCloseButton onClick={() => setDeleteTarget(null)} />
              </DialogHeader>

              <Alert variant="destructive">
                <div className="grid gap-1">
                  <p className="font-medium">Konfirmasi hapus</p>
                  <p className="text-sm leading-6 text-current/80">
                    Data user ini akan dihapus dari daftar operator. Lanjutkan?
                  </p>
                </div>
              </Alert>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
                  Batal
                </Button>
                <Button type="button" variant="destructive" onClick={() => void handleDeleteProfile(deleteTarget)}>
                  <Trash2 className="size-4" />
                  Hapus user
                </Button>
              </div>
            </div>
          </ModalOverlay>
        ) : null}
      </div>
    </StageCard>
  )
}

function Field({
  id,
  label,
  helperText,
  tone = 'default',
  ...inputProps
}: {
  id: string
  label: string
  helperText?: string
  tone?: 'default' | 'error'
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id} className="text-xs uppercase tracking-[0.18em] text-slate-500">
        {label}
      </Label>
      <Input
        id={id}
        className={tone === 'error' ? 'h-12 border-rose-200 focus-visible:ring-rose-200' : 'h-12'}
        {...inputProps}
      />
      {helperText ? (
        <p className={tone === 'error' ? 'text-xs leading-5 text-rose-600' : 'text-xs leading-5 text-slate-500'}>
          {helperText}
        </p>
      ) : null}
    </div>
  )
}

function PasswordField({
  id,
  label,
  showPassword,
  onToggle,
  ...inputProps
}: {
  id: string
  label: string
  showPassword: boolean
  onToggle: () => void
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id} className="text-xs uppercase tracking-[0.18em] text-slate-500">
        {label}
      </Label>
      <div className="relative">
        <Input id={id} type={showPassword ? 'text' : 'password'} className="h-12 pr-12" {...inputProps} />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-950"
          onClick={onToggle}
          aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
        >
          {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </Button>
      </div>
    </div>
  )
}

function Th({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <th className={`px-4 py-4 ${className}`}>{children}</th>
}

function Td({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <td className={`border-t border-slate-100 px-4 py-4 align-top text-sm text-slate-700 ${className}`}>{children}</td>
}

function SaveIcon() {
  return <BadgeCheck className="size-4" />
}

function DetailRow({
  label,
  value,
}: {
  label: string
  value: ReactNode
}) {
  return (
    <div className="grid gap-1 rounded-2xl border border-slate-200 bg-white p-4">
      <dt className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</dt>
      <dd className="text-sm leading-6 text-slate-950 [overflow-wrap:anywhere]">{value}</dd>
    </div>
  )
}

function profileKey(profile: Pick<OperatorProfile, 'operatorName' | 'operatorCode' | 'role'>) {
  return `${profile.operatorName.trim()}::${profile.operatorCode.trim()}::${profile.role}`
}

function generateNextOperatorCode(profiles: OperatorProfile[]) {
  const nextNumber =
    profiles.reduce((max, profile) => {
      const numeric = Number.parseInt(profile.operatorCode.trim(), 10)
      return Number.isFinite(numeric) ? Math.max(max, numeric) : max
    }, 0) + 1

  return String(nextNumber).padStart(3, '0')
}

function formatTableDateTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

function formatOperator(operatorName: string, operatorCode: string) {
  if (operatorName && operatorCode) {
    return `${operatorName} (${operatorCode})`
  }

  return operatorName || operatorCode || '-'
}

function isLastAdminProfile(profile: OperatorProfile, profiles: OperatorProfile[]) {
  return profile.role === 'admin' && profiles.filter((item) => item.role === 'admin').length <= 1
}

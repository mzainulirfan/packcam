import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  removeOperatorProfile,
  updateOperatorPassword,
  upsertOperatorProfile,
  useOperatorProfiles,
  useOperatorSession,
} from '../app/operatorSession'
import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog'
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
  const hasActiveFilters = Boolean(searchText.trim()) || roleFilter !== 'all' || taskFilter !== 'all'
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
    <div className="users-opencode mx-auto grid w-full max-w-[1520px] gap-8 px-0 py-1">
      <section className="users-opencode__hero flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="users-opencode__section-label">[+] Administrasi</div>
          <h1 className="users-opencode__title">Users</h1>
          <p className="users-opencode__lede">
            Tambah, edit, reset password, atau hapus akun operator QC dan packing.
          </p>
        </div>
        <Button type="button" className="users-opencode__button" onClick={openCreateModal}>
          [new-user]
        </Button>
      </section>

      <section className="users-opencode__stats">
        <StatCard marker="[+]" label="Total user" value={operatorProfiles.length} unit="akun" />
        <StatCard marker="[x]" label="Admin" value={totalAdmins} unit="akun" />
        <StatCard marker="[-]" label="Operator" value={totalOperators} unit="akun" />
      </section>

      <div className="sticky top-0 z-10 -mx-4 border-b bg-white/85 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <section className="users-opencode__filters users-opencode__filters--inline">
          <div className="users-opencode__filter-grid">
          <div className="users-opencode__search-block">
            <span className="users-opencode__filter-label">search</span>
            <span className="users-opencode__input-prefix" aria-hidden="true">[?]</span>
            <Input
              id="users-search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Cari nama, username, kode..."
              className="users-opencode__input pl-12"
              aria-label="Cari user"
            />
          </div>

          <div className="users-opencode__filter-controls">
            <FilterGroup
              label="role"
              options={[
                ['all', 'Semua'],
                ['admin', 'Admin'],
                ['operator', 'Operator'],
              ]}
              value={roleFilter}
              onChange={(value) => setRoleFilter(value as UserRoleFilter)}
            />

            <FilterGroup
              label="task"
              options={[
                ['all', 'Semua'],
                ['qc', 'QC'],
                ['packing', 'Packing'],
              ]}
              value={taskFilter}
              onChange={(value) => setTaskFilter(value as UserTaskFilter)}
            />
          </div>

          <div className="users-opencode__filter-actions">
            <span><strong>{filteredProfiles.length}</strong>/{operatorProfiles.length}</span>
            <Button type="button" variant="ghost" className="users-opencode__button" onClick={clearFilters} disabled={!hasActiveFilters}>
              [reset]
            </Button>
          </div>
        </div>

          {shouldShowStatusAlert ? (
            <Alert variant={messageTone === 'error' ? 'destructive' : 'default'} className="mt-2">
              <div className="users-opencode__alert grid gap-1">
                <p>{messageTone === 'error' ? '[!] Status' : '[+] Status'}</p>
                <p>{message}</p>
              </div>
            </Alert>
          ) : null}
        </section>
        </div>

      <section className="users-opencode__table-section overflow-hidden">
        <div className="users-opencode__table-header flex items-center justify-between px-5 py-4">
          <div>
            <h2>[+] Daftar operator</h2>
            <p>Klik nama operator untuk edit detail akun.</p>
          </div>
          <span className="users-opencode__badge">
            {filteredProfiles.length} hasil
          </span>
        </div>

        <div className="p-0">
          <div className="users-opencode__mobile-list md:hidden">
            {filteredProfiles.length ? (
              filteredProfiles.map((profile) => {
                const key = profileKey(profile)
                const isSelected = selectedKey === key

                return (
                  <article key={key} className={isSelected ? 'users-opencode__mobile-card is-selected' : 'users-opencode__mobile-card'}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 grid gap-1">
                        <button type="button" className="users-opencode__name-button truncate text-left" onClick={() => openEditModal(profile)}>
                          {profile.fullName ?? profile.operatorName}
                        </button>
                        <p className="users-opencode__meta truncate">{profile.operatorCode}</p>
                      </div>
                      <RoleBadge role={profile.role} />
                    </div>

                    <div className="users-opencode__task-grid grid grid-cols-2 gap-3">
                      <div>
                        <div className="users-opencode__meta">Task</div>
                        <div className="mt-1"><TaskBadge taskType={profile.taskType} /></div>
                      </div>
                      <div>
                        <div className="users-opencode__meta">Last used</div>
                        <div className="mt-1"><DateTimeCell value={profile.lastUsedAt} compact /></div>
                      </div>
                    </div>

                    <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                      <Button type="button" variant="outline" size="sm" className="users-opencode__button w-full" onClick={() => openEditModal(profile)}>[edit]</Button>
                      <Button type="button" variant="outline" size="sm" className="users-opencode__button w-full" onClick={() => openResetModal(profile)}>[reset]</Button>
                      <Button type="button" variant="destructive" size="sm" className="users-opencode__button" onClick={() => openDeleteModal(profile)} aria-label={`Hapus ${profile.fullName ?? profile.operatorName}`}>[delete]</Button>
                    </div>
                  </article>
                )
              })
            ) : (
              <div className="users-opencode__empty">
                <strong>[-] Belum ada operator yang cocok.</strong>
                <p>Ubah kata kunci pencarian atau buat operator baru.</p>
              </div>
            )}
          </div>

          <div className="hidden max-h-[56vh] overflow-auto md:block">
            <table className="users-opencode__table w-full min-w-[900px] border-collapse">
              <thead className="sticky top-0 z-[1] bg-white">
                <tr className="border-b bg-muted/30">
                  <Th className="text-[0.72rem] uppercase tracking-wide text-muted-foreground">Nama</Th>
                  <Th className="text-[0.72rem] uppercase tracking-wide text-muted-foreground">Kode</Th>
                  <Th className="text-[0.72rem] uppercase tracking-wide text-muted-foreground">Role</Th>
                  <Th className="text-[0.72rem] uppercase tracking-wide text-muted-foreground">Tugas</Th>
                  <Th className="text-[0.72rem] uppercase tracking-wide text-muted-foreground">Last used</Th>
                  <Th className="text-right text-[0.72rem] uppercase tracking-wide text-muted-foreground">Aksi</Th>
                </tr>
              </thead>
              <tbody>
                {filteredProfiles.length ? (
                  filteredProfiles.map((profile) => {
                    const key = profileKey(profile)

                    return (
                      <tr key={key} className={selectedKey === key ? 'users-opencode__row is-selected table-row' : 'users-opencode__row table-row'}>
                        <Td>
                          <div className="flex items-center gap-2">
                            <div className="users-opencode__avatar">
                              [{getInitials(profile.fullName ?? profile.operatorName)}]
                            </div>
                            <div className="min-w-0">
                              <button type="button" className="users-opencode__name-button truncate" onClick={() => openEditModal(profile)}>
                                {profile.fullName ?? profile.operatorName}
                              </button>
                              <p className="users-opencode__meta mt-0.5 truncate">{profile.operatorName}</p>
                            </div>
                          </div>
                        </Td>
                        <Td>{profile.operatorCode}</Td>
                        <Td><RoleBadge role={profile.role} /></Td>
                        <Td><TaskBadge taskType={profile.taskType} /></Td>
                        <Td className="whitespace-nowrap"><DateTimeCell value={profile.lastUsedAt} /></Td>
                        <Td>
                          <div className="row-actions flex items-center justify-end gap-1 opacity-80 transition">
                            <Button type="button" variant="outline" size="sm" className="users-opencode__button" onClick={() => openEditModal(profile)}>[edit]</Button>
                            <Button type="button" variant="outline" size="sm" className="users-opencode__button" onClick={() => openResetModal(profile)}>[reset]</Button>
                            <Button type="button" variant="destructive" size="sm" className="users-opencode__button" onClick={() => openDeleteModal(profile)}>[delete]</Button>
                          </div>
                        </Td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="p-6">
                      <div className="users-opencode__empty">
                        <strong>[-] Belum ada operator yang cocok.</strong>
                        <p>Ubah kata kunci pencarian atau buat operator baru.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

        <Dialog open={dialogState === 'form'} onOpenChange={(open) => !open && closeFormModal()}>
          <DialogContent className="max-w-xl max-h-[84vh] flex flex-col overflow-hidden p-0 sm:max-w-[640px]">
            <DialogHeader className="shrink-0 border-b px-6 py-5 text-left">
              <div className="grid gap-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{formMode === 'edit' ? '[+] Edit user' : '[+] Tambah user'}</p>
                <DialogTitle>{formMode === 'edit' ? `Edit ${formSourceProfile?.operatorName ?? 'user'}` : 'Buat operator baru'}</DialogTitle>
                <DialogDescription>{formMode === 'edit' ? 'Edit akun operator.' : 'Tambah akun operator.'}</DialogDescription>
              </div>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {formMode === 'edit' && formSourceProfile ? (
                <Alert variant={isEditingCurrentSession ? 'default' : 'default'} className="py-2">
                  <div className="grid gap-1 text-xs leading-snug">
                    <p className="font-medium">{isEditingCurrentSession ? '[!] Akun aktif sedang diedit' : '[+] Mode edit aktif'}</p>
                    <p className="text-muted-foreground">{isEditingCurrentSession ? 'Akun ini sedang dipakai pada sesi login saat ini. Simpan dengan hati-hati.' : `Perubahan akan diterapkan ke ${formatOperator(formSourceProfile.operatorName, formSourceProfile.operatorCode)}.`}</p>
                    <p className="text-muted-foreground">Username & kode dikunci saat edit. Gunakan reset password untuk ganti kata sandi.</p>
                  </div>
                </Alert>
              ) : null}

              <div className="space-y-4">
                <Field
                  id="user-fullname"
                  label="nama lengkap"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Nama lengkap"
                  helperText="Nama lengkap wajib diisi."
                />
                <div className="grid gap-3 sm:grid-cols-2">
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
                  {formMode === 'edit' ? (
                    <Field
                      id="user-code"
                      label="kode"
                      value={operatorCode}
                      onChange={(event) => setOperatorCode(event.target.value)}
                      placeholder="001"
                      readOnly
                      helperText={codeFieldHelp}
                      tone={codeConflict ? 'error' : 'default'}
                    />
                  ) : (
                    <div className="grid gap-2">
                      <Label className="text-xs">kode otomatis</Label>
                      <div className="flex h-8 items-center justify-between rounded-[6px] border bg-muted px-3 font-mono text-sm">
                        <span>{nextCreateCode}</span>
                        <span className="text-xs text-muted-foreground">pass: user123</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label className="text-xs">role</Label>
                    <div className="grid grid-cols-2 gap-1 rounded-[8px] bg-muted p-1">
                      {ROLE_OPTIONS.map((option) => {
                        const checked = operatorRole === option.value
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setOperatorRole(option.value)}
                            className={checked ? 'rounded-[6px] bg-foreground px-3 py-2 text-xs font-bold text-background' : 'rounded-[6px] px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground'}
                          >
                            {option.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-xs">tugas</Label>
                    <div className="grid grid-cols-2 gap-1 rounded-[8px] bg-muted p-1">
                      {TASK_OPTIONS.map((option) => {
                        const checked = operatorTaskType === option.value
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setOperatorTaskType(option.value)}
                            className={checked ? 'rounded-[6px] bg-foreground px-3 py-2 text-xs font-bold text-background' : 'rounded-[6px] px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground'}
                          >
                            {option.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter className="shrink-0 border-t bg-card px-6 py-5">
              <Button type="button" variant="outline" onClick={closeFormModal}>
                [cancel]
              </Button>
              <Button type="button" onClick={() => void handleSaveForm()} disabled={!!nameConflict || !!codeConflict || !fullName.trim() || !operatorName.trim()}>
                [save]
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={dialogState === 'confirm-save' && !!pendingSaveAction} onOpenChange={(open) => !open && closeConfirmSaveModal()}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">[+] Konfirmasi simpan</p>
              <DialogTitle>{pendingSaveAction?.isEditMode ? `Simpan perubahan ${pendingSaveAction?.name}` : `Buat ${pendingSaveAction?.name}`}</DialogTitle>
              <DialogDescription>Lanjutkan hanya jika perubahan ini memang sudah benar.</DialogDescription>
            </DialogHeader>
            <Alert variant="default" className="py-2">
              <div className="grid gap-1 text-xs">
                <p className="font-medium">[+] Alasan konfirmasi</p>
                <p className="text-muted-foreground">
                  {[
                    isEditingCurrentSession ? 'Akun ini sedang dipakai pada sesi login aktif.' : null,
                    pendingSaveAction?.role === 'admin' && pendingSaveAction?.sourceProfile?.role !== 'admin'
                      ? `Perubahan ini akan mempromosikan ${pendingSaveAction?.sourceProfile?.operatorName ?? 'user'} menjadi admin.`
                      : null,
                  ]
                    .filter((item): item is string => Boolean(item))
                    .join(' ')}
                </p>
              </div>
            </Alert>
            <dl className="grid gap-3 md:grid-cols-2 text-sm">
              <DetailRow label="Nama lengkap" value={pendingSaveAction?.fullNameValue} />
              <DetailRow label="Username" value={pendingSaveAction?.name} />
              <DetailRow label="Operator code" value={pendingSaveAction?.code} />
              <DetailRow label="Role" value={pendingSaveAction?.role} />
              <DetailRow label="Task" value={pendingSaveAction?.taskType} />
            </dl>
            <DialogFooter className="px-6 pb-6 pt-4">
              <Button type="button" variant="outline" onClick={closeConfirmSaveModal}>
                [back]
              </Button>
              <Button
                type="button"
                onClick={() => {
                  if (!pendingSaveAction) return
                  void commitSaveAction(pendingSaveAction)
                }}
              >
                [save-now]
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={dialogState === 'reset' && !!resetTarget} onOpenChange={(open) => !open && (setResetTarget(null), setDialogState(null))}>
          <DialogContent className="max-w-sm max-h-[80vh] flex flex-col overflow-hidden p-0">
            <DialogHeader className="shrink-0 border-b px-6 py-5 text-left">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">[+] Reset password</p>
              <DialogTitle>{resetTarget ? formatOperator(resetTarget.operatorName, resetTarget.operatorCode) : ''}</DialogTitle>
              <DialogDescription>{resetTarget?.role ?? ''}</DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
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
            <DialogFooter className="shrink-0 border-t bg-card px-6 py-5">
              <Button type="button" variant="outline" onClick={() => (setResetTarget(null), setDialogState(null))} disabled={isResetting}>
                [cancel]
              </Button>
              <Button type="button" onClick={() => void handleResetPassword()} disabled={isResetting}>
                {isResetting ? '[saving]' : '[save-password]'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={dialogState === 'delete' && !!deleteTarget} onOpenChange={(open) => !open && (setDeleteTarget(null), setDialogState(null))}>
          <DialogContent className="max-w-sm max-h-[80vh] flex flex-col overflow-hidden p-0">
            <DialogHeader className="shrink-0 border-b px-6 py-5 text-left">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-destructive">[!] Hapus user</p>
              <DialogTitle>{deleteTarget?.fullName ?? deleteTarget?.operatorName ?? ''}</DialogTitle>
              <DialogDescription>
                {deleteTarget ? `${deleteTarget.operatorCode} · ${deleteTarget.role}` : ''}
              </DialogDescription>
            </DialogHeader>
            <div className="px-6 py-4">
              <Alert variant="destructive" className="py-3">
                <div className="grid gap-1 text-xs">
                  <p className="font-medium">[!] Konfirmasi hapus</p>
                  <p className="text-muted-foreground">Data user ini akan dihapus dari daftar operator. Lanjutkan?</p>
                </div>
              </Alert>
            </div>
            <DialogFooter className="shrink-0 border-t bg-card px-6 py-5">
              <Button type="button" variant="outline" onClick={() => (setDeleteTarget(null), setDialogState(null))}>
                [cancel]
              </Button>
              <Button type="button" variant="destructive" onClick={() => deleteTarget && void handleDeleteProfile(deleteTarget)}>
                [delete-user]
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  )
}

function StatCard({
  marker,
  label,
  value,
  unit,
}: {
  marker: string
  label: string
  value: number
  unit: string
}) {
  return (
    <article className="users-opencode__stat">
      <span className="users-opencode__stat-marker">{marker}</span>
      <div>
        <p>{label}</p>
        <strong className="tabular-nums">{value}</strong>
        <span>{unit}</span>
      </div>
    </article>
  )
}

function FilterGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: Array<[string, string]>
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="users-opencode__filter-group grid gap-2">
      <span>{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map(([optionValue, optionLabel]) => (
          <Button
            key={optionValue}
            type="button"
            size="sm"
            variant={value === optionValue ? 'default' : 'ghost'}
            className="users-opencode__button"
            onClick={() => onChange(optionValue)}
            aria-pressed={value === optionValue}
          >
            {value === optionValue ? '[x]' : '[+]'} {optionLabel}
          </Button>
        ))}
      </div>
    </div>
  )
}

function RoleBadge({ role }: { role: OperatorRole }) {
  return (
    <span className="users-opencode__badge">
      {role === 'admin' ? '[x]' : '[+]'} {role}
    </span>
  )
}

function TaskBadge({ taskType }: { taskType: WorkTask }) {
  return (
    <span className="users-opencode__badge">
      [+] {taskType}
    </span>
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
    <div className="users-opencode__field grid gap-2">
      <Label htmlFor={id}>
        {label}
      </Label>
      <Input
        id={id}
        className={tone === 'error' ? 'users-opencode__input is-error' : 'users-opencode__input'}
        {...inputProps}
      />
      {helperText ? (
        <p className={tone === 'error' ? 'users-opencode__help is-error' : 'users-opencode__help'}>
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
    <div className="users-opencode__field grid gap-2">
      <Label htmlFor={id}>
        {label}
      </Label>
      <div className="relative">
        <Input id={id} type={showPassword ? 'text' : 'password'} className="users-opencode__input pr-12" {...inputProps} />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="users-opencode__password-toggle absolute right-1 top-1/2 -translate-y-1/2"
          onClick={onToggle}
          aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
        >
          {showPassword ? '[hide]' : '[show]'}
        </Button>
      </div>
    </div>
  )
}

function Th({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <th className={`px-5 py-3 ${className}`}>{children}</th>
}

function Td({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <td className={`px-5 py-4 align-top ${className}`}>{children}</td>
}

function DateTimeCell({ value, compact = false }: { value: string; compact?: boolean }) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return <span>{value}</span>
  }

  const dateLabel = new Intl.DateTimeFormat('id-ID', { dateStyle: compact ? 'short' : 'medium' }).format(date)
  const timeLabel = new Intl.DateTimeFormat('id-ID', { timeStyle: 'short' }).format(date)

  if (compact) {
    return <span>{dateLabel} · {timeLabel}</span>
  }

  return (
    <div className="users-opencode__datetime">
      <div>{dateLabel}</div>
      <div>{timeLabel}</div>
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

  return initials || 'US'
}

function DetailRow({
  label,
  value,
}: {
  label: string
  value: ReactNode
}) {
  return (
    <div className="users-opencode__detail-row grid gap-1">
      <dt>{label}</dt>
      <dd>{value}</dd>
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

function formatOperator(operatorName: string, operatorCode: string) {
  if (operatorName && operatorCode) {
    return `${operatorName} (${operatorCode})`
  }

  return operatorName || operatorCode || '-'
}

function isLastAdminProfile(profile: OperatorProfile, profiles: OperatorProfile[]) {
  return profile.role === 'admin' && profiles.filter((item) => item.role === 'admin').length <= 1
}

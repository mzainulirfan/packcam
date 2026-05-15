import { useEffect, useMemo, useRef, useState } from 'react'
import {
  removeOperatorProfile,
  upsertOperatorProfile,
  updateOperatorPassword,
  useOperatorProfiles,
} from '../app/operatorSession'
import { StageCard } from '../components/StageCard'
import type { OperatorProfile, OperatorRole } from '../data/types'

const ROLE_OPTIONS: Array<{ value: OperatorRole; label: string }> = [
  { value: 'operator', label: 'Operator' },
  { value: 'admin', label: 'Admin' },
]

type FormMode = 'create' | 'edit' | null

export function UsersPage() {
  const operatorProfiles = useOperatorProfiles()
  const flashTimerRef = useRef<number | null>(null)
  const [searchText, setSearchText] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [formMode, setFormMode] = useState<FormMode>(null)
  const [formSourceProfile, setFormSourceProfile] = useState<OperatorProfile | null>(null)
  const [fullName, setFullName] = useState('')
  const [operatorName, setOperatorName] = useState('')
  const [operatorCode, setOperatorCode] = useState('')
  const [operatorRole, setOperatorRole] = useState<OperatorRole>('operator')
  const [message, setMessage] = useState('Kelola akun operator dari sini.')
  const [resetTarget, setResetTarget] = useState<OperatorProfile | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('')
  const [resetShowPassword, setResetShowPassword] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<OperatorProfile | null>(null)
  const [flashMessage, setFlashMessage] = useState('')

  useEffect(() => {
    return () => {
      if (flashTimerRef.current !== null) {
        window.clearTimeout(flashTimerRef.current)
      }
    }
  }, [])

  const filteredProfiles = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase()

    if (!normalizedSearch) {
      return operatorProfiles
    }

    return operatorProfiles.filter((profile) => {
      return (
        (profile.fullName ?? '').toLowerCase().includes(normalizedSearch) ||
        profile.operatorName.toLowerCase().includes(normalizedSearch) ||
        profile.operatorCode.toLowerCase().includes(normalizedSearch) ||
        profile.role.toLowerCase().includes(normalizedSearch)
      )
    })
  }, [operatorProfiles, searchText])

  const totalAdmins = operatorProfiles.filter((profile) => profile.role === 'admin').length
  const totalOperators = operatorProfiles.filter((profile) => profile.role === 'operator').length
  const nextCreateCode = useMemo(() => generateNextOperatorCode(operatorProfiles), [operatorProfiles])
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

  function openCreateModal() {
    setFormMode('create')
    setFormSourceProfile(null)
    setFullName('')
    setOperatorName('')
    setOperatorRole('operator')
    setOperatorCode(nextCreateCode)
    setMessage('Lengkapi username untuk menambah operator baru.')
  }

  function openEditModal(profile: OperatorProfile) {
    setFormMode('edit')
    setFormSourceProfile(profile)
    setFullName(profile.fullName ?? '')
    setOperatorName(profile.operatorName)
    setOperatorCode(profile.operatorCode)
    setOperatorRole(profile.role)
    setMessage(`Edit profil ${profile.operatorName}.`)
  }

  function closeFormModal() {
    setFormMode(null)
    setFormSourceProfile(null)
    setFullName('')
    setOperatorName('')
    setOperatorCode('')
    setOperatorRole('operator')
  }

  function openResetModal(profile: OperatorProfile) {
    setResetTarget(profile)
    setResetPassword('')
    setResetPasswordConfirm('')
    setResetShowPassword(false)
  }

  function openDeleteModal(profile: OperatorProfile) {
    if (isDefaultAdminProfile(profile)) {
      setMessage('Akun default admin tidak bisa dihapus.')
      return
    }

    setDeleteTarget(profile)
  }

  async function handleSaveForm() {
    const name = operatorName.trim()
    const isEditMode = formMode === 'edit'
    const fullNameValue = fullName.trim()
    const code = isEditMode ? operatorCode.trim() : generateNextOperatorCode(operatorProfiles)
    const role = isEditMode ? operatorRole : 'operator'
    const sourceKey = formSourceProfile ? profileKey(formSourceProfile) : null

    if (!name) {
      setMessage('Username wajib diisi.')
      return
    }

    if (/\s/.test(name)) {
      setMessage('Username tidak boleh mengandung spasi.')
      return
    }

    if (nameConflict && profileKey(nameConflict) !== sourceKey) {
      setMessage(`Nama "${nameConflict.operatorName}" sudah dipakai user lain.`)
      return
    }

    if (!fullNameValue) {
      setMessage('Nama lengkap wajib diisi.')
      return
    }

    try {
      const savedProfile = await upsertOperatorProfile(
        name,
        code,
        isEditMode ? undefined : 'user123',
        fullNameValue,
        role,
        formSourceProfile
          ? {
              operatorName: formSourceProfile.operatorName,
              operatorCode: formSourceProfile.operatorCode,
              role: formSourceProfile.role,
            }
          : null,
      )

      triggerFlash(`Profil ${savedProfile.operatorName} berhasil disimpan.`)
      setSelectedKey(profileKey(savedProfile))
      closeFormModal()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal menyimpan profil.')
    }
  }

  function handleDeleteProfile(profile: OperatorProfile) {
    if (isDefaultAdminProfile(profile)) {
      setMessage('Akun default admin tidak bisa dihapus.')
      return
    }

    removeOperatorProfile(profile.operatorName, profile.operatorCode, profile.role)

    if (selectedKey === profileKey(profile)) {
      setSelectedKey(null)
    }

    if (formSourceProfile && profileKey(formSourceProfile) === profileKey(profile)) {
      closeFormModal()
    }

    triggerFlash(`Profil ${profile.operatorName} dihapus dari daftar operator.`)
    setDeleteTarget(null)
  }

  async function handleResetPassword() {
    if (!resetTarget) {
      return
    }

    const password = resetPassword.trim()
    const passwordConfirm = resetPasswordConfirm.trim()

    if (!password || !passwordConfirm) {
      setMessage('Kata sandi baru dan konfirmasi wajib diisi.')
      return
    }

    if (password !== passwordConfirm) {
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
      triggerFlash(`Kata sandi ${resetTarget.operatorName} berhasil direset.`)
      setResetTarget(null)
      setResetPassword('')
      setResetPasswordConfirm('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal reset kata sandi.')
    } finally {
      setIsResetting(false)
    }
  }

  const triggerFlash = (nextMessage: string) => {
    setFlashMessage(nextMessage)

    if (flashTimerRef.current !== null) {
      window.clearTimeout(flashTimerRef.current)
    }

    flashTimerRef.current = window.setTimeout(() => {
      setFlashMessage('')
      flashTimerRef.current = null
    }, 2500)
  }

  return (
    <StageCard title="Users">
      <div className="users-stack">
        <div className="users-summary users-summary--flat">
          <article>
            <span>Total user</span>
            <strong>{operatorProfiles.length}</strong>
          </article>
          <article>
            <span>Admin</span>
            <strong>{totalAdmins}</strong>
          </article>
          <article>
            <span>Operator</span>
            <strong>{totalOperators}</strong>
          </article>
        </div>

        <div className="users-toolbar">
          <label className="users-search">
            <span>Cari</span>
            <input
              type="text"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Nama, kode, atau role"
            />
          </label>

          <div className="users-toolbar__actions">
            <button type="button" className="action-button action-button--primary" onClick={openCreateModal}>
              Tambah operator
            </button>
            <button
              type="button"
              className="action-button"
              onClick={() => setSearchText('')}
              disabled={!searchText}
            >
              Bersihkan cari
            </button>
          </div>
        </div>

        {flashMessage ? <p className="users-flashmessage">{flashMessage}</p> : <p className="users-feedback">{message}</p>}

        <div className="users-layout">
          <div className="users-block users-block--full">
            <div className="users-block__header">
              <div>
                <h3>Daftar operator</h3>
              </div>
            </div>

            <div className="users-table__wrap">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Nama</th>
                    <th>Kode</th>
                    <th>Role</th>
                    <th>Last used</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProfiles.length ? (
                    filteredProfiles.map((profile) => {
                      const key = profileKey(profile)

                      return (
                        <tr
                          key={key}
                          className={
                            selectedKey === key ? 'users-row users-row--selected' : 'users-row'
                          }
                        >
                          <td data-label="Nama">
                            <button
                              type="button"
                              className="users-name-button"
                              onClick={() => openEditModal(profile)}
                            >
                              {profile.fullName ?? profile.operatorName}
                            </button>
                          </td>
                          <td data-label="Kode">{profile.operatorCode}</td>
                          <td data-label="Role">
                            <span className={`users-role users-role--${profile.role}`}>
                              {profile.role}
                            </span>
                          </td>
                          <td data-label="Last used" className="users-table__last-used">
                            {formatTableDateTime(profile.lastUsedAt)}
                          </td>
                          <td data-label="Aksi">
                            <div className="users-row__actions">
                              <button
                                type="button"
                                className="action-button action-button--primary"
                                onClick={() => openEditModal(profile)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="action-button"
                                onClick={() => openResetModal(profile)}
                              >
                                Reset password
                              </button>
                              <button
                                type="button"
                                className="action-button"
                                onClick={() => openDeleteModal(profile)}
                              >
                                Hapus
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} data-label="Status">
                        <div className="empty-state">
                          <strong>Belum ada operator yang cocok.</strong>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {formMode ? (
        <div className="modal-overlay" role="presentation" onClick={closeFormModal}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-form-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-card__header">
              <div>
                <p className="modal-card__eyebrow">{formMode === 'edit' ? 'Edit user' : 'Tambah user'}</p>
                <h3 id="user-form-title">
                  {formMode === 'edit'
                    ? `Edit ${formSourceProfile?.operatorName ?? 'user'}`
                    : 'Buat operator baru'}
                </h3>
                <p className="modal-card__meta">
                  {formMode === 'edit' ? 'Edit akun operator.' : 'Tambah akun operator.'}
                </p>
              </div>
              <button type="button" className="modal-card__close" onClick={closeFormModal}>
                Tutup
              </button>
            </div>

            <div className="modal-card__body">
              <label className="settings-field">
                <span className="settings-field__label">nama_lengkap</span>
                <input
                  className="settings-field__input"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Nama lengkap"
                />
                <small className="settings-field__help">Nama lengkap wajib diisi.</small>
              </label>

              <label className="settings-field">
                <span className="settings-field__label">username</span>
                <input
                  className={
                    nameConflict ? 'settings-field__input settings-field__input--error' : 'settings-field__input'
                  }
                  value={operatorName}
                  onChange={(event) => setOperatorName(event.target.value.replace(/\s+/g, ''))}
                  placeholder="Username"
                />
                <small
                  className={
                    nameConflict
                      ? 'settings-field__help settings-field__help--error'
                      : 'settings-field__help'
                  }
                >
                  {nameFieldHelp}
                </small>
              </label>

              {formMode === 'edit' ? (
                <>
                  <label className="settings-field">
                    <span className="settings-field__label">operator_code</span>
                    <input
                      className={
                        codeConflict
                          ? 'settings-field__input settings-field__input--error'
                          : 'settings-field__input'
                      }
                      value={operatorCode}
                      onChange={(event) => setOperatorCode(event.target.value)}
                      placeholder="001"
                      readOnly
                    />
                    <small
                      className={
                        codeConflict
                          ? 'settings-field__help settings-field__help--error'
                          : 'settings-field__help'
                      }
                    >
                      {codeFieldHelp}
                    </small>
                  </label>

                  <div className="settings-field">
                    <span className="settings-field__label">operator_role</span>
                    <div className="users-role-switch" role="radiogroup" aria-label="Operator role">
                      {ROLE_OPTIONS.map((option) => {
                        const checked = operatorRole === option.value
                        return (
                          <button
                            key={option.value}
                            type="button"
                            role="radio"
                            aria-checked={checked}
                            className={checked ? 'users-role-switch__button active' : 'users-role-switch__button'}
                            onClick={() => setOperatorRole(option.value)}
                          >
                            {option.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <div className="users-auto-code">
                  <span className="settings-field__label">operator_code otomatis</span>
                  <strong>{nextCreateCode}</strong>
                </div>
              )}

            </div>

            <div className="modal-card__actions">
              <button type="button" className="action-button" onClick={closeFormModal}>
                Batal
              </button>
              <button
                type="button"
                className="action-button action-button--primary"
                onClick={() => void handleSaveForm()}
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {resetTarget ? (
        <div className="modal-overlay" role="presentation" onClick={() => setResetTarget(null)}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-password-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-card__header">
              <div>
                <p className="modal-card__eyebrow">Reset password</p>
                <h3 id="reset-password-title">
                  {formatOperator(resetTarget.operatorName, resetTarget.operatorCode)}
                </h3>
                <p className="modal-card__meta">{resetTarget.role}</p>
              </div>
              <button type="button" className="modal-card__close" onClick={() => setResetTarget(null)}>
                Tutup
              </button>
            </div>

            <div className="modal-card__body">
              <label className="settings-field">
                <span className="settings-field__label">password_baru</span>
                <div className="settings-password">
                  <input
                    className="settings-field__input settings-password__input"
                    type={resetShowPassword ? 'text' : 'password'}
                    value={resetPassword}
                    onChange={(event) => setResetPassword(event.target.value)}
                    placeholder="Password baru"
                  />
                  <button
                    type="button"
                    className="settings-password__toggle"
                    onClick={() => setResetShowPassword((current) => !current)}
                    aria-label={resetShowPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  >
                    <i className={`bx ${resetShowPassword ? 'bx-hide' : 'bx-show'}`} aria-hidden="true" />
                  </button>
                </div>
              </label>

              <label className="settings-field">
                <span className="settings-field__label">konfirmasi_password</span>
                <div className="settings-password">
                  <input
                    className="settings-field__input settings-password__input"
                    type={resetShowPassword ? 'text' : 'password'}
                    value={resetPasswordConfirm}
                    onChange={(event) => setResetPasswordConfirm(event.target.value)}
                    placeholder="Ulangi password baru"
                  />
                  <button
                    type="button"
                    className="settings-password__toggle"
                    onClick={() => setResetShowPassword((current) => !current)}
                    aria-label={resetShowPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  >
                    <i className={`bx ${resetShowPassword ? 'bx-hide' : 'bx-show'}`} aria-hidden="true" />
                  </button>
                </div>
              </label>
            </div>

            <div className="modal-card__actions">
              <button
                type="button"
                className="action-button"
                onClick={() => setResetTarget(null)}
                disabled={isResetting}
              >
                Batal
              </button>
              <button
                type="button"
                className="action-button action-button--primary"
                onClick={() => void handleResetPassword()}
                disabled={isResetting}
              >
                {isResetting ? 'Menyimpan...' : 'Simpan password'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="modal-overlay" role="presentation" onClick={() => setDeleteTarget(null)}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-card__header">
              <div>
                <p className="modal-card__eyebrow">Hapus user</p>
                <h3 id="delete-title">{deleteTarget.fullName ?? deleteTarget.operatorName}</h3>
                <p className="modal-card__meta">
                  {deleteTarget.operatorCode} · {deleteTarget.role}
                </p>
              </div>
              <button type="button" className="modal-card__close" onClick={() => setDeleteTarget(null)}>
                Tutup
              </button>
            </div>

            <div className="modal-card__body">
              <p className="users-delete-confirm">
                Data user ini akan dihapus dari daftar operator. Lanjutkan?
              </p>
            </div>

            <div className="modal-card__actions">
              <button
                type="button"
                className="action-button"
                onClick={() => setDeleteTarget(null)}
              >
                Batal
              </button>
              <button
                type="button"
                className="action-button action-button--primary"
                onClick={() => {
                  handleDeleteProfile(deleteTarget)
                }}
              >
                Hapus user
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </StageCard>
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

function isDefaultAdminProfile(profile: OperatorProfile) {
  return (
    profile.operatorName.trim().toLowerCase() === 'admin' &&
    profile.operatorCode.trim() === '001' &&
    profile.role === 'admin'
  )
}

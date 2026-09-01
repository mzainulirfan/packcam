import { useEffect, useState } from 'react'
import type { InputHTMLAttributes } from 'react'

import { AuthShell } from '../components/auth/AuthShell'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Separator } from '../components/ui/separator'
import { bootstrapAdminApi, getBootstrapStatusApi, isApiReachable } from '@pakti/api-client'
import { useSystemConfig } from '@pakti/shared/systemConfig'

type MessageTone = 'info' | 'error'

const SETUP_HIGHLIGHTS = [
  {
    marker: '01',
    title: 'Buat identitas admin',
    description: 'Isi nama lengkap agar profil admin pertama punya identitas yang jelas.',
  },
  {
    marker: '02',
    title: 'Tentukan username dan kode',
    description: 'Username dipakai saat login, sementara kode user membantu identifikasi internal.',
  },
  {
    marker: '03',
    title: 'Set password login',
    description: 'Buat password yang aman agar akses awal ke aplikasi tetap terjaga.',
  },
  {
    marker: '04',
    title: 'Langsung siap dipakai',
    description: 'Sesudah akun dibuat, kamu bisa langsung masuk ke dashboard Pakti.',
  },
] as const

const NEXT_STEP_HIGHLIGHTS = [
  {
    marker: '01',
    title: 'Login dengan akun baru',
    description: 'Gunakan username dan password yang baru dibuat untuk masuk ke sistem.',
  },
  {
    marker: '02',
    title: 'Lanjut ke scan resi',
    description: 'Setelah login, alur kerja berikutnya langsung ke halaman Scan.',
  },
] as const

export function WelcomePage() {
  const systemConfig = useSystemConfig()
  const [fullName, setFullName] = useState('')
  const [operatorName, setOperatorName] = useState('')
  const [operatorCode, setOperatorCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('Isi konfigurasi untuk membuat akun admin pertama.')
  const [messageTone, setMessageTone] = useState<MessageTone>('info')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSetupDone, setIsSetupDone] = useState(false)
  const [serverReady, setServerReady] = useState<boolean | null>(null)
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)

  useEffect(() => {
    let active = true

    void isApiReachable()
      .then((reachable) => {
        if (active) {
          setServerReady(reachable)
        }
      })
      .catch(() => {
        if (active) {
          setServerReady(false)
        }
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true

    void getBootstrapStatusApi()
      .then((status) => {
        if (active) {
          setNeedsSetup(status.needsSetup)
        }
      })
      .catch(() => {
        if (active) {
          setNeedsSetup(false)
        }
      })

    return () => {
      active = false
    }
  }, [])

  async function handleCreateAdmin() {
    if (needsSetup === false) {
      setMessageTone('error')
      setMessage('Bootstrap sudah selesai. Silakan login dengan akun admin yang sudah ada.')
      return
    }

    const normalizedFullName = fullName.trim()
    const normalizedName = operatorName.trim()
    const normalizedCode = operatorCode.trim()
    const normalizedPassword = password.trim()
    const normalizedConfirmPassword = confirmPassword.trim()

    if (!normalizedFullName || !normalizedName || !normalizedCode || !normalizedPassword || !normalizedConfirmPassword) {
      setMessageTone('error')
      setMessage('Semua field wajib diisi.')
      return
    }

    if (normalizedPassword !== normalizedConfirmPassword) {
      setMessageTone('error')
      setMessage('Konfirmasi password tidak cocok.')
      return
    }

    setIsSubmitting(true)

    try {
      await bootstrapAdminApi({
        operatorName: normalizedName,
        operatorCode: normalizedCode,
        password: normalizedPassword,
        fullName: normalizedFullName,
      })
      setIsSetupDone(true)
    } catch (error) {
      setMessageTone('error')
      setMessage(error instanceof Error ? error.message : 'Gagal membuat akun admin.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isSetupDone) {
    return (
      <AuthShell
        appName={systemConfig.appName}
        brandMark={systemConfig.brandMark || systemConfig.appName.charAt(0).toUpperCase()}
        eyebrow="Setup selesai"
        title="Akun admin pertama siap dipakai"
        description="Akun admin sudah dibuat. Kamu bisa langsung login memakai username dan password yang baru saja diset."
        highlights={NEXT_STEP_HIGHLIGHTS}
        footerNote="Buka kembali layar login untuk masuk"
      >
        <Card className="auth-opencode__card w-full max-w-xl">
          <CardContent className="space-y-5 p-5 sm:p-6">
            <Alert variant="success">
              <AlertTitle>Akun berhasil dibuat</AlertTitle>
              <AlertDescription>
                Username dan password sudah tersimpan. Pastikan kredensial tersebut dicatat dengan benar.
              </AlertDescription>
            </Alert>

            <Button type="button" size="lg" className="h-10 w-full rounded-lg bg-[#000000] font-['Inter'] text-[13px] font-medium text-white hover:bg-[#31302e]" onClick={() => window.location.reload()}>
              Masuk
            </Button>
          </CardContent>
        </Card>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      appName={systemConfig.appName}
      brandMark={systemConfig.brandMark || systemConfig.appName.charAt(0).toUpperCase()}
      eyebrow="First-time setup"
      title="Buat akun admin pertama"
      description="Pakti belum menemukan akun admin di perangkat ini. Buat akun admin dulu supaya dashboard bisa dipakai untuk login, scan resi, dan mengelola operator lain."
      highlights={SETUP_HIGHLIGHTS}
      footerNote="Setup awal hanya perlu dilakukan sekali"
    >
      <Card className="auth-opencode__card w-full max-w-xl">
          <CardContent className="space-y-5 p-5 sm:p-6">
            {serverReady === false ? (
              <Alert variant="destructive">
                <AlertTitle>Server belum aktif</AlertTitle>
                <AlertDescription>
                  Setup admin membutuhkan backend API. Jalankan `npm run dev:full` agar frontend dan server aktif
                  bersamaan, lalu coba lagi.
                </AlertDescription>
              </Alert>
            ) : needsSetup === false ? (
              <Alert variant="info">
                <AlertTitle>Bootstrap sudah selesai</AlertTitle>
                <AlertDescription>
                  Server sudah memiliki akun admin. Halaman setup tidak diperlukan lagi, silakan login dengan akun
                  yang sudah ada.
                </AlertDescription>
              </Alert>
            ) : null}

            {needsSetup === false ? (
              <div className="grid gap-4">
                <div className="auth-opencode__note">
                  Bootstrap sudah selesai. Masuk ke halaman login untuk menggunakan akun admin yang sudah ada.
                </div>
                <Button type="button" size="lg" className="h-10 w-full rounded-lg bg-[#000000] font-['Inter'] text-[13px] font-medium text-white hover:bg-[#31302e]" onClick={() => window.location.reload()}>
                  Masuk
                </Button>
              </div>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  void handleCreateAdmin()
                }}
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    id="admin-full-name"
                    label="Nama lengkap"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Nama lengkap admin"
                    autoComplete="name"
                    description="Nama ini akan tampil di daftar user."
                  />

                  <Field
                    id="admin-username"
                    label="Username"
                    value={operatorName}
                    onChange={(event) => setOperatorName(event.target.value.replace(/\s+/g, ''))}
                    placeholder="Username login"
                    autoComplete="username"
                    description="Dipakai saat login ke aplikasi."
                  />
                </div>

                <Field
                  id="admin-code"
                  label="Kode operator"
                  value={operatorCode}
                  onChange={(event) => setOperatorCode(event.target.value)}
                  placeholder="001"
                  description="Kode unik untuk identitas admin."
                />

                <div className="grid gap-4 md:grid-cols-2">
                  <PasswordField
                    id="admin-password"
                    label="Password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Password admin"
                    autoComplete="new-password"
                    showPassword={showPassword}
                    onToggle={() => setShowPassword((current) => !current)}
                    helpText="Gunakan password yang aman dan simpan di tempat yang benar."
                  />

                  <PasswordField
                    id="admin-confirm-password"
                    label="Konfirmasi password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Ulangi password"
                    autoComplete="new-password"
                    showPassword={showPassword}
                    onToggle={() => setShowPassword((current) => !current)}
                    helpText="Pastikan password dan konfirmasi sama."
                  />
                </div>

                <Separator />

                {message ? (
                  <Alert variant={messageTone === 'error' ? 'destructive' : 'info'}>
                    <AlertTitle>{messageTone === 'error' ? 'Validasi setup' : 'Informasi'}</AlertTitle>
                    <AlertDescription>{message}</AlertDescription>
                  </Alert>
                ) : null}

                <Button type="submit" size="lg" className="h-10 w-full rounded-lg bg-[#000000] font-['Inter'] text-[13px] font-medium text-white hover:bg-[#31302e]" disabled={isSubmitting}>
                  {isSubmitting ? 'Membuat akun...' : 'Buat admin'}
                </Button>
              </form>
            )}
        </CardContent>
      </Card>
    </AuthShell>
  )
}

function Field({
  id,
  label,
  description,
  ...inputProps
}: {
  id: string
  label: string
  description?: string
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="auth-opencode__field space-y-2">
      <Label htmlFor={id}>
        {label}
      </Label>
      <Input id={id} className="auth-opencode__input" {...inputProps} />
      {description ? <p>{description}</p> : null}
    </div>
  )
}

function PasswordField({
  id,
  label,
  helpText,
  showPassword,
  onToggle,
  ...inputProps
}: {
  id: string
  label: string
  helpText?: string
  showPassword: boolean
  onToggle: () => void
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="auth-opencode__field space-y-2">
      <Label htmlFor={id}>
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type={showPassword ? 'text' : 'password'}
          className="auth-opencode__input pr-12"
          {...inputProps}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="auth-opencode__password-toggle absolute right-1 top-1/2 -translate-y-1/2"
          onClick={onToggle}
          aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
        >
          {showPassword ? 'Sembunyikan' : 'Tampilkan'}
        </Button>
      </div>
      {helpText ? <p>{helpText}</p> : null}
    </div>
  )
}

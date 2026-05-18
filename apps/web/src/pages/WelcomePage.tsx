import { useEffect, useState } from 'react'
import type { InputHTMLAttributes } from 'react'
import {
  ArrowRight,
  BadgeCheck,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
  UserRoundPlus,
  Workflow,
} from 'lucide-react'

import { AuthShell } from '../components/auth/AuthShell'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Separator } from '../components/ui/separator'
import { bootstrapAdminApi, getBootstrapStatusApi, isApiReachable } from '@pakti/api-client'
import { useSystemConfig } from '@pakti/shared/systemConfig'

type MessageTone = 'info' | 'error'

const SETUP_HIGHLIGHTS = [
  {
    icon: UserRoundPlus,
    title: 'Buat identitas admin',
    description: 'Isi nama lengkap agar profil admin pertama punya identitas yang jelas.',
  },
  {
    icon: Workflow,
    title: 'Tentukan username dan kode',
    description: 'Username dipakai saat login, sementara kode user membantu identifikasi internal.',
  },
  {
    icon: KeyRound,
    title: 'Set password login',
    description: 'Buat password yang aman agar akses awal ke aplikasi tetap terjaga.',
  },
  {
    icon: ShieldCheck,
    title: 'Langsung siap dipakai',
    description: 'Sesudah akun dibuat, kamu bisa langsung masuk ke dashboard Pakti.',
  },
] as const

const NEXT_STEP_HIGHLIGHTS = [
  {
    icon: BadgeCheck,
    title: 'Login dengan akun baru',
    description: 'Gunakan username dan password yang baru dibuat untuk masuk ke sistem.',
  },
  {
    icon: Workflow,
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
        <Card className="w-full max-w-xl border-slate-200/80 bg-white/95 shadow-2xl shadow-slate-900/10 backdrop-blur">
          <CardHeader className="space-y-3 p-6 pb-0">
            <div className="flex items-center gap-3">
              <div className="grid size-12 place-items-center rounded-2xl bg-emerald-600 text-sm font-semibold text-white shadow-sm">
                <BadgeCheck className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{systemConfig.appName}</p>
                <CardTitle className="text-2xl">Setup selesai</CardTitle>
              </div>
            </div>
            <CardDescription className="max-w-lg text-sm leading-6 text-slate-500">
              Akun admin pertama berhasil dibuat. Klik tombol di bawah untuk kembali ke halaman login.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5 pt-6">
            <Alert variant="success">
              <AlertTitle>Akun berhasil dibuat</AlertTitle>
              <AlertDescription>
                Username dan password sudah tersimpan. Pastikan kredensial tersebut dicatat dengan benar.
              </AlertDescription>
            </Alert>

            <Button type="button" size="lg" className="w-full" onClick={() => window.location.reload()}>
              Lanjut ke Login
              <ArrowRight className="size-4" />
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
      <Card className="w-full max-w-xl border-slate-200/80 bg-white/95 shadow-2xl shadow-slate-900/10 backdrop-blur">
        <CardHeader className="space-y-4 p-6 pb-0">
          <div className="flex items-center gap-3">
            <div className="grid size-12 place-items-center rounded-2xl bg-slate-950 text-sm font-semibold text-white shadow-sm">
              {systemConfig.brandMark || systemConfig.appName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{systemConfig.appName}</p>
              <CardTitle className="text-2xl">Setup admin</CardTitle>
            </div>
          </div>
          <CardDescription className="max-w-lg text-sm leading-6 text-slate-500">{systemConfig.tagline}</CardDescription>
        </CardHeader>

          <CardContent className="space-y-5 pt-6">
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
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-500">
                  Bootstrap sudah selesai. Masuk ke halaman login untuk menggunakan akun admin yang sudah ada.
                </div>
                <Button type="button" size="lg" className="w-full" onClick={() => window.location.reload()}>
                  Ke Login
                  <ArrowRight className="size-4" />
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
                    label="full_name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Nama lengkap admin"
                    autoComplete="name"
                    description="Nama ini akan tampil di daftar user."
                  />

                  <Field
                    id="admin-username"
                    label="username"
                    value={operatorName}
                    onChange={(event) => setOperatorName(event.target.value.replace(/\s+/g, ''))}
                    placeholder="Username login"
                    autoComplete="username"
                    description="Dipakai saat login ke aplikasi."
                  />
                </div>

                <Field
                  id="admin-code"
                  label="operator_code"
                  value={operatorCode}
                  onChange={(event) => setOperatorCode(event.target.value)}
                  placeholder="001"
                  description="Kode unik untuk identitas admin."
                />

                <div className="grid gap-4 md:grid-cols-2">
                  <PasswordField
                    id="admin-password"
                    label="password"
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
                    label="confirm_password"
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

                <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <LoaderCircle className="size-4 animate-spin" />
                      Membuat akun...
                    </>
                  ) : (
                    <>
                      Buat akun admin
                      <ArrowRight className="size-4" />
                    </>
                  )}
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
    <div className="space-y-2">
      <Label htmlFor={id} className="text-xs uppercase tracking-[0.18em] text-slate-500">
        {label}
      </Label>
      <Input id={id} className="h-12" {...inputProps} />
      {description ? <p className="text-xs leading-5 text-slate-500">{description}</p> : null}
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
    <div className="space-y-2">
      <Label htmlFor={id} className="text-xs uppercase tracking-[0.18em] text-slate-500">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type={showPassword ? 'text' : 'password'}
          className="h-12 pr-12"
          {...inputProps}
        />
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
      {helpText ? <p className="text-xs leading-5 text-slate-500">{helpText}</p> : null}
    </div>
  )
}

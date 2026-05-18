import { useState } from 'react'
import { ArrowRight, Eye, EyeOff, LoaderCircle, ScanSearch, ShieldCheck, Workflow } from 'lucide-react'

import { authOperatorByUsername } from '../app/operatorSession'
import { navigateTo } from '../app/uiState'
import { AuthShell } from '../components/auth/AuthShell'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Separator } from '../components/ui/separator'
import { useSystemConfig } from '@pakti/shared/systemConfig'

type MessageTone = 'info' | 'error'

const LOGIN_HIGHLIGHTS = [
  {
    icon: ShieldCheck,
    title: 'Akses operator terkontrol',
    description: 'Hanya akun yang sudah terdaftar yang bisa masuk ke dashboard Pakti.',
  },
  {
    icon: ScanSearch,
    title: 'Masuk lalu scan',
    description: 'Begitu login berhasil, operator langsung diarahkan ke alur kerja scan resi.',
  },
  {
    icon: Workflow,
    title: 'Workflow tetap ringkas',
    description: 'Tampilan fokus ke proses kerja, bukan ke dekorasi yang mengganggu.',
  },
] as const

export function OperatorLoginPage() {
  const systemConfig = useSystemConfig()
  const [operatorName, setOperatorName] = useState('')
  const [operatorPassword, setOperatorPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('Masuk dengan username dan password akun yang sudah terdaftar.')
  const [messageTone, setMessageTone] = useState<MessageTone>('info')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleLogin() {
    const name = operatorName.trim()
    const password = operatorPassword.trim()

    if (!name || !password) {
      setMessageTone('error')
      setMessage('Username dan kata sandi wajib diisi.')
      return
    }

    setIsSubmitting(true)

    try {
      await authOperatorByUsername(name, password)
      navigateTo('scan')
    } catch (error) {
      setMessageTone('error')
      setMessage(error instanceof Error ? error.message : 'Gagal melakukan auth operator.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthShell
      appName={systemConfig.appName}
      brandMark={systemConfig.brandMark || systemConfig.appName.charAt(0).toUpperCase()}
      eyebrow="Operator login"
      title="Masuk ke dashboard Pakti"
      description={`${systemConfig.tagline} Gunakan akun operator yang sudah terdaftar untuk masuk dan memulai proses scan.`}
      highlights={LOGIN_HIGHLIGHTS}
      footerNote="Login aman untuk desktop operasional"
    >
      <Card className="w-full max-w-xl border-slate-200/80 bg-white/95 shadow-2xl shadow-slate-900/10 backdrop-blur">
        <CardHeader className="space-y-4 p-6 pb-0">
          <div className="flex items-center gap-3">
            <div className="grid size-12 place-items-center rounded-2xl bg-slate-950 text-sm font-semibold text-white shadow-sm">
              {systemConfig.brandMark || systemConfig.appName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{systemConfig.appName}</p>
              <CardTitle className="text-2xl">Login operator</CardTitle>
            </div>
          </div>
          <CardDescription className="max-w-lg text-sm leading-6 text-slate-500">
            Masuk dengan username dan password yang sudah dibuat untuk operator ini.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5 pt-6">
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              void handleLogin()
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="operator-username" className="text-xs uppercase tracking-[0.18em] text-slate-500">
                username
              </Label>
              <Input
                id="operator-username"
                value={operatorName}
                onChange={(event) => setOperatorName(event.target.value)}
                placeholder="Username"
                autoComplete="username"
                className="h-12"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="operator-password" className="text-xs uppercase tracking-[0.18em] text-slate-500">
                password
              </Label>
              <div className="relative">
                <Input
                  id="operator-password"
                  type={showPassword ? 'text' : 'password'}
                  value={operatorPassword}
                  onChange={(event) => setOperatorPassword(event.target.value)}
                  placeholder="Password"
                  autoComplete="current-password"
                  className="h-12 pr-12"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-950"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
              </div>
            </div>

            <Separator />

            {message ? (
              <Alert variant={messageTone === 'error' ? 'destructive' : 'info'}>
                <AlertTitle>{messageTone === 'error' ? 'Login gagal' : 'Informasi'}</AlertTitle>
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  Memproses...
                </>
              ) : (
                <>
                  Masuk
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  )
}

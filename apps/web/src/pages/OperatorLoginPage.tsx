import { useState } from 'react'

import { authOperatorByUsername } from '../app/operatorSession'
import { navigateTo } from '../app/uiState'
import { AuthShell } from '../components/auth/AuthShell'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { useSystemConfig } from '@pakti/shared/systemConfig'

type MessageTone = 'info' | 'error'

const LOGIN_HIGHLIGHTS = [
  {
    marker: '01',
    title: 'Akses operator terkontrol',
    description: 'Hanya akun yang sudah terdaftar yang bisa masuk ke dashboard Pakti.',
  },
  {
    marker: '02',
    title: 'Masuk lalu scan',
    description: 'Begitu login berhasil, operator langsung diarahkan ke alur kerja scan resi.',
  },
  {
    marker: '03',
    title: 'Workflow tetap ringkas',
    description: 'Tampilan fokus ke proses kerja, bukan ke dekorasi yang mengganggu.',
  },
] as const

export function OperatorLoginPage() {
  const systemConfig = useSystemConfig()
  const [operatorName, setOperatorName] = useState('')
  const [operatorPassword, setOperatorPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [messageTone, setMessageTone] = useState<MessageTone>('info')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleLogin() {
    const name = operatorName.trim()
    const password = operatorPassword.trim()

    setMessage(null)
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
      brandMark={systemConfig.brandMark || systemConfig.appName.charAt(0).toUpperCase()}
      eyebrow="Operator login"
      title="Masuk ke dashboard Pakti"
      description={`${systemConfig.tagline} Gunakan akun operator yang sudah terdaftar untuk masuk dan memulai proses scan.`}
      highlights={LOGIN_HIGHLIGHTS}
      footerNote="Login aman untuk desktop operasional"
    >
      <Card className="w-full overflow-hidden rounded-[12px] border border-[#e6e6e6] bg-white shadow-none">
        <CardContent className="space-y-4 p-5">
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              void handleLogin()
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="operator-username" className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">
                Username
              </Label>
              <Input
                id="operator-username"
                value={operatorName}
                onChange={(event) => {
                  setOperatorName(event.target.value)
                  if (message) setMessage(null)
                }}
                placeholder="Username"
                autoComplete="username"
                className="h-8 rounded-[4px] border-[#e6e6e6] bg-white px-3 font-['Inter'] text-[13px] placeholder:text-[#a39e98] focus-visible:border-[#8f8a84] focus-visible:ring-0"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="operator-password" className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="operator-password"
                  type={showPassword ? 'text' : 'password'}
                  value={operatorPassword}
                  onChange={(event) => {
                    setOperatorPassword(event.target.value)
                    if (message) setMessage(null)
                  }}
                  placeholder="Password"
                  autoComplete="current-password"
                  className="h-8 rounded-[4px] border-[#e6e6e6] bg-white px-3 pr-16 font-['Inter'] text-[13px] placeholder:text-[#a39e98] focus-visible:border-[#8f8a84] focus-visible:ring-0"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 h-6 -translate-y-1/2 rounded-[4px] bg-white px-2 font-['Inter'] text-[11px] font-medium text-[#615d59] hover:bg-[#f6f5f4] hover:text-[#000000]"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                >
                  {showPassword ? 'Sembunyikan' : 'Tampilkan'}
                </Button>
              </div>
            </div>

            {message && messageTone === 'error' ? (
              <Alert variant="destructive" className="rounded-[8px] border-[#fecaca] bg-[#fee2e2] font-['Inter'] text-[13px]">
                <AlertTitle className="font-['Inter'] text-[13px] font-semibold text-[#991b1b]">Login gagal</AlertTitle>
                <AlertDescription className="font-['Inter'] text-[12px] leading-5 text-[#991b1b]">{message}</AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" size="lg" className="h-8 w-full rounded-[8px] bg-[#000000] font-['Inter'] text-[13px] font-medium text-white hover:bg-[#31302e]" disabled={isSubmitting}>
              {isSubmitting ? 'Memproses...' : 'Masuk'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  )
}

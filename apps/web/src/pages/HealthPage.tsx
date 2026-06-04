import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Database, HardDriveDownload, RefreshCcw, ShieldAlert, Sparkles, SquareActivity, XCircle } from 'lucide-react'

import { StageCard } from '../components/StageCard'
import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Separator } from '../components/ui/separator'
import { ModalOverlay } from '../components/ui/ModalOverlay'
import { DialogCloseButton } from '../components/ui/dialog'
import { DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { getBuildInfo } from '@pakti/shared'
import {
  clearServerAllDataApi,
  clearServerLastErrorApi,
  clearServerScanDataApi,
  readServerHealthApi,
} from '@pakti/api-client'

type ServerHealthSnapshot = {
  status: string
  build: {
    appName: string
    tagline: string
  }
  system: Record<string, unknown>
  settings: Record<string, unknown>
  bootstrap: {
    needsSetup: boolean
    adminCount: number
    operatorCount: number
  }
  storage: {
    counts: {
      operatorProfiles: number
      sessions: number
      recordings: number
      scanLogs: number
    }
  }
  lastError: { message: string; createdAt: string } | null
}

type ModalState = 'scan' | 'all' | null

export function HealthPage() {
  const buildInfo = getBuildInfo()
  const [serverHealth, setServerHealth] = useState<ServerHealthSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('Memuat ringkasan server...')
  const [activeModal, setActiveModal] = useState<ModalState>(null)

  useEffect(() => {
    let active = true

    void readServerHealthApi()
      .then((snapshot) => {
        if (!active) {
          return
        }

        setServerHealth(snapshot as ServerHealthSnapshot)
        setMessage('Ringkasan server dimuat.')
      })
      .catch(() => {
        if (!active) {
          return
        }

        setServerHealth(null)
        setMessage('Sesi login diperlukan atau server belum aktif. Ringkasan data belum bisa dimuat.')
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    function handleRealtimeHealthUpdate() {
      void refreshHealth()
    }

    const events = [
      'pakti:recordings-updated',
      'pakti:scan-logs-updated',
      'pakti:operators-updated',
      'pakti:sessions-updated',
      'pakti:settings-updated',
      'pakti:system-config-change',
      'pakti:last-error-updated',
    ] as const

    for (const eventName of events) {
      window.addEventListener(eventName, handleRealtimeHealthUpdate)
    }

    return () => {
      for (const eventName of events) {
        window.removeEventListener(eventName, handleRealtimeHealthUpdate)
      }
    }
  }, [])

  async function refreshHealth() {
    setLoading(true)
    try {
      const snapshot = await readServerHealthApi()
      setServerHealth(snapshot as ServerHealthSnapshot)
      setMessage('Ringkasan server dimuat.')
    } catch {
      setServerHealth(null)
      setMessage('Sesi login diperlukan atau server belum aktif. Ringkasan data belum bisa dimuat.')
    } finally {
      setLoading(false)
    }
  }

  async function handleClearScanData() {
    setActiveModal(null)
    await clearServerScanDataApi()
    await refreshHealth()
  }

  async function handleClearAllData() {
    setActiveModal(null)
    await clearServerAllDataApi()
    await refreshHealth()
  }

  const runtimeChecks = [
    {
      label: 'MediaDevices',
      description: 'Akses kamera dan perangkat media tersedia.',
      value: typeof navigator !== 'undefined' && !!navigator.mediaDevices,
    },
    {
      label: 'Secure Context',
      description: 'Kamera hanya bisa dipakai di HTTPS atau localhost.',
      value: typeof window !== 'undefined' && window.isSecureContext,
    },
    {
      label: 'MediaRecorder',
      description: 'Mesin perekaman video dapat dipakai.',
      value: typeof MediaRecorder !== 'undefined',
    },
    {
      label: 'Browser runtime',
      description: 'Environment browser yang dibutuhkan aplikasi tersedia.',
      value: typeof window !== 'undefined',
    },
    {
      label: 'Server API',
      description: 'Akses fetch untuk berbicara dengan backend tersedia.',
      value: typeof window !== 'undefined' && typeof window.fetch === 'function',
    },
  ] as const

  const dataStats = [
    { label: 'Settings', value: String(Object.keys(serverHealth?.settings ?? {}).length), icon: Database },
    { label: 'Recordings', value: String(serverHealth?.storage?.counts?.recordings ?? 0), icon: HardDriveDownload },
    { label: 'Scan logs', value: String(serverHealth?.storage?.counts?.scanLogs ?? 0), icon: SquareActivity },
    { label: 'Last error', value: serverHealth?.lastError ? '1' : '0', icon: AlertTriangle },
  ] as const

  return (
    <StageCard title="Health">
      <div className="grid gap-4">
        <section className="grid gap-4 rounded-[2rem] border border-slate-200/80 bg-gradient-to-br from-white to-slate-50 p-4 shadow-xl shadow-slate-900/5 lg:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid gap-2">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs uppercase tracking-[0.22em] text-slate-500">
                <Sparkles className="size-3.5" />
                System diagnostics
              </div>
              <h3 className="text-2xl font-semibold tracking-tight text-slate-950">Status kesehatan aplikasi</h3>
              <p className="max-w-3xl text-sm leading-6 text-slate-500">
                Halaman ini memperlihatkan status runtime, ringkasan data server, serta akses cepat untuk membersihkan data
                bila diperlukan.
              </p>
            </div>

            <Card className="border-slate-200/80 bg-white shadow-sm shadow-slate-900/5">
              <CardContent className="grid gap-2 p-4 text-sm text-slate-500">
                <div className="flex items-center justify-between gap-10">
                  <span>Version</span>
                  <strong className="text-slate-950">{buildInfo.version}</strong>
                </div>
                <div className="flex items-center justify-between gap-10">
                  <span>Build time</span>
                  <strong className="text-slate-950">{buildInfo.buildTime}</strong>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {dataStats.map((item) => {
              const Icon = item.icon
              return (
                <Card key={item.label} className="border-slate-200/80 shadow-sm shadow-slate-900/5">
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{item.label}</p>
                      <div className="grid size-9 place-items-center rounded-xl bg-slate-950 text-white">
                        <Icon className="size-4" />
                      </div>
                    </div>
                    <div className="text-3xl font-semibold tracking-tight text-slate-950">{item.value}</div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </section>

        <Alert variant={serverHealth ? 'info' : 'destructive'}>
          <div className="grid gap-1">
            <p className="font-medium">Status server</p>
            <p className="text-sm leading-6 text-current/80">{loading ? 'Memuat ringkasan server...' : message}</p>
          </div>
        </Alert>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <Card className="border-slate-200/80 shadow-xl shadow-slate-900/5">
            <CardHeader className="space-y-2">
              <CardTitle className="text-lg">Runtime checks</CardTitle>
              <CardDescription>Komponen browser dan platform yang dibutuhkan aplikasi.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              {runtimeChecks.map((check) => (
                <div
                  key={check.label}
                  className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-slate-950">{check.label}</div>
                    <p className="mt-1 text-sm leading-6 text-slate-500">{check.description}</p>
                  </div>
                  <span
                    className={
                      check.value
                        ? 'inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700'
                        : 'inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700'
                    }
                  >
                    {check.value ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
                      {check.value ? 'OK' : 'Missing'}
                    </span>
                  </div>
                ))}
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 shadow-xl shadow-slate-900/5">
            <CardHeader className="space-y-2">
              <CardTitle className="text-lg">Data overview</CardTitle>
              <CardDescription>Ringkasan data yang tersimpan di server saat ini.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Recordings</p>
                  <strong className="mt-2 block text-2xl tracking-tight text-slate-950">
                    {serverHealth?.storage?.counts?.recordings ?? 0}
                  </strong>
                  <p className="mt-2 text-sm leading-6 text-slate-500">File video yang sudah direkam dan dicatat.</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Scan logs</p>
                  <strong className="mt-2 block text-2xl tracking-tight text-slate-950">
                    {serverHealth?.storage?.counts?.scanLogs ?? 0}
                  </strong>
                  <p className="mt-2 text-sm leading-6 text-slate-500">Log aktivitas scan, QC, dan packing.</p>
                </div>
              </div>

              <Separator />

              {serverHealth?.lastError ? (
              <Alert variant="destructive">
                  <div className="grid gap-3">
                    <p className="flex items-center gap-2 font-medium">
                      <ShieldAlert className="size-4" />
                      Last error
                    </p>
                    <p className="leading-6 text-current/80">{serverHealth.lastError.message}</p>
                    <p className="text-xs uppercase tracking-[0.18em] text-current/70">{serverHealth.lastError.createdAt}</p>
                    <div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void clearServerLastErrorApi().then(() => refreshHealth())}
                      >
                        Clear error
                      </Button>
                    </div>
                  </div>
                </Alert>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  Belum ada error terakhir.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="border-rose-200/80 bg-gradient-to-br from-white to-rose-50/70 shadow-xl shadow-slate-900/5">
          <CardHeader className="space-y-2">
            <CardTitle className="text-lg text-slate-950">Reset data</CardTitle>
            <CardDescription>
              Gunakan aksi ini hanya jika perlu membersihkan data proses atau menghapus seluruh data Pakti.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <Alert variant="info">
              <div className="grid gap-1">
                <p className="font-medium">Perhatian</p>
                <p className="text-sm leading-6 text-current/80">
                  Reset scan menghapus data QC, packing, recording, dan log. Reset all akan menghapus seluruh data server
                  termasuk user dan session login.
                </p>
              </div>
            </Alert>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                className="border-slate-200 bg-white"
                onClick={() => setActiveModal('scan')}
              >
                Hapus data scan
              </Button>
              <Button type="button" variant="destructive" onClick={() => setActiveModal('all')}>
                Hapus semua data
              </Button>
            </div>
          </CardContent>
        </Card>

        {activeModal === 'scan' ? (
          <ConfirmDialog
            title="Hapus data scan?"
            description="Aksi ini hanya menghapus data scan, recording, dan log. Data user/operator tetap aman."
            confirmLabel="Hapus data scan"
            tone="info"
            onCancel={() => setActiveModal(null)}
            onConfirm={handleClearScanData}
            disabled={loading}
          />
        ) : null}

        {activeModal === 'all' ? (
          <ConfirmDialog
            title="Hapus semua data?"
            description="Aksi ini akan menghapus semua data Pakti, termasuk user, session login, recording, log, dan pengaturan."
            confirmLabel="Hapus semua data"
            tone="danger"
            onCancel={() => setActiveModal(null)}
            onConfirm={handleClearAllData}
            disabled={loading}
          />
        ) : null}
      </div>
    </StageCard>
  )
}

function ConfirmDialog({
  title,
  description,
  confirmLabel,
  tone,
  onCancel,
  onConfirm,
  disabled = false,
}: {
  title: string
  description: string
  confirmLabel: string
  tone: 'info' | 'danger'
  onCancel: () => void
  onConfirm: () => void | Promise<void>
  disabled?: boolean
}) {
  return (
    <ModalOverlay onClose={onCancel} contentClassName="max-w-lg">
      <div className="grid gap-4">
        <DialogHeader className="flex-row items-start justify-between gap-4">
          <div className="grid gap-2">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Peringatan</p>
            <DialogTitle
              id={tone === 'danger' ? 'health-reset-title' : 'health-reset-scan-title'}
              className="text-lg font-semibold tracking-tight text-slate-950"
            >
              {title}
            </DialogTitle>
            <DialogDescription className="text-sm leading-6 text-slate-500">{description}</DialogDescription>
          </div>
          <DialogCloseButton onClick={onCancel} />
        </DialogHeader>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onCancel}>
            Batal
          </Button>
          <Button
            type="button"
            variant={tone === 'danger' ? 'destructive' : 'default'}
            onClick={() => void onConfirm()}
            disabled={disabled}
          >
            <RefreshCcw className="size-4" />
            {confirmLabel}
          </Button>
        </div>
      </div>
    </ModalOverlay>
  )
}

import { useEffect, useState } from 'react'

import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
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

  return (
    <div className="health-opencode mx-auto grid w-full max-w-[1520px] gap-5 px-0 py-1">
        <section className="health-opencode__summary flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="grid gap-2">
            <div className="health-opencode__section-label">[+] Health</div>
            <h1 className="health-opencode__title">Health</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="health-opencode__badge">v{buildInfo.version}</span>
            <span className="health-opencode__badge">{serverHealth ? '[x] server' : '[!] server'}</span>
          </div>
        </section>

        <Alert variant={serverHealth ? 'info' : 'destructive'}>
          <div className="health-opencode__alert grid gap-1">
            <p>{serverHealth ? '[x]' : '[!]'} Status server</p>
            <p>{loading ? 'Memuat ringkasan server...' : message}</p>
          </div>
        </Alert>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="health-opencode__panel">
            <CardHeader className="space-y-2">
              <CardTitle>Runtime checks</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              {runtimeChecks.map((check) => (
                <div
                  key={check.label}
                  className="health-opencode__check-row"
                >
                  <div className="min-w-0">
                    <div>{check.label}</div>
                  </div>
                  <span className="health-opencode__badge">
                    {check.value ? '[x] OK' : '[!] Missing'}
                    </span>
                  </div>
                ))}
            </CardContent>
          </Card>

          <Card className="health-opencode__panel">
            <CardHeader className="space-y-2">
              <CardTitle>Server data</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="grid gap-2">
                <DataLine label="Recordings" value={serverHealth?.storage?.counts?.recordings ?? 0} />
                <DataLine label="Scan logs" value={serverHealth?.storage?.counts?.scanLogs ?? 0} />
                <DataLine label="Operators" value={serverHealth?.storage?.counts?.operatorProfiles ?? 0} />
                <DataLine label="Sessions" value={serverHealth?.storage?.counts?.sessions ?? 0} />
              </div>

              {serverHealth?.lastError ? (
              <Alert variant="destructive">
                  <div className="health-opencode__alert grid gap-3">
                    <p>
                      [!] Last error
                    </p>
                    <p>{serverHealth.lastError.message}</p>
                    <p>{serverHealth.lastError.createdAt}</p>
                    <div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void clearServerLastErrorApi().then(() => refreshHealth())}
                      >
                        [clear-error]
                      </Button>
                    </div>
                  </div>
                </Alert>
              ) : (
                <div className="health-opencode__empty">
                  [-] Belum ada error terakhir.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="health-opencode__panel">
          <CardHeader className="space-y-2">
            <CardTitle>Reset data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <Alert variant="info">
              <div className="grid gap-1">
                <p>[!] Perhatian</p>
                <p>
                  Reset scan menghapus data QC, packing, recording, dan log. Reset all akan menghapus seluruh data server
                  termasuk user dan session login.
                </p>
              </div>
            </Alert>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                className="health-opencode__button"
                onClick={() => setActiveModal('scan')}
              >
                [clear-scan]
              </Button>
              <Button type="button" variant="destructive" className="health-opencode__button" onClick={() => setActiveModal('all')}>
                [clear-all]
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
  )
}

function DataLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="health-opencode__list-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
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
    <ModalOverlay onClose={onCancel} contentClassName="health-opencode__modal max-w-lg">
      <div className="grid gap-4">
        <DialogHeader className="health-opencode__modal-header flex-row items-start justify-between gap-4">
          <div className="grid gap-2">
            <p>{tone === 'danger' ? '[!]' : '[+]'} Peringatan</p>
            <DialogTitle
              id={tone === 'danger' ? 'health-reset-title' : 'health-reset-scan-title'}
            >
              {title}
            </DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </div>
          <DialogCloseButton onClick={onCancel} />
        </DialogHeader>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" className="health-opencode__button" onClick={onCancel}>
            [cancel]
          </Button>
          <Button
            type="button"
            variant={tone === 'danger' ? 'destructive' : 'default'}
            className="health-opencode__button"
            onClick={() => void onConfirm()}
            disabled={disabled}
          >
            [{confirmLabel.toLowerCase().replaceAll(' ', '-')}]
          </Button>
        </div>
      </div>
    </ModalOverlay>
  )
}

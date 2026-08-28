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

  async function loadHealthSnapshot(successMessage = 'Ringkasan server dimuat.') {
    const snapshot = await readServerHealthApi()
    setServerHealth(snapshot as ServerHealthSnapshot)
    setMessage(successMessage)
  }

  useEffect(() => {
    let active = true

    void loadHealthSnapshot()
      .then(() => {
        if (!active) {
          return
        }
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
      'pakti:chat-sends-updated',
      'pakti:shipping-chat-sends-updated',
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
      await loadHealthSnapshot()
    } catch {
      setServerHealth(null)
      setMessage('Sesi login diperlukan atau server belum aktif. Ringkasan data belum bisa dimuat.')
    } finally {
      setLoading(false)
    }
  }

  async function handleClearScanData() {
    setLoading(true)
    try {
      setActiveModal(null)
      await clearServerScanDataApi()
      await loadHealthSnapshot('Data scan, recording, dan log berhasil dihapus.')
    } catch {
      setMessage('Reset scan gagal. Server belum merespons atau sesi login tidak valid.')
    } finally {
      setLoading(false)
    }
  }

  async function handleClearAllData() {
    setLoading(true)
    try {
      setActiveModal(null)
      await clearServerAllDataApi()
      await loadHealthSnapshot('Semua data server berhasil dihapus.')
    } catch {
      setMessage('Reset semua data gagal. Server belum merespons atau sesi login tidak valid.')
    } finally {
      setLoading(false)
    }
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
    <div className="health-opencode grid w-full gap-5 px-0 py-1">
      <section className="health-opencode__summary flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-2">
          <div className="health-opencode__section-label">[+] Health</div>
          <h1 className="health-opencode__title">Health Console</h1>
          <p className="health-opencode__lede">Diagnosa runtime, server, storage, dan reset data.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="health-opencode__badge">v{buildInfo.version}</span>
          <span className="health-opencode__badge">{serverHealth ? '[x] server' : '[!] server'}</span>
          <span className="health-opencode__badge">{loading ? '[~] loading' : '[x] idle'}</span>
          <Button type="button" variant="outline" className="health-opencode__button" onClick={() => void refreshHealth()}>
            [refresh]
          </Button>
        </div>
      </section>

      <Alert variant={serverHealth ? 'info' : 'destructive'}>
        <div className="health-opencode__alert grid gap-1">
          <p>{serverHealth ? '[x]' : '[!]'} Status server</p>
          <p>{loading ? 'Memuat ringkasan server...' : message}</p>
        </div>
      </Alert>

      {serverHealth?.lastError ? (
        <Alert variant="destructive">
          <div className="health-opencode__alert grid gap-3">
            <p>[!] Last error</p>
            <p>{serverHealth.lastError.message}</p>
            <p>{serverHealth.lastError.createdAt}</p>
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="health-opencode__button"
                onClick={() => void clearServerLastErrorApi().then(() => refreshHealth())}
              >
                [clear-error]
              </Button>
            </div>
          </div>
        </Alert>
      ) : null}

      <Card className="health-opencode__panel">
        <CardHeader>
          <CardTitle>System overview</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {loading && !serverHealth ? (
            <div className="health-opencode__empty">[~] Memuat status server...</div>
          ) : (
            <div className="health-opencode__stats">
              <Metric index="01" label="Status" value={serverHealth?.status ?? 'offline'} />
              <Metric index="02" label="Bootstrap" value={serverHealth?.bootstrap?.needsSetup ? 'needed' : serverHealth ? 'ready' : '-'} />
              <Metric index="03" label="Operators" value={String(serverHealth?.storage?.counts?.operatorProfiles ?? 0)} />
              <Metric index="04" label="Sessions" value={String(serverHealth?.storage?.counts?.sessions ?? 0)} />
              <Metric index="05" label="Recordings" value={String(serverHealth?.storage?.counts?.recordings ?? 0)} />
              <Metric index="06" label="Scan logs" value={String(serverHealth?.storage?.counts?.scanLogs ?? 0)} />
              <Metric index="07" label="Last error" value={serverHealth?.lastError ? 'ada' : 'clear'} />
              <Metric index="08" label="Secure context" value={typeof window !== 'undefined' && window.isSecureContext ? 'ready' : 'missing'} />
            </div>
          )}
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="health-opencode__panel">
          <CardHeader>
            <CardTitle>Runtime diagnostics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            {runtimeChecks.map((check) => (
              <RuntimeCheckRow key={check.label} label={check.label} description={check.description} value={check.value} />
            ))}
          </CardContent>
        </Card>

        <Card className="health-opencode__panel">
          <CardHeader>
            <CardTitle>Danger zone</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <DangerAction
              title="Reset scan data"
              description="Menghapus data QC, packing, recording, dan log. User/operator tetap aman."
              actionLabel="[clear-scan]"
              onClick={() => setActiveModal('scan')}
            />
            <DangerAction
              title="Reset all data"
              description="Menghapus seluruh data server, termasuk user, session login, recording, log, dan pengaturan."
              actionLabel="[clear-all]"
              onClick={() => setActiveModal('all')}
              destructive
            />
          </CardContent>
        </Card>
      </section>

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

function Metric({ index, label, value }: { index: string; label: string; value: string }) {
  return (
    <div className="health-opencode__stat">
      <span>{index}</span>
      <p>{label}<br /><strong>{value}</strong></p>
    </div>
  )
}

function RuntimeCheckRow({ label, description, value }: { label: string; description: string; value: boolean }) {
  return (
    <div className="health-opencode__check-row">
      <div className="min-w-0">
        <div>{label}</div>
        <p>{description}</p>
      </div>
      <span className="health-opencode__badge">{value ? '[x] OK' : '[!] Missing'}</span>
    </div>
  )
}

function DangerAction({
  title,
  description,
  actionLabel,
  onClick,
  destructive = false,
}: {
  title: string
  description: string
  actionLabel: string
  onClick: () => void
  destructive?: boolean
}) {
  return (
    <div className="health-opencode__list-row items-center">
      <span className="min-w-0">
        <strong>{title}</strong>
        <small className="block">{description}</small>
      </span>
      <Button type="button" variant={destructive ? 'destructive' : 'outline'} className="health-opencode__button" onClick={onClick}>
        {actionLabel}
      </Button>
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

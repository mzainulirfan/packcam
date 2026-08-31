import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Activity01Icon,
  Alert01Icon,
  Cancel01Icon,
  CheckmarkCircle01Icon,
  CloudServerIcon,
  Database02Icon,
  Delete02Icon,
  RefreshIcon,
  Shield01Icon,
} from '@hugeicons/core-free-icons'

import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { ModalOverlay } from '../components/ui/ModalOverlay'
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

  const loadHealthSnapshot = useCallback(async (successMessage = 'Ringkasan server dimuat.') => {
    const snapshot = await readServerHealthApi()
    setServerHealth(snapshot as ServerHealthSnapshot)
    setMessage(successMessage)
  }, [])

  const refreshHealth = useCallback(async () => {
    setLoading(true)
    try {
      await loadHealthSnapshot()
    } catch {
      setServerHealth(null)
      setMessage('Sesi login diperlukan atau server belum aktif. Ringkasan data belum bisa dimuat.')
    } finally {
      setLoading(false)
    }
  }, [loadHealthSnapshot])

  useEffect(() => {
    let active = true

    queueMicrotask(() => {
      void loadHealthSnapshot()
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
    })

    return () => {
      active = false
    }
  }, [loadHealthSnapshot])

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
  }, [refreshHealth])

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
    <div className="health-page mx-auto max-w-[1240px] bg-[#f6f5f4] px-4 py-8 font-['Inter'] sm:px-6 lg:py-10 xl:px-8">
      <section className="mb-7 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">System / Health</div>
          <h1 className="mt-2 text-[32px] font-bold leading-[1.1] tracking-[-0.8px] text-[#000000] sm:text-[36px]">Health console</h1>
          <p className="mt-3 max-w-2xl text-[14px] leading-6 text-[#615d59] sm:text-[15px]">Diagnosa runtime, server, storage, dan reset data operasional dari satu panel.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex h-11 items-center justify-center rounded-full border border-[#e6e6e6] bg-white px-4 text-[14px] font-medium text-[#0075de] shadow-[0_1px_2px_rgba(0,0,0,0.03),0_8px_24px_rgba(0,0,0,0.035)]">v{buildInfo.version}</span>
          <Button type="button" variant="outline" onClick={() => void refreshHealth()} className="h-11 rounded-full border-[#e6e6e6] bg-white px-5 text-[14px] font-medium text-[#615d59] hover:bg-[#fbfaf9]">
            <HugeiconsIcon icon={RefreshIcon} size={18} strokeWidth={1.9} /> Refresh
          </Button>
        </div>
      </section>

      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        <HealthStat label="Server" value={serverHealth ? serverHealth.status : 'offline'} detail={loading ? 'Memuat ringkasan server...' : message} icon={CloudServerIcon} />
        <HealthStat label="Storage" value={String(serverHealth?.storage?.counts?.recordings ?? 0)} detail={`${serverHealth?.storage?.counts?.sessions ?? 0} sesi · ${serverHealth?.storage?.counts?.scanLogs ?? 0} scan log`} icon={Database02Icon} />
        <HealthStat label="Bootstrap" value={serverHealth?.bootstrap?.needsSetup ? 'needed' : serverHealth ? 'ready' : '-'} detail={`${serverHealth?.bootstrap?.adminCount ?? 0} admin · ${serverHealth?.bootstrap?.operatorCount ?? 0} operator`} icon={Shield01Icon} />
      </section>

      {serverHealth?.lastError ? (
        <Alert variant="destructive" className="mb-5 rounded-[8px] border-[#f2c8a4] bg-[#fff7ed] font-['Inter'] text-[14px]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="grid gap-1">
              <p className="font-semibold text-[#000000]">Last error</p>
              <p className="text-[#31302e]">{serverHealth.lastError.message}</p>
              <p className="text-[12px] text-[#a39e98]">{serverHealth.lastError.createdAt}</p>
            </div>
            <Button type="button" variant="outline" size="sm" className="h-9 rounded-lg border-[#f2c8a4] bg-white px-3 text-[13px] text-[#dd5b00] hover:bg-[#fff7ed]" onClick={() => void clearServerLastErrorApi().then(() => refreshHealth())}>
              <HugeiconsIcon icon={Delete02Icon} size={15} strokeWidth={1.9} /> Clear error
            </Button>
          </div>
        </Alert>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-[#e6e6e6] bg-white">
          <PanelHeader icon={CheckmarkCircle01Icon} title="Runtime diagnostics" description="Kesiapan browser untuk kamera, recorder, dan komunikasi API." />
          <div className="grid gap-3 p-4 sm:p-5">
            {runtimeChecks.map((check) => (
              <RuntimeCheckRow key={check.label} label={check.label} description={check.description} value={check.value} />
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-[#e6e6e6] bg-white">
          <PanelHeader icon={Alert01Icon} title="Danger zone" description="Aksi reset data server yang butuh konfirmasi." />
          <div className="grid gap-3 p-4 sm:p-5">
            <DangerAction title="Reset scan data" description="Menghapus data QC, packing, recording, dan log. User/operator tetap aman." actionLabel="Clear scan" onClick={() => setActiveModal('scan')} />
            <DangerAction title="Reset all data" description="Menghapus seluruh data server, termasuk user, session login, recording, log, dan pengaturan." actionLabel="Clear all" onClick={() => setActiveModal('all')} destructive />
          </div>
        </div>
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

function RuntimeCheckRow({ label, description, value }: { label: string; description: string; value: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-[8px] border border-[#e6e6e6] bg-[#f6f5f4] p-3">
      <div className="min-w-0">
        <div className="text-[14px] font-medium text-[#000000]">{label}</div>
        <p className="mt-1 text-[12px] leading-5 text-[#615d59]">{description}</p>
      </div>
      <span className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${value ? 'border-[#e6e6e6] bg-white text-[#0075de]' : 'border-[#f2c8a4] bg-[#fff7ed] text-[#dd5b00]'}`}>{value ? 'OK' : 'Missing'}</span>
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
    <div className="flex flex-col gap-3 rounded-[12px] border border-[#e6e6e6] bg-[#f6f5f4] p-4 sm:flex-row sm:items-center sm:justify-between">
      <span className="min-w-0">
        <strong className="block text-[14px] font-semibold text-[#000000]">{title}</strong>
        <small className="mt-1 block text-[12px] leading-5 text-[#615d59]">{description}</small>
      </span>
      <Button type="button" variant={destructive ? 'destructive' : 'outline'} className={`h-9 shrink-0 rounded-lg px-3 text-[13px] font-medium ${destructive ? 'bg-black text-white hover:bg-[#31302e]' : 'border-[#e6e6e6] bg-white text-[#615d59] hover:bg-[#fbfaf9]'}`} onClick={onClick}>
        <HugeiconsIcon icon={Delete02Icon} size={15} strokeWidth={1.9} />
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
    <ModalOverlay onClose={onCancel} contentClassName="health-modal max-w-[420px] gap-0 overflow-hidden rounded-2xl border-[#e6e6e6] bg-white p-0 font-['Inter'] shadow-[0_10px_28px_rgba(0,0,0,0.08)]">
      <div>
        <div className="border-b border-[#e6e6e6] p-6">
          <div className="flex items-start justify-between gap-5">
            <div className="grid gap-1">
              <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">{tone === 'danger' ? 'Danger action' : 'Konfirmasi'}</p>
              <h3 className="text-[18px] font-semibold text-[#000000]">{title}</h3>
              <p className="text-[13px] leading-5 text-[#615d59]">{description}</p>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={onCancel} className="h-9 w-9 shrink-0 rounded-lg text-[#615d59] hover:bg-[#f6f5f4] hover:text-[#000000]">
              <HugeiconsIcon icon={Cancel01Icon} size={19} strokeWidth={1.9} />
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#e6e6e6] bg-white p-4">
          <Button type="button" variant="ghost" className="h-9 rounded-full border border-[#e6e6e6] bg-white px-5 text-[13px]" onClick={onCancel}>
            Batal
          </Button>
          <Button
            type="button"
            variant={tone === 'danger' ? 'destructive' : 'default'}
            className={`h-9 rounded-full px-6 text-[13px] font-medium ${tone === 'danger' ? 'bg-black text-white hover:bg-[#31302e]' : 'bg-[#0075de] text-white hover:bg-[#005bab]'}`}
            onClick={() => void onConfirm()}
            disabled={disabled}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </ModalOverlay>
  )
}

function HealthStat({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: typeof Activity01Icon }) {
  return (
    <article className="rounded-xl border border-[#e6e6e6] bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">{label}</div>
          <div className="mt-3 text-[24px] font-bold leading-none tracking-[-0.5px] text-[#000000]">{value}</div>
          <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-[#615d59]">{detail}</p>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#f6f5f4] text-[#31302e]">
          <HugeiconsIcon icon={icon} size={19} strokeWidth={1.9} />
        </span>
      </div>
    </article>
  )
}

function PanelHeader({ icon, title, description }: { icon: typeof Activity01Icon; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3 border-b border-[#e6e6e6] px-4 py-4 sm:px-5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#f6f5f4] text-[#31302e]">
        <HugeiconsIcon icon={icon} size={19} strokeWidth={1.9} />
      </span>
      <div className="min-w-0">
        <h2 className="text-[16px] font-semibold text-[#000000]">{title}</h2>
        <p className="mt-1 text-[12px] leading-5 text-[#a39e98]">{description}</p>
      </div>
    </div>
  )
}

// @ts-ignore TS6133 - kept for future use
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-[#e6e6e6] bg-[#f6f5f4] p-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">{label}</div>
      <div className="mt-2 text-[18px] font-semibold text-[#000000]">{value}</div>
    </div>
  )
}

// @ts-ignore TS6133 - kept for future use
function EmptyState({ children }: { children: ReactNode }) {
  return <div className="p-6 text-center text-[14px] font-medium text-[#615d59]">{children}</div>
}

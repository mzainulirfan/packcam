import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowDown01Icon,
  CheckmarkCircle01Icon,
  CloudServerIcon,
  Copy01Icon,
  FolderOpenIcon,
  RefreshIcon,
  Settings01Icon,
  TextIcon,
  VideoReplayIcon,
} from '@hugeicons/core-free-icons'

import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { DEFAULT_SYSTEM_CONFIG, DEFAULT_VIDEO_BITRATE, DEFAULT_VIDEO_RESOLUTION, DEFAULT_VIDEO_ROOT_PATH } from '@pakti/shared/defaults'
import { notify } from '../app/notify'
import {
  readServerSettingsApi,
  readServerSystemConfigApi,
  openServerSettingsFolderApi,
  saveServerSettingsApi,
  saveServerSystemConfigApi,
} from '@pakti/api-client'
import type { AppSettings, SystemConfig } from '@pakti/types'
import { useCameraDevices } from '../hooks/useCameraDevices'
import { notifySystemConfigChange } from '@pakti/shared/systemConfig'

type SaveState = 'idle' | 'saved' | 'reset'
type BrandingSaveState = 'idle' | 'saved' | 'reset'
type ServerStatus = 'loading' | 'online' | 'offline'

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(() => ({
    videoRootPath: DEFAULT_VIDEO_ROOT_PATH,
    videoFormat: 'webm',
    videoResolution: DEFAULT_VIDEO_RESOLUTION,
    videoBitrate: DEFAULT_VIDEO_BITRATE,
    cameraDeviceId: '',
    autoOpenFolder: false,
  }))
  const [savedSettings, setSavedSettings] = useState<AppSettings>(() => ({
    videoRootPath: DEFAULT_VIDEO_ROOT_PATH,
    videoFormat: 'webm',
    videoResolution: DEFAULT_VIDEO_RESOLUTION,
    videoBitrate: DEFAULT_VIDEO_BITRATE,
    cameraDeviceId: '',
    autoOpenFolder: false,
  }))
  const [, setSaveState] = useState<SaveState>('idle')
  const [saveMessage, setSaveMessage] = useState('Perubahan belum disimpan.')
  const [operationalSavedAt, setOperationalSavedAt] = useState<string | null>(null)
  const [systemConfig, setSystemConfig] = useState<SystemConfig>(() => DEFAULT_SYSTEM_CONFIG)
  const [savedSystemConfig, setSavedSystemConfig] = useState<SystemConfig>(() => DEFAULT_SYSTEM_CONFIG)
  const [, setBrandingState] = useState<BrandingSaveState>('idle')
  const [brandingMessage, setBrandingMessage] = useState('Belum ada perubahan branding.')
  const [brandingSavedAt, setBrandingSavedAt] = useState<string | null>(null)
  const [, setLoading] = useState(true)
  const [sourceMessage, setSourceMessage] = useState('Memuat konfigurasi dari server...')
  const [serverStatus, setServerStatus] = useState<ServerStatus>('loading')
  const cameraDevices = useCameraDevices(true)

  useEffect(() => {
    let active = true

    void Promise.all([readServerSettingsApi(), readServerSystemConfigApi()])
      .then(([nextSettings, nextConfig]) => {
        if (!active) {
          return
        }

        setSettings(nextSettings)
        setSavedSettings(nextSettings)
        setSystemConfig(nextConfig)
        setSavedSystemConfig(nextConfig)
        setOperationalSavedAt(formatTimestamp(nextSettings.updatedAt))
        setBrandingSavedAt(formatTimestamp(nextConfig.updatedAt))
        setSourceMessage('Konfigurasi dimuat dari server.')
        setServerStatus('online')
        notify.load('Konfigurasi dimuat', 'Pengaturan operasional dan branding berhasil dimuat.')
      })
      .catch(() => {
        if (!active) {
          return
        }

        setSettings({
          videoRootPath: DEFAULT_VIDEO_ROOT_PATH,
          videoFormat: 'webm',
          videoResolution: DEFAULT_VIDEO_RESOLUTION,
          videoBitrate: DEFAULT_VIDEO_BITRATE,
          cameraDeviceId: '',
          autoOpenFolder: false,
        })
        setSavedSettings({
          videoRootPath: DEFAULT_VIDEO_ROOT_PATH,
          videoFormat: 'webm',
          videoResolution: DEFAULT_VIDEO_RESOLUTION,
          videoBitrate: DEFAULT_VIDEO_BITRATE,
          cameraDeviceId: '',
          autoOpenFolder: false,
        })
        setSystemConfig(DEFAULT_SYSTEM_CONFIG)
        setSavedSystemConfig(DEFAULT_SYSTEM_CONFIG)
        setSourceMessage('Sesi login diperlukan atau server belum aktif. Konfigurasi belum bisa dimuat.')
        setServerStatus('offline')
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

  const isOperationalDirty = !areAppSettingsEqual(settings, savedSettings)
  const isBrandingDirty = !areSystemConfigEqual(systemConfig, savedSystemConfig)
  const shouldShowStatusAlert = serverStatus === 'offline' || isOperationalDirty || isBrandingDirty
  const statusAlertVariant = serverStatus === 'offline' ? 'destructive' : isOperationalDirty || isBrandingDirty ? 'info' : 'default'
  const serverStatusLabel = serverStatus === 'online' ? 'Online' : serverStatus === 'offline' ? 'Offline' : 'Checking'

  function formatTimestamp(value: string | null) {
    if (!value) {
      return 'Belum tersimpan di server'
    }

    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  }

  function updateField<K extends keyof AppSettings>(field: K, value: AppSettings[K]) {
    setSettings((current) => ({
      ...current,
      [field]: value,
    }))
    setSaveState('idle')
    setSaveMessage('Ada perubahan yang belum disimpan.')
  }

  function handleSave() {
    void saveServerSettingsApi(settings)
      .then((nextSettings) => {
        setSettings(nextSettings)
        setSavedSettings(nextSettings)
        setSaveState('saved')
        setSaveMessage('Pengaturan tersimpan di server.')
        setOperationalSavedAt(formatTimestamp(nextSettings.updatedAt))
        setServerStatus('online')
        notify.save('Pengaturan tersimpan', 'Konfigurasi operasional berhasil disimpan ke server.')
      })
      .catch(() => {
        setSaveState('idle')
        const errorMessage = 'Sesi login diperlukan atau server belum aktif. Pengaturan belum bisa disimpan.'
        setSaveMessage(errorMessage)
        setServerStatus('offline')
        notify.error('Gagal menyimpan pengaturan', errorMessage)
      })
  }

  function handleReset() {
    void saveServerSettingsApi({
      videoRootPath: DEFAULT_VIDEO_ROOT_PATH,
      videoFormat: 'webm',
      videoResolution: DEFAULT_VIDEO_RESOLUTION,
      videoBitrate: DEFAULT_VIDEO_BITRATE,
      cameraDeviceId: '',
      autoOpenFolder: false,
    })
      .then((nextSettings) => {
        setSettings(nextSettings)
        setSavedSettings(nextSettings)
        setSaveState('reset')
        setSaveMessage('Semua pengaturan dikembalikan ke default server.')
        setOperationalSavedAt(formatTimestamp(nextSettings.updatedAt))
        setServerStatus('online')
        notify.reset('Pengaturan direset', 'Konfigurasi operasional dikembalikan ke default server.')
      })
      .catch(() => {
        setSaveState('idle')
        const errorMessage = 'Sesi login diperlukan atau server belum aktif. Reset pengaturan belum bisa dilakukan.'
        setSaveMessage(errorMessage)
        setServerStatus('offline')
        notify.error('Gagal reset pengaturan', errorMessage)
      })
  }

  function handleResetOperational() {
    void handleReset()
  }

  async function handleChooseVideoFolder() {
    const nextPath = window.prompt('Masukkan path folder video', settings.videoRootPath || DEFAULT_VIDEO_ROOT_PATH)

    if (nextPath === null) {
      return
    }

    updateField('videoRootPath', nextPath.trim() || DEFAULT_VIDEO_ROOT_PATH)
    setSaveMessage('Folder video diperbarui.')
    notify.copy('Folder dipilih', 'Path folder video berhasil diperbarui.')
  }

  async function handleCopyVideoFolder() {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      setSaveMessage('Clipboard tidak tersedia di browser ini.')
      return
    }

    try {
      await navigator.clipboard.writeText(settings.videoRootPath || DEFAULT_VIDEO_ROOT_PATH)
      setSaveMessage('Path folder video disalin ke clipboard.')
      notify.copy('Copy path berhasil', 'Path folder video berhasil disalin ke clipboard.')
    } catch {
      const errorMessage = 'Gagal menyalin path folder video.'
      setSaveMessage(errorMessage)
      notify.error('Gagal copy path', errorMessage)
    }
  }

  function handleOpenVideoFolder() {
    void openServerSettingsFolderApi()
      .then(() => {
        setSaveMessage('Folder video dibuka di file manager.')
        setServerStatus('online')
        notify.info('Folder terbuka', 'Folder video berhasil dibuka di file manager.')
      })
      .catch((error) => {
        const errorMessage = error instanceof Error ? error.message : 'Gagal membuka folder video.'
        setSaveMessage(errorMessage)
        setServerStatus('offline')
        notify.error('Gagal membuka folder', errorMessage)
      })
  }

  function updateBrandingField<K extends keyof SystemConfig>(field: K, value: SystemConfig[K]) {
    setSystemConfig((current) => ({
      ...current,
      [field]: value,
    }))
    setBrandingState('idle')
    setBrandingMessage('Ada perubahan branding yang belum disimpan.')
  }

  function handleSaveBranding() {
    void saveServerSystemConfigApi(systemConfig)
      .then((nextConfig) => {
        setSystemConfig(nextConfig)
        setSavedSystemConfig(nextConfig)
        setBrandingState('saved')
        setBrandingMessage('Branding sistem tersimpan di server.')
        notifySystemConfigChange()
        setBrandingSavedAt(formatTimestamp(nextConfig.updatedAt))
        setServerStatus('online')
        notify.save('Branding tersimpan', 'Identitas sistem berhasil disimpan ke server.')
      })
      .catch(() => {
        setBrandingState('idle')
        const errorMessage = 'Sesi login diperlukan atau server belum aktif. Branding belum bisa disimpan.'
        setBrandingMessage(errorMessage)
        setServerStatus('offline')
        notify.error('Gagal menyimpan branding', errorMessage)
      })
  }

  function handleResetBranding() {
    void saveServerSystemConfigApi(DEFAULT_SYSTEM_CONFIG)
      .then((nextConfig) => {
        setSystemConfig(nextConfig)
        setSavedSystemConfig(nextConfig)
        setBrandingState('reset')
        setBrandingMessage('Branding dikembalikan ke default server.')
        notifySystemConfigChange()
        setBrandingSavedAt(formatTimestamp(nextConfig.updatedAt))
        setServerStatus('online')
        notify.reset('Branding direset', 'Identitas sistem dikembalikan ke default server.')
      })
      .catch(() => {
        setBrandingState('idle')
        const errorMessage = 'Sesi login diperlukan atau server belum aktif. Reset branding belum bisa dilakukan.'
        setBrandingMessage(errorMessage)
        setServerStatus('offline')
        notify.error('Gagal reset branding', errorMessage)
      })
  }

  return (
    <div className="settings-page mx-auto max-w-[1240px] bg-[#f6f5f4] px-4 py-8 font-['Inter'] sm:px-6 lg:py-10 xl:px-8">
      <section className="mb-6 flex flex-col gap-4">
        <div>
          <div className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Administrasi / Settings</div>
          <h1 className="mt-2 font-['Inter'] text-[32px] font-bold leading-[1.1] tracking-[-0.8px] text-[#000000] sm:text-[36px]">Pengaturan sistem</h1>
          <p className="mt-2 max-w-2xl font-['Inter'] text-[14px] leading-6 text-[#615d59]">Atur folder video, kualitas rekaman, kamera default, dan identitas aplikasi dari satu tempat.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-full border px-3 font-['Inter'] text-[11px] font-semibold ${serverStatus === 'online' ? 'border-[#e6e6e6] bg-white text-[#31302e]' : serverStatus === 'offline' ? 'border-[#f2c8a4] bg-[#fff7ed] text-[#dd5b00]' : 'border-[#e6e6e6] bg-white text-[#615d59]'}`}>
            <HugeiconsIcon icon={CloudServerIcon} size={12} strokeWidth={1.9} /> {serverStatusLabel}
          </span>
          <span className="font-['Inter'] text-[12px] text-[#a39e98]">{sourceMessage}</span>
        </div>
      </section>

      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        <SettingsStat label="Server" value={serverStatusLabel} detail={sourceMessage} icon={CloudServerIcon} />
        <SettingsStat label="Operational" value={isOperationalDirty ? 'Unsaved' : 'Saved'} detail={operationalSavedAt || 'Belum tersimpan di sesi ini'} icon={VideoReplayIcon} />
        <SettingsStat label="Branding" value={isBrandingDirty ? 'Unsaved' : 'Saved'} detail={brandingSavedAt || 'Belum tersimpan di sesi ini'} icon={TextIcon} />
      </section>

      {shouldShowStatusAlert ? (
        <Alert variant={statusAlertVariant} className="mb-5 rounded-[4px] border-[#dddddd] bg-white font-['Inter'] text-[14px]">
          <div className="grid gap-1">
            <p className="font-semibold text-[#000000]">Status pengaturan</p>
            {serverStatus === 'offline' ? <p className="text-[#31302e]">{sourceMessage}</p> : null}
            {isOperationalDirty ? <p className="text-[#31302e]">{saveMessage}</p> : null}
            {isBrandingDirty ? <p className="text-[#31302e]">{brandingMessage}</p> : null}
          </div>
        </Alert>
      ) : null}

      <div className="grid gap-6">
        <section className="overflow-hidden rounded-[12px] border border-[#e6e6e6] bg-white">
          <PanelHeader icon={VideoReplayIcon} title="Operational" description="Konfigurasi rekaman, folder penyimpanan, dan kamera default." badge={operationalSavedAt || 'Belum tersimpan'} />
          <div className="grid gap-4 p-5">
            <div className="rounded-[12px] border border-[#dddddd] bg-[#f6f5f4] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Folder video</div>
                  <p className="mt-2 break-all text-[14px] font-medium text-[#000000]">{settings.videoRootPath}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => void handleCopyVideoFolder()} className="h-9 rounded-lg border-[#dddddd] bg-white px-3 text-[13px] font-medium text-[#615d59] hover:bg-[#f6f5f4]">
                    <HugeiconsIcon icon={Copy01Icon} size={15} strokeWidth={1.9} /> Copy
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={handleOpenVideoFolder} className="h-9 rounded-lg border-[#dddddd] bg-white px-3 text-[13px] font-medium text-[#615d59] hover:bg-[#f6f5f4]">
                    <HugeiconsIcon icon={FolderOpenIcon} size={15} strokeWidth={1.9} /> Buka
                  </Button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => void handleChooseVideoFolder()} className="h-9 rounded-lg border-[#dddddd] bg-white px-3 text-[13px] font-medium text-[#000000] hover:bg-[#fbfaf9]">
                  <HugeiconsIcon icon={FolderOpenIcon} size={15} strokeWidth={1.9} /> Pilih folder
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={handleResetOperational} className="h-9 rounded-lg px-3 text-[13px] font-medium text-[#615d59] hover:bg-white">
                  <HugeiconsIcon icon={RefreshIcon} size={15} strokeWidth={1.9} /> Reset operational
                </Button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FieldGroup controlId="settings-format-input" label="Format video">
                <NativeSelect id="settings-format-input" value={settings.videoFormat} onChange={(value) => updateField('videoFormat', value as AppSettings['videoFormat'])}>
                  <option value="webm">webm</option>
                  <option value="mp4">mp4</option>
                </NativeSelect>
              </FieldGroup>
              <FieldGroup controlId="settings-resolution-input" label="Resolusi video">
                <Input id="settings-resolution-input" value={settings.videoResolution} onChange={(event) => updateField('videoResolution', event.target.value)} placeholder={DEFAULT_VIDEO_RESOLUTION} className="h-8 rounded-[4px] border-[#e6e6e6] bg-white px-3 font-['Inter'] text-[13px] placeholder:text-[#a39e98] focus-visible:border-[#8f8a84] focus-visible:ring-0" />
              </FieldGroup>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FieldGroup controlId="settings-bitrate-input" label="Bitrate video">
                <Input id="settings-bitrate-input" value={settings.videoBitrate} onChange={(event) => updateField('videoBitrate', event.target.value)} placeholder={DEFAULT_VIDEO_BITRATE} className="h-8 rounded-[4px] border-[#e6e6e6] bg-white px-3 font-['Inter'] text-[13px] placeholder:text-[#a39e98] focus-visible:border-[#8f8a84] focus-visible:ring-0" />
              </FieldGroup>
              <FieldGroup controlId="settings-camera-input" label="Kamera default">
                <NativeSelect id="settings-camera-input" value={settings.cameraDeviceId || '__default__'} onChange={(value) => updateField('cameraDeviceId', value === '__default__' ? '' : value)}>
                  <option value="__default__">Default camera</option>
                  {cameraDevices.filter((device) => device.deviceId.trim() !== '').map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
                  ))}
                </NativeSelect>
              </FieldGroup>
            </div>

            <label htmlFor="settings-auto-open-input" className="flex items-start gap-2.5 rounded-[8px] border border-[#e6e6e6] bg-[#f6f5f4] p-3 font-['Inter'] text-[13px] leading-5 text-[#31302e]">
              <input id="settings-auto-open-input" type="checkbox" checked={settings.autoOpenFolder} onChange={(event) => updateField('autoOpenFolder', event.target.checked)} className="mt-0.5 size-4 rounded-[4px] border-[#e6e6e6] accent-[#000000]" />
              <span>Aktifkan pembukaan folder otomatis setelah rekaman tersimpan.</span>
            </label>

            <div className="flex justify-end border-t border-[#e6e6e6] pt-4">
              <Button type="button" onClick={handleSave} className="h-8 rounded-[8px] bg-[#000000] px-5 font-['Inter'] text-[12px] font-medium text-white hover:bg-[#31302e]">
                <HugeiconsIcon icon={CheckmarkCircle01Icon} size={14} strokeWidth={1.9} /> Simpan settings
              </Button>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[12px] border border-[#e6e6e6] bg-white">
          <PanelHeader icon={Settings01Icon} title="Branding" description="Identitas aplikasi yang tampil di sidebar dan metadata sistem." badge={brandingSavedAt || 'Belum tersimpan'} />
          <div className="grid gap-4 p-5">
            <FieldGroup controlId="branding-app-name-input" label="Nama aplikasi">
              <Input id="branding-app-name-input" value={systemConfig.appName} onChange={(event) => updateBrandingField('appName', event.target.value)} placeholder={DEFAULT_SYSTEM_CONFIG.appName} className="h-8 rounded-[4px] border-[#e6e6e6] bg-white px-3 font-['Inter'] text-[13px] placeholder:text-[#a39e98] focus-visible:border-[#8f8a84] focus-visible:ring-0" />
            </FieldGroup>
            <FieldGroup controlId="branding-tagline-input" label="Tagline">
              <Input id="branding-tagline-input" value={systemConfig.tagline} onChange={(event) => updateBrandingField('tagline', event.target.value)} placeholder={DEFAULT_SYSTEM_CONFIG.tagline} className="h-8 rounded-[4px] border-[#e6e6e6] bg-white px-3 font-['Inter'] text-[13px] placeholder:text-[#a39e98] focus-visible:border-[#8f8a84] focus-visible:ring-0" />
            </FieldGroup>
            <FieldGroup controlId="branding-mark-input" label="Brand mark">
              <Input id="branding-mark-input" value={systemConfig.brandMark} onChange={(event) => updateBrandingField('brandMark', event.target.value)} placeholder={DEFAULT_SYSTEM_CONFIG.brandMark} className="h-8 rounded-[4px] border-[#e6e6e6] bg-white px-3 font-['Inter'] text-[13px] placeholder:text-[#a39e98] focus-visible:border-[#8f8a84] focus-visible:ring-0" />
            </FieldGroup>

            <div className="mt-1 overflow-hidden rounded-[8px] border border-[#e6e6e6] bg-[#f6f5f4]">
              <div className="border-b border-[#e6e6e6] bg-white px-4 py-3">
                <div className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">Preview</div>
              </div>
              <div className="flex items-center gap-3 bg-white p-4">
                <div className="grid h-9 w-9 place-items-center rounded-[8px] bg-[#000000] font-['Inter'] text-[12px] font-bold text-white">{systemConfig.brandMark || DEFAULT_SYSTEM_CONFIG.brandMark}</div>
                <div className="min-w-0">
                  <div className="truncate font-['Inter'] text-[14px] font-semibold text-[#000000]">{systemConfig.appName || DEFAULT_SYSTEM_CONFIG.appName}</div>
                  <div className="truncate font-['Inter'] text-[12px] text-[#615d59]">{systemConfig.tagline || DEFAULT_SYSTEM_CONFIG.tagline}</div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-[#e6e6e6] pt-4">
              <Button type="button" variant="ghost" onClick={handleResetBranding} className="h-8 rounded-[8px] border border-[#e6e6e6] bg-white px-4 font-['Inter'] text-[12px] font-medium text-[#615d59] hover:bg-[#f6f5f4]">
                <HugeiconsIcon icon={RefreshIcon} size={14} strokeWidth={1.9} /> Reset branding
              </Button>
              <Button type="button" onClick={handleSaveBranding} className="h-8 rounded-[8px] bg-[#000000] px-5 font-['Inter'] text-[12px] font-medium text-white hover:bg-[#31302e]">
                <HugeiconsIcon icon={CheckmarkCircle01Icon} size={14} strokeWidth={1.9} /> Simpan branding
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function FieldGroup({
  controlId,
  label,
  description,
  children,
}: {
  controlId: string
  label: string
  description?: string
  children: ReactNode
}) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <Label htmlFor={controlId} className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">
        {label}
      </Label>
      {children}
      {description ? <p className="font-['Inter'] text-[12px] text-[#615d59]">{description}</p> : null}
    </div>
  )
}

function SettingsStat({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: typeof Settings01Icon }) {
  return (
    <article className="rounded-[12px] border border-[#e6e6e6] bg-white p-5">
      <div className="grid gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="font-['Inter'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39e98]">{label}</div>
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] bg-[#f6f5f4] text-[#31302e]">
            <HugeiconsIcon icon={icon} size={16} strokeWidth={1.9} />
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-['Inter'] text-[26px] font-bold leading-none tracking-[-0.5px] text-[#000000]">{value}</span>
          <span className="font-['Inter'] text-[12px] leading-none text-[#615d59]">{detail}</span>
        </div>
      </div>
    </article>
  )
}

function PanelHeader({ icon, title, description, badge }: { icon: typeof Settings01Icon; title: string; description: string; badge: string }) {
  return (
    <div className="flex flex-col gap-3 border-b border-[#e6e6e6] px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
      <div className="flex min-w-0 gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#f6f5f4] text-[#31302e]">
          <HugeiconsIcon icon={icon} size={19} strokeWidth={1.9} />
        </span>
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold text-[#000000]">{title}</h2>
          <p className="mt-1 text-[12px] leading-5 text-[#a39e98]">{description}</p>
        </div>
      </div>
      <span className="inline-flex w-fit items-center rounded-full border border-[#e6e6e6] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#0075de]">{badge}</span>
    </div>
  )
}

function NativeSelect({ id, value, onChange, children }: { id: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <label className="relative block">
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className="h-8 w-full appearance-none rounded-[4px] border border-[#e6e6e6] bg-white px-3 pr-8 font-['Inter'] text-[13px] text-[#000000] focus:border-[#8f8a84] focus:outline-none">
        {children}
      </select>
      <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-[#a39e98]">
        <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={1.9} />
      </span>
    </label>
  )
}

function areAppSettingsEqual(left: AppSettings, right: AppSettings) {
  return (
    left.videoRootPath === right.videoRootPath &&
    left.videoFormat === right.videoFormat &&
    left.videoResolution === right.videoResolution &&
    left.videoBitrate === right.videoBitrate &&
    left.cameraDeviceId === right.cameraDeviceId &&
    left.autoOpenFolder === right.autoOpenFolder
  )
}

function areSystemConfigEqual(left: SystemConfig, right: SystemConfig) {
  return left.appName === right.appName && left.tagline === right.tagline && left.brandMark === right.brandMark
}

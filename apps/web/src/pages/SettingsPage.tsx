import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Copy, FolderOpen, Monitor, RefreshCcw, Save, ScanSearch, Settings2, Sparkles } from 'lucide-react'

import { StageCard } from '../components/StageCard'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Separator } from '../components/ui/separator'
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

  const liveSummary = useMemo(
    () => [
      { label: 'Folder video', value: settings.videoRootPath || DEFAULT_VIDEO_ROOT_PATH, icon: FolderOpen },
      { label: 'Format rekaman', value: settings.videoFormat.toUpperCase(), icon: ScanSearch },
      { label: 'Resolusi', value: settings.videoResolution || DEFAULT_VIDEO_RESOLUTION, icon: Monitor },
      { label: 'Bitrate', value: settings.videoBitrate || DEFAULT_VIDEO_BITRATE, icon: Settings2 },
    ],
    [settings],
  )

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
    <StageCard title="Settings">
      <div className="grid gap-4">
        <section className="grid gap-4 rounded-[2rem] border border-slate-200/80 bg-gradient-to-br from-white to-slate-50 p-4 shadow-xl shadow-slate-900/5 lg:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid gap-2">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs uppercase tracking-[0.22em] text-slate-500">
                <Sparkles className="size-3.5" />
                System settings
              </div>
              <h3 className="text-2xl font-semibold tracking-tight text-slate-950">Konfigurasi Pakti</h3>
              <p className="max-w-3xl text-sm leading-6 text-slate-500">
                Atur konfigurasi operasional dan branding secara terpisah supaya pengaturan tetap ringkas dan mudah
                dipelihara.
              </p>
            </div>

            <Card className="min-w-0 border-slate-200/80 bg-white shadow-sm shadow-slate-900/5">
              <CardContent className="grid gap-3 p-4 text-sm text-slate-500">
                <div className="flex min-w-0 items-center justify-between gap-4">
                  <span>Status server</span>
                  <strong
                    className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${
                      serverStatus === 'online'
                        ? 'bg-emerald-50 text-emerald-700'
                        : serverStatus === 'offline'
                          ? 'bg-rose-50 text-rose-700'
                          : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {serverStatusLabel}
                  </strong>
                </div>
                <div className="flex min-w-0 items-center justify-between gap-4">
                  <span>Operasional</span>
                  <strong className="min-w-0 truncate text-right text-slate-950">
                    {operationalSavedAt || 'Belum tersimpan di sesi ini'}
                  </strong>
                </div>
                <div className="flex min-w-0 items-center justify-between gap-4">
                  <span>Branding</span>
                  <strong className="min-w-0 truncate text-right text-slate-950">
                    {brandingSavedAt || 'Belum tersimpan di sesi ini'}
                  </strong>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {liveSummary.map((item) => {
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
                    <div className="min-w-0 break-all text-sm font-medium leading-6 text-slate-950">
                      {item.value}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {shouldShowStatusAlert ? (
            <Alert variant={statusAlertVariant}>
              <div className="grid gap-2">
                <AlertTitle>Status settings</AlertTitle>
                <AlertDescription className="grid gap-1">
                  {serverStatus === 'offline' ? <span>{sourceMessage}</span> : null}
                  {isOperationalDirty ? <span>{saveMessage}</span> : null}
                  {isBrandingDirty ? <span>{brandingMessage}</span> : null}
                </AlertDescription>
              </div>
            </Alert>
          ) : null}
        </section>

        <Tabs defaultValue="operational" className="grid gap-4">
          <div className="flex justify-start">
            <TabsList variant="line" className="w-full sm:w-auto">
              <TabsTrigger value="operational" className="gap-2">
                <span>Operational</span>
                {isOperationalDirty ? <span className="size-2 rounded-full bg-amber-500" aria-hidden="true" /> : null}
              </TabsTrigger>
              <TabsTrigger value="branding" className="gap-2">
                <span>Brand identity</span>
                {isBrandingDirty ? <span className="size-2 rounded-full bg-amber-500" aria-hidden="true" /> : null}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="operational" className="grid gap-4">
            <Card className="border-slate-200/80 shadow-xl shadow-slate-900/5">
              <CardHeader className="space-y-2">
                <CardTitle className="text-lg">Operational settings</CardTitle>
                <CardDescription>Pengaturan yang memengaruhi kamera, penyimpanan, dan format rekaman.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5 pt-4">
                <div className="grid gap-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="grid gap-1">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Folder aktif</p>
                        <p className="break-all text-sm font-medium text-slate-950">{settings.videoRootPath}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" className="border-slate-200 bg-white" onClick={() => void handleCopyVideoFolder()}>
                          <Copy className="size-4" />
                          Copy path
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="border-slate-200 bg-white" onClick={handleOpenVideoFolder}>
                          <FolderOpen className="size-4" />
                          Open folder
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button type="button" size="sm" variant="outline" className="border-slate-200" onClick={() => void handleChooseVideoFolder()}>
                      <FolderOpen className="size-4" />
                      Pilih folder
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="border-slate-200" onClick={handleResetOperational}>
                      <RefreshCcw className="size-4" />
                      Reset operational
                    </Button>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <FieldGroup controlId="settings-format-input" label="video_format" description="Format default hasil rekaman.">
                    <Select
                      value={settings.videoFormat}
                      onValueChange={(value) => updateField('videoFormat', value as AppSettings['videoFormat'])}
                    >
                      <SelectTrigger id="settings-format-input" className="h-12 w-full">
                        <SelectValue placeholder="Pilih format" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="webm">webm</SelectItem>
                        <SelectItem value="mp4">mp4</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldGroup>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <FieldGroup controlId="settings-resolution-input" label="video_resolution" description="Contoh: 1280x720.">
                    <Input
                      id="settings-resolution-input"
                      value={settings.videoResolution}
                      onChange={(event) => updateField('videoResolution', event.target.value)}
                      placeholder={DEFAULT_VIDEO_RESOLUTION}
                      className="h-12 min-w-0"
                    />
                  </FieldGroup>

                  <FieldGroup controlId="settings-bitrate-input" label="video_bitrate" description="Angka dalam bps.">
                    <Input
                      id="settings-bitrate-input"
                      value={settings.videoBitrate}
                      onChange={(event) => updateField('videoBitrate', event.target.value)}
                      placeholder={DEFAULT_VIDEO_BITRATE}
                      className="h-12 min-w-0"
                    />
                  </FieldGroup>
                </div>

                <FieldGroup
                  controlId="settings-camera-input"
                  label="camera_device_id"
                  description="Pilih device kamera yang dipakai preview dan recording."
                >
                  <Select
                    value={settings.cameraDeviceId || '__default__'}
                    onValueChange={(value) => updateField('cameraDeviceId', value === '__default__' ? '' : value)}
                  >
                    <SelectTrigger id="settings-camera-input" className="h-12 w-full">
                      <SelectValue placeholder="Default camera" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__default__">Default camera</SelectItem>
                      {cameraDevices
                        .filter((device) => device.deviceId.trim() !== '')
                        .map((device) => (
                          <SelectItem key={device.deviceId} value={device.deviceId}>
                            {device.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </FieldGroup>

                <FieldGroup controlId="settings-auto-open-input" label="auto_open_folder" description="Buka folder video setelah rekaman selesai.">
                  <label className="flex min-w-0 items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <input
                      id="settings-auto-open-input"
                      type="checkbox"
                      checked={settings.autoOpenFolder}
                      onChange={(event) => updateField('autoOpenFolder', event.target.checked)}
                      className="size-4 rounded border-slate-300 text-slate-950 focus:ring-slate-950/10"
                    />
                    <span className="min-w-0 text-sm leading-6 text-slate-700">Aktifkan pembukaan folder otomatis.</span>
                  </label>
                </FieldGroup>

                <Separator />

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button type="button" size="lg" onClick={handleSave}>
                    <Save className="size-4" />
                    Simpan pengaturan
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="branding" className="grid gap-4">
            <Card className="border-slate-200/80 shadow-xl shadow-slate-900/5">
              <CardHeader className="space-y-2">
                <CardTitle className="text-lg">Brand identity</CardTitle>
                <CardDescription>Identitas sistem yang tampil di login, sidebar, dan header aplikasi.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5 pt-4">
                <div className="grid gap-4">
                  <FieldGroup controlId="branding-app-name-input" label="app_name" description="Nama aplikasi di sidebar dan title browser.">
                    <Input
                      id="branding-app-name-input"
                      value={systemConfig.appName}
                      onChange={(event) => updateBrandingField('appName', event.target.value)}
                      placeholder={DEFAULT_SYSTEM_CONFIG.appName}
                      className="h-12 min-w-0"
                    />
                  </FieldGroup>

                  <FieldGroup controlId="branding-tagline-input" label="tagline" description="Deskripsi singkat untuk metadata halaman.">
                    <Input
                      id="branding-tagline-input"
                      value={systemConfig.tagline}
                      onChange={(event) => updateBrandingField('tagline', event.target.value)}
                      placeholder={DEFAULT_SYSTEM_CONFIG.tagline}
                      className="h-12 min-w-0"
                    />
                  </FieldGroup>

                  <FieldGroup controlId="branding-mark-input" label="brand_mark" description="Inisial di logo sidebar.">
                    <Input
                      id="branding-mark-input"
                      value={systemConfig.brandMark}
                      onChange={(event) => updateBrandingField('brandMark', event.target.value)}
                      placeholder={DEFAULT_SYSTEM_CONFIG.brandMark}
                      className="h-12 min-w-0"
                    />
                  </FieldGroup>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    <p className="font-medium text-slate-950">Ringkasan branding</p>
                    <p className="mt-1 leading-6">
                      Branding sekarang dibatasi ke nama aplikasi, tagline, dan brand mark. Warna tema dikelola internal
                      supaya settings tetap fokus.
                    </p>
                  </div>
                </div>

                <Separator />

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button type="button" size="lg" onClick={handleSaveBranding}>
                    <Sparkles className="size-4" />
                    Simpan branding
                  </Button>
                  <Button type="button" size="lg" variant="outline" className="border-slate-200" onClick={handleResetBranding}>
                    Reset branding
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </StageCard>
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
    <div className="grid min-w-0 gap-2">
      <Label htmlFor={controlId} className="text-xs uppercase tracking-[0.18em] text-slate-500">
        {label}
      </Label>
      {children}
      {description ? <p className="text-xs leading-5 text-slate-500">{description}</p> : null}
    </div>
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

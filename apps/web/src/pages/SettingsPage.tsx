import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
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
    <div className="settings-opencode mx-auto grid w-full max-w-[1520px] gap-8 px-0 py-1">
      <section className="settings-opencode__hero flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-2">
          <div className="settings-opencode__section-label">[+] Settings</div>
          <h1 className="settings-opencode__title">Settings</h1>
        </div>
        <strong className="settings-opencode__badge">
          {serverStatus === 'online' ? '[x]' : serverStatus === 'offline' ? '[!]' : '[~]'} {serverStatusLabel}
        </strong>
      </section>

      <div className="grid gap-6">
        {shouldShowStatusAlert ? (
          <Alert variant={statusAlertVariant}>
            <div className="grid gap-1">
              {serverStatus === 'offline' ? <p>{sourceMessage}</p> : null}
              {isOperationalDirty ? <p>{saveMessage}</p> : null}
              {isBrandingDirty ? <p>{brandingMessage}</p> : null}
            </div>
          </Alert>
        ) : null}

        <div className="settings-opencode__simple-grid">
            <Card className="settings-opencode__panel">
              <CardHeader className="space-y-2">
                <CardTitle>Operational</CardTitle>
                <p>{operationalSavedAt || 'Belum tersimpan di sesi ini'}</p>
              </CardHeader>
              <CardContent className="space-y-5 pt-4">
                <div className="grid gap-4">
                  <div className="settings-opencode__folder-box">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="grid gap-1">
                        <p>{settings.videoRootPath}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" className="settings-opencode__button" onClick={() => void handleCopyVideoFolder()}>
                          [copy-path]
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="settings-opencode__button" onClick={handleOpenVideoFolder}>
                          [open-folder]
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button type="button" size="sm" variant="outline" className="settings-opencode__button" onClick={() => void handleChooseVideoFolder()}>
                      [choose-folder]
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="settings-opencode__button" onClick={handleResetOperational}>
                      [reset-operational]
                    </Button>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <FieldGroup controlId="settings-format-input" label="video_format">
                    <Select
                      value={settings.videoFormat}
                      onValueChange={(value) => updateField('videoFormat', value as AppSettings['videoFormat'])}
                    >
                      <SelectTrigger id="settings-format-input" className="settings-opencode__input w-full">
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
                  <FieldGroup controlId="settings-resolution-input" label="video_resolution">
                    <Input
                      id="settings-resolution-input"
                      value={settings.videoResolution}
                      onChange={(event) => updateField('videoResolution', event.target.value)}
                      placeholder={DEFAULT_VIDEO_RESOLUTION}
                      className="settings-opencode__input"
                    />
                  </FieldGroup>

                  <FieldGroup controlId="settings-bitrate-input" label="video_bitrate">
                    <Input
                      id="settings-bitrate-input"
                      value={settings.videoBitrate}
                      onChange={(event) => updateField('videoBitrate', event.target.value)}
                      placeholder={DEFAULT_VIDEO_BITRATE}
                      className="settings-opencode__input"
                    />
                  </FieldGroup>
                </div>

                <FieldGroup
                  controlId="settings-camera-input"
                  label="camera_device_id"
                >
                  <Select
                    value={settings.cameraDeviceId || '__default__'}
                    onValueChange={(value) => updateField('cameraDeviceId', value === '__default__' ? '' : value)}
                  >
                    <SelectTrigger id="settings-camera-input" className="settings-opencode__input w-full">
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

                <FieldGroup controlId="settings-auto-open-input" label="auto_open_folder">
                  <label className="settings-opencode__check-row flex min-w-0 items-start gap-3">
                    <input
                      id="settings-auto-open-input"
                      type="checkbox"
                      checked={settings.autoOpenFolder}
                      onChange={(event) => updateField('autoOpenFolder', event.target.checked)}
                      className="size-4"
                    />
                    <span>Aktifkan pembukaan folder otomatis.</span>
                  </label>
                </FieldGroup>

                <Separator />

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button type="button" size="lg" className="settings-opencode__button" onClick={handleSave}>
                    [save-settings]
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="settings-opencode__panel">
              <CardHeader className="space-y-2">
                <CardTitle>Branding</CardTitle>
                <p>{brandingSavedAt || 'Belum tersimpan di sesi ini'}</p>
              </CardHeader>
              <CardContent className="space-y-5 pt-4">
                <div className="grid gap-4">
                  <FieldGroup controlId="branding-app-name-input" label="app_name">
                    <Input
                      id="branding-app-name-input"
                      value={systemConfig.appName}
                      onChange={(event) => updateBrandingField('appName', event.target.value)}
                      placeholder={DEFAULT_SYSTEM_CONFIG.appName}
                      className="settings-opencode__input"
                    />
                  </FieldGroup>

                  <FieldGroup controlId="branding-tagline-input" label="tagline">
                    <Input
                      id="branding-tagline-input"
                      value={systemConfig.tagline}
                      onChange={(event) => updateBrandingField('tagline', event.target.value)}
                      placeholder={DEFAULT_SYSTEM_CONFIG.tagline}
                      className="settings-opencode__input"
                    />
                  </FieldGroup>

                  <FieldGroup controlId="branding-mark-input" label="brand_mark">
                    <Input
                      id="branding-mark-input"
                      value={systemConfig.brandMark}
                      onChange={(event) => updateBrandingField('brandMark', event.target.value)}
                      placeholder={DEFAULT_SYSTEM_CONFIG.brandMark}
                      className="settings-opencode__input"
                    />
                  </FieldGroup>

                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button type="button" size="lg" className="settings-opencode__button" onClick={handleSaveBranding}>
                    [save-branding]
                  </Button>
                  <Button type="button" size="lg" variant="outline" className="settings-opencode__button" onClick={handleResetBranding}>
                    [reset-branding]
                  </Button>
                </div>
              </CardContent>
            </Card>
        </div>
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
    <div className="settings-opencode__field grid min-w-0 gap-2">
      <Label htmlFor={controlId}>
        {label}
      </Label>
      {children}
      {description ? <p>{description}</p> : null}
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

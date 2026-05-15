import { useState } from 'react'
import {
  DEFAULT_VIDEO_BITRATE,
  DEFAULT_VIDEO_RESOLUTION,
  DEFAULT_VIDEO_ROOT_PATH,
} from '../config/defaultSettings'
import { DEFAULT_SYSTEM_CONFIG } from '../config/defaultSystemConfig'
import { StageCard } from '../components/StageCard'
import { SettingsField } from '../components/SettingsField'
import { getStoredSettings, resetSettings, saveSettings } from '../data/settings'
import { getStoredSystemConfig, resetSystemConfig, saveSystemConfig } from '../data/systemConfig'
import type { AppSettings, SystemConfig } from '../data/types'
import { useCameraDevices } from '../hooks/useCameraDevices'
import { choosePackcamDirectory } from '../platform/fileSystemBridge'

type SaveState = 'idle' | 'saved' | 'reset'
type BrandingSaveState = 'idle' | 'saved' | 'reset'

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(() => getStoredSettings())
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveMessage, setSaveMessage] = useState('Perubahan belum disimpan.')
  const [systemConfig, setSystemConfig] = useState<SystemConfig>(() => getStoredSystemConfig())
  const [brandingState, setBrandingState] = useState<BrandingSaveState>('idle')
  const [brandingMessage, setBrandingMessage] = useState('Belum ada perubahan branding.')
  const cameraDevices = useCameraDevices(true)

  function updateField<K extends keyof AppSettings>(field: K, value: AppSettings[K]) {
    setSettings((current) => ({
      ...current,
      [field]: value,
    }))
    setSaveState('idle')
    setSaveMessage('Ada perubahan yang belum disimpan.')
  }

  function handleSave() {
    const nextSettings = saveSettings(settings)
    setSettings(nextSettings)
    setSaveState('saved')
    setSaveMessage('Pengaturan tersimpan lokal dan dipakai pada sesi berikutnya.')
  }

  function handleReset() {
    const nextSettings = resetSettings()
    setSettings(nextSettings)
    setSaveState('reset')
    setSaveMessage('Semua pengaturan dikembalikan ke default.')
  }

  async function handleChooseVideoFolder() {
    try {
      const selection = await choosePackcamDirectory()

      if (!selection) {
        setSaveMessage('Pemilih folder belum tersedia pada runtime ini.')
        setSaveState('idle')
        return
      }

      const nextPath = selection.path || DEFAULT_VIDEO_ROOT_PATH
      updateField('videoRootPath', nextPath)
      setSaveMessage(`Folder video dipilih: ${selection.label}`)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }

      setSaveMessage('Folder video tidak bisa dipilih.')
    }
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
    const nextConfig = saveSystemConfig(systemConfig)
    setSystemConfig(nextConfig)
    setBrandingState('saved')
    setBrandingMessage('Branding sistem tersimpan dan dipakai di seluruh UI.')
  }

  function handleResetBranding() {
    const nextConfig = resetSystemConfig()
    setSystemConfig(nextConfig)
    setBrandingState('reset')
    setBrandingMessage('Branding dikembalikan ke default.')
  }

  return (
    <StageCard title="Settings">
      <div className="settings-shell">
        <div className="settings-grid">
          <form className="settings-panel settings-form" onSubmit={(event) => event.preventDefault()}>
            <div className="settings-panel__header">
              <div>
                <p className="settings-panel__eyebrow">Form</p>
                <h3>Pengaturan aplikasi</h3>
              </div>
            </div>

            <div className="settings-form__grid">
              <div className="settings-field settings-field--folder">
                <span className="settings-field__label">folder_picker</span>
                <div className="settings-folder-picker">
                  <input
                    className="settings-field__input settings-folder-picker__input"
                    value={settings.videoRootPath}
                    readOnly
                  />
                  <button
                    type="button"
                    className="action-button settings-folder-picker__button"
                    onClick={() => void handleChooseVideoFolder()}
                  >
                    Pilih folder
                  </button>
                </div>
                <small className="settings-field__help">
                  Klik untuk memilih folder, tanpa mengetik manual.
                </small>
              </div>
              <label className="settings-field">
                <span className="settings-field__label">video_format</span>
                <select
                  className="settings-field__input"
                  value={settings.videoFormat}
                  onChange={(event) => updateField('videoFormat', event.target.value as AppSettings['videoFormat'])}
                >
                  <option value="webm">webm</option>
                  <option value="mp4">mp4</option>
                </select>
                <small className="settings-field__help">Format default hasil rekaman.</small>
              </label>
              <SettingsField
                label="video_resolution"
                value={settings.videoResolution}
                onChange={(event) => updateField('videoResolution', event.target.value)}
                placeholder={DEFAULT_VIDEO_RESOLUTION}
                description="Contoh: 1280x720."
              />
              <SettingsField
                label="video_bitrate"
                value={settings.videoBitrate}
                onChange={(event) => updateField('videoBitrate', event.target.value)}
                placeholder={DEFAULT_VIDEO_BITRATE}
                description="Angka dalam bps."
              />
              <label className="settings-field">
                <span className="settings-field__label">camera_device_id</span>
                <select
                  className="settings-field__input"
                  value={settings.cameraDeviceId}
                  onChange={(event) => updateField('cameraDeviceId', event.target.value)}
                >
                  <option value="">Default camera</option>
                  {cameraDevices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label}
                    </option>
                  ))}
                </select>
                <small className="settings-field__help">
                  Pilih device kamera yang dipakai preview dan recording.
                </small>
              </label>
              <label className="settings-field settings-field--toggle">
                <span className="settings-field__label">auto_open_folder</span>
                <input
                  type="checkbox"
                  checked={settings.autoOpenFolder}
                  onChange={(event) => updateField('autoOpenFolder', event.target.checked)}
                />
                <small className="settings-field__help">
                  Buka folder video setelah rekaman selesai.
                </small>
              </label>
            </div>

            <div className="settings-actions">
              <button type="button" className="action-button action-button--primary" onClick={handleSave}>
                Simpan pengaturan
              </button>
              <button type="button" className="action-button" onClick={handleReset}>
                Reset default
              </button>
            </div>

            <p className="settings-feedback">{saveMessage}</p>
            <p className="settings-feedback settings-feedback--muted">Status: {saveState}</p>
          </form>

          <div className="settings-side">
            <section className="settings-panel">
              <div className="settings-panel__header">
                <div>
                  <p className="settings-panel__eyebrow">Brand</p>
                  <h3>Identitas sistem</h3>
                </div>
              </div>

              <div className="settings-form__grid settings-form__grid--brand settings-form__grid--single">
                <SettingsField
                  label="app_name"
                  value={systemConfig.appName}
                  onChange={(event) => updateBrandingField('appName', event.target.value)}
                  placeholder={DEFAULT_SYSTEM_CONFIG.appName}
                  description="Nama aplikasi di sidebar dan title browser."
                />
                <SettingsField
                  label="tagline"
                  value={systemConfig.tagline}
                  onChange={(event) => updateBrandingField('tagline', event.target.value)}
                  placeholder={DEFAULT_SYSTEM_CONFIG.tagline}
                  description="Deskripsi singkat untuk metadata halaman."
                />
                <SettingsField
                  label="brand_mark"
                  value={systemConfig.brandMark}
                  onChange={(event) => updateBrandingField('brandMark', event.target.value)}
                  placeholder={DEFAULT_SYSTEM_CONFIG.brandMark}
                  description="Inisial di logo sidebar."
                />
                <ColorSettingField
                  label="primary_color"
                  value={systemConfig.primaryColor}
                  onChange={(value) => updateBrandingField('primaryColor', value)}
                  description="Warna utama untuk tombol, logo, dan highlight aktif."
                />
                <ColorSettingField
                  label="accent_color"
                  value={systemConfig.accentColor}
                  onChange={(value) => updateBrandingField('accentColor', value)}
                  description="Warna aksen untuk elemen pendukung."
                />
              </div>

              <div className="settings-actions">
                <button type="button" className="action-button action-button--primary" onClick={handleSaveBranding}>
                  Simpan branding
                </button>
                <button type="button" className="action-button" onClick={handleResetBranding}>
                  Reset branding
                </button>
              </div>

              <p className="settings-feedback">{brandingMessage}</p>
              <p className="settings-feedback settings-feedback--muted">
                Status branding: {brandingState}
              </p>
            </section>
          </div>
        </div>
      </div>
    </StageCard>
  )
}

function ColorSettingField({
  label,
  value,
  onChange,
  description,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  description?: string
}) {
  return (
    <label className="settings-field">
      <span className="settings-field__label">{label}</span>
      <div className="settings-color-field">
        <input
          className="settings-color-field__picker"
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <input
          className="settings-field__input settings-color-field__input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="#111113"
        />
      </div>
      {description ? <small className="settings-field__help">{description}</small> : null}
    </label>
  )
}

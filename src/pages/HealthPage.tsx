import { useMemo, useState } from 'react'
import { StageCard } from '../components/StageCard'
import { getBuildInfo } from '../config/buildInfo'
import {
  clearAllPackcamStorage,
  clearLastError,
  clearScanPackcamData,
  readLastError,
} from '../data/storage'
import { getStoredSettings } from '../data/settings'
import { deleteRecordingFiles, listRecordings } from '../data/recordings'
import { listScanLogs } from '../data/scanLogs'

export function HealthPage() {
  const buildInfo = getBuildInfo()
  const settings = useMemo(() => getStoredSettings(), [])
  const recordings = useMemo(() => listRecordings(), [])
  const scanLogs = useMemo(() => listScanLogs(), [])
  const lastError = readLastError()
  const [isResetScanOpen, setIsResetScanOpen] = useState(false)
  const [isResetAllOpen, setIsResetAllOpen] = useState(false)

  async function handleClearScanData() {
    setIsResetScanOpen(false)
    await deleteRecordingFiles(recordings)
    await clearScanPackcamData()
    window.location.reload()
  }

  async function handleClearAllData() {
    setIsResetAllOpen(false)
    await deleteRecordingFiles(recordings)
    await clearAllPackcamStorage()
    window.location.reload()
  }

  const runtimeChecks = [
    { label: 'MediaDevices', value: typeof navigator !== 'undefined' && !!navigator.mediaDevices },
    { label: 'MediaRecorder', value: typeof MediaRecorder !== 'undefined' },
    { label: 'IndexedDB', value: typeof indexedDB !== 'undefined' },
    { label: 'localStorage', value: typeof window !== 'undefined' && !!window.localStorage },
  ]

  const dataStats = [
    { label: 'Settings', value: Object.keys(settings).length.toString() },
    { label: 'Recordings', value: recordings.length.toString() },
    { label: 'Scan logs', value: scanLogs.length.toString() },
    { label: 'Last error', value: lastError ? '1' : '0' },
  ]

  return (
    <StageCard title="Health">
      <div className="health-shell">
        <div className="health-summary">
          <article>
            <span>Version</span>
            <strong>{buildInfo.version}</strong>
          </article>
          <article>
            <span>Build time</span>
            <strong>{buildInfo.buildTime}</strong>
          </article>
          <article>
            <span>Recordings</span>
            <strong>{recordings.length}</strong>
          </article>
          <article>
            <span>Scan logs</span>
            <strong>{scanLogs.length}</strong>
          </article>
        </div>

        <div className="health-grid">
          <section className="health-block">
            <h3>Runtime</h3>
            <ul className="health-list">
              {runtimeChecks.map((check) => (
                <li key={check.label}>
                  <span>{check.label}</span>
                  <strong className={check.value ? 'health-ok' : 'health-fail'}>
                    {check.value ? 'OK' : 'Missing'}
                  </strong>
                </li>
              ))}
            </ul>
          </section>

          <section className="health-block">
            <h3>Data</h3>
            <ul className="health-list">
              {dataStats.map((check) => (
                <li key={check.label}>
                  <span>{check.label}</span>
                  <strong>{check.value}</strong>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="health-footer">
          <section className="health-block">
            <h3>Last error</h3>
            {lastError ? (
              <div className="health-error">
                <strong>{lastError.message}</strong>
                <small>{lastError.createdAt}</small>
                <button type="button" className="action-button" onClick={clearLastError}>
                  Clear error
                </button>
              </div>
            ) : (
              <p className="health-empty">Belum ada error terakhir.</p>
            )}
          </section>

          <section className="health-block health-block--danger">
            <h3>Reset</h3>
            <p className="health-empty">
              Pilih reset scan untuk menghapus data proses packing, atau reset semua data untuk menghapus seluruh
              data PackCam termasuk user.
            </p>
            <div className="history-actions">
              <button
                type="button"
                className="action-button"
                onClick={() => setIsResetScanOpen(true)}
              >
                Hapus data scan
              </button>
              <button
                type="button"
                className="action-button action-button--danger"
                onClick={() => setIsResetAllOpen(true)}
              >
                Hapus semua data
              </button>
            </div>
          </section>
        </div>

        {isResetScanOpen ? (
          <div className="modal-overlay" role="presentation" onClick={() => setIsResetScanOpen(false)}>
            <div
              className="modal-card health-reset-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="health-reset-scan-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal-card__header">
                <div>
                  <p className="modal-card__eyebrow">Peringatan</p>
                  <h3 id="health-reset-scan-title">Hapus data scan?</h3>
                  <p className="modal-card__meta">
                    Aksi ini hanya menghapus data scan, recording, dan log. Data user/operator tetap aman.
                  </p>
                </div>
                <button type="button" className="modal-card__close" onClick={() => setIsResetScanOpen(false)}>
                  Tutup
                </button>
              </div>

              <div className="modal-card__actions">
                <button type="button" className="action-button" onClick={() => setIsResetScanOpen(false)}>
                  Batal
                </button>
                <button type="button" className="action-button action-button--primary" onClick={handleClearScanData}>
                  Hapus data scan
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {isResetAllOpen ? (
          <div className="modal-overlay" role="presentation" onClick={() => setIsResetAllOpen(false)}>
            <div
              className="modal-card health-reset-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="health-reset-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal-card__header">
                <div>
                  <p className="modal-card__eyebrow">Peringatan</p>
                  <h3 id="health-reset-title">Hapus semua data?</h3>
                  <p className="modal-card__meta">
                    Aksi ini akan menghapus semua data PackCam, termasuk user, session login, recording, log, dan
                    pengaturan.
                  </p>
                </div>
                <button
                  type="button"
                  className="modal-card__close"
                  onClick={() => setIsResetAllOpen(false)}
                >
                  Tutup
                </button>
              </div>

              <div className="modal-card__actions">
                <button type="button" className="action-button" onClick={() => setIsResetAllOpen(false)}>
                  Batal
                </button>
                <button type="button" className="action-button action-button--danger" onClick={handleClearAllData}>
                  Hapus semua data
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </StageCard>
  )
}

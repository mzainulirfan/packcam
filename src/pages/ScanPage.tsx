import { useEffect, useState } from 'react'
import { useOperatorSession } from '../app/operatorSession'
import { CameraPreview } from '../components/CameraPreview'
import { BarcodeInput } from '../components/BarcodeInput'
import { StageCard } from '../components/StageCard'
import { getStoredSettings, saveSettings } from '../data/settings'
import { logScanEvent } from '../data/scanLogs'
import { useBarcodeScanner } from '../hooks/useBarcodeScanner'
import { useCameraDevices } from '../hooks/useCameraDevices'
import { useCameraStream } from '../hooks/useCameraStream'
import { useRecordingSession } from '../hooks/useRecordingSession'
import { useWatermarkedStream } from '../hooks/useWatermarkedStream'

export function ScanPage() {
  const operatorSession = useOperatorSession()
  const [settings, setSettings] = useState(() => getStoredSettings())
  const [scanAlert, setScanAlert] = useState<{ kind: 'info' | 'success' | 'warning' | 'error'; message: string } | null>(null)
  const [watermarkResi, setWatermarkResi] = useState<string | null>(null)
  const [clockText, setClockText] = useState(() => formatClock(new Date()))
  const cameraDevices = useCameraDevices(true)
  const cameraState = useCameraStream(settings.cameraDeviceId)
  const watermarkedStream = useWatermarkedStream({
    sourceStream: cameraState.stream,
    watermarkResi,
    watermarkTime: clockText,
  })
  const recordingStream = watermarkedStream ?? cameraState.stream
  const recordingSession = useRecordingSession({
    stream: recordingStream,
    settings,
    operatorName: operatorSession?.operatorName ?? '',
    operatorCode: operatorSession?.operatorCode ?? '',
  })
  useEffect(() => {
    queueMicrotask(() => {
      setWatermarkResi(recordingSession.state.activeResi)
    })
  }, [recordingSession.state.activeResi])

  const barcodeScanner = useBarcodeScanner({
    onValidScan: (value) => {
      void recordingSession.handleScan(value).then((outcome) => {
        const alert = mapScanOutcomeToAlert(outcome.action, outcome.message)
        setScanAlert(alert)
      })
    },
    onInvalidScan: (value, message) => {
      logScanEvent(value || 'INVALID', 'invalid', message, {
        operatorName: operatorSession?.operatorName ?? '',
        operatorCode: operatorSession?.operatorCode ?? '',
      })
      setScanAlert({ kind: 'error', message })
    },
  })

  function handleCameraChange(deviceId: string) {
    const nextSettings = saveSettings({
      ...settings,
      cameraDeviceId: deviceId,
    })

    setSettings(nextSettings)
  }

  function handleSubmitBarcode() {
    const result = barcodeScanner.submitBarcode(barcodeScanner.value)

    if (result.status === 'invalid') {
      setScanAlert({ kind: 'error', message: result.message })
    }
  }

  const currentProcessingResi =
    recordingSession.state.queuedResi ??
    recordingSession.state.activeResi ??
    (barcodeScanner.result?.status === 'valid'
      ? barcodeScanner.value.trim() || null
      : null)
  const recordingStage = getRecordingStage(recordingSession.state)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockText(formatClock(new Date()))
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [])

  return (
    <StageCard title="Scan">
      <div className="scan-grid">
        <div className="scan-column">
          <div className="barcode-panel">
            <div className="barcode-panel__header">
              <h3>Input resi</h3>
            </div>

            {scanAlert ? (
              <div className={`scan-alert scan-alert--${scanAlert.kind}`}>
                <strong>{scanAlert.kind === 'success' ? 'Berhasil' : scanAlert.kind === 'warning' ? 'Perhatian' : scanAlert.kind === 'error' ? 'Gagal' : 'Info'}</strong>
                <p>{scanAlert.message}</p>
              </div>
            ) : null}

            <BarcodeInput
              inputRef={barcodeScanner.inputRef}
              value={barcodeScanner.value}
              onValueChange={barcodeScanner.setValue}
              onKeyDown={barcodeScanner.handleKeyDown}
              onSubmit={handleSubmitBarcode}
              onClear={() => {
                barcodeScanner.resetResult()
                barcodeScanner.setValue('')
                setScanAlert({ kind: 'info', message: 'Input dibersihkan.' })
                barcodeScanner.focusInput()
              }}
            />

            <div className="barcode-feedback">
              <p className="barcode-feedback__resi">
                {currentProcessingResi ? (
                  <>
                    Sedang memproses resi{' '}
                    <strong>{currentProcessingResi}</strong>
                  </>
                ) : (
                  'Belum ada resi yang diproses.'
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="scan-column">
          <div className="camera-panel">
            <div className="camera-panel__header">
              <div>
                <h3>Preview kamera</h3>
              </div>

              <label className="camera-select">
                <span>Device</span>
                <select
                  value={settings.cameraDeviceId}
                  onChange={(event) => handleCameraChange(event.target.value)}
                >
                  <option value="">Default camera</option>
                  {cameraDevices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <CameraPreview
              stream={recordingStream}
              isLoading={cameraState.loading}
              error={cameraState.error}
              emptyMessage="Pilih kamera untuk memulai preview."
            />
            <div className="scan-recording-strip">
              <div className="scan-recording-strip__header">
                <div>
                  <p className="scan-recording-strip__eyebrow">Recording</p>
                  <h3>
                    {recordingSession.state.mode === 'recording'
                      ? 'Sedang merekam'
                      : recordingSession.state.mode === 'stopping'
                        ? 'Menyimpan rekaman'
                        : recordingSession.state.mode === 'error'
                          ? 'Ada gangguan'
                          : 'Siap merekam'}
                  </h3>
                </div>
                <span
                  className={
                    recordingSession.state.mode === 'recording'
                      ? 'recording-badge recording-badge--live'
                      : recordingSession.state.mode === 'stopping'
                        ? 'recording-badge recording-badge--saving'
                        : recordingSession.state.mode === 'error'
                          ? 'recording-badge recording-badge--error'
                          : 'recording-badge'
                  }
                >
                  {recordingSession.state.mode}
                </span>
              </div>

              <p className="scan-recording-strip__stage">{recordingStage.label}</p>
              <p className="scan-recording-strip__operator">
                {operatorSession?.operatorName
                  ? `Operator: ${operatorSession.operatorName}`
                  : 'Operator belum login.'}
              </p>

              <div className="scan-recording-strip__meta">
                <div>
                  <span>Aktif</span>
                  <strong>{recordingSession.state.activeResi ?? '-'}</strong>
                </div>
                <div>
                  <span>Antrian</span>
                  <strong>{recordingSession.state.queuedResi ?? '-'}</strong>
                </div>
                <div>
                  <span>Tersimpan</span>
                  <strong>{recordingSession.state.lastSavedResi ?? '-'}</strong>
                </div>
              </div>

              <p className="scan-recording-strip__message">{recordingSession.state.message}</p>
              {recordingSession.state.recoveryMessage ? (
                <p className="scan-recording-strip__recovery">
                  {recordingSession.state.recoveryMessage}
                </p>
              ) : null}

              <div className="scan-recording-strip__actions">
                <button
                  type="button"
                  className="action-button action-button--primary"
                  onClick={() => {
                    void recordingSession.stopRecording().then((message) => {
                      setScanAlert({ kind: 'success', message })
                    })
                  }}
                  disabled={
                    recordingSession.state.mode !== 'recording' &&
                    recordingSession.state.mode !== 'stopping'
                  }
                >
                  Stop rekam
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </StageCard>
  )
}

function mapScanOutcomeToAlert(
  action: 'started' | 'continued' | 'queued' | 'already_processed' | 'stopped' | 'idle' | 'error',
  message: string,
) {
  if (action === 'already_processed' || action === 'error') {
    return { kind: 'error' as const, message }
  }

  if (action === 'queued') {
    return null
  }

  if (action === 'continued' || action === 'started' || action === 'stopped') {
    return { kind: 'success' as const, message }
  }

  return { kind: 'info' as const, message }
}

function getRecordingStage(state: {
  mode: 'idle' | 'recording' | 'stopping' | 'error'
  activeResi: string | null
  queuedResi: string | null
}) {
  if (state.mode === 'error') {
    return { label: 'Tahap: gangguan sistem' }
  }

  if (state.mode === 'stopping') {
    return state.queuedResi
      ? { label: `Tahap: simpan resi ${state.activeResi ?? '-'} lalu lanjut ${state.queuedResi}` }
      : { label: `Tahap: simpan resi ${state.activeResi ?? '-'}` }
  }

  if (state.mode === 'recording') {
    return state.queuedResi
      ? { label: `Tahap: resi ${state.activeResi ?? '-'} diproses, siapkan ${state.queuedResi}` }
      : { label: `Tahap: merekam resi ${state.activeResi ?? '-'}` }
  }

  return { label: 'Tahap: siap scan resi' }
}

function formatClock(date: Date) {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date)
}

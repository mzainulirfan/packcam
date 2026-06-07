import { buildApiUrl } from '@pakti/api-client'

type BackendRealtimeEventName =
  | 'recordings-updated'
  | 'scan-logs-updated'
  | 'operators-updated'
  | 'settings-updated'
  | 'system-config-updated'
  | 'sessions-updated'
  | 'last-error-updated'

type BrowserRealtimeEventName =
  | 'pakti:recordings-updated'
  | 'pakti:scan-logs-updated'
  | 'pakti:operators-updated'
  | 'pakti:settings-updated'
  | 'pakti:system-config-change'
  | 'pakti:sessions-updated'
  | 'pakti:last-error-updated'

type BackendRealtimeEnvelope = {
  event?: BackendRealtimeEventName
  data?: Record<string, unknown>
}

const EVENT_MAP: Record<BackendRealtimeEventName, BrowserRealtimeEventName> = {
  'recordings-updated': 'pakti:recordings-updated',
  'scan-logs-updated': 'pakti:scan-logs-updated',
  'operators-updated': 'pakti:operators-updated',
  'settings-updated': 'pakti:settings-updated',
  'system-config-updated': 'pakti:system-config-change',
  'sessions-updated': 'pakti:sessions-updated',
  'last-error-updated': 'pakti:last-error-updated',
}

let realtimeSource: EventSource | null = null

function hasWindow() {
  return typeof window !== 'undefined'
}

function emitBrowserEvent(eventName: BrowserRealtimeEventName, detail?: Record<string, unknown>) {
  if (!hasWindow()) {
    return
  }

  window.dispatchEvent(new CustomEvent(eventName, { detail }))
}

function closeRealtimeSource() {
  realtimeSource?.close()
  realtimeSource = null
}

function handleBackendEvent(eventName: BackendRealtimeEventName, payload: Record<string, unknown>) {
  emitBrowserEvent(EVENT_MAP[eventName], payload)
}

export function startRealtimeBridge() {
  if (!hasWindow() || typeof EventSource === 'undefined') {
    return closeRealtimeSource
  }

  if (realtimeSource) {
    return closeRealtimeSource
  }

  const source = new EventSource(buildApiUrl('/api/events'), { withCredentials: true })
  realtimeSource = source

  for (const eventName of Object.keys(EVENT_MAP) as BackendRealtimeEventName[]) {
    source.addEventListener(eventName, (event) => {
      if (!(event instanceof MessageEvent)) {
        return
      }

      let payload: Record<string, unknown> = {}

      if (typeof event.data === 'string' && event.data.trim()) {
        try {
          const parsed = JSON.parse(event.data) as BackendRealtimeEnvelope | Record<string, unknown>

          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            payload =
              'data' in parsed && parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)
                ? (parsed.data as Record<string, unknown>)
                : (parsed as Record<string, unknown>)
          }
        } catch {
          payload = { message: event.data }
        }
      }

      handleBackendEvent(eventName, payload)
    })
  }

  source.addEventListener('error', () => {
    if (source.readyState === EventSource.CLOSED) {
      closeRealtimeSource()
    }
  })

  return closeRealtimeSource
}

export function stopRealtimeBridge() {
  closeRealtimeSource()
}

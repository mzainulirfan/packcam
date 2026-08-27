import type { Request, Response } from 'express'

type BackendRealtimeEventName =
  | 'recordings-updated'
  | 'scan-logs-updated'
  | 'operators-updated'
  | 'settings-updated'
  | 'system-config-updated'
  | 'sessions-updated'
  | 'last-error-updated'
  | 'orders-updated'
  | 'chat-sends-updated'
  | 'shipping-chat-sends-updated'

type RealtimeClient = {
  response: Response
  heartbeat: NodeJS.Timeout
}

const clients = new Set<RealtimeClient>()

function writeEvent(response: Response, event: BackendRealtimeEventName, payload: Record<string, unknown> = {}) {
  response.write(`event: ${event}\n`)
  response.write(`data: ${JSON.stringify(payload)}\n\n`)
}

function removeClient(client: RealtimeClient) {
  client.response.removeListener('close', onCloseMap.get(client.response) ?? (() => undefined))
  client.response.removeListener('finish', onCloseMap.get(client.response) ?? (() => undefined))
  clearInterval(client.heartbeat)
  clients.delete(client)
  onCloseMap.delete(client.response)
}

const onCloseMap = new WeakMap<Response, () => void>()

export function subscribeBackendRealtime(_req: Request, res: Response) {
  res.status(200)
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  res.flushHeaders?.()
  res.write('retry: 5000\n\n')

  const client: RealtimeClient = {
    response: res,
    heartbeat: setInterval(() => {
      res.write(': ping\n\n')
    }, 25000),
  }

  const cleanup = () => {
    removeClient(client)
  }

  onCloseMap.set(res, cleanup)
  res.on('close', cleanup)
  res.on('finish', cleanup)
  clients.add(client)
}

export function broadcastBackendEvent(
  event: BackendRealtimeEventName,
  payload: Record<string, unknown> = {},
) {
  for (const client of clients) {
    try {
      writeEvent(client.response, event, payload)
    } catch {
      removeClient(client)
    }
  }
}


import fs from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import cors from 'cors'
import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import multer from 'multer'
import { DEFAULT_APP_SETTINGS, DEFAULT_SYSTEM_CONFIG } from '@pakti/shared/defaults'
import type { AppSettings, ShopeeOrder } from '@pakti/types'

import { calculatePackingPayForOrder, clearAllData, clearLastError, clearScanData, authenticateOperator, appendRecordingChunk, closePackingSession, createPackingPayRule, createPackingSession, createRecordingDraft, createScanLog, createSession, deleteOperatorProfile, deletePackingPayRule, deleteRecording, deleteSessionById, finalizeRecording, getActivePackingSession, getBootstrapStatus, getChatSendStats, getHealthSnapshot, getNextPendingShippingChatSend, getPackingPayRuleById, getPackingSessionById, getRecordingById, getShopeeOrderByOrderNumber, getShopeeOrderByResi, getShopeeOrderStats, getShippingChatSendStats, importShopeeOrders, invalidateCompletedRecordingsForResi, listChatSendsByRecordingIds, listOperatorProfiles, listPackingOperators, listPackingPayRules, listPendingChatSends, listRecentChatSends, listRecentShippingChatSends, listRecentShopeeOrders, listRecordings, listRecordingsByResi, listScanLogs, listShopeeOrderResisByOrderNumberSearch, prepareReadyRecordingChatSendsForToday, prepareRecordingChatSend, prepareRecordingShareFile, prepareShippingChatSends, readLastError, readSettings, readSystemConfig, reportLastError, recoverRecordingDraft, resolveSession, resetOperatorPassword, retryChatSend, retryShippingChatSend, saveSettings, saveSystemConfig, updateChatSendStatus, updatePackingPayRule, updateSessionTaskType, updateShippingChatSendStatus, upsertOperatorProfile } from './store'
import type { ShippingChatOrderInput } from './store/shippingChatSendStore'
import { clearSessionCookie, getCookie, normalizeRole, readStringField, sendError, sendOk, setSessionCookie } from './http'
import type { HttpSession } from './http'
import { ensureServerStorage, getUploadsDir } from './db'
import { subscribeBackendRealtime } from './realtime'

const app = express()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 750 * 1024 * 1024,
  },
})
const port = Number(process.env.PORT ?? 3001)
const host = process.env.HOST ?? '0.0.0.0'
const loginRateLimitWindowMs = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000)
const loginRateLimitMaxAttempts = Number(process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS ?? 10)
const defaultCorsOrigins = [
  'https://pakti.zakado.id',
  'https://pakti.vercel.app',
  'https://pakti-mobile.vercel.app',
  'https://mpakti.zakado.id',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:4175',
  'http://127.0.0.1:4175',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]
const corsOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
  .concat(defaultCorsOrigins)
const loginAttempts = new Map<string, { count: number; resetAt: number }>()
let shopeeExtensionHeartbeat: null | {
  page: string
  mode: string
  pendingVideoCount: number | null
  pendingShippingAvailable: boolean | null
  updatedAt: string
} = null

type AuthenticatedRequest = Request & {
  session?: HttpSession
}

function isAllowedCorsOrigin(origin: string) {
  if (process.env.SHOPEE_EXTENSION_API_KEY?.trim()) {
    if (origin.startsWith('chrome-extension://')) {
      return true
    }

    if (origin === 'https://seller.shopee.co.id' || origin === 'https://seller.shopee.com') {
      return true
    }
  }

  return corsOrigins.some((allowedOrigin) => {
    if (allowedOrigin === origin) {
      return true
    }

    if (allowedOrigin.startsWith('*.')) {
      return origin.endsWith(allowedOrigin.slice(1))
    }

    return false
  })
}

function getRequestSession(req: Request) {
  return resolveSession(getCookie(req, 'pakti_session'))
}

function requireSession(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const session = getRequestSession(req)
  if (!session) {
    return sendError(res, 401, 'Sesi login diperlukan.')
  }

  req.session = session
  return next()
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const session = req.session ?? getRequestSession(req)
  if (!session) {
    return sendError(res, 401, 'Sesi login diperlukan.')
  }

  if (session.role !== 'admin') {
    return sendError(res, 403, 'Hanya admin yang dapat mengakses fitur ini.')
  }

  req.session = session
  return next()
}

function hasValidExtensionKey(req: Request) {
  const configuredKey = process.env.SHOPEE_EXTENSION_API_KEY?.trim()
  if (!configuredKey) {
    return false
  }

  return req.header('X-Pakti-Extension-Key')?.trim() === configuredKey
}

function requireOrderImportAccess(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (hasValidExtensionKey(req)) {
    return next()
  }

  return requireAdmin(req, res, next)
}

function requireSessionOrExtensionKey(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (hasValidExtensionKey(req)) {
    return next()
  }

  return requireSession(req, res, next)
}

function getPublicApiBaseUrl(req: Request) {
  return (process.env.PUBLIC_API_BASE_URL ?? `${req.protocol}://${req.get('host') ?? `localhost:${port}`}`).trim().replace(/\/+$/, '')
}

function getLoginRateLimitKey(req: Request, operatorName: string) {
  return `${req.ip ?? req.socket.remoteAddress ?? 'unknown'}:${operatorName.trim().toLowerCase()}`
}

function readQueryString(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0]?.trim() ?? ''
  }

  return value?.trim() ?? ''
}

function canSessionAccessRecording(session: HttpSession, record: ReturnType<typeof listRecordings>[number]) {
  if (session.role === 'admin') {
    return true
  }

  return (
    (record.operator_name ?? '').trim().toLowerCase() === session.operatorName.trim().toLowerCase() &&
    (record.operator_code ?? '').trim().toLowerCase() === session.operatorCode.trim().toLowerCase()
  )
}

function canSessionActAsOperator(session: HttpSession, operatorName: string, operatorCode: string) {
  if (session.role === 'admin') {
    return true
  }

  return (
    session.operatorName.trim().toLowerCase() === operatorName.trim().toLowerCase() &&
    session.operatorCode.trim().toLowerCase() === operatorCode.trim().toLowerCase()
  )
}

function isLoginRateLimited(key: string) {
  const now = Date.now()
  const attempt = loginAttempts.get(key)
  if (!attempt || attempt.resetAt <= now) {
    loginAttempts.delete(key)
    return false
  }

  return attempt.count >= loginRateLimitMaxAttempts
}

function recordFailedLogin(key: string) {
  const now = Date.now()
  const current = loginAttempts.get(key)
  const next =
    current && current.resetAt > now
      ? { count: current.count + 1, resetAt: current.resetAt }
      : { count: 1, resetAt: now + loginRateLimitWindowMs }

  loginAttempts.set(key, next)
}

function clearLoginAttempts(key: string) {
  loginAttempts.delete(key)
}

ensureServerStorage()

app.set('trust proxy', 1)
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || (corsOrigins.length > 0 && isAllowedCorsOrigin(origin))) {
        callback(null, true)
        return
      }

      callback(new Error(`Origin ${origin} tidak diizinkan oleh CORS.`))
    },
    credentials: true,
  }),
)
app.use(express.json({ limit: '4mb' }))
app.use(express.urlencoded({ extended: true }))
app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (error instanceof SyntaxError) {
    return sendError(res, 400, 'Request JSON tidak valid.')
  }

  return next(error)
})
function requireFileAccess(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (hasValidExtensionKey(req)) {
    return next()
  }

  return requireSession(req, res, next)
}

app.use('/files', requireFileAccess, (req, res, next) => {
  const legacyPrefix = '/services/backend/server-data/uploads/'
  const uploadsPrefix = '/uploads/'
  const legacyPath = req.path.startsWith(legacyPrefix)
    ? req.path.slice(legacyPrefix.length)
    : req.path.startsWith(uploadsPrefix)
      ? req.path.slice(uploadsPrefix.length)
      : null

  if (legacyPath) {
    return res.redirect(307, `/files/${legacyPath}`)
  }

  return next()
}, express.static(getUploadsDir()))

app.get('/api/health', (_req, res) => {
  sendOk(res, {
    status: 'ok',
  })
})

app.get('/api/bootstrap', (_req, res) => {
  sendOk(res, getBootstrapStatus())
})

app.post('/api/bootstrap/admin', (req, res) => {
  const bootstrap = getBootstrapStatus()
  if (!bootstrap.needsSetup) {
    return sendError(res, 409, 'Bootstrap sudah selesai.')
  }

  const operatorName = readStringField(req.body?.operatorName, 'operatorName')
  const operatorCode = readStringField(req.body?.operatorCode, 'operatorCode')
  const password = readStringField(req.body?.password, 'password')
  const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : null

  if (!operatorName || !operatorCode || !password) {
    return sendError(res, 400, 'operatorName, operatorCode, dan password wajib diisi.')
  }

  try {
    const profile = upsertOperatorProfile({
      operatorName,
      operatorCode,
      role: 'admin',
      taskType: 'qc',
      fullName,
      password,
    })

    if (!profile) {
      return sendError(res, 500, 'Gagal membuat admin.')
    }

    const session = createSession(profile.operatorName, profile.operatorCode, profile.role, profile.taskType)
    setSessionCookie(res, session.sessionId, req)

    return sendOk(res, {
      profile,
      session,
    })
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : 'Bootstrap gagal.')
  }
})

app.post('/api/auth/login', (req, res) => {
  const operatorName = readStringField(req.body?.operatorName, 'operatorName')
  const operatorCode = typeof req.body?.operatorCode === 'string' ? req.body.operatorCode.trim() : ''
  const password = readStringField(req.body?.password, 'password')
  const role = normalizeRole(req.body?.role)

  if (!operatorName || !password) {
    return sendError(res, 400, 'Username dan password wajib diisi.')
  }

  const rateLimitKey = getLoginRateLimitKey(req, operatorName)
  if (isLoginRateLimited(rateLimitKey)) {
    return sendError(res, 429, 'Terlalu banyak percobaan login. Coba lagi beberapa menit lagi.')
  }

  try {
    const result = authenticateOperator({
      operatorName,
      operatorCode,
      password,
      role,
    })

    clearLoginAttempts(rateLimitKey)
    setSessionCookie(res, result.session.sessionId, req)

    return sendOk(res, {
      session: result.session,
      profile: result.profile,
    })
  } catch (error) {
    recordFailedLogin(rateLimitKey)
    return sendError(res, 401, error instanceof Error ? error.message : 'Login gagal.')
  }
})

app.post('/api/auth/logout', (req, res) => {
  const sessionId = getCookie(req, 'pakti_session')
  if (sessionId) {
    deleteSessionById(sessionId)
  }

  clearSessionCookie(res, req)
  return sendOk(res, { loggedOut: true })
})

app.get('/api/session', (req, res) => {
  const sessionId = getCookie(req, 'pakti_session')
  const session = resolveSession(sessionId)
  return sendOk(res, { session })
})

app.put('/api/session/task', (req, res) => {
  const session = getRequestSession(req)
  if (!session) {
    return sendError(res, 401, 'Sesi login diperlukan.')
  }

  if (session.role !== 'admin') {
    return sendError(res, 403, 'Hanya admin yang dapat mengganti task aktif.')
  }

  const nextTaskType = req.body?.taskType === 'packing' ? 'packing' : req.body?.taskType === 'qc' ? 'qc' : null
  if (!nextTaskType) {
    return sendError(res, 400, 'taskType harus qc atau packing.')
  }

  try {
    const updatedSession = updateSessionTaskType(session.sessionId, nextTaskType)
    if (!updatedSession) {
      return sendError(res, 404, 'Sesi tidak ditemukan.')
    }

    return sendOk(res, { session: updatedSession })
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : 'Gagal mengganti task aktif.')
  }
})

app.use('/api', (req, res, next) => {
  const protectedPrefixes = [
    '/system-config',
    '/settings',
    '/operators',
    '/recordings',
    '/history',
    '/scan-logs',
    '/last-error',
    '/events',
    '/data',
  ]

  if (protectedPrefixes.some((prefix) => req.path.startsWith(prefix))) {
    return requireSession(req as AuthenticatedRequest, res, next)
  }

  next()
})

app.get('/api/events', (req, res) => {
  subscribeBackendRealtime(req, res)
})

app.get('/api/admin/status', (req, res) => {
  const session = getRequestSession(req)
  if (!session) {
    return sendError(res, 401, 'Sesi login diperlukan.')
  }

  if (session.role !== 'admin') {
    return sendError(res, 403, 'Hanya admin yang dapat membuka panel status.')
  }

  const recordings = listRecordings()
  const scanLogs = listScanLogs()
  const health = getHealthSnapshot()

  return sendOk(res, {
    bootstrap: getBootstrapStatus(),
    health,
    counts: {
      operatorProfiles: health.counts.operatorProfiles,
      sessions: health.counts.sessions,
      recordings: health.counts.recordings,
      scanLogs: health.counts.scanLogs,
    },
    shopeeAutomation: {
      orders: getShopeeOrderStats(),
      videoChat: getChatSendStats(),
      shippingChat: getShippingChatSendStats(),
      extensionWorker: shopeeExtensionHeartbeat,
    },
    recentRecordings: recordings.slice(0, 8),
    recentScanLogs: scanLogs.slice(0, 8),
    lastError: readLastError(),
  })
})

app.get('/api/system-config', (_req, res) => {
  sendOk(res, readSystemConfig())
})

app.put('/api/system-config', requireAdmin, (req, res) => {
  try {
    const nextConfig = saveSystemConfig({
      appName: readStringField(req.body?.appName, 'appName') || DEFAULT_SYSTEM_CONFIG.appName,
      tagline: readStringField(req.body?.tagline, 'tagline') || DEFAULT_SYSTEM_CONFIG.tagline,
      brandMark: readStringField(req.body?.brandMark, 'brandMark') || DEFAULT_SYSTEM_CONFIG.brandMark,
    })

    return sendOk(res, nextConfig)
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : 'Gagal menyimpan system config.')
  }
})

app.get('/api/settings', (_req, res) => {
  sendOk(res, readSettings())
})

app.put('/api/settings', requireAdmin, (req, res) => {
  try {
    const nextSettings = saveSettings({
      videoRootPath: readStringField(req.body?.videoRootPath, 'videoRootPath') || DEFAULT_APP_SETTINGS.videoRootPath,
      videoFormat: req.body?.videoFormat === 'mp4' ? 'mp4' : 'webm',
      videoResolution: readStringField(req.body?.videoResolution, 'videoResolution') || DEFAULT_APP_SETTINGS.videoResolution,
      videoBitrate: readStringField(req.body?.videoBitrate, 'videoBitrate') || DEFAULT_APP_SETTINGS.videoBitrate,
      cameraDeviceId: typeof req.body?.cameraDeviceId === 'string' ? req.body.cameraDeviceId.trim() : '',
      autoOpenFolder: Boolean(req.body?.autoOpenFolder),
    } satisfies AppSettings)

    return sendOk(res, nextSettings)
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : 'Gagal menyimpan settings.')
  }
})

app.post('/api/settings/open-folder', requireAdmin, (_req, res) => {
  try {
    const settings = readSettings()
    const absolutePath = path.join(getUploadsDir(), ...settings.videoRootPath.split('/').filter(Boolean))
    fs.mkdirSync(absolutePath, { recursive: true })

    if (process.platform === 'darwin') {
      spawn('open', [absolutePath], { detached: true, stdio: 'ignore' }).unref()
    } else if (process.platform === 'win32') {
      spawn('explorer', [absolutePath], { detached: true, stdio: 'ignore' }).unref()
    } else {
      spawn('xdg-open', [absolutePath], { detached: true, stdio: 'ignore' }).unref()
    }

    return sendOk(res, { path: absolutePath })
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : 'Gagal membuka folder video.')
  }
})

app.get('/api/operators', requireAdmin, (_req, res) => {
  sendOk(res, listOperatorProfiles())
})

app.get('/api/packing/operators', requireSession, (_req, res) => {
  sendOk(res, listPackingOperators())
})

app.get('/api/packing-sessions/active', requireSession, (req, res) => {
  const session = getRequestSession(req)
  sendOk(res, getActivePackingSession(session))
})

app.get('/api/packing-sessions/:id', requireSession, (req, res) => {
  const params = req.params as Record<string, string | undefined>
  const packingSession = getPackingSessionById(params.id ?? '')
  if (!packingSession) {
    return sendError(res, 404, 'Sesi packing tidak ditemukan.')
  }

  return sendOk(res, packingSession)
})

app.post('/api/packing-sessions', requireSession, (req, res) => {
  const session = getRequestSession(req)
  if (!session) {
    return sendError(res, 401, 'Sesi login diperlukan.')
  }

  try {
    const packingSession = createPackingSession({
      packerOperatorName: readStringField(req.body?.packerOperatorName, 'packerOperatorName'),
      packerOperatorCode: readStringField(req.body?.packerOperatorCode, 'packerOperatorCode'),
      createdBySessionId: session.sessionId,
      note: typeof req.body?.note === 'string' ? req.body.note : null,
    })
    return sendOk(res, packingSession)
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : 'Gagal membuat sesi packing.')
  }
})

app.post('/api/packing-sessions/:id/close', requireSession, (req, res) => {
  try {
    const params = req.params as Record<string, string | undefined>
    const packingSession = closePackingSession(params.id ?? '', typeof req.body?.note === 'string' ? req.body.note : null)
    return sendOk(res, packingSession)
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : 'Gagal menutup sesi packing.')
  }
})

app.get('/api/packing-pay-rules', requireSession, (_req, res) => {
  sendOk(res, listPackingPayRules())
})

app.post('/api/packing-pay-rules', requireAdmin, (req, res) => {
  try {
    const rule = createPackingPayRule({
      name: readStringField(req.body?.name, 'name'),
      matchType: req.body?.matchType,
      matchValue: typeof req.body?.matchValue === 'string' ? req.body.matchValue : null,
      payType: req.body?.payType,
      amount: Number(req.body?.amount),
      priority: Number(req.body?.priority),
      active: req.body?.active !== false,
    })
    return sendOk(res, rule)
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : 'Gagal membuat pay rule.')
  }
})

app.patch('/api/packing-pay-rules/:id', requireAdmin, (req, res) => {
  try {
    const params = req.params as Record<string, string | undefined>
    const rule = updatePackingPayRule(params.id ?? '', {
      name: typeof req.body?.name === 'string' ? req.body.name : undefined,
      matchType: req.body?.matchType,
      matchValue: typeof req.body?.matchValue === 'string' || req.body?.matchValue === null ? req.body.matchValue : undefined,
      payType: req.body?.payType,
      amount: req.body?.amount !== undefined ? Number(req.body.amount) : undefined,
      priority: req.body?.priority !== undefined ? Number(req.body.priority) : undefined,
      active: req.body?.active !== undefined ? Boolean(req.body.active) : undefined,
    })
    return sendOk(res, rule)
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : 'Gagal update pay rule.')
  }
})

app.delete('/api/packing-pay-rules/:id', requireAdmin, (req, res) => {
  try {
    const params = req.params as Record<string, string | undefined>
    deletePackingPayRule(params.id ?? '')
    return sendOk(res, { deleted: true })
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : 'Gagal hapus pay rule.')
  }
})

app.post('/api/operators', requireAdmin, (req, res) => {
  try {
    const profile = upsertOperatorProfile({
      operatorName: readStringField(req.body?.operatorName, 'operatorName'),
      operatorCode: readStringField(req.body?.operatorCode, 'operatorCode'),
      role: normalizeRole(req.body?.role),
      taskType: req.body?.taskType === 'packing' ? 'packing' : 'qc',
      fullName: typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : null,
      password: typeof req.body?.password === 'string' ? req.body.password : null,
    })

    return sendOk(res, profile)
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : 'Gagal menyimpan operator.')
  }
})

app.put('/api/operators/:operatorName/:operatorCode/:role', requireAdmin, (req, res) => {
  try {
    const params = req.params as Record<string, string | undefined>
    const profile = upsertOperatorProfile({
      operatorName: params.operatorName ?? '',
      operatorCode: params.operatorCode ?? '',
      role: normalizeRole(params.role),
      taskType: req.body?.taskType === 'packing' ? 'packing' : 'qc',
      fullName: typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : null,
      password: typeof req.body?.password === 'string' ? req.body.password : null,
    })

    return sendOk(res, profile)
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : 'Gagal memperbarui operator.')
  }
})

app.delete('/api/operators/:operatorName/:operatorCode/:role', requireAdmin, (req, res) => {
  try {
    const params = req.params as Record<string, string | undefined>
    const deleted = deleteOperatorProfile(params.operatorName ?? '', params.operatorCode ?? '', normalizeRole(params.role))
    if (!deleted) {
      return sendError(res, 404, 'Operator tidak ditemukan.')
    }

    return sendOk(res, { deleted: true })
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : 'Gagal menghapus operator.')
  }
})

app.post('/api/import/shopee/orders', requireOrderImportAccess, (req, res) => {
  try {
    const orders = Array.isArray(req.body?.orders) ? (req.body.orders as Array<Partial<ShopeeOrder>>) : []
    if (orders.length === 0) {
      return sendError(res, 400, 'orders wajib berisi minimal 1 order.')
    }

    return sendOk(res, importShopeeOrders(orders))
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : 'Gagal import order Shopee.')
  }
})

app.post('/api/shopee/extension-heartbeat', requireSessionOrExtensionKey, (req, res) => {
  shopeeExtensionHeartbeat = {
    page: typeof req.body?.page === 'string' ? req.body.page.slice(0, 240) : '',
    mode: typeof req.body?.mode === 'string' ? req.body.mode.slice(0, 60) : 'unknown',
    pendingVideoCount: Number.isFinite(Number(req.body?.pendingVideoCount)) ? Number(req.body.pendingVideoCount) : null,
    pendingShippingAvailable: typeof req.body?.pendingShippingAvailable === 'boolean' ? req.body.pendingShippingAvailable : null,
    updatedAt: new Date().toISOString(),
  }

  return sendOk(res, shopeeExtensionHeartbeat)
})

app.post('/api/shopee/shipping-chat/prepare', requireSessionOrExtensionKey, (req, res) => {
  try {
    // Format baru: { orders: [{ orderNumber, trackingNumber?, buyerUsername? }] }
    // Format lama (kompatibel): { orderNumbers: string[] }
    let inputs: ShippingChatOrderInput[] = []

    if (Array.isArray(req.body?.orders)) {
      inputs = (req.body.orders as unknown[]).flatMap((item): ShippingChatOrderInput[] => {
        if (typeof item === 'object' && item !== null && typeof (item as Record<string, unknown>).orderNumber === 'string') {
          const o = item as Record<string, unknown>
          return [{
            orderNumber: String(o.orderNumber),
            trackingNumber: typeof o.trackingNumber === 'string' ? o.trackingNumber : null,
            buyerUsername: typeof o.buyerUsername === 'string' ? o.buyerUsername : null,
          }]
        }
        return []
      })
    } else if (Array.isArray(req.body?.orderNumbers)) {
      // Backward-compatible: extension lama hanya mengirim orderNumbers
      inputs = (req.body.orderNumbers as unknown[])
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map((orderNumber) => ({ orderNumber }))
    }

    if (inputs.length === 0) {
      return sendError(res, 400, 'orders atau orderNumbers wajib berisi minimal 1 nomor pesanan.')
    }

    return sendOk(res, prepareShippingChatSends(inputs))
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : 'Gagal menyiapkan shipping chat.')
  }
})

app.get('/api/shopee/shipping-chat/next', requireSessionOrExtensionKey, (_req, res) => {
  return sendOk(res, getNextPendingShippingChatSend())
})

app.get('/api/shopee/shipping-chat/recent', requireSession, (req, res) => {
  const query = req.query as Record<string, string | string[] | undefined>
  const limit = Number(readQueryString(query.limit) || 20)
  return sendOk(res, listRecentShippingChatSends(Number.isFinite(limit) ? limit : 20))
})

app.post('/api/shopee/shipping-chat/:id/prepared', requireSessionOrExtensionKey, (req, res) => {
  try {
    const params = req.params as Record<string, string | undefined>
    return sendOk(res, updateShippingChatSendStatus(params.id ?? '', 'prepared'))
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : 'Gagal memperbarui status shipping chat.')
  }
})

app.post('/api/shopee/shipping-chat/:id/sent', requireSessionOrExtensionKey, (req, res) => {
  try {
    const params = req.params as Record<string, string | undefined>
    return sendOk(res, updateShippingChatSendStatus(params.id ?? '', 'sent'))
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : 'Gagal memperbarui status shipping chat.')
  }
})

app.post('/api/shopee/shipping-chat/:id/failed', requireSessionOrExtensionKey, (req, res) => {
  try {
    const params = req.params as Record<string, string | undefined>
    return sendOk(res, updateShippingChatSendStatus(params.id ?? '', 'failed', typeof req.body?.error === 'string' ? req.body.error : null))
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : 'Gagal memperbarui status shipping chat.')
  }
})

app.post('/api/shopee/shipping-chat/:id/cancelled', requireSessionOrExtensionKey, (req, res) => {
  try {
    const params = req.params as Record<string, string | undefined>
    return sendOk(res, updateShippingChatSendStatus(params.id ?? '', 'cancelled', typeof req.body?.error === 'string' ? req.body.error : null))
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : 'Gagal melewati shipping chat.')
  }
})

app.post('/api/shopee/shipping-chat/:id/retry', requireSession, (req, res) => {
  try {
    const params = req.params as Record<string, string | undefined>
    return sendOk(res, retryShippingChatSend(params.id ?? ''))
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : 'Gagal memproses ulang shipping chat.')
  }
})

app.get('/api/orders/by-resi/:resi', requireSession, (req, res) => {
  const params = req.params as Record<string, string | undefined>
  const order = getShopeeOrderByResi(params.resi ?? '')
  if (!order) {
    return sendError(res, 404, 'Order tidak ditemukan untuk resi ini.')
  }

  return sendOk(res, order)
})

app.get('/api/shopee/orders/by-resi/:resi/packing-preview', requireSession, (req, res) => {
  const params = req.params as Record<string, string | undefined>
  const resi = String(params.resi ?? '').trim()
  if (!resi) return sendError(res, 400, 'Resi wajib diisi.')
  const order = getShopeeOrderByResi(resi)
  if (!order) return sendError(res, 404, 'Order tidak ditemukan untuk resi ini.')
  const pay = calculatePackingPayForOrder(order)
  return sendOk(res, { order, pay })
})

app.get('/api/orders/by-order/:orderNumber', requireSession, (req, res) => {
  const params = req.params as Record<string, string | undefined>
  const order = getShopeeOrderByOrderNumber(params.orderNumber ?? '')
  if (!order) {
    return sendError(res, 404, 'Order tidak ditemukan.')
  }

  return sendOk(res, order)
})

app.get('/api/orders/recent', requireSession, (req, res) => {
  const query = req.query as Record<string, string | string[] | undefined>
  const limit = Number(readQueryString(query.limit) || 50)
  return sendOk(res, listRecentShopeeOrders(Number.isFinite(limit) ? limit : 50))
})

app.post('/api/operators/:operatorName/:operatorCode/:role/password', requireAdmin, (req, res) => {
  try {
    const password = readStringField(req.body?.password, 'password')
    if (!password) {
      return sendError(res, 400, 'password wajib diisi.')
    }

    const params = req.params as Record<string, string | undefined>
    const profile = resetOperatorPassword(
      params.operatorName ?? '',
      params.operatorCode ?? '',
      normalizeRole(params.role),
      password,
    )

    return sendOk(res, profile)
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : 'Gagal reset password.')
  }
})

app.get('/api/recordings', (req, res) => {
  const session = getRequestSession(req)
  if (!session) {
    return sendError(res, 401, 'Sesi login diperlukan.')
  }

  sendOk(res, listRecordings().filter((record) => canSessionAccessRecording(session, record)))
})

app.get('/api/history/recordings', (req, res) => {
  const session = getRequestSession(req)
  if (!session) {
    return sendError(res, 401, 'Sesi login diperlukan.')
  }

  const query = req.query as Record<string, string | string[] | undefined>
  const searchText = readQueryString(query.search).toLowerCase()
  const taskFilter = readQueryString(query.taskType)
  const operatorFilter = readQueryString(query.operator)
  const dateFrom = readQueryString(query.dateFrom)
  const dateTo = readQueryString(query.dateTo)
  const shopeeOrderResiMatches = new Set(listShopeeOrderResisByOrderNumberSearch(searchText).map((resi) => resi.toLowerCase()))

  const records = listRecordings().filter((record) => {
    const matchesSession =
      session.role === 'admin' ||
      ((record.operator_name ?? '').trim().toLowerCase() === session.operatorName.trim().toLowerCase() &&
        (record.operator_code ?? '').trim().toLowerCase() === session.operatorCode.trim().toLowerCase())

    if (!matchesSession) {
      return false
    }

    const matchesSearch =
      !searchText ||
      record.resi_number.toLowerCase().includes(searchText) ||
      shopeeOrderResiMatches.has(record.resi_number.trim().toLowerCase()) ||
      record.file_name.toLowerCase().includes(searchText) ||
      record.file_path.toLowerCase().includes(searchText) ||
      (record.note?.toLowerCase().includes(searchText) ?? false) ||
      record.task_type.includes(searchText) ||
      record.status.includes(searchText)
    const matchesTask = taskFilter !== 'qc' && taskFilter !== 'packing' ? true : record.task_type === taskFilter
    const matchesOperator =
      session.role !== 'admin' ||
      !operatorFilter ||
      operatorFilter === 'all' ||
      ((record.operator_name ?? '').trim().toLowerCase() || (record.operator_code ?? '').trim().toLowerCase()) ===
        operatorFilter.trim().toLowerCase()
    const matchesDateFrom = !dateFrom || record.record_date >= dateFrom
    const matchesDateTo = !dateTo || record.record_date <= dateTo

    return matchesSearch && matchesTask && matchesOperator && matchesDateFrom && matchesDateTo
  })

  return sendOk(res, {
    records,
    totalRecords: records.length,
  })
})

app.get('/api/recordings/resi/:resiNumber', (req, res) => {
  const session = getRequestSession(req)
  if (!session) {
    return sendError(res, 401, 'Sesi login diperlukan.')
  }

  const params = req.params as Record<string, string | undefined>
  sendOk(res, listRecordingsByResi(params.resiNumber ?? '').filter((record) => canSessionAccessRecording(session, record)))
})

app.post('/api/recordings', (req, res) => {
  const session = getRequestSession(req)
  if (!session) {
    return sendError(res, 401, 'Sesi login diperlukan.')
  }

  try {
    const operatorName = readStringField(req.body?.operatorName, 'operatorName')
    const operatorCode = readStringField(req.body?.operatorCode, 'operatorCode')
    if (!canSessionActAsOperator(session, operatorName, operatorCode)) {
      return sendError(res, 403, 'Operator recording tidak sesuai dengan sesi login saat ini.')
    }

    const draft = createRecordingDraft({
      id: typeof req.body?.id === 'string' ? req.body.id : undefined,
      resiNumber: readStringField(req.body?.resiNumber, 'resiNumber'),
      taskType: req.body?.taskType === 'packing' ? 'packing' : 'qc',
      operatorName,
      operatorCode,
      startedAt: typeof req.body?.startedAt === 'string' ? req.body.startedAt : undefined,
      fileName: typeof req.body?.fileName === 'string' ? req.body.fileName.trim() : undefined,
      filePath: typeof req.body?.filePath === 'string' ? req.body.filePath.trim() : undefined,
      fileSizeBytes: typeof req.body?.fileSizeBytes === 'number' ? req.body.fileSizeBytes : null,
      status: typeof req.body?.status === 'string' && req.body.status === 'error' ? 'error' : 'recording',
      note: typeof req.body?.note === 'string' ? req.body.note.trim() : null,
      mediaType: req.body?.mediaType === 'photo' ? 'photo' : 'video',
      packingSessionId: typeof req.body?.packingSessionId === 'string' ? req.body.packingSessionId.trim() : null,
    })

    return sendOk(res, draft)
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : 'Gagal membuat draft recording.')
  }
})

app.post('/api/recordings/:id/chunks', upload.single('chunk'), (req, res) => {
  const session = getRequestSession(req)
  if (!session) {
    return sendError(res, 401, 'Sesi login diperlukan.')
  }

  const params = req.params as Record<string, string | undefined>
  const recording = getRecordingById(params.id ?? '')
  if (!recording) {
    return sendError(res, 404, 'Recording tidak ditemukan.')
  }

  if (!canSessionAccessRecording(session, recording)) {
    return sendError(res, 403, 'Recording ini tidak bisa diubah oleh sesi login saat ini.')
  }

  if (!req.file) {
    return sendError(res, 400, 'Field chunk wajib diisi.')
  }

  try {
    const pendingPath = appendRecordingChunk(recording.id, req.file.buffer)
    return sendOk(res, {
      recording: getRecordingById(recording.id),
      chunk: {
        path: pendingPath,
        size: req.file.size,
        mimetype: req.file.mimetype,
      },
    })
  } catch (error) {
    reportLastError(error instanceof Error ? error.message : 'Upload chunk gagal.')
    return sendError(res, 500, error instanceof Error ? error.message : 'Upload chunk gagal.')
  }
})

app.post('/api/recordings/:id/finalize', (req, res) => {
  const session = getRequestSession(req)
  if (!session) {
    return sendError(res, 401, 'Sesi login diperlukan.')
  }

  try {
    const params = req.params as Record<string, string | undefined>
    const recording = getRecordingById(params.id ?? '')
    if (!recording) {
      return sendError(res, 404, 'Recording tidak ditemukan.')
    }

    if (!canSessionAccessRecording(session, recording)) {
      return sendError(res, 403, 'Recording ini tidak bisa difinalisasi oleh sesi login saat ini.')
    }

    const finalized = finalizeRecording(params.id ?? '', {
      fileSizeBytes: typeof req.body?.fileSizeBytes === 'number' ? req.body.fileSizeBytes : null,
      endTime: typeof req.body?.endTime === 'string' ? req.body.endTime : undefined,
      note: typeof req.body?.note === 'string' ? req.body.note : undefined,
    })

    return sendOk(res, finalized)
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : 'Gagal finalize recording.')
  }
})

app.post('/api/recordings/:id/recover', (req, res) => {
  const session = getRequestSession(req)
  if (!session) {
    return sendError(res, 401, 'Sesi login diperlukan.')
  }

  try {
    const params = req.params as Record<string, string | undefined>
    const recording = getRecordingById(params.id ?? '')
    if (!recording) {
      return sendError(res, 404, 'Recording tidak ditemukan.')
    }

    if (!canSessionAccessRecording(session, recording)) {
      return sendError(res, 403, 'Recording ini tidak bisa dipulihkan oleh sesi login saat ini.')
    }

    const recovered = recoverRecordingDraft(params.id ?? '')

    if (!recovered) {
      return sendError(res, 404, 'Recording belum punya chunk yang bisa dipulihkan.')
    }

    return sendOk(res, recovered)
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : 'Gagal recovery recording.')
  }
})

app.post('/api/recordings/:id/share-file', async (req, res) => {
  try {
    const session = getRequestSession(req)
    if (!session) {
      return sendError(res, 401, 'Sesi login diperlukan.')
    }

    const params = req.params as Record<string, string | undefined>
    const recording = getRecordingById(params.id ?? '')
    if (!recording) {
      return sendError(res, 404, 'Recording tidak ditemukan.')
    }

    if (!canSessionAccessRecording(session, recording)) {
      return sendError(res, 403, 'Recording ini tidak bisa diakses oleh sesi login saat ini.')
    }

    return sendOk(res, await prepareRecordingShareFile(params.id ?? ''))
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : 'Gagal menyiapkan file share.')
  }
})

app.post('/api/recordings/:id/chat-send/prepare', async (req, res) => {
  try {
    const session = getRequestSession(req)
    if (!session) {
      return sendError(res, 401, 'Sesi login diperlukan.')
    }

    const params = req.params as Record<string, string | undefined>
    const recording = getRecordingById(params.id ?? '')
    if (!recording) {
      return sendError(res, 404, 'Recording tidak ditemukan.')
    }

    if (!canSessionAccessRecording(session, recording)) {
      return sendError(res, 403, 'Recording ini tidak bisa diakses oleh sesi login saat ini.')
    }

    const shareFile = recording.share_file_ready && recording.share_file_path
      ? { filePath: recording.share_file_path }
      : await prepareRecordingShareFile(recording.id)
    const job = prepareRecordingChatSend({
      recordingId: recording.id,
      videoFilePath: shareFile.filePath,
      messageTemplate: typeof req.body?.messageTemplate === 'string' ? req.body.messageTemplate : null,
    })

    return sendOk(res, {
      ...job,
      videoUrl: `${getPublicApiBaseUrl(req)}/files/${job.videoFilePath}`,
    })
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : 'Gagal menyiapkan kirim chat Shopee.')
  }
})

app.post('/api/chat-sends/auto-prepare-ready', requireSessionOrExtensionKey, async (req, res) => {
  try {
    const rawLimit = Number(req.body?.limit ?? 5)
    const result = await prepareReadyRecordingChatSendsForToday({
      limit: Number.isFinite(rawLimit) ? rawLimit : 5,
      taskType: req.body?.taskType === 'qc' ? 'qc' : 'packing',
      prepareShareFile: prepareRecordingShareFile,
    })

    return sendOk(res, {
      ...result,
      created: result.created.map((job) => ({
        ...job,
        videoUrl: `${getPublicApiBaseUrl(req)}/files/${job.videoFilePath}`,
      })),
    })
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : 'Gagal menyiapkan chat video otomatis.')
  }
})

app.get('/api/chat-sends/pending', requireSessionOrExtensionKey, (req, res) => {
  sendOk(res, listPendingChatSends(getPublicApiBaseUrl(req)))
})

app.get('/api/chat-sends/recent', requireSession, (req, res) => {
  const query = req.query as Record<string, string | string[] | undefined>
  const limit = Number(readQueryString(query.limit) || 20)
  sendOk(res, listRecentChatSends(Number.isFinite(limit) ? limit : 20, getPublicApiBaseUrl(req)))
})

app.get('/api/chat-sends/by-recordings', requireSession, (req, res) => {
  const query = req.query as Record<string, string | string[] | undefined>
  const raw = readQueryString(query.recordingIds)
  const ids = raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 200)
  sendOk(res, listChatSendsByRecordingIds(ids, getPublicApiBaseUrl(req)))
})

app.post('/api/chat-sends/:id/prepared', requireSessionOrExtensionKey, (req, res) => {
  try {
    const params = req.params as Record<string, string | undefined>
    return sendOk(res, updateChatSendStatus(params.id ?? '', 'prepared'))
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : 'Gagal memperbarui status chat.')
  }
})

app.post('/api/chat-sends/:id/sent', requireSessionOrExtensionKey, (req, res) => {
  try {
    const params = req.params as Record<string, string | undefined>
    return sendOk(res, updateChatSendStatus(params.id ?? '', 'sent'))
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : 'Gagal memperbarui status chat.')
  }
})

app.post('/api/chat-sends/:id/failed', requireSessionOrExtensionKey, (req, res) => {
  try {
    const params = req.params as Record<string, string | undefined>
    return sendOk(res, updateChatSendStatus(params.id ?? '', 'failed', typeof req.body?.error === 'string' ? req.body.error : null))
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : 'Gagal memperbarui status chat.')
  }
})

app.post('/api/chat-sends/:id/cancelled', requireSessionOrExtensionKey, (req, res) => {
  try {
    const params = req.params as Record<string, string | undefined>
    return sendOk(res, updateChatSendStatus(params.id ?? '', 'cancelled', typeof req.body?.error === 'string' ? req.body.error : null))
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : 'Gagal melewati chat.')
  }
})

app.post('/api/chat-sends/:id/retry', requireSession, (req, res) => {
  try {
    const params = req.params as Record<string, string | undefined>
    return sendOk(res, retryChatSend(params.id ?? ''))
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : 'Gagal me-retry chat video.')
  }
})

app.post('/api/recordings/repeat-qc', (req, res) => {
  const session = getRequestSession(req)
  if (!session) {
    return sendError(res, 401, 'Sesi login diperlukan.')
  }

  try {
    const resiNumber = typeof req.body?.resiNumber === 'string' ? req.body.resiNumber.trim() : ''
    const accessibleRecordings = listRecordingsByResi(resiNumber).filter((record) => canSessionAccessRecording(session, record))
    if (accessibleRecordings.length === 0) {
      return sendError(res, 403, 'Recording ini tidak bisa diulang oleh sesi login saat ini.')
    }

    const updated = invalidateCompletedRecordingsForResi(resiNumber)
    return sendOk(res, updated)
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : 'Gagal menyiapkan ulang QC.')
  }
})

app.delete('/api/recordings/:id', (req, res) => {
  const session = getRequestSession(req)
  if (!session) {
    return sendError(res, 401, 'Sesi login diperlukan.')
  }

  const params = req.params as Record<string, string | undefined>
  const recording = getRecordingById(params.id ?? '')
  if (!recording) {
    return sendError(res, 404, 'Recording tidak ditemukan.')
  }

  if (!canSessionAccessRecording(session, recording)) {
    return sendError(res, 403, 'Recording ini tidak bisa dihapus oleh sesi login saat ini.')
  }

  const deleted = deleteRecording(params.id ?? '')
  if (!deleted) {
    return sendError(res, 404, 'Recording tidak ditemukan.')
  }

  return sendOk(res, { deleted: true })
})

app.get('/api/scan-logs', (_req, res) => {
  sendOk(res, listScanLogs())
})

app.post('/api/scan-logs', (req, res) => {
  try {
    const actionValue = typeof req.body?.action === 'string' ? req.body.action : undefined
    const log = createScanLog({
      resiNumber: readStringField(req.body?.resiNumber, 'resiNumber'),
      taskType: req.body?.taskType === 'packing' ? 'packing' : 'qc',
      action: actionValue === 'stop' || actionValue === 'duplicate' || actionValue === 'invalid' ? actionValue : 'start',
      message: typeof req.body?.message === 'string' ? req.body.message.trim() : null,
      operatorName: typeof req.body?.operatorName === 'string' ? req.body.operatorName.trim() : null,
      operatorCode: typeof req.body?.operatorCode === 'string' ? req.body.operatorCode.trim() : null,
    })

    return sendOk(res, log)
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : 'Gagal membuat scan log.')
  }
})

app.get('/api/last-error', (_req, res) => {
  sendOk(res, readLastError())
})

app.post('/api/last-error', (req, res) => {
  try {
    const message = readStringField(req.body?.message, 'message')
    const payload = reportLastError(message || 'Unknown error')
    sendOk(res, payload)
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : 'Gagal menyimpan last error.')
  }
})

app.delete('/api/last-error', requireAdmin, (_req, res) => {
  clearLastError()
  sendOk(res, { cleared: true })
})

app.delete('/api/data/scan', requireAdmin, (_req, res) => {
  clearScanData()
  sendOk(res, { cleared: true })
})

app.delete('/api/data/all', requireAdmin, (_req, res) => {
  clearAllData()
  sendOk(res, { cleared: true })
})

app.use((_req, res) => {
  sendError(res, 404, 'Endpoint tidak ditemukan.')
})

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  void _next
  sendError(res, 500, error instanceof Error ? error.message : 'Server error.')
})

app.listen(port, host, () => {
  console.log(`Pakti API listening on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`)
  console.log(`LAN access: http://${process.env.LAN_IP ?? '<IP-laptop>'}:${port}`)
})

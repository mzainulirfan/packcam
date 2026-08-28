import type { Request, Response } from 'express'

export type HttpSession = {
  sessionId: string
  operatorName: string
  operatorCode: string
  role: 'admin' | 'operator'
  taskType: 'qc' | 'packing'
  createdAt: string
  updatedAt: string
}

export function parseCookies(cookieHeader: string | undefined) {
  const cookies = new Map<string, string>()

  if (!cookieHeader) {
    return cookies
  }

  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rest] = part.trim().split('=')
    if (!rawName) {
      continue
    }

    cookies.set(rawName, decodeURIComponent(rest.join('=') || ''))
  }

  return cookies
}

export function getCookie(req: Request, name: string) {
  return parseCookies(req.headers.cookie).get(name) ?? null
}

export function sendError(res: Response, statusCode: number, message: string) {
  return res.status(statusCode).json({
    ok: false,
    error: message,
  })
}

export function sendOk<T>(res: Response, data: T) {
  return res.json({
    ok: true,
    data,
  })
}

export function readStringField(value: unknown, _fieldName: string, fallback = '') {
  if (typeof value !== 'string') {
    return fallback
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return fallback
  }

  return trimmed
}

export function normalizeRole(value: unknown): 'admin' | 'operator' {
  return value === 'admin' ? 'admin' : 'operator'
}

function isCrossSiteRequest(req?: Request) {
  const origin = (req?.headers.origin ?? '').trim()
  if (!origin) return false
  try {
    const url = new URL(origin)
    // Vercel and trycloudflare are cross-site from localhost
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return false
    return true
  } catch {
    return false
  }
}

function readCookieAttributes(req?: Request) {
  const sameSite = isCrossSiteRequest(req) ? 'None' : 'Lax'
  const cookieDomain = (process.env.COOKIE_DOMAIN ?? '').trim()
  const cookieSecure = sameSite === 'None'

  return [
    'HttpOnly',
    `SameSite=${sameSite}`,
    'Path=/',
    ...(cookieSecure ? ['Secure'] : []),
    ...(cookieDomain ? [`Domain=${cookieDomain}`] : []),
  ]
}

export function setSessionCookie(res: Response, sessionId: string, req?: Request) {
  const cookie = [
    `pakti_session=${encodeURIComponent(sessionId)}`,
    ...readCookieAttributes(req),
  ].join('; ')

  res.setHeader('Set-Cookie', cookie)
}

export function clearSessionCookie(res: Response, req?: Request) {
  res.setHeader('Set-Cookie', [
    'pakti_session=',
    ...readCookieAttributes(req),
    'Max-Age=0',
  ].join('; '))
}

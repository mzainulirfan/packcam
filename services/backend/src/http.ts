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

export function setSessionCookie(res: Response, sessionId: string) {
  const cookie = [
    `pakti_session=${encodeURIComponent(sessionId)}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
  ].join('; ')

  res.setHeader('Set-Cookie', cookie)
}

export function clearSessionCookie(res: Response) {
  res.setHeader('Set-Cookie', [
    'pakti_session=',
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    'Max-Age=0',
  ].join('; '))
}

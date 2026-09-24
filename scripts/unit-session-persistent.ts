import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import type { Response } from 'node:http'
import { fileURLToPath } from 'node:url'

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const TEST_DB_PATH = path.resolve(MODULE_DIR, '../server-data/pakti-test-session.sqlite')

for (const suffix of ['', '-wal', '-shm', '-journal']) {
  const extra = `${TEST_DB_PATH}${suffix}`
  if (fs.existsSync(extra)) fs.unlinkSync(extra)
}

process.env.PAKTI_DB_PATH = TEST_DB_PATH
delete process.env.SESSION_TTL_HOURS

const { getDb } = await import('../services/backend/src/db.ts')
const { authenticateOperator, createSession, getSessionById, resolveSession } = await import('../services/backend/src/store/sessionStore.ts')
const { upsertOperatorProfile } = await import('../services/backend/src/store/operatorStore.ts')
const { clearSessionCookie, getSessionCookieMaxAgeSeconds, getSessionTtlHours, setSessionCookie } = await import('../services/backend/src/http.ts')

const database = getDb()

function captureSetCookie(apply: (res: Response) => void) {
  const values: string[] = []
  const res = {
    setHeader(_name: string, value: string) {
      values.push(value)
    },
  } as unknown as Response
  apply(res)
  assert.equal(values.length, 1)
  return values[0] as string
}

test('TTL sesi default 7 hari dan Max-Age cookie mengikutinya', () => {
  assert.equal(getSessionTtlHours(), 168)
  assert.equal(getSessionCookieMaxAgeSeconds(), 168 * 60 * 60)
})

test('setSessionCookie tanpa persistent tidak memasang Max-Age', () => {
  const cookie = captureSetCookie((res) => setSessionCookie(res, 'session_abc'))
  assert.match(cookie, /pakti_session=session_abc/)
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /Path=\//)
  assert.doesNotMatch(cookie, /Max-Age=/)
})

test('setSessionCookie persistent memasang Max-Age 7 hari', () => {
  const cookie = captureSetCookie((res) => setSessionCookie(res, 'session_abc', undefined, { persistent: true }))
  assert.match(cookie, /Max-Age=604800/)
})

test('clearSessionCookie selalu menghapus cookie', () => {
  const cookie = captureSetCookie((res) => clearSessionCookie(res))
  assert.match(cookie, /pakti_session=;/)
  assert.match(cookie, /Max-Age=0/)
})

test('createSession menyimpan flag persistent dan resolveSession mempertahankannya', () => {
  const regular = createSession('Operator Biasa', 'OP01', 'operator', 'packing')
  assert.equal(regular.persistent, false)
  assert.equal(getSessionById(regular.sessionId)?.persistent, false)

  const remembered = createSession('Operator Ingat', 'OP02', 'operator', 'packing', true)
  assert.equal(remembered.persistent, true)
  const resolved = resolveSession(remembered.sessionId)
  assert.ok(resolved)
  assert.equal(resolved?.persistent, true)
})

test('authenticateOperator meneruskan flag persistent dari login', () => {
  const suffix = Math.random().toString(36).slice(2, 8)
  upsertOperatorProfile({
    operatorName: `Tes Ingat ${suffix}`,
    operatorCode: `TI${suffix}`,
    role: 'operator',
    taskType: 'packing',
    password: 'rahasia123',
  })

  const regular = authenticateOperator({ operatorName: `Tes Ingat ${suffix}`, password: 'rahasia123' })
  assert.equal(regular.session.persistent, false)

  const remembered = authenticateOperator({ operatorName: `Tes Ingat ${suffix}`, password: 'rahasia123', persistent: true })
  assert.equal(remembered.session.persistent, true)
  const cookie = captureSetCookie((res) => setSessionCookie(res, remembered.session.sessionId, undefined, { persistent: true }))
  assert.match(cookie, /Max-Age=604800/)
})

test('sesi kedaluwarsa tetap ditolak walau persistent', () => {
  const remembered = createSession('Operator Lama', 'OP03', 'operator', 'packing', true)
  database.prepare(`UPDATE operator_sessions SET updated_at = ? WHERE session_id = ?`).run('2020-01-01T00:00:00.000Z', remembered.sessionId)
  assert.equal(resolveSession(remembered.sessionId), null)
  assert.equal(getSessionById(remembered.sessionId), null)
})

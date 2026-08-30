import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const TEST_DB_PATH = path.resolve(MODULE_DIR, '../server-data/pakti-test-packing-session.sqlite')

if (fs.existsSync(TEST_DB_PATH)) {
  fs.unlinkSync(TEST_DB_PATH)
}

process.env.PAKTI_DB_PATH = TEST_DB_PATH

const { getDb } = await import('../services/backend/src/db.ts')
const { upsertOperatorProfile } = await import('../services/backend/src/store/operatorStore.ts')
const {
  closePackingSession,
  createPackingSession,
  getPackingSessionById,
  reopenPackingSession,
} = await import('../services/backend/src/store/packingSessionStore.ts')

const database = getDb()

function resetDb() {
  database.prepare('DELETE FROM recordings').run()
  database.prepare('DELETE FROM packing_work_sessions').run()
  database.prepare('DELETE FROM operator_profiles').run()
}

function seedPackingOperator(operatorName: string, operatorCode: string, fullName = operatorName) {
  return upsertOperatorProfile({
    operatorName,
    operatorCode,
    role: 'operator',
    taskType: 'packing',
    fullName,
    password: 'secret123',
  })
}

test('reopenPackingSession melanjutkan sesi active yang belum diakhiri dan melepas sesi aktif lain', () => {
  resetDb()
  seedPackingOperator('sani', 'PK01', 'Sani')
  seedPackingOperator('wildan', 'PK02', 'Wildan')

  const saniSession = createPackingSession({
    packerOperatorName: 'sani',
    packerOperatorCode: 'PK01',
    createdBySessionId: 'device-session-1',
  })
  assert.ok(saniSession)

  const wildanSession = createPackingSession({
    packerOperatorName: 'wildan',
    packerOperatorCode: 'PK02',
    createdBySessionId: 'device-session-1',
    releaseActive: true,
  })
  assert.ok(wildanSession)
  assert.equal(getPackingSessionById(saniSession.id)?.status, 'active')
  assert.equal(getPackingSessionById(saniSession.id)?.createdBySessionId, null)

  const reopened = reopenPackingSession({
    id: saniSession.id,
    currentSession: {
      sessionId: 'device-session-1',
      operatorName: 'admin',
      operatorCode: 'ADM',
      role: 'admin',
      taskType: 'packing',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    releaseActive: true,
  })

  assert.equal(reopened?.id, saniSession.id)
  assert.equal(reopened?.status, 'active')
  assert.equal(reopened?.endedAt, null)
  assert.equal(reopened?.createdBySessionId, 'device-session-1')
  assert.equal(getPackingSessionById(wildanSession.id)?.status, 'active')
  assert.equal(getPackingSessionById(wildanSession.id)?.createdBySessionId, null)
})

test('createPackingSession otomatis melepas sesi aktif lama di device yang sama', () => {
  resetDb()
  seedPackingOperator('sani', 'PK01', 'Sani')
  seedPackingOperator('wildan', 'PK02', 'Wildan')

  const saniSession = createPackingSession({
    packerOperatorName: 'sani',
    packerOperatorCode: 'PK01',
    createdBySessionId: 'device-session-1',
  })

  const wildanSession = createPackingSession({
    packerOperatorName: 'wildan',
    packerOperatorCode: 'PK02',
    createdBySessionId: 'device-session-1',
  })

  assert.equal(wildanSession?.status, 'active')
  assert.equal(wildanSession?.createdBySessionId, 'device-session-1')
  assert.equal(getPackingSessionById(saniSession?.id ?? '')?.status, 'active')
  assert.equal(getPackingSessionById(saniSession?.id ?? '')?.createdBySessionId, null)
})

test('reopenPackingSession menolak sesi yang sudah diakhiri', () => {
  resetDb()
  seedPackingOperator('sani', 'PK01', 'Sani')

  const saniSession = createPackingSession({
    packerOperatorName: 'sani',
    packerOperatorCode: 'PK01',
    createdBySessionId: 'device-session-1',
  })
  assert.ok(saniSession)
  closePackingSession(saniSession.id)

  assert.throws(() => reopenPackingSession({
    id: saniSession.id,
    currentSession: {
      sessionId: 'device-session-1',
      operatorName: 'admin',
      operatorCode: 'ADM',
      role: 'admin',
      taskType: 'packing',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  }), /belum diakhiri/)
})

test('reopenPackingSession bisa mengambil alih sesi active dari session login lama', () => {
  resetDb()
  seedPackingOperator('sani', 'PK01', 'Sani')

  const saniSession = createPackingSession({
    packerOperatorName: 'sani',
    packerOperatorCode: 'PK01',
    createdBySessionId: 'old-login-session',
  })
  assert.ok(saniSession)

  const resumed = reopenPackingSession({
    id: saniSession.id,
    currentSession: {
      sessionId: 'current-login-session',
      operatorName: 'admin',
      operatorCode: 'ADM',
      role: 'admin',
      taskType: 'packing',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    releaseActive: true,
  })

  assert.equal(resumed?.id, saniSession.id)
  assert.equal(resumed?.status, 'active')
  assert.equal(resumed?.createdBySessionId, 'current-login-session')
})

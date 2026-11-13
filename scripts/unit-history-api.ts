import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

const testDir = fs.mkdtempSync(path.resolve('.cache/history-api-'))
process.env.PAKTI_DB_PATH = path.join(testDir, 'test.sqlite')
const { getDb } = await import('../services/backend/src/db.ts')
const { createSession } = await import('../services/backend/src/store/sessionStore.ts')
const database = getDb()
const owner = createSession('owner', 'OP1', 'operator', 'packing')
const admin = createSession('admin', 'ADM', 'admin', 'qc')
const now = new Date().toISOString()
const old = '2020-01-01T00:00:00.000Z'
const seed = database.prepare(`INSERT INTO recordings (id, resi_number, task_type, operator_name, operator_code, file_name, file_path, record_date, start_time, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'test.webm', 'test.webm', ?, ?, 'completed', ?, ?)`)
function record(id: string, resi: string, task: string, date: string, name = 'owner', code = 'OP1') {
  seed.run(id, resi, task, name, code, date.slice(0, 10), date, date, date)
}
for (let i = 0; i < 350; i++) record(`rec-${i}`, `RESI-${i}`, 'packing', now)
record('qc-old', 'SHARED', 'qc', old)
record('packing-new', 'SHARED', 'packing', now)
record('private-old', 'PRIVATE', 'qc', old)
record('private-other', 'PRIVATE', 'packing', now, 'other', 'OP2')
record('unrelated', 'UNRELATED', 'qc', old)

const probe = createServer()
await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve))
const port = (probe.address() as { port: number }).port
await new Promise<void>(resolve => probe.close(() => resolve()))
const child = spawn(process.execPath, ['--import', 'tsx', 'services/backend/src/app.ts'], {
  cwd: process.cwd(), env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
})
let output = ''
child.stdout.on('data', chunk => { output += String(chunk) })
child.stderr.on('data', chunk => { output += String(chunk) })
const base = `http://127.0.0.1:${port}`
try {
  let ready = false
  for (let i = 0; i < 100; i++) {
    try { ready = (await fetch(`${base}/api/health`)).ok } catch { /* Wait for test server. */ }
    if (ready) break
    if (child.exitCode !== null) throw new Error(output)
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.ok(ready, 'Test backend did not start')
  const get = (query: string, token = owner.sessionId) => fetch(`${base}/api/history/recordings${query}`, { headers: { Authorization: `Bearer ${token}` } })
  const query = `?updatedSince=${encodeURIComponent(new Date(Date.now() - 86400000).toISOString())}`
  const response = await get(query)
  if (response.status !== 200) throw new Error(await response.text())
  assert.equal(response.status, 200)
  const payload = await response.json() as { data: { records: Array<{ id: string; operator_name: string }>; totalRecords: number } }
  assert.equal(payload.data.totalRecords, 352)
  assert.ok(payload.data.records.some(row => row.id === 'qc-old'))
  assert.ok(payload.data.records.every(row => row.operator_name === 'owner'))
  assert.ok(!payload.data.records.some(row => row.id === 'private-old'))
  const audit = await (await get(query, admin.sessionId)).json() as typeof payload
  assert.equal(audit.data.totalRecords, 354)
  assert.ok(audit.data.records.some(row => row.id === 'private-other'))
  const all = await (await get('')).json() as typeof payload
  assert.equal(all.data.totalRecords, 354)
  assert.equal((await get('?updatedSince=invalid')).status, 400)
  assert.equal((await fetch(`${base}/api/history/recordings`)).status, 401)
  console.log('PASS history API: >300 rows, counterpart stages, authorization before window, admin audit, all dates, invalid dates, unauthenticated access')
} finally {
  child.kill()
  database.close()
}

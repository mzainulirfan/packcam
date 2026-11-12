import assert from 'node:assert/strict'
import test from 'node:test'

import type { RecordingRow } from '@pakti/types'

import {
  filterRecordings,
  getRecordingIdentitySummary,
  matchesRecordingLoginIdentity,
} from '../apps/mobile/src/history/historyUtils.ts'

function makeRecording(overrides: Partial<RecordingRow> = {}): RecordingRow {
  return {
    id: 'recording-1',
    resiNumber: 'RESI-001',
    taskType: 'packing',
    operatorName: 'sani',
    operatorCode: 'PK01',
    fileName: 'packing.jpg',
    filePath: 'packing.jpg',
    mediaType: 'photo',
    fileSizeBytes: 100,
    recordDate: '2026-11-12',
    startTime: '2026-11-12T01:00:00.000Z',
    endTime: '2026-11-12T01:00:01.000Z',
    durationSeconds: 1,
    status: 'completed',
    note: null,
    packerOperatorName: 'sani',
    packerOperatorCode: 'PK01',
    packingPayAmount: 1500,
    packingPayStatus: 'calculated',
    createdAt: '2026-11-12T01:00:00.000Z',
    updatedAt: '2026-11-12T01:00:01.000Z',
    ...overrides,
  }
}

test('history packing baru menampilkan identitas login sebagai packer dan pencatat', () => {
  const record = makeRecording()
  const identity = getRecordingIdentitySummary(record)

  assert.deepEqual(identity, {
    actorName: 'sani',
    actorCode: 'PK01',
    creditedName: 'sani',
    creditedCode: 'PK01',
    isHistoricalOnBehalf: false,
  })
  assert.equal(matchesRecordingLoginIdentity(record, 'SANI', 'pk01'), true)
})

test('history mempertahankan audit packing historis atas nama tanpa memindahkan akun pencatat', () => {
  const record = makeRecording({
    operatorName: 'admin',
    operatorCode: 'ADM',
    packerOperatorName: 'sani',
    packerOperatorCode: 'PK01',
  })
  const identity = getRecordingIdentitySummary(record)

  assert.equal(identity.isHistoricalOnBehalf, true)
  assert.equal(identity.actorName, 'admin')
  assert.equal(identity.creditedName, 'sani')
  assert.equal(matchesRecordingLoginIdentity(record, 'admin', 'ADM'), true)
  assert.equal(matchesRecordingLoginIdentity(record, 'sani', 'PK01'), false)
})

test('filter akun saya tidak mencampur recording akun lain', () => {
  const own = makeRecording({ id: 'own' })
  const other = makeRecording({ id: 'other', operatorName: 'wildan', operatorCode: 'PK02', packerOperatorName: 'wildan', packerOperatorCode: 'PK02' })

  const filtered = filterRecordings({
    recordings: [own, other],
    historyTaskFilter: 'all',
    historyDateFilter: 'all',
    normalizedHistoryQuery: '',
    historyAllAccounts: false,
    currentOperatorName: 'sani',
    currentOperatorCode: 'PK01',
  })

  assert.deepEqual(filtered.map((record) => record.id), ['own'])
})

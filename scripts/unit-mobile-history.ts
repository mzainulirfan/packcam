import { selectHistoryActivityWindow } from '../services/backend/src/historyWindow.ts'
import assert from 'node:assert/strict'
import test from 'node:test'

import type { RecordingRow } from '@pakti/types'

import {
  filterRecordings,
  groupRecordings,
  groupHistoryByDate,
  getHistoryEmptyState,
  getHistorySince,
  matchesHistoryDateFilter,
  getLatestTaskRecord,
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

test('grouping memakai aktivitas terbaru meski QC lebih lama daripada packing', () => {
  const qc = makeRecording({ id: 'qc-old', taskType: 'qc', updatedAt: '2026-11-10T01:00:00Z' })
  const packing = makeRecording({ id: 'packing-new', updatedAt: '2026-11-13T01:00:00Z' })
  const other = makeRecording({ id: 'other-resi', resiNumber: 'RESI-002', updatedAt: '2026-11-12T01:00:00Z' })
  const groups = groupRecordings([qc, packing, other], 'newest')
  assert.equal(groups[0].resiNumber, 'RESI-001')
  assert.equal(groups[0].latestRow?.id, 'packing-new')
  assert.deepEqual(groups[0].rows.map(r => r.id), ['qc-old', 'packing-new'])
  assert.equal(groupRecordings([qc, packing, other], 'oldest')[0].resiNumber, 'RESI-002')
})

test('resi dengan kapitalisasi atau spasi berbeda tetap satu kartu', () => {
  const groups = groupRecordings([makeRecording(), makeRecording({ id: 'case', resiNumber: ' resi-001 ', taskType: 'qc' })], 'newest')
  assert.equal(groups.length, 1)
  assert.equal(groups[0].rows.length, 2)
})

test('pencarian memakai nomor pesanan tersimpan tanpa daftar Shopee terbaru', () => {
  const record = makeRecording({ orderNumber: 'ORDER-ABC-123' })
  const filtered = filterRecordings({ recordings: [record], historyTaskFilter: 'all', historyDateFilter: 'all', normalizedHistoryQuery: 'abc-123', historyAllAccounts: false, currentOperatorName: 'sani', currentOperatorCode: 'pk01' })
  assert.equal(filtered.length, 1)
})

test('belum lengkap mencakup progres 0% dan 50%, bukan 100%', () => {
  const empty = makeRecording({ id: 'pending', resiNumber: 'EMPTY', status: 'error' })
  const half = makeRecording({ id: 'half', resiNumber: 'HALF' })
  const complete = [makeRecording({ id: 'c-p', resiNumber: 'COMPLETE' }), makeRecording({ id: 'c-q', resiNumber: 'COMPLETE', taskType: 'qc' })]
  const groups = groupRecordings([empty, half, ...complete], 'newest')
  const sections = groupHistoryByDate(groups, 'belum-lengkap')
  assert.deepEqual(new Set(sections.flatMap(([, list]) => list.map(g => g.resiNumber))), new Set(['EMPTY', 'HALF']))
})

test('hasil pencarian kosong tidak mengklaim resi tidak ada di server', () => {
  const result = getHistoryEmptyState({ groupedRecordingsLength: 0, historyQuery: 'UNKNOWN', matchingResiRecords: [], latestMatchingResiRecord: null, historyAllAccounts: false, currentOperatorName: 'sani', currentOperatorCode: 'pk01' })
  assert.equal(result?.detail.includes('belum masuk ke server'), false)
})


test('batas tanggal pemuatan dan filter konsisten di tengah malam Jakarta', () => {
  const now = new Date('2026-11-12T17:05:00Z')
  assert.equal(getHistorySince('today', now), '2026-11-12T17:00:00.000Z')
  assert.equal(getHistorySince('yesterday', now), '2026-11-11T17:00:00.000Z')
  assert.equal(getHistorySince('week', now), '2026-11-06T17:00:00.000Z')
  assert.equal(getHistorySince('all', now), null)
  assert.equal(matchesHistoryDateFilter('2026-11-12T16:59:59Z', 'today', now), false)
  assert.equal(matchesHistoryDateFilter('2026-11-12T17:00:00Z', 'today', now), true)
  assert.equal(matchesHistoryDateFilter('2026-11-12T17:00:00Z', 'yesterday', now), false)
  assert.equal(matchesHistoryDateFilter('2026-11-12T16:59:59Z', 'yesterday', now), true)
  assert.equal(matchesHistoryDateFilter('invalid', 'today', now), false)
})

test('pemuatan resi aktif menyertakan tahap lama tanpa batas 300 dan tidak mengambil resi tak terkait', () => {
  const oldQc = { resi_number: ' RESI-001 ', updated_at: '2026-11-01T00:00:00Z' }
  const newPacking = { resi_number: 'resi-001', updated_at: '2026-11-13T00:00:00Z' }
  const unrelated = { resi_number: 'OLD', updated_at: '2026-11-01T00:00:00Z' }
  const rows = [oldQc, newPacking, unrelated, ...Array.from({ length: 350 }, (_, i) => ({ resi_number: `NEW-${i}`, updated_at: '2026-11-13T00:00:00Z' }))]
  const result = selectHistoryActivityWindow(rows, Date.parse('2026-11-12T17:00:00Z'))
  assert.equal(result.length, 352)
  assert.ok(result.includes(oldQc))
  assert.equal(result.includes(unrelated), false)
  assert.equal(selectHistoryActivityWindow(rows, null).length, rows.length)
})

test('progress memakai status tahap terbaru, bukan retry atau draft lama', () => {
  const older = makeRecording({ id: 'old', status: 'error', updatedAt: '2026-11-12T01:00:00Z' })
  const latest = makeRecording({ id: 'new', status: 'completed', updatedAt: '2026-11-13T01:00:00Z' })
  assert.equal(getLatestTaskRecord([older, latest], 'packing')?.id, 'new')
})

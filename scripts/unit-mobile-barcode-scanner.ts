import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createBarcodeScanGate,
  observeBarcodeScan,
  resetBarcodeScanGate,
} from '../apps/mobile/src/hooks/useBarcodeScanner.logic.ts'

test('barcode yang terus terlihat hanya dipancarkan sekali', () => {
  const gate = createBarcodeScanGate()

  assert.equal(observeBarcodeScan(gate, 'RESI-001', 100, 1100), true)
  assert.equal(observeBarcodeScan(gate, 'RESI-001', 1300, 1100), false)
  assert.equal(observeBarcodeScan(gate, 'RESI-001', 5000, 1100), false)
})

test('reset scanner menahan hasil barcode dari frame lama', () => {
  const gate = createBarcodeScanGate()

  assert.equal(observeBarcodeScan(gate, 'RESI-QC', 100, 1100), true)
  resetBarcodeScanGate(gate)

  assert.equal(observeBarcodeScan(gate, 'RESI-QC', 2000, 1100), false)
  assert.equal(observeBarcodeScan(gate, 'RESI-QC', 4000, 1100), false)
})

test('reset scanner juga menahan resi terakhir walau barcode perintah terbaca sesudahnya', () => {
  const gate = createBarcodeScanGate()

  assert.equal(observeBarcodeScan(gate, 'RESI-QC', 100, 1100), true)
  assert.equal(observeBarcodeScan(gate, 'STOP-SAVE', 200, 1100), true)
  resetBarcodeScanGate(gate, 'RESI-QC')

  assert.equal(observeBarcodeScan(gate, 'RESI-QC', 2000, 1100), false)
  assert.equal(observeBarcodeScan(gate, 'STOP-SAVE', 2000, 1100), false)
  assert.equal(observeBarcodeScan(gate, 'RESI-BARU', 2000, 1100), true)
})

test('barcode sama boleh dipindai lagi setelah frame benar-benar kosong', () => {
  const gate = createBarcodeScanGate()

  assert.equal(observeBarcodeScan(gate, 'RESI-REPEAT', 100, 1100), true)
  assert.equal(observeBarcodeScan(gate, null, 1500, 1100, 350), false)
  assert.equal(observeBarcodeScan(gate, null, 1849, 1100, 350), false)
  assert.equal(observeBarcodeScan(gate, 'RESI-REPEAT', 1850, 1100, 350), false)

  assert.equal(observeBarcodeScan(gate, null, 2000, 1100, 350), false)
  assert.equal(observeBarcodeScan(gate, null, 2350, 1100, 350), false)
  assert.equal(observeBarcodeScan(gate, 'RESI-REPEAT', 2351, 1100, 350), true)
})

test('barcode berbeda tetap dibaca langsung tanpa menunggu frame kosong', () => {
  const gate = createBarcodeScanGate()

  assert.equal(observeBarcodeScan(gate, 'RESI-A', 100, 1100), true)
  assert.equal(observeBarcodeScan(gate, 'RESI-B', 200, 1100), true)
})

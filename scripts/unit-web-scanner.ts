import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_SCAN_AREA_RATIO,
  DEFAULT_SCAN_INTERVAL_MS,
  FULL_FRAME_SCAN_EVERY,
  AUTO_SWITCH_TO_FULL_FRAME_AFTER_MISSES,
  getScanAreaRatioForAttempt,
  getScanAreaRatioForMode,
  getScanRegionRect,
  normalizeBarcodeValue,
  shouldAutoSwitchToFullFrame,
} from '../apps/web/src/hooks/useVideoBarcodeScanner.logic.ts'

test('normalizeBarcodeValue trims scanner noise', () => {
  assert.equal(normalizeBarcodeValue('  RESI123  '), 'RESI123')
})

test('getScanRegionRect centers the scan crop', () => {
  assert.equal(DEFAULT_SCAN_INTERVAL_MS, 100)
  assert.equal(DEFAULT_SCAN_AREA_RATIO, 0.82)

  const rect = getScanRegionRect(1280, 720, DEFAULT_SCAN_AREA_RATIO)

  assert.deepEqual(rect, {
    sourceX: 115,
    sourceY: 65,
    sourceWidth: 1050,
    sourceHeight: 590,
  })
})

test('getScanRegionRect clamps invalid ratios', () => {
  const rect = getScanRegionRect(100, 50, 0.1)

  assert.deepEqual(rect, {
    sourceX: 30,
    sourceY: 15,
    sourceWidth: 40,
    sourceHeight: 20,
  })
})

test('getScanAreaRatioForAttempt falls back to full frame periodically', () => {
  assert.equal(FULL_FRAME_SCAN_EVERY, 3)
  assert.equal(getScanAreaRatioForAttempt(0, DEFAULT_SCAN_AREA_RATIO), DEFAULT_SCAN_AREA_RATIO)
  assert.equal(getScanAreaRatioForAttempt(1, DEFAULT_SCAN_AREA_RATIO), DEFAULT_SCAN_AREA_RATIO)
  assert.equal(getScanAreaRatioForAttempt(3, DEFAULT_SCAN_AREA_RATIO), 1)
  assert.equal(getScanAreaRatioForAttempt(6, DEFAULT_SCAN_AREA_RATIO), 1)
})

test('getScanAreaRatioForMode supports full-frame mode', () => {
  assert.equal(getScanAreaRatioForMode('center-first', 0, DEFAULT_SCAN_AREA_RATIO), DEFAULT_SCAN_AREA_RATIO)
  assert.equal(getScanAreaRatioForMode('full-frame', 0, DEFAULT_SCAN_AREA_RATIO), 1)
  assert.equal(getScanAreaRatioForMode('full-frame', 7, DEFAULT_SCAN_AREA_RATIO), 1)
})

test('shouldAutoSwitchToFullFrame triggers after enough misses', () => {
  assert.equal(AUTO_SWITCH_TO_FULL_FRAME_AFTER_MISSES, 6)
  assert.equal(shouldAutoSwitchToFullFrame('center-first', 5), false)
  assert.equal(shouldAutoSwitchToFullFrame('center-first', 6), true)
  assert.equal(shouldAutoSwitchToFullFrame('full-frame', 6), false)
})

console.log('Web scanner unit checks passed.')

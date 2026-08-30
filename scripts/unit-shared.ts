import assert from 'node:assert/strict'

import { DEFAULT_APP_SETTINGS } from '@pakti/shared/defaults'
import { buildDailyVideoPath, buildRecordingFileName, normalizeVideoFormat, sanitizeVideoName } from '@pakti/shared/videoPath'

const startedAt = new Date(2026, 4, 18, 12, 34, 56, 789)

assert.equal(sanitizeVideoName('QC/A:B*C?'), 'QC_A_B_C_')
assert.equal(normalizeVideoFormat('mp4'), 'mp4')
assert.equal(normalizeVideoFormat('avi'), DEFAULT_APP_SETTINGS.videoFormat)

assert.equal(
  buildRecordingFileName('RESI/123', 'mp4', 'packing', startedAt),
  'packing_RESI_123_20260518_123456_789.mp4',
)

assert.equal(
  buildDailyVideoPath({ videoRootPath: '', videoFormat: 'mp4' }, 'RESI/123', 'qc', startedAt),
  'Documents/Pakti/videos/qc_RESI_123_20260518_123456_789.mp4',
)

assert.equal(
  buildDailyVideoPath({ videoRootPath: '', videoFormat: 'mp4' }, 'RESI/123', 'packing', startedAt, 'photo'),
  'Documents/Pakti/photos/packing_RESI_123_20260518_123456_789.jpg',
)

console.log('Shared unit checks passed.')

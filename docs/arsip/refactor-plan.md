# Refactor Plan

## Prinsip Refactor

- Tidak ubah behavior, flow, endpoint, storage, atau UI besar.
- Refactor bertahap per area kecil.
- Setelah tiap tahap: build, smoke manual, commit kecil.
- Prioritas: pisahkan concern, bukan redesign.
- Jangan pindahkan logic sensitif sekaligus dengan markup besar.

## Target Utama

### 1. Mobile `App.tsx`

- File: `apps/mobile/src/App.tsx`
- Masalah: terlalu banyak state, effect, handler, dan UI dalam satu file.
- Target: `App.tsx` hanya jadi shell untuk boot/auth/header/nav dan tab routing.

### 2. Backend `store.ts`

- File: `services/backend/src/store.ts`
- Masalah: DB, recording lifecycle, session, operator, settings, FFmpeg, dan share file bercampur.
- Target: pisahkan domain backend tanpa mengubah kontrak API.

### 3. Web `HistoryPage.tsx`

- File: `apps/web/src/pages/HistoryPage.tsx`
- Masalah: history list, filters, detail modal, share actions, dan delete actions bercampur.
- Target: pecah UI detail/filter dulu.

## Phase 1: Mobile UI Extraction, Low Risk

Tujuan: pecah komponen presentational tanpa memindahkan logic utama dulu.

File baru:

- `apps/mobile/src/tabs/SessionTab.tsx`
- `apps/mobile/src/tabs/HistoryDetailSheet.tsx`
- `apps/mobile/src/tabs/HistoryDeleteDialog.tsx`

Tetap di `App.tsx`:

- state
- handler
- API calls
- effects
- tab selection

Yang dipindah:

- JSX session tab
- JSX detail history sheet
- JSX delete dialog

Benefit:

- Risiko rendah karena props-only.
- Flow tetap identik.
- `App.tsx` langsung turun signifikan.

Validasi:

- `npm run build -w @pakti/mobile`
- Manual cek session page.
- Manual cek buka detail history.
- Manual cek share native.
- Manual cek WhatsApp.
- Manual cek copy resi.
- Manual cek delete confirmation.

## Phase 2: Mobile History Logic Extraction

Tujuan: keluarkan derived data dan helper history.

File baru:

- `apps/mobile/src/history/historyUtils.ts`
- `apps/mobile/src/history/useMobileHistoryFilters.ts`

Dipindah:

- `getShareStatusLabel`
- `getShareStatusDescription`
- `getGroupShareStatus`
- `getShareStatusClassName`
- filter/sort/group history
- empty state calculation

Tidak dipindah dulu:

- API refresh
- SSE
- delete/share handlers

Validasi:

- `npm run build -w @pakti/mobile`
- Manual cek filter.
- Manual cek search resi.
- Manual cek group by date.
- Manual cek detail sheet.

## Phase 3: Mobile Share Preparation Hook

Tujuan: isolasi auto/manual prepare share video.

File baru:

- `apps/mobile/src/history/useSharePreparation.ts`

Dipindah:

- `preparedShareFilesRef`
- `requestedShareFileIdsRef`
- fallback auto prepare effect
- `handleShareRecording`

Tetap sama:

- `prepareServerRecordingShareFileApi`
- native share behavior
- WhatsApp behavior
- toast/notice output

Validasi:

- Prepare video otomatis.
- Klik `Siapkan share`.
- Klik WhatsApp.
- Cek error handling.

## Phase 4: Mobile Scan Queue Hook

Tujuan: isolasi scan queue supaya `App.tsx` tidak memegang barcode orchestration.

File baru:

- `apps/mobile/src/scan/useScanQueue.ts`
- opsional `apps/mobile/src/scan/scanCopy.ts`

Dipindah:

- pending scan queue refs
- rejected resi ref
- wait queue
- process queue
- scan feedback decision
- duplicate handling

Tidak ubah:

- scanner interval
- recording start/stop
- QC-before-packing validation

Validasi:

- Scan resi baru.
- Scan duplicate.
- Scan saat recording berjalan.
- Stop recording.
- Packing tanpa QC tetap ditolak.

## Phase 5: Backend Video Service Extraction

Tujuan: pisahkan FFmpeg/transcode/share file dari DB store.

File baru:

- `services/backend/src/video/ffmpeg.ts`
- `services/backend/src/video/watermark.ts`
- `services/backend/src/video/shareVideo.ts`

Dipindah:

- `getFfmpegPath`
- `runFfmpeg`
- watermark filter
- share encoding profile
- `runFfmpegShareMp4Transcode`
- `runFfmpegWatermark`
- `runFfmpegMp4Transcode`

Tetap di `store.ts`:

- DB update
- recording row lookup
- scheduling queue sementara

Validasi:

- `npm run build -w @pakti/backend`
- FFmpeg dummy test.
- Manual prepare share video.

## Phase 6: Backend Store Split

Tujuan: pecah domain DB setelah video logic aman.

File baru:

- `services/backend/src/store/settingsStore.ts`
- `services/backend/src/store/operatorStore.ts`
- `services/backend/src/store/sessionStore.ts`
- `services/backend/src/store/recordingStore.ts`

Dipindah bertahap:

- settings/system config
- operators
- sessions
- recordings terakhir

Validasi:

- `npm run build -w @pakti/backend`
- `npm run smoke` jika masih valid.
- Manual login.
- Manual settings.
- Manual users.
- Manual scan.
- Manual history.

## Phase 7: Web History Extraction

Tujuan: kurangi risiko web page besar tanpa logic rewrite.

File baru:

- `apps/web/src/history/HistoryFilters.tsx`
- `apps/web/src/history/HistoryDetailDialog.tsx`
- `apps/web/src/history/HistoryRecordingCard.tsx`

Validasi:

- `npm run build`
- Manual cek history web.
- Manual cek filter.
- Manual cek detail.
- Manual cek share/download.

## Urutan Eksekusi Yang Disarankan

1. Phase 1: extract mobile `SessionTab`, `HistoryDetailSheet`, `HistoryDeleteDialog`.
2. Phase 2: extract mobile history utils.
3. Phase 5: extract backend video service.
4. Phase 3: extract mobile share preparation hook.
5. Phase 4: extract mobile scan queue hook.
6. Phase 6 dan Phase 7 belakangan.

## Commit Strategy

- 1 commit per phase.
- `refactor(mobile): extract session and history detail views`
- `refactor(mobile): extract history utilities`
- `refactor(backend): extract video processing helpers`
- `refactor(mobile): extract share preparation logic`
- `refactor(mobile): extract scan queue logic`

## Stop Criteria

- Build gagal.
- Manual test menunjukkan flow berubah.
- Props extraction mulai butuh rewrite state besar.
- Ada perubahan behavior tidak disengaja.

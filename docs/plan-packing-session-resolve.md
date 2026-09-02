# Plan: Resolve Sesi Packing Sebelum Buat Baru

## Tujuan
Saat `Mulai sesi` / `Ganti petugas` untuk task packing, cek dulu sesi petugas tersebut. Jangan langsung `INSERT` baru.

Syarat user:
1. Jika ada **sesi aktif hari ini** untuk petugas tsb → arahkan ke sesi yang ada, tidak buat baru.
2. Jika ada **sesi closed hari ini tapi belum dibayar** (`paid_at IS NULL` dan `payment_id IS NULL`) → buka kembali (`active`) dan lanjutkan di situ, tidak buat baru.
3. Jika **tidak ada** sesi hari ini dan tidak ada closed belum bayar → baru boleh bikin sesi baru.

Hari = `Asia/Jakarta` (`YYYY-MM-DD`).

## Scope
- Backend `services/backend/src/store/packingSessionStore.ts`
- API `services/backend/src/app.ts` (tambah `reused` info)
- Frontend `apps/web/src/pages/PackingSessionsPage.tsx` dan `apps/mobile/src/App.tsx` (flow `Mulai`/`Ganti petugas`)
- Tidak ubah skema DB. Tidak ubah payment. Tidak ubah mobile design system.

## Definisi Hari
- Helper `getJakartaDateKey(iso)` yang sudah ada di `packingSessionStore.ts:73` dan `PackingSessionsPage.tsx:39`:
  ```ts
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
  ```
- Dipakai konsisten di BE dan FE. Hindari `DATE()` SQLite yang pakai `localtime` server (bisa beda zone).

## Backend

### 1. Finder baru di `packingSessionStore.ts`
```ts
function findPackingSessionsForOperatorOnDate(packerName: string, packerCode: string, dateKey: string): PackingWorkSession[]
function findActivePackingSessionForOperatorOnDate(...)
function findClosedUnpaidPackingSessionForOperatorOnDate(...) // closed + paid_at IS NULL + dateKey
```
- Query `SELECT ... WHERE packer_operator_name=? AND packer_operator_code=? AND paid_at IS NULL` lalu filter JS `getJakartaDateKey(row.started_at) === dateKey` (lebih aman dari time zone).
- Untuk `closedUnpaidToday` ambil yang `status='closed'` sort `startedAt DESC` → paling baru.

### 2. Ubah `createPackingSession(input)` urutan cek
1. Resolve profile `findOperatorProfile` (tetap).
2. `todayKey = getJakartaDateKey(nowIso())`
3. **Cek 1 – active hari ini**
   - `activeToday = findActive...OnDate(profileName, profileCode, todayKey)`
   - Jika ada: `UPDATE created_by_session_id` kalau perlu, `return activeToday` (broadcast `packing-session-reused-active`). Tidak `INSERT`.
4. **Cek 2 – closed belum bayar hari ini**
   - `closedToday = findClosedUnpaid...OnDate(...)`
   - Jika ada: `UPDATE packing_work_sessions SET status='active', ended_at=NULL, note=COALESCE(?, note), created_by_session_id=?, updated_at=? WHERE id=?`, broadcast `packing-session-reopened-for-resolve`, `return` itu.
5. **Baru buat** kalau 1 & 2 tidak ada: lanjut `releaseActivePackingSession(input.createdBySessionId)` lalu `INSERT` seperti sekarang.

- Jika `activeToday` ternyata `paid` (seharusnya tidak karena filter `paid_at IS NULL`), lewati dan lanjut ke cek 2 / create.

### 3. API di `app.ts`
Opsi A (minim ubah FE): tetap `POST /api/packing-sessions` tapi kembalikan shape baru:
```ts
{ session: PackingWorkSession, reused: 'active' | 'reopened' | 'created' }
```
- FE yang sudah `createPackingSessionApi` tinggal baca `reused` untuk toast & `navigateToPackingSessionDetail`.

Opsi B (lebih eksplisit): tambah `POST /api/packing-sessions/resolve` dengan body sama, logic sama, biar `POST /api/packing-sessions` tetap murni create (untuk admin/debug). Rekomendasi: **Opsi A** dulu.

- Tambah import `mergePackingSessions` sudah ada, tidak bentrok. Tambah `getJakartaDateKey` tidak perlu export.

### 4. Broadcast
- `packing-session-reused-active`, `packing-session-reopened-for-resolve` biar realtime `sessions-updated` tetap jalan.

## Frontend

### Web `PackingSessionsPage.tsx` & Mobile `App.tsx`
- Flow `handleStartPackingSession(packerKey)` / `handleSwitchPackingSession` tetap panggil `createPackingSessionApi` (atau `resolve`).
- Tangani `reused`:
  - `active` → `notify.info('Sesi hari ini sudah jalan, diarahkan ke sesi yang ada')`
  - `reopened` → `notify.info('Sesi closed belum dibayar dibuka kembali')`
  - `created` → `notify.success('Sesi baru dibuat')`
- Lalu `navigateToPackingSessionDetail(session.id)` (web) atau `setActivePackingSession` + `setShowSwitchDialog(false)` (mobile). Tidak perlu FE cek manual `listPackingSessions` dulu.

- Validasi FE tambahan (opsional, untuk disable tombol):
  - `canCreateNewToday` = tidak ada `activeToday` dan tidak ada `closedUnpaidToday` → tombol `Mulai sesi baru` enable, else `Lanjutkan sesi hari ini` (label berubah).

## Edge Cases
- `paidAt != null` atau `paymentId != null` → tidak boleh di-reuse/reopen (sesuai syarat 2).
- Jika ada >1 `closedUnpaidToday` (sebelum migrasi manual merge, bisa), ambil paling baru `startedAt DESC`.
- `createdBySessionId` punya active lain → tetap `releaseActivePackingSession` sebelum reuse (biar tidak dobel active per login).
- `role=operator` packing hanya bisa handle sesinya sendiri (cek sudah ada di `createPackingSession`).
- Tanggal `startedAt` bisa beda dengan `todayKey` kalau sesi dibuat lewat tengah malam Jakarta — pakai `startedAt` sebagai penentu hari sesi, bukan `createdAt`.

## Tidak Diubah
- Skema `packing_work_sessions` dan `recordings.packing_session_id`.
- `mergePackingSessions` manual (sudah ada) tetap untuk gabung sesi beda hari/operator (syarat tanggal sama).
- Mobile design system (`var(--op-*)`) tidak diubah.
- `listPackingSessions` grouping UI tetap `per packer` (bukan per hari otomatis) — resolve hanya di create.

## Verifikasi
- `npm run build:vercel` (web `dist` + mobile `dist/mobile`)
- `graphify update .`
- Manual:
  1. Buat sesi packer A jam 08:00 → sesi #1 active.
  2. Coba buat lagi packer A hari sama → harus balik ke #1 (tidak nambah row), toast `sudah jalan`.
  3. Close #1 (belum bayar) → status closed.
  4. Coba buat lagi packer A hari sama → harus reopen #1 jadi active (tidak nambah row), toast `dibuka kembali`.
  5. Bayar #1 → `paid_at` terisi → buat lagi packer A hari sama → harus `created` baru (boleh, karena closed sudah dibayar tidak di-reuse).
  6. Packer B hari sama → tidak terpengaruh (beda operator).
  7. Beda hari (besok Jakarta) → `created` baru.
- Cek `GET /api/packing-sessions?limit=50` jumlah tidak dobel untuk same operator same day sebelum dibayar.

## Keputusan
- Butuh `GET /api/packing-sessions/by-operator-today?name=&code=` untuk debug? Opsional, bisa pakai `list` + filter FE kalau tidak mau tambah endpoint.

## Estimasi
- BE: 1 file utama + 1 route.
- FE: 2 file (web + mobile) untuk handle `reused`.
- Risiko rendah, tidak migrasi data.

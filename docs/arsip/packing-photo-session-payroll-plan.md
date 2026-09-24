# Packing Photo/Video Session Payroll Plan

## Tujuan

Menambah fitur packing yang bisa memilih dokumentasi `foto` atau `video`, sekaligus mencatat sesi kerja petugas packing dan menghitung upah per paket berdasarkan data order Shopee yang disinkronkan extension.

Catatan penting: proses packing mayoritas/semua akan dilakukan dari mobile app. Karena itu UX utama untuk mulai sesi, scan resi, pilih foto/video, preview order, dan capture dokumentasi harus diprioritaskan di `apps/mobile`. Web tetap dipakai untuk admin, history, reporting, dan fallback operasional.

## Ringkasan Keputusan

- `taskType` tetap `packing`; jangan dipecah menjadi task baru.
- Tambahkan `mediaType` untuk dokumentasi packing: `photo` atau `video`.
- Video packing tetap memakai alur `MediaRecorder` saat ini.
- Foto packing mengambil frame dari kamera dan menyimpan image artifact.
- Petugas packing wajib membuat `packing work session` sebelum proses packing.
- Sesi packing bukan sesi login; ini sesi kerja/payroll.
- Petugas sesi packing dipilih dari user/operator existing dengan `taskType = packing`.
- Data jasa kirim, nama produk, variasi, dan qty diambil dari hasil sync extension Shopee.
- Saat packing selesai, sistem menyimpan snapshot order + snapshot upah agar payroll historis stabil.
- Upah default Rp1.500/paket, tetapi bisa berubah berdasarkan rule variasi/produk/qty.
- Mobile app adalah primary surface untuk proses packing harian.
- Web app adalah secondary/fallback surface untuk packing, tetapi primary untuk admin/reporting.

## Flow Operator Packing

Flow ini diprioritaskan untuk mobile app.

1. Operator login seperti biasa.
2. Operator memilih task `packing`.
3. Jika belum ada sesi packing aktif, halaman scan menampilkan panel wajib `Mulai Sesi Packing`.
4. Petugas memilih nama petugas dari daftar operator dengan `taskType = packing`.
5. Sistem membuat sesi packing aktif.
6. Petugas memilih mode dokumentasi `Foto` atau `Video`.
7. Petugas scan resi.
8. Sistem lookup order Shopee berdasarkan resi.
9. UI menampilkan jasa kirim, item, variasi, qty, dan estimasi upah.
10. Petugas menyelesaikan dokumentasi packing.
11. Backend menyimpan recording packing dengan session id, media type, order snapshot, dan pay snapshot.
12. Setelah selesai kerja, petugas klik `Akhiri Sesi`.

## Data Yang Disimpan Per Packing

- `resiNumber`
- `orderNumber`
- `taskType = packing`
- `mediaType = photo | video`
- `filePath`
- `fileName`
- `mimeType`
- `packingSessionId`
- `packerOperatorId`
- `packerName`
- `packerCode`
- `shippingChannel`
- `orderSnapshotJson`
- `payAmount`
- `payRuleId`
- `payBreakdownJson`
- `payStatus = calculated | needs_review | manual_override`

## Data Order Dari Extension Shopee

Extension order sync perlu menyimpan order-level dan item-level fields.

Order-level:

- `orderNumber`
- `trackingNumber`
- `buyerUsername`
- `shippingChannel`
- `orderStatus`
- `updatedAt`

Item-level disimpan sebagai JSON:

```json
[
  {
    "productName": "Cermin Hampers",
    "variationName": "Pink / Gift Box",
    "sku": "CM-HMP-PINK",
    "quantity": 1
  }
]
```

Rekomendasi awal: simpan item sebagai `itemsJson` di `shopee_orders`. Normalisasi ke tabel item bisa dilakukan nanti jika reporting makin kompleks.

## Packing Work Session

Tabel baru: `packing_work_sessions`.

Field minimal:

- `id`
- `packerOperatorId`
- `packerNameSnapshot`
- `packerCodeSnapshot`
- `startedAt`
- `endedAt`
- `status = active | closed | cancelled`
- `note`
- `createdBySessionId`
- `createdAt`
- `updatedAt`

Aturan:

- Satu browser/device hanya boleh punya satu packing session aktif.
- Petugas yang bisa dipilih hanya operator existing dengan `taskType = packing`.
- Jika user login saat ini adalah operator packing, dropdown sesi boleh preselect user tersebut.
- Admin bisa membuat sesi untuk operator packing lain di device yang sama.
- Operator yang sudah tidak aktif/tidak valid tidak muncul untuk sesi baru.
- Sesi lama tetap menampilkan snapshot nama/kode walaupun data user berubah.
- Backend menolak finalize packing jika `taskType = packing` tetapi tidak ada `packingSessionId` aktif.
- Jika browser refresh, sesi aktif tetap lanjut.
- Admin bisa close sesi yang lupa ditutup.
- Upah dihitung dari packing recording `completed` saja.
- Jika recording dihapus/invalidate, total upah sesi ikut dihitung ulang dari data completed yang tersisa.

## Pay Rule

Tabel baru: `packing_pay_rules`.

Field minimal:

- `id`
- `name`
- `matchType = default | product_contains | variation_contains | sku_contains | shipping_channel`
- `matchValue`
- `payType = per_package | per_qty`
- `amount`
- `priority`
- `active`
- `createdAt`
- `updatedAt`

Contoh rule:

- Default packing: `per_package`, Rp1.500.
- Cermin hampers: `variation_contains = cermin hampers`, `per_package`, Rp1.600.
- Produk cermin qty banyak: `product_contains = cermin`, `per_qty`, Rp1.500.

Algoritma hitung awal:

1. Ambil `itemsJson` dari order Shopee.
2. Cari rule aktif berdasarkan priority tertinggi.
3. Jika rule `per_package`, total = `amount`.
4. Jika rule `per_qty`, total = `amount * matchedQty`.
5. Jika tidak ada item/order, gunakan default atau tandai `needs_review` tergantung kebutuhan rule.
6. Simpan hasil final ke recording sebagai snapshot.

## Snapshot Payroll

Saat packing completed, backend harus menyimpan snapshot:

```json
{
  "shippingChannel": "J&T Express",
  "items": [
    {
      "productName": "Cermin",
      "variationName": "Silver",
      "sku": "CM-SLV",
      "quantity": 3
    }
  ],
  "pay": {
    "ruleName": "Cermin per qty",
    "payType": "per_qty",
    "amount": 1500,
    "quantity": 3,
    "total": 4500
  }
}
```

Alasan snapshot:

- Sync Shopee berikutnya tidak mengubah payroll lama.
- Admin bisa audit kenapa paket tertentu dibayar nominal tertentu.
- Export payroll tetap stabil walaupun rule berubah di masa depan.

## UI Scan Page

### Mobile Scan Page

Perubahan utama ada di mobile scan/packing flow:

- Saat task `packing`, tampilkan status sesi packing aktif di bagian atas layar.
- Jika tidak ada sesi aktif, blokir scan packing dan tampilkan form mulai sesi yang nyaman dipakai di HP.
- Form mulai sesi memakai dropdown/search operator packing dari data user management.
- Jika operator login saat ini bertugas packing, preselect operator tersebut.
- Tambah toggle mode dokumentasi `Foto | Video` yang besar dan mudah disentuh.
- Setelah scan resi, tampilkan order preview dalam layout mobile-first:
  - jasa kirim
  - nomor order
  - buyer
  - daftar produk + variasi + qty
  - estimasi upah
- Mode video memakai flow record/stop existing.
- Mode foto memakai tombol capture besar dari camera preview.
- Setelah foto/video tersimpan, tampilkan ringkasan `Berhasil packing` + upah paket.
- Mobile harus bisa recover sesi aktif setelah refresh/reload.
- Optimasi untuk jaringan tidak stabil: simpan state sementara sampai backend confirm.

### Web Scan Page

Perubahan di halaman scan:

- Tetap mendukung packing sebagai fallback.
- Gunakan logic dan API yang sama dengan mobile.
- Tidak perlu jadi UX utama jika effort harus diprioritaskan.
- Saat task `packing`, tampilkan status sesi packing aktif.
- Jika tidak ada sesi aktif, blokir scan packing dan tampilkan form mulai sesi.
- Form mulai sesi memakai dropdown operator packing dari data user management.
- Tambah toggle mode dokumentasi `Foto | Video` hanya untuk task packing.
- Setelah scan resi, tampilkan ringkasan order:
  - jasa kirim
  - nomor order
  - buyer
  - daftar produk + variasi + qty
  - estimasi upah
- Mode video memakai tombol stop recording seperti sekarang.
- Mode foto memakai tombol capture/simpan foto.

## UI History

Perubahan di History:

- Tampilkan badge media `photo` atau `video`.
- Detail record menampilkan preview sesuai media.
- Tambah informasi packing session dan packer name.
- Tampilkan pay amount dan pay breakdown untuk recording packing.
- Download harus mendukung image dan video.

## UI Admin/Reporting

Tambah halaman atau section `Packing Sessions`.

Fitur:

- List sesi per tanggal.
- Filter petugas packing.
- Total paket completed.
- Total upah.
- Detail sesi berisi daftar resi/order/item/pay breakdown.
- Close sesi aktif secara manual.
- Export CSV/Excel untuk payroll.

## Backend API

Endpoint baru yang disarankan:

- `GET /api/packing-sessions/active`
- `POST /api/packing-sessions`
- `POST /api/packing-sessions/:id/close`
- `GET /api/packing-sessions`
- `GET /api/packing-sessions/:id`
- `GET /api/packing-pay-rules`
- `POST /api/packing-pay-rules`
- `PATCH /api/packing-pay-rules/:id`
- `DELETE /api/packing-pay-rules/:id`
- `GET /api/shopee/orders/by-resi/:resiNumber/packing-preview`

Endpoint recording existing perlu menerima:

- `mediaType`
- `packingSessionId`
- untuk photo: single file upload/finalize atau finalize langsung dari blob image.

## File Area Terdampak

- `apps/mobile/src/App.tsx`
- `apps/mobile/src/history/historyUtils.ts`
- `apps/mobile/src/history/useMobileHistoryFilters.ts`
- `apps/web/src/pages/ScanPage.tsx`
- `apps/web/src/pages/HistoryPage.tsx`
- `apps/web/src/history/HistoryDetailDialog.tsx`
- `apps/web/src/history/HistoryRecordingCard.tsx`
- `apps/web/src/pages/AdminPage.tsx` atau halaman admin baru
- `apps/shopee-extension/popup.js`
- `apps/shopee-extension/content.js`
- `packages/types/src/index.ts`
- `packages/shared/src/recordings.ts`
- `packages/shared/src/videoPath.ts`
- `packages/api-client/src/index.ts`
- `services/backend/src/schema.ts`
- `services/backend/src/db.ts`
- `services/backend/src/app.ts`
- `services/backend/src/store/recordingStore.ts`
- `services/backend/src/store/orderStore.ts`
- store baru: `services/backend/src/store/packingSessionStore.ts`
- store baru: `services/backend/src/store/packingPayRuleStore.ts`

## Tahapan Implementasi

### Tahap 1 - Data Model Dasar

- Tambah `mediaType` ke recording, default `video`.
- Tambah field packing session dan payroll snapshot ke recording.
- Tambah tabel `packing_work_sessions` dengan referensi operator packing dan snapshot nama/kode.
- Tambah tabel `packing_pay_rules`.
- Tambah type di `packages/types`.

### Tahap 2 - Order Item Sync

- Extend `ShopeeOrder` dengan `itemsJson`.
- Extend backend import order agar menerima item list.
- Extend extension order sync untuk mengambil jasa kirim + item product + variasi + qty.
- Simpan raw snapshot ringan untuk debug jika scrape berubah.

### Tahap 3 - Packing Session API

- Implement create/close/list active packing session.
- Implement endpoint/list helper untuk operator dengan `taskType = packing`.
- Simpan active session id di frontend local storage.
- Backend validasi session aktif saat finalize packing.
- Backend validasi `packerOperatorId` mengarah ke operator packing yang valid saat membuat sesi.

### Tahap 4 - Photo/Video Packing UI

- Prioritaskan implementasi di mobile app.
- Tambah toggle `Foto | Video` di task packing mobile.
- Implement capture photo dari camera preview/canvas di mobile.
- Video flow mobile tetap memakai mekanisme existing jika sudah ada; jika belum, samakan dengan web/backend recording API.
- Kirim `mediaType` ke backend.
- Setelah mobile stabil, port/fallback logic ke web `ScanPage`.

### Tahap 5 - Pay Calculation

- Implement pay rule matcher.
- Implement packing preview by resi.
- Hitung estimasi upah sebelum capture.
- Simpan pay snapshot saat completed.

### Tahap 6 - History/Admin Reporting

- Tampilkan media badge dan preview image/video.
- Tampilkan packer/session/pay breakdown di detail.
- Tambah list sesi packing dan export payroll.

### Tahap 7 - Shopee Chat Impact

- Pastikan auto-send video hanya mengambil recording packing `mediaType = video`.
- Untuk `mediaType = photo`, tentukan apakah foto dikirim ke buyer atau hanya internal.
- Jika foto belum dikirim otomatis, tampilkan status `internal only` agar tidak masuk video queue.

## Risiko Dan Mitigasi

- DOM Shopee berubah: simpan `rawOrderJson` dan beri fallback `needs_review` jika item gagal dibaca.
- Data item kosong: payroll jangan dihitung otomatis untuk rule yang butuh variasi/qty.
- Sesi lupa ditutup: admin bisa close manual.
- Operator berubah nama/kode: sesi menyimpan snapshot agar payroll lama tetap konsisten.
- Rule berubah: snapshot pay di recording menjaga histori tetap stabil.
- Duplikasi scan resi: existing unique task completed tetap dipakai; payroll hanya hitung completed aktif.
- Mobile browser permission kamera bisa berubah: tampilkan recovery message dan tombol retry camera.
- Jaringan mobile tidak stabil: jangan anggap packing completed sebelum backend finalize sukses.

## Pertanyaan Terbuka

- Untuk packing foto, apakah foto perlu otomatis dikirim ke buyer via Shopee Chat atau hanya dokumentasi internal?
- Jika satu order punya beberapa item dengan rule berbeda, total upah dijumlah per matched item atau hanya pakai rule prioritas tertinggi per paket?
- Apakah admin boleh edit manual upah satu paket setelah packing selesai?

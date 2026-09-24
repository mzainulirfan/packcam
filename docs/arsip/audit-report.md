# Audit Report

Tanggal audit: 2026-08-28

## Ringkasan

Audit mencakup backend, web, mobile, Shopee extension, database, autentikasi, file/video, antrean chat, build, lint, unit test, smoke check, dan pemetaan Graphify.

## Temuan

### 1. High: CORS dapat terbuka penuh

File: `services/backend/src/app.ts:175`

Kondisi berikut mengizinkan semua origin ketika `CORS_ORIGINS` kosong:

```ts
!origin || corsOrigins.length === 0 || isAllowedCorsOrigin(origin)
```

Dampak: website lain berpotensi melakukan request credentialed ke API. Jika `CORS_ORIGINS` kosong, request dengan origin seharusnya ditolak, bukan diizinkan.

### 2. High: Operator dapat memodifikasi recording operator lain

Middleware umum hanya memastikan ada session login di `services/backend/src/app.ts:348`, tetapi beberapa endpoint mutasi tidak memeriksa kepemilikan recording:

- Membuat draft: `services/backend/src/app.ts:725`
- Upload chunk: `services/backend/src/app.ts:747`
- Finalize: `services/backend/src/app.ts:774`
- Recovery: `services/backend/src/app.ts:789`
- Ulangi QC: `services/backend/src/app.ts:910`

Dampak: operator yang sudah login berpotensi mengubah recording operator lain jika mengetahui ID recording.

### 3. High: Status `sent` dapat tercatat secara keliru

File: `apps/shopee-extension/popup.js:353`

Popup mengubah status menjadi `sent` setelah delay 2,5 detik tanpa memverifikasi pesan benar-benar terkirim di Shopee.

Worker otomatis juga mengubah status setelah selector diklik, bukan setelah Shopee memberikan konfirmasi pengiriman: `apps/shopee-extension/content.js:590`.

### 4. High: Video gagal dilampirkan tetapi pesan tetap dikirim

File: `apps/shopee-extension/content.js:510`

Jika fetch video gagal atau `input[type=file]` tidak ditemukan, kode hanya mencatat warning lalu tetap mengirim pesan.

Dampak: status dapat menjadi `sent` walaupun bukti video tidak ikut terkirim.

### 5. Medium: Job gagal tetap berada di pending tanpa batas percobaan

File: `services/backend/src/store/chatSendStore.ts:193`

`listPendingChatSends()` mengambil semua job berstatus `pending` dan `failed` tanpa filter jumlah percobaan.

Dampak: job gagal dapat terus muncul dan menghambat job lain, termasuk shipping chat.

### 6. Medium: Dukungan domain Shopee `.com` tidak konsisten

Manifest mendukung `seller.shopee.com`, tetapi deteksi halaman hanya menerima `seller.shopee.co.id`: `apps/shopee-extension/content.js:171`.

### 7. Medium: Error auto-worker ditelan diam-diam

File: `apps/shopee-extension/content.js:657`

Worker utama memakai `catch {}` tanpa logging atau update status.

Dampak: proses terlihat tidak melakukan apa-apa ketika sebenarnya gagal.

## Verifikasi

- Lint berhasil.
- Unit test shared berhasil.
- Unit test web scanner berhasil.
- Unit test shipping chat berhasil.
- Build backend berhasil.
- Build web/mobile berhasil.
- Smoke check berhasil.
- Build extension berhasil.

## Prioritas Perbaikan

1. Perketat CORS dan authorization recording.
2. Validasi attachment video sebelum mengirim pesan.
3. Jangan menandai job `sent` tanpa verifikasi pengiriman.
4. Batasi retry job gagal.
5. Tambahkan logging dan status error pada auto-worker.
6. Samakan dukungan domain Shopee `.co.id` dan `.com`.

## Catatan

Audit dilakukan pada working tree saat ini. Perubahan extension, loader environment backend, integrasi Graphify, dan file report ini masih belum di-commit.

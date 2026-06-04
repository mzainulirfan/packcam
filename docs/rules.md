# Rules Pakti Packcam

Tanggal konsolidasi: 2026-06-03

Dokumen ini menjadi sumber aturan kerja Pakti Packcam.

## Aturan Inti

- `apps/web` berisi dashboard web.
- `apps/mobile` berisi mobile web app.
- `services/backend` berisi Express API, SQLite access, upload, auth, dan realtime event.
- `packages/types` berisi tipe domain bersama.
- `packages/shared` berisi logic bersama yang tidak bergantung pada React app tertentu.
- `packages/api-client` berisi wrapper API client dan mapping payload server ke tipe client.
- Endpoint protected harus memvalidasi session di backend.
- Admin-only behavior harus dicek di backend.
- Jangan mulai recording tanpa resi valid dan session operator.
- Jangan mengganti task saat recording aktif.
- Saat recording mobile berjalan, scan kamera untuk resi yang sudah direkam/duplikat tidak boleh menghentikan recording aktif.
- Alur scan mobile tidak boleh mengambil seluruh history saat recording aktif; gunakan lookup per resi agar preview dan recorder tetap responsif.
- Reset data, delete operator, dan delete recording harus dikonfirmasi eksplisit.

## Test Rules

- Jalankan `npm run lint` untuk perubahan lint-sensitive.
- Jalankan `npm run build` untuk perubahan web/build config.
- Jalankan `npm run build:mobile` untuk perubahan mobile.
- Jalankan `npm run smoke` untuk validasi integrasi ringan.
- Jalankan `npm run test:unit` untuk perubahan `packages/shared`.
- Jalankan `npm run test:web` untuk perubahan scanner web.

## Sumber Gabungan

- Ringkasan aturan project yang dikonsolidasikan dari permintaan terbaru.


# Plan Backend API SQLite Server-Side

Dokumen ini menjelaskan langkah berikutnya jika Pakti dipindahkan dari SQLite browser-side ke arsitektur web penuh dengan backend API dan SQLite di server.

## Target

- Frontend tetap React/Vite/Tailwind.
- Backend menyediakan API untuk auth, data operasional, dan upload video.
- SQLite dipakai sebagai database utama di server.
- File video disimpan di filesystem server atau storage yang setara.

## Masalah yang Diselesaikan

- Data tidak bergantung pada browser session atau local storage.
- Banyak device bisa mengakses data yang sama.
- Recovery dan backup lebih mudah diatur secara terpusat.
- Ukuran data video tidak membebani browser.

## Arsitektur Rekomendasi

### Frontend

- React SPA
- tetap memakai UI yang sudah ada
- semua akses data lewat HTTP API

### Backend

- Node.js
- Fastify atau Express
- SQLite sebagai database utama
- penyimpanan file video di server filesystem

### Storage

- metadata: SQLite
- video: filesystem server
- session/auth: SQLite atau token session storage

## Domain API

### Auth

- login operator
- logout
- cek session aktif
- setup admin pertama

### Operator

- list operator
- create operator
- update operator
- reset password
- delete operator

### Settings

- get settings
- update settings
- get system branding
- update system branding

### Recording

- create draft recording saat scan
- upload hasil rekaman
- finalize recording
- recovery recording yang gagal

### History

- list recording
- filter recording
- download file video
- export CSV/XLS

### Health

- runtime/status check
- storage summary
- reset scan data
- reset all data

## Desain Flow Recording

1. Operator scan resi.
2. Frontend membuat draft recording ke backend.
3. Browser merekam video.
4. Saat resi berikutnya datang, frontend stop recording lama.
5. Blob video di-upload ke backend.
6. Backend menyimpan file dan metadata ke SQLite.
7. Progress upload tampil di area preview.
8. Setelah upload selesai, frontend mulai recording baru.

## Aturan Penting

- Recording baru tidak boleh dimulai sebelum backend mengonfirmasi save selesai.
- Kamera stream di browser tetap aktif.
- Upload harus punya progress state yang terlihat jelas.
- Jika save gagal, state masuk `error` dan user harus tahu.

## Rancangan Database

### Tabel inti

- `operator_profiles`
- `operator_sessions`
- `system_config`
- `app_settings`
- `recordings`
- `scan_logs`
- `bootstrap_state`
- `last_error`

### Catatan

- Untuk video file, simpan path dan metadata di SQLite.
- Jangan simpan video besar langsung ke SQLite kecuali memang ada alasan khusus.

## Tahap Implementasi

### Tahap 1 - API base

- buat project backend
- sambungkan SQLite
- siapkan migrasi schema
- siapkan health endpoint

### Tahap 2 - Auth dan setup awal

- pindahkan login operator
- pindahkan setup admin pertama
- pindahkan session management

### Tahap 3 - Settings dan branding

- pindahkan konfigurasi aplikasi
- pindahkan branding
- update UI frontend agar membaca dari API

### Tahap 4 - Recording upload

- buat endpoint draft recording
- buat endpoint upload blob
- buat endpoint finalize
- buat recovery record yang belum selesai

### Tahap 5 - History dan export

- pindahkan list/filter history
- pindahkan preview/download file
- pindahkan export CSV/XLS

### Tahap 6 - Admin dan reset

- pindahkan CRUD user/operator
- pindahkan reset scan
- pindahkan reset all

### Tahap 7 - Cleanup frontend

- hapus penyimpanan data lokal yang sudah tidak dipakai
- ganti hook/data layer ke API client
- rapikan error/loading state

## Checklist Testing

- login berhasil dan session bertahan
- setup admin pertama berjalan
- scan resi membuat draft recording
- recording lama tersimpan sebelum recording baru mulai
- progress upload tampil di preview
- history tampil sesuai data server
- reset scan dan reset all bekerja
- recovery saat upload gagal bekerja

## Risiko

- upload video besar bisa lambat
- butuh strategi locking SQLite yang aman
- perlu backup database dan file video
- auth/session harus dirancang supaya tidak mudah bocor

## Kriteria Selesai

- frontend bisa jalan tanpa storage browser sebagai sumber utama
- SQLite server menjadi sumber data utama
- video tersimpan di server
- flow scan-record-save tetap stabil
- cleanup lama di frontend sudah tidak dipakai

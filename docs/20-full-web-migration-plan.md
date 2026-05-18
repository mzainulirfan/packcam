# Plan Migrasi Penuh ke Aplikasi Web

Dokumen ini mencatat sisa pekerjaan agar Pakti benar-benar menjadi aplikasi web penuh dengan `SQLite` di server sebagai sumber data utama, tanpa fallback browser yang masih aktif.

## Target Akhir

- Aplikasi dibuka penuh di browser.
- Semua data operasional disimpan dan dibaca dari server.
- Browser hanya berperan sebagai UI dan pengendali kamera/scan.
- Tidak ada storage data bisnis penting yang masih bergantung pada cache browser.
- Setup admin, login, history, settings, users, health, dan admin audit seluruhnya berjalan via backend API.
- Proses recording video tetap stabil, tetapi penyimpanan final berada di server.

## Status Saat Ini

Sudah ada:

- Frontend React/Vite.
- Backend API Express.
- Database server-side SQLite.
- Upload file video ke server.
- Setup admin via endpoint bootstrap.
- Halaman utama sudah mengarah ke API.
- Error boundary agar runtime error tidak blank total.

Masih tersisa beberapa bagian transisi yang perlu dirapikan agar migrasi benar-benar selesai.

## Sisa Pekerjaan Utama

### 1. Hapus semua fallback browser untuk data inti

Hal yang masih perlu dibuang atau dipastikan tidak dipakai lagi:

- cache lokal untuk `operatorSession`
- cache lokal untuk `operatorProfiles`
- cache lokal untuk `settings`
- cache lokal untuk `systemConfig`
- cache lokal untuk `scanLogs`
- cache lokal untuk `recordings`
- cache lokal untuk `lastError`

Target:

- Semua halaman data membaca dari API server sebagai sumber utama.
- Browser cache hanya boleh dipakai untuk hal non-kritis seperti preferensi UI murni, jika masih dibutuhkan.

### 2. Pindahkan state recording sementara ke alur server yang lebih eksplisit

Bagian yang masih perlu diperjelas:

- chunk sementara saat recording
- state transisi `idle -> recording -> stopping -> saving -> ready_to_record_next`
- recovery jika browser refresh saat recording belum selesai

Target:

- Draft recording dibuat di server sejak awal.
- Upload video final tetap ke server.
- Chunk sementara hanya dipakai bila benar-benar diperlukan untuk recovery, dan harus punya jalur bersih di server.
- Tidak ada penyimpanan media bisnis penting yang tersisa di browser.

### 3. Bersihkan storage browser yang tidak lagi dibutuhkan

Yang masih perlu dievaluasi untuk dihapus:

- `src/data/storage.ts`
- `src/data/storageBackend.ts`
- `src/data/backends/webStorageBackend.ts`
- `src/data/backends/webSqliteStorageBackend.ts`
- helper migrasi/backup lokal yang sudah tidak dipakai

Target:

- Repository tidak lagi membawa layer penyimpanan browser yang statusnya hanya transisi.
- Kode storage lebih kecil, lebih mudah dirawat, dan tidak membingungkan.

### 4. Jadikan backend API satu-satunya sumber data operasional

Yang perlu dipastikan:

- `History` hanya baca dari server.
- `Users` hanya baca/tulis ke server.
- `Settings` hanya baca/tulis ke server.
- `Admin` hanya audit server.
- `Health` hanya ringkasan runtime + data server.
- `Scan` hanya memakai konfigurasi server.
- `Welcome` bootstrap admin hanya lewat server.

Target:

- Tidak ada fallback cache lokal di halaman data.
- Jika server tidak aktif, UI menampilkan pesan yang jelas, bukan mode diam-diam memakai cache.

### 5. Rapikan auth/session supaya benar-benar server-only

Masih perlu dipastikan:

- login selalu lewat backend
- session dibaca dari backend
- logout memutus session server
- reset password dan CRUD user tidak bisa jalan tanpa sesi yang valid
- bootstrap admin tetap punya jalur khusus yang aman

Target:

- Tidak ada lagi session yang bergantung pada local storage atau cache browser.

### 6. Rapikan health, admin, dan pesan fallback

Masih perlu dijaga:

- pesan saat server offline tetap user-friendly
- tidak ada error teknis yang bocor ke UI
- admin panel harus jelas membedakan server aktif, server mati, dan mode terbatas

Target:

- Pengguna tahu tindakan apa yang harus dilakukan, tanpa melihat detail teknis.

### 7. Pastikan startup web tidak pernah blank

Langkah yang masih perlu dipastikan:

- app tetap render walau fetch awal server gagal
- error boundary hanya jadi lapisan darurat, bukan jalur normal
- loading awal tidak menahan render layar utama

Target:

- Layar putih tidak muncul lagi.
- Kalau ada masalah, muncul pesan yang jelas dan UI tetap hidup.

### 8. Bersihkan sisa kode yang hanya relevan untuk fase migrasi

Yang perlu dicari dan dievaluasi:

- helper sinkronisasi lama
- endpoint migrasi yang hanya dipakai sekali
- util fallback browser yang tidak lagi dibutuhkan
- event atau state yang dulu dipakai untuk transisi desktop/web

Target:

- Kode akhir lebih kecil, lebih tegas, dan tidak menyisakan mode dual-stack tanpa kebutuhan.

### 9. Kunci kontrak API dan tipe data

Masih perlu dipastikan:

- response shape setiap endpoint stabil
- error format seragam
- tipe frontend dan backend tidak divergen
- `RecordingRow`, `OperatorProfile`, `OperatorSession`, `SystemConfig`, `AppSettings`, dan `ScanLogRow` sinkron

Target:

- Perubahan API tidak merusak halaman frontend.

### 10. Perkuat testing migrasi penuh

Yang perlu dites ulang:

- login admin pertama
- login operator
- scan -> recording -> stop -> save -> scan berikutnya
- refresh saat recording berjalan
- refresh saat saving
- history preview video dari server
- users CRUD
- settings save/load
- admin audit status server
- health saat server hidup dan mati

Target:

- Tidak ada regresi pada alur kerja utama.

## Rekomendasi Urutan Eksekusi

### Tahap 1

- Hapus fallback browser untuk session, users, settings, system config, scan logs, dan history.
- Pastikan semua halaman data benar-benar API-first.

### Tahap 2

- Finalisasi pipeline recording agar recovery dan penyimpanan media sepenuhnya jelas di server.
- Hapus storage browser yang tidak lagi dipakai.

### Tahap 3

- Rapikan startup, health, dan admin supaya mode offline hanya jadi pesan, bukan jalur data alternatif.

### Tahap 4

- Lakukan cleanup besar terhadap kode transisi.
- Perkuat testing end-to-end.

## Checklist Selesai

- [ ] Tidak ada fallback cache lokal untuk data inti
- [ ] Session dan auth sepenuhnya server-side
- [ ] Recording final disimpan ke server
- [ ] Recovery recording jelas dan konsisten
- [ ] History, Users, Settings, Admin, Health, dan Scan semuanya API-first
- [ ] Startup tidak blank saat server belum aktif
- [ ] Pesan error user-facing sudah seragam
- [ ] Kode storage browser transisi sudah dibersihkan
- [ ] Tipe frontend/backend tetap sinkron
- [ ] Testing alur utama sudah lolos

## Catatan Penting

- Jika tujuan akhirnya adalah `full web` yang ketat, server harus dianggap sumber kebenaran tunggal.
- Browser cache hanya boleh dipakai untuk preferensi UI atau cache sementara yang tidak memengaruhi integritas data.
- Selama masih ada fallback data bisnis di browser, migrasi belum bisa dianggap selesai.

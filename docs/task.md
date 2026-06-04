# Task Pakti Packcam

Tanggal konsolidasi: 2026-06-03

Dokumen ini menjadi sumber roadmap task dan rencana implementasi Pakti Packcam.

## Prioritas P0

- Validasi recording end-to-end.
- Hardening error recording.
- Validasi session dan role.
- Stabilkan mobile LAN HTTPS.

## Prioritas P1

- Perjelas duplicate dan repeat QC.
- Improve History untuk audit cepat.
- Tambahkan validasi Settings.
- Perkuat Health dan Recovery Admin.

## Selesai 2026-06-04

- Bugfix mobile scan queue: scan kamera untuk resi duplikat/sudah direkam saat recording aktif tidak lagi menghentikan recording yang sedang berjalan.
- Validasi: `npm run build --workspace @pakti/mobile` dan `npm run lint`.
- Optimasi performa mobile recording: lookup duplicate/progress per resi, scanner downscale/non-overlap, interval scanner lebih ringan saat recording, dan upload chunk recording menjadi 3 detik.
- Validasi tambahan: `npm run build --workspace @pakti/backend`.
- Optimasi lanjutan mobile recording: recorder memakai stream kamera asli dan watermark dipindahkan menjadi overlay preview ringan agar canvas realtime tidak membebani perekaman.
- Watermark permanen video ditambahkan di backend setelah finalize menggunakan ffmpeg-static dengan isi nomor resi, petugas, dan tanggal-jam-menit.
- Audio mobile recording ditambahkan lewat microphone track dengan fallback video-only jika izin mic tidak tersedia.
- History mobile menampilkan preview video untuk rekaman completed langsung di kartu resi.
- History mobile menambahkan aksi share video ke native share sheet dan WhatsApp tanpa fallback URL API eksternal.

## Prioritas P2

- Perluas test scanner logic.
- Perluas test shared exporter dan recording utilities.
- Rapikan batas package.
- Lengkapi dokumentasi operasional.

## Definition of Done

- Kode mengikuti struktur monorepo.
- UI mengikuti design system.
- Role dan session divalidasi di backend.
- Error state terlihat di UI.
- Data penting tercatat di SQLite.
- Rekaman dapat ditemukan di History.
- Test relevan dijalankan atau keterbatasannya dicatat.

## Sumber Gabungan

- `00-persiapan-project.md`
- `10-hardening-dan-distribusi.md`
- `17-bugfix-perekaman-video-proses-packing.md`
- `20-full-web-migration-plan.md`
- `28-rencana-migrasi-monorepo-aman.md`

---

## Sumber: `00-persiapan-project.md`

# Tahap 0 - Persiapan Project

## Tujuan

Menyiapkan fondasi proyek agar tahap fitur inti bisa dikerjakan tanpa hambatan teknis.

## Ruang Lingkup

- Setup struktur project `Tauri + React + TypeScript`.
- Konfigurasi formatter, linter, dan struktur folder dasar.
- Siapkan halaman kosong untuk `Scan`, `History`, dan `Settings`.
- Siapkan baseline konfigurasi untuk penyimpanan lokal.

## Tugas

1. Pastikan repo bisa dijalankan lokal.
2. Rapikan struktur folder frontend dan backend.
3. Siapkan routing dasar atau navigasi halaman.
4. Siapkan placeholder UI tanpa logika bisnis.

## Hasil yang Diharapkan

- Project build dan run tanpa error.
- Struktur awal siap untuk pengembangan fitur.
- Tidak ada fitur bisnis yang kompleks di tahap ini.

## Selesai Jika

- Aplikasi tampil dengan halaman dasar.
- Tidak ada error konfigurasi utama.
- Developer lain bisa lanjut ke tahap database tanpa menebak struktur project.

---

## Sumber: `10-hardening-dan-distribusi.md`

# Tahap 10 - Hardening dan Distribusi

## Tujuan

Memastikan aplikasi siap dipakai di mesin operator secara stabil.

## Ruang Lingkup

- Uji crash recovery.
- Uji disk penuh.
- Uji kamera ditolak atau dipakai aplikasi lain.
- Build installer.
- Buat dokumentasi singkat user.

## Tugas

1. Jalankan skenario gagal yang umum.
2. Perbaiki bug stabilitas terakhir.
3. Siapkan package instalasi.
4. Tulis panduan penggunaan minimal.

## Hasil yang Diharapkan

- Aplikasi siap didistribusikan.
- Risiko error lapangan lebih kecil.
- Operator punya panduan dasar.

## Selesai Jika

- Build installer sukses.
- Kasus gagal utama sudah diuji.
- Dokumentasi cukup untuk onboarding awal.

---

## Sumber: `17-bugfix-perekaman-video-proses-packing.md`

# Tahap 17 - Bugfix Perekaman Video Proses Packing

## Tujuan

Memperbaiki bug perekaman video saat pergantian resi agar video baru tidak freeze, proses saving berjalan berurutan, dan preview tetap aktif setelah rekaman sebelumnya selesai disimpan.

## Latar Belakang Masalah

Sistem saat ini bekerja dengan alur:

- resi discan
- recording dimulai
- scan resi berikutnya memicu penyimpanan video sebelumnya
- setelah itu sistem memulai recording baru

Bug yang terjadi:

- setelah recording berjalan cukup lama, sekitar 2-3 menit, scan resi kedua memicu pergantian rekaman
- video pertama berhasil diarahkan ke proses penyimpanan
- video kedua mulai secara logis, tetapi preview tampak diam atau freeze
- timer perekaman tetap berjalan, sehingga state terlihat aktif padahal frame video tidak benar-benar bergerak

## Hipotesis Penyebab Bug

Kemungkinan penyebab yang perlu dianalisis:

- recording baru dimulai terlalu cepat sebelum proses encoding/saving video sebelumnya benar-benar selesai
- `MediaRecorder` atau stream output masih berada pada state transisi saat instance baru dibuat
- stream kamera dipakai ulang tanpa sinkronisasi yang cukup setelah stop/save selesai
- preview dan recording session saling bergantung pada objek stream yang belum stabil
- proses background save masih berjalan, tetapi sistem sudah menganggap recording berikutnya siap
- ada race condition antara event `stop`, event `onstop`, pembuatan draft baru, dan pengaktifan recorder baru

## Ruang Lingkup

- Perbaikan alur recording di `src/hooks/useRecordingSession.ts`
- Penyesuaian status/state recording untuk mendukung proses saving yang eksplisit
- Penambahan indikator progress atau loading pada area preview saat saving berjalan
- Penyesuaian UI di halaman scan agar status proses lebih jelas
- Penambahan checklist testing untuk skenario scan beruntun dan recording panjang

## State Management yang Diusulkan

Gunakan state machine yang lebih eksplisit agar transisi lebih aman:

- `idle`
- `recording`
- `stopping`
- `saving`
- `ready_to_record_next`
- `error`

Makna tiap state:

- `idle`: kamera siap, belum ada recording aktif
- `recording`: frame sedang direkam untuk resi aktif
- `stopping`: recorder sedang dihentikan, data sedang dipindahkan ke proses finalisasi
- `saving`: file video sedang di-encode / disimpan ke storage
- `ready_to_record_next`: saving selesai, kamera siap dipakai untuk recording berikutnya
- `error`: ada gangguan pada recorder, kamera, atau proses save

## Flow Baru yang Diharapkan

Urutan proses yang harus dipakai:

1. resi discan
2. recording lama dihentikan
3. proses saving video lama dimulai
4. tampil progress bar / loading di area preview
5. proses saving selesai 100%
6. baru mulai recording baru untuk resi berikutnya

## Aturan Penting

- Scan resi baru tidak boleh langsung memulai recording baru jika saving belum selesai.
- Camera stream jangan dimatikan jika masih dibutuhkan untuk recording berikutnya.
- Proses encoding dan saving harus ditunggu sampai benar-benar selesai sebelum recorder baru dibuat.
- State `saving` harus menjadi blok transisi yang mencegah start recording baru.
- Jika ada antrian resi berikutnya, resi itu disimpan sebagai pending sampai state `ready_to_record_next`.
- UI harus memperlihatkan bahwa sistem sedang menyimpan, bukan seolah-olah recording baru sudah aktif.

## Rancangan Implementasi

### 1. Refactor Session Flow

- Pisahkan logika `stop recording`, `save artifact`, dan `start next recording`.
- Hindari start recorder baru di callback yang masih berada dalam siklus save lama.
- Jadikan penyimpanan video lama sebagai operasi yang selesai dulu baru mengizinkan start berikutnya.

### 2. Tambahkan Guard untuk Transisi

- Pastikan `handleScan()` tidak memanggil `startRecording()` saat state masih `stopping` atau `saving`.
- Simpan resi berikutnya ke `queuedResi` atau `pendingResi`.
- Setelah save selesai, cek apakah ada resi pending lalu start recording berikutnya.

### 3. Progress UI di Preview

- Saat state `saving`, tampilkan progress bar atau loading indicator pada area preview.
- Jika progress detail sulit diukur, tampilkan loading bar indeterminate yang jelas.
- Ubah pesan status di preview agar operator tahu video sedang diproses.

### 4. Kualitas Preview

- Preview kamera harus tetap aktif dan tidak freeze setelah pergantian resi.
- Pastikan sumber stream tetap valid saat berpindah dari recording lama ke recording baru.
- Jika perlu, delay singkat bisa dipakai hanya untuk memastikan recorder lama benar-benar release sebelum recorder baru dibuat.

### 5. Penanganan Error

- Jika save gagal, state masuk ke `error`.
- Tampilkan pesan error yang jelas di UI.
- Pastikan user bisa retry tanpa harus refresh aplikasi.

## Rekomendasi Teknis

- Gunakan `async/await` untuk membuat alur transisi lebih mudah diikuti.
- Simpan operasi save dalam satu fungsi finalisasi yang mengembalikan promise selesai.
- Pisahkan:
  - `beginRecording(resi)`
  - `stopCurrentRecording()`
  - `saveCurrentRecording()`
  - `startQueuedRecording()`
- Gunakan boolean guard atau token transisi untuk mencegah start ganda.
- Pertimbangkan `AbortController` atau token session untuk membatalkan proses lama jika state sudah berubah.
- Tambahkan log debugging sementara untuk memantau urutan event:
  - scan diterima
  - stop dipanggil
  - save mulai
  - save selesai
  - recording berikutnya mulai

## Contoh Alur Logika

```text
state = recording
pendingResi = null

scan(resiBaru):
  if state == recording:
    pendingResi = resiBaru
    stopCurrentRecording()
    state = stopping
    return

  if state in (stopping, saving):
    pendingResi = resiBaru
    return

  if state == idle or state == ready_to_record_next:
    beginRecording(resiBaru)
    state = recording

onStopRecorder():
  state = saving
  showProgressPreview()
  await saveCurrentRecording()
  state = ready_to_record_next

  if pendingResi exists:
    beginRecording(pendingResi)
    pendingResi = null
    state = recording
  else:
    state = idle
```

## Checklist Testing

### Skenario Dasar

- Scan resi pertama lalu pastikan recording mulai normal.
- Scan resi kedua setelah 2-3 menit recording berjalan.
- Pastikan recording lama berhenti dulu.
- Pastikan progress saving tampil pada preview.
- Pastikan recording baru hanya mulai setelah saving selesai.

### Skenario Freeze

- Uji pergantian resi berulang dalam waktu singkat.
- Pastikan preview video tidak freeze setelah recording kedua dimulai.
- Pastikan timer tidak berjalan sementara frame diam tanpa alasan.

### Skenario Saving

- Uji saat storage lambat atau file video besar.
- Pastikan state tetap di `saving` sampai promise save selesai.
- Pastikan tidak ada recording baru yang start prematur.

### Skenario Error

- Simulasikan gagal save.
- Pastikan masuk ke state `error`.
- Pastikan pesan error tampil jelas.
- Pastikan user bisa retry tanpa restart aplikasi.

### Skenario Recovery

- Setelah error, coba scan resi baru.
- Pastikan sistem kembali bisa merekam normal.
- Pastikan kamera stream tetap tersedia jika tidak ada gangguan hardware.

### Skenario UI

- Progress bar/loading terlihat jelas saat saving.
- Tombol aksi tidak membingungkan user saat transisi.
- Status di preview sesuai dengan state aktual.

## File yang Kemungkinan Terdampak

- `src/hooks/useRecordingSession.ts`
- `src/pages/ScanPage.tsx`
- `src/components/CameraPreview.tsx`
- `src/data/recordings.ts`
- `src/data/scanLogs.ts`
- `src/data/types.ts`

## Hasil yang Diharapkan

- Recording baru tidak freeze setelah pergantian resi.
- Saving video lama selalu selesai dulu sebelum recording baru dimulai.
- UI menampilkan progress yang jelas selama proses saving.
- Preview kamera tetap stabil dan sinkron dengan state sistem.
- Alur scan menjadi lebih dapat diprediksi dan aman untuk pemakaian harian.

## Selesai Jika

- Skenario recording lama lalu scan resi kedua berjalan tanpa freeze.
- Saving muncul sebagai proses eksplisit di UI.
- Recording baru selalu dimulai setelah saving selesai.
- Tidak ada race condition yang membuat preview diam atau state salah.
- Checklist testing lulus untuk durasi rekaman pendek dan panjang.

---

## Sumber: `20-full-web-migration-plan.md`

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

---

## Sumber: `28-rencana-migrasi-monorepo-aman.md`

# Rencana Migrasi Monorepo Aman

Tujuan plan ini adalah menyiapkan struktur monorepo tanpa merusak web yang sudah berjalan. Migrasi harus bertahap, non-breaking, dan mudah diuji di setiap langkah.

## Ringkasan Status

- Web sudah pindah penuh ke `apps/web`
- Backend sudah pindah ke `services/backend`
- Shared logic sudah pindah ke `packages/*`
- Bridge runtime `server/*` sudah dibersihkan
- Storage backend sudah tersinkron ke `services/backend/server-data`
- Mobile app sudah mulai dibootstrap
- Cleanup akhir masih berjalan, terutama penyempurnaan mobile dan dokumentasi

## Cleanup Yang Masih Open

- [x] Mulai bootstrap `apps/mobile` dengan shell dan login minimum
- [ ] Rapikan sisa item plan yang masih tertulis sebagai pending meski sudah selesai secara fungsional
- [ ] Tambahkan smoke test khusus untuk backend, web, dan mobile setelah mobile ada

## Target Struktur

```txt
pakti/
  apps/
    web/
    mobile/
  services/
    backend/
  packages/
    shared/
    api-client/
    types/
```

## Status Progres Saat Ini

- [x] Fase A - Shared Core
- [x] Fase B - API Client
- [x] Fase C - Backend Service
- [x] Fase D - Web App
- [~] Fase E - Mobile App
- [~] Fase F - Cleanup

Catatan:
- `Fase C` sudah berjalan dan backend aktif di `services/backend`; storage sekarang tersinkron ke `services/backend/server-data`.
- `Fase E` sudah mulai dibootstrap dengan shell dan login dasar mobile.
- `Fase F` sekarang tinggal penataan akhir dokumentasi, alias, dan penyempurnaan mobile.

## Checklist Task

### Tahap 0 - Audit dan Boundary

- [ ] Audit folder dan file yang sekarang masih tercampur antara UI, API, dan logic bersama
- [ ] Kelompokkan file menjadi `web-only`, `backend-only`, dan `shared`
- [ ] Tandai file yang tidak boleh berubah perilakunya selama migrasi
- [ ] Tetapkan daftar dependency yang tetap di web dan yang akan dipakai bersama

### Tahap 1 - Root Monorepo

- [ ] Tetapkan root monorepo tanpa mengubah perilaku web yang ada
- [ ] Tambahkan folder `apps`, `services`, dan `packages`
- [ ] Siapkan workspace configuration untuk package manager yang dipakai
- [ ] Tambahkan alias/path baru untuk folder shared
- [ ] Pastikan web lama masih bisa dijalankan dari lokasi lama atau path baru secara setara

### Tahap 2 - Backend Split

- [ ] Pindahkan backend ke `services/backend` secara bertahap
- [ ] Pisahkan entry server, store, routes, dan util backend
- [ ] Pertahankan web lama tetap berjalan selama masa transisi
- [ ] Pastikan endpoint tetap sama selama tidak ada perubahan kontrak
- [ ] Pastikan build backend tetap stabil setelah dipindah

### Tahap 3 - Shared Packages

- [ ] Ekstrak tipe data bersama ke `packages/types`
- [ ] Ekstrak helper umum ke `packages/shared`
- [ ] Ekstrak client API ke `packages/api-client`
- [ ] Ekstrak formatter, validator, dan helper history ke package bersama
- [ ] Pastikan web memakai package bersama tanpa mengubah output fitur
- [ ] Pastikan backend dan mobile memakai kontrak tipe yang sama

### Tahap 4 - Mobile App Bootstrap

- [x] Tambahkan `apps/mobile` sebagai proyek baru yang berdiri sendiri
- [x] Bootstrap mobile app dengan struktur navigasi minimal
- [ ] Mulai dari fitur mobile minimum: login, scan, preview, rekam, history ringkas
- [ ] Jangan bawa settings/admin penuh ke mobile pada fase awal
- [ ] Pastikan mobile langsung memakai backend dan package shared yang sama

### Tahap 5 - Web Finalization

- [ ] Simpan dashboard lengkap, settings, users, dan admin tools tetap di web
- [ ] Rapikan import web agar hanya mengambil shared package
- [ ] Pastikan build web tidak berubah perilaku setelah pemisahan folder
- [ ] Tambahkan dokumentasi cara menjalankan masing-masing app di monorepo
- [ ] Verifikasi lint, build, dan alur API di web serta mobile

## Prinsip Migrasi

- Jangan memindahkan semuanya sekaligus.
- Jangan ubah behavior web sebelum ada pengganti yang stabil.
- Shared logic harus menjadi sumber kebenaran bersama, bukan duplikasi.
- Mobile dan web boleh berbeda UI, tetapi harus memakai backend dan data contract yang sama.

## Urutan Aman

1. Siapkan wrapper monorepo.
2. Pindahkan backend lebih dulu.
3. Pindahkan tipe dan helper shared.
4. Tambahkan mobile app.
5. Setelah stabil, rapikan web agar memakai package bersama sepenuhnya.

## Pembagian Tanggung Jawab File

- `apps/web`: seluruh UI web lengkap dan admin dashboard
- `apps/mobile`: UI operator mobile untuk scan, rekam, dan history ringkas
- `services/backend`: server API, storage, dan logika sinkronisasi
- `packages/types`: tipe data domain dan contract API
- `packages/shared`: helper umum, formatter, dan logic reusable
- `packages/api-client`: wrapper request dan parsing response

## Checklist Per Folder

### `apps/web`

- [x] Pertahankan halaman admin/web yang sudah ada tanpa perubahan perilaku
- [x] Pastikan routing web tetap sama setelah folder berpindah
- [x] Pindahkan UI yang benar-benar web-only ke folder ini
- [x] Update import agar mengambil logic dari `packages/*`
- [x] Pastikan build web tetap menghasilkan output yang sama

### `apps/mobile`

- [ ] Buat shell aplikasi mobile dengan navigasi dasar
- [ ] Implementasi login operator
- [ ] Implementasi scan dan input cepat
- [ ] Implementasi preview kamera dan rekam video
- [ ] Implementasi history ringkas dan detail sederhana
- [ ] Pastikan mobile memakai kontrak API yang sama dengan web
- [ ] Hindari membawa fitur admin penuh ke mobile pada fase awal

### `services/backend`

- [x] Pindahkan entry server ke folder ini
- [x] Pindahkan store, route, dan handler API ke backend service
- [x] Pertahankan kontrak endpoint selama migrasi
- [x] Pisahkan kode yang bergantung pada filesystem, database, dan session
- [x] Pastikan proses build dan run backend terpisah dari web
- [x] Migrasikan storage aktif ke folder backend final

### `packages/shared`

- [x] Kumpulkan formatter tanggal, status, task, dan helper umum
- [x] Pastikan helper tidak bergantung ke UI framework
- [~] Tambahkan unit kecil untuk logic reusable bila diperlukan
- [x] Gunakan package ini dari web, mobile, dan backend jika cocok

### `packages/types`

- [x] Pindahkan tipe `AppSettings`, `SystemConfig`, `OperatorProfile`, dan `Recording`
- [x] Tambahkan tipe contract API yang dipakai bersama
- [x] Hindari duplikasi tipe di web dan mobile

### `packages/api-client`

- [x] Pindahkan wrapper fetch/request ke package ini
- [x] Standarkan parsing error dan response
- [x] Pastikan web dan mobile memakai client yang sama
- [x] Jaga agar base URL dan autentikasi tetap bisa dikonfigurasi per app

## Deliverable Awal

- [x] Root monorepo terbentuk
- [x] Web tetap berjalan normal
- [x] Backend bisa dijalankan terpisah
- [x] Shared package mulai dipakai minimal oleh satu atau dua modul
- [x] Mobile app sudah punya shell dan login dasar
- [x] Dokumentasi run/dev/build untuk tiap app tersedia
- [x] Storage aktif sudah berada di lokasi backend final

## Contoh File Yang Dipindah

### Ke `services/backend`

- `server/index.ts`
- `server/store.ts`
- `server/routes/*`
- `server/middleware/*`
- `server/utils/*`

### Ke `packages/types`

- `src/data/types.ts`
- tipe request/response API
- tipe domain yang dipakai web dan mobile

### Ke `packages/shared`

- formatter tanggal dan waktu
- helper status, task, dan filter history
- helper validasi ringan yang tidak bergantung ke UI

### Ke `packages/api-client`

- wrapper fetch ke backend
- fungsi login, session, settings, history, users
- parsing response dan error standar

### Tetap di `apps/web`

- seluruh halaman admin dan dashboard
- komponen UI web-only
- routing web lengkap
- logic yang khusus untuk tampilan desktop

### Tetap di `apps/mobile`

- shell navigasi mobile
- halaman scan dan rekam
- preview kamera
- history ringkas

## Urutan Migrasi File Yang Aman

1. Buat struktur folder monorepo tanpa memindah file lama dulu.
2. Tambahkan workspace/config root, lalu pastikan web tetap build.
3. Pindahkan tipe ke `packages/types` terlebih dahulu.
4. Pindahkan helper umum ke `packages/shared`.
5. Pindahkan wrapper API ke `packages/api-client`.
6. Pindahkan backend ke `services/backend` dan sesuaikan import.
7. Buat `apps/mobile` lalu sambungkan ke package shared dan API client.
8. Setelah semua stabil, rapikan web agar hanya memakai package bersama.

## Template Workspace dan Script

Jika memakai npm workspaces, bentuk dasarnya:

```json
{
  "workspaces": [
    "apps/*",
    "services/*",
    "packages/*"
  ]
}
```

Script root yang biasanya dibutuhkan:

- `dev:web`
- `dev:mobile`
- `dev:backend`
- `build:web`
- `build:mobile`
- `build:backend`
- `lint`

Contoh `package.json` root:

```json
{
  "name": "pakti-monorepo",
  "private": true,
  "workspaces": [
    "apps/*",
    "services/*",
    "packages/*"
  ],
  "scripts": {
    "dev:web": "npm run dev --workspace apps/web",
    "dev:mobile": "npm run dev --workspace apps/mobile",
    "dev:backend": "npm run dev --workspace services/backend",
    "build:web": "npm run build --workspace apps/web",
    "build:mobile": "npm run build --workspace apps/mobile",
    "build:backend": "npm run build --workspace services/backend",
    "lint": "npm run lint --workspaces"
  }
}
```

Catatan untuk template ini:

- Script di atas hanya contoh struktur.
- Nama workspace bisa disesuaikan dengan package manager dan tooling final.
- Jika root tetap butuh menjalankan web lama sementara, script lama bisa dipertahankan dulu sebagai alias.

## Template Package Per Workspace

### `apps/web/package.json`

```json
{
  "name": "@pakti/web",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview"
  }
}
```

### `apps/mobile/package.json`

```json
{
  "name": "@pakti/mobile",
  "private": true,
  "scripts": {
    "dev": "expo start",
    "build": "expo export",
    "lint": "eslint ."
  }
}
```

### `services/backend/package.json`

```json
{
  "name": "@pakti/backend",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "lint": "eslint ."
  }
}
```

### `packages/types/package.json`

```json
{
  "name": "@pakti/types",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts"
}
```

### `packages/shared/package.json`

```json
{
  "name": "@pakti/shared",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts"
}
```

### `packages/api-client/package.json`

```json
{
  "name": "@pakti/api-client",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts"
}
```

Catatan template workspace:

- Format package di atas bisa disesuaikan jika nanti mobile tidak memakai Expo.
- Jika backend dan packages ingin dibuild ke `dist`, tambahkan `tsup` atau `tsc` sesuai kebutuhan.
- `apps/web` boleh tetap memakai Vite seperti sekarang.

## Catatan Penting

- Pindahan folder tidak boleh mengubah contract API.
- Web lama harus tetap bisa dipakai selama mobile belum selesai.
- Jangan jadikan package shared sebagai tempat logic UI.
- Kalau ada file yang dipakai banyak tempat, pindahkan bertahap ke shared sebelum duplikasi makin besar.

## Urutan Pemindahan File Nyata

### Fase A - Tanpa Pindah Behavior

- [ ] `src/data/types.ts` dipindah dulu ke `packages/types`
- [ ] `src/config/defaultSettings.ts` dan `src/config/defaultSystemConfig.ts` dipisah antara shared config dan app config
- [ ] `src/lib/utils.ts` dipindah ke `packages/shared`
- [ ] `src/utils/download.ts` dipindah ke `packages/shared`
- [ ] `src/data/exporters.ts` dipindah ke `packages/shared`
- [ ] `src/data/systemConfig.ts` dipindah ke `packages/shared`

### Fase B - API Client

- [ ] `src/data/api.ts` dipecah menjadi `packages/api-client`
- [ ] `src/app/operatorSession.ts` diarahkan memakai api client bersama
- [ ] `src/app/bootstrapState.ts` tetap di web dulu sampai backend stabil
- [ ] `src/data/recordings.ts` dan `src/data/scanLogs.ts` dievaluasi untuk dipisah ke package/shared jika masih lintas app

### Fase C - Backend Service

- [ ] `server/index.ts` dipindah ke `services/backend/src/index.ts`
- [ ] `server/store.ts` dipindah ke `services/backend/src/store.ts`
- [ ] `server/db.ts` dipindah ke `services/backend/src/db.ts`
- [ ] `server/schema.ts` dipindah ke `services/backend/src/schema.ts`
- [ ] `server/http.ts` dipindah ke `services/backend/src/http.ts`
- [ ] `server/auth.ts` dipindah ke `services/backend/src/auth.ts`
- [ ] `server/better-sqlite3.d.ts` tetap di backend service

### Fase D - Web App

- [ ] `src/App.tsx` dipindah ke `apps/web/src/App.tsx`
- [ ] `src/main.tsx` dipindah ke `apps/web/src/main.tsx`
- [ ] `src/pages/*` dipindah ke `apps/web/src/pages/*`
- [ ] `src/components/*` dipindah ke `apps/web/src/components/*`
- [ ] `src/hooks/*` dipindah ke `apps/web/src/hooks/*`
- [ ] `src/app/*` dipindah ke `apps/web/src/app/*`
- [ ] `src/index.css` dan `src/App.css` dipindah ke web app

### Fase E - Mobile App

- [ ] Buat `apps/mobile/src` dari nol, jangan copy semua halaman web
- [ ] Tarik hanya logic yang benar-benar dibutuhkan untuk scan dan rekam
- [ ] Pakai package `types`, `shared`, dan `api-client` untuk kontrak bersama
- [ ] Tambahkan fitur history ringkas setelah scan/rekam stabil

### Fase F - Cleanup

- [ ] Hapus duplikasi import setelah semua package bersama dipakai
- [ ] Rapikan alias path root monorepo
- [ ] Tambahkan documentasi run/build per app
- [ ] Validasi web lama dan mobile baru bisa jalan paralel tanpa bentrok

## Diagram Alur Migrasi

```txt
repo lama
  ├─ src/*          -> apps/web/src/*
  ├─ server/*       -> services/backend/src/*
  ├─ src/data/types -> packages/types
  ├─ src/lib/utils  -> packages/shared
  ├─ src/data/api   -> packages/api-client
  └─ src/pages/*    -> apps/web/src/pages/*

setelah itu:
  apps/web   -> UI full web
  apps/mobile -> UI mobile operasional
  services/backend -> API dan storage
  packages/* -> logic bersama
```

## Rencana Sprint

### Sprint 1 - Fondasi

- [x] Audit boundary file lama
- [x] Siapkan root monorepo
- [x] Tambahkan workspace config
- [x] Pastikan web lama masih build dan jalan
- [x] Fokus file: `src/App.tsx`, `src/main.tsx`, `src/index.css`, `src/App.css`, `package.json`
- [x] Command cek: `npm run lint` dan `npm run build`

### Sprint 2 - Shared Core

- [x] Pindahkan types ke package bersama
- [x] Pindahkan helper umum
- [x] Pindahkan api client
- [x] Pastikan web masih memakai output yang sama
- [x] Fokus file: `src/data/types.ts`, `src/lib/utils.ts`, `src/utils/download.ts`, `src/data/exporters.ts`, `src/data/systemConfig.ts`, `src/data/defaultSettings.ts`, `src/config/defaultSettings.ts`, `src/config/defaultSystemConfig.ts`, `src/data/api.ts`
- [x] Command cek: `npm run lint` dan `npm run build`

### Sprint 3 - Backend Move

- [x] Pindahkan backend ke service terpisah
- [x] Sesuaikan entrypoint dan storage
- [x] Verifikasi endpoint tetap sama
- [x] Jalankan lint/build backend terpisah
- [x] Fokus file: `server/index.ts`, `server/store.ts`, `server/db.ts`, `server/schema.ts`, `server/http.ts`, `server/auth.ts`, `server/better-sqlite3.d.ts`
- [x] Command cek: `npm run api:dev` dan `npm run build`

### Sprint 4 - Mobile Bootstrap

- [ ] Buat mobile app shell
- [ ] Implementasi login dan scan
- [ ] Implementasi kamera dan rekam
- [ ] Tambahkan history ringkas
- [ ] Verifikasi web dan mobile bisa jalan paralel
- [ ] Fokus file: `src/pages/OperatorLoginPage.tsx`, `src/pages/ScanPage.tsx`, `src/pages/HistoryPage.tsx`, `src/components/CameraPreview.tsx`, `src/components/BarcodeInput.tsx`, `src/hooks/useCameraStream.ts`, `src/hooks/useRecordingSession.ts`, `src/hooks/useBarcodeScanner.ts`
- [ ] Command cek: `npm run lint` dan build mobile app

### Sprint 5 - Stabilization

- [x] Rapikan import shared
- [x] Hapus duplikasi
- [x] Tambahkan dokumentasi run/build
- [x] Final check lint, build, dan API contract
- [x] Fokus file: seluruh import di `apps/web`, `services/backend`, dan `packages/*` setelah pindah selesai
- [x] Command cek: semua `build`, `lint`, dan smoke test web + mobile + backend

## Peta File per Sprint

### Sprint 1 - Root dan layout

- `package.json`
- `vite.config.ts`
- `tsconfig.json`
- `tsconfig.app.json`
- `eslint.config.js`
- `src/main.tsx`
- `src/App.tsx`

### Sprint 2 - Shared logic

- `src/data/types.ts`
- `src/lib/utils.ts`
- `src/utils/download.ts`
- `src/data/exporters.ts`
- `src/data/systemConfig.ts`
- `src/data/defaultSettings.ts`
- `src/config/defaultSettings.ts`
- `src/config/defaultSystemConfig.ts`
- `src/data/api.ts`

### Sprint 3 - Backend

- `server/index.ts`
- `server/store.ts`
- `server/db.ts`
- `server/schema.ts`
- `server/http.ts`
- `server/auth.ts`
- `server/better-sqlite3.d.ts`

### Sprint 4 - Mobile seed

- `src/components/CameraPreview.tsx`
- `src/components/BarcodeInput.tsx`
- `src/hooks/useCameraStream.ts`
- `src/hooks/useRecordingSession.ts`
- `src/hooks/useBarcodeScanner.ts`
- `src/pages/OperatorLoginPage.tsx`
- `src/pages/ScanPage.tsx`
- `src/pages/HistoryPage.tsx`

### Sprint 5 - Web completion

- `src/pages/WelcomePage.tsx`
- `src/pages/UsersPage.tsx`
- `src/pages/SettingsPage.tsx`
- `src/pages/HealthPage.tsx`
- `src/pages/AdminPage.tsx`
- `src/app/*`
- `src/components/*`
- `src/components/ui/*`

## Kriteria Selesai

- [ ] Web full tetap utuh dan fungsional
- [ ] Mobile operasional bisa scan dan rekam
- [ ] Backend dipakai bersama oleh web dan mobile
- [ ] Shared logic tidak duplikasi
- [ ] Monorepo bisa dibuild dan dijalankan tanpa konflik

## Risiko dan Rollback

### Risiko Umum

- Path alias baru bisa memutus import lama.
- Build root bisa gagal karena workspace belum lengkap.
- Backend bisa tidak sinkron dengan web jika kontrak API berubah saat pindah.
- Mobile bisa terlalu cepat bergantung ke shared package yang belum stabil.

### Cara Mengurangi Risiko

- Pindah satu lapis kecil per sprint.
- Setelah setiap perpindahan file, jalankan lint dan build.
- Jangan hapus file lama sampai pengganti benar-benar stabil.
- Pertahankan endpoint backend selama masa transisi.
- Simpan perubahan shared API contract sebagai tahap terpisah.

### Rollback Cepat

- Jika web rusak setelah pindah package, kembalikan import ke file lama sementara.
- Jika backend gagal berjalan di service baru, jalankan dari lokasi lama sampai service baru stabil.
- Jika mobile belum siap, biarkan web tetap menjadi satu-satunya client yang aktif.
- Jika workspace setup bermasalah, batalkan pemindahan folder besar dan hanya simpan alias/config.

## Update 2026-06-05 - Bootstrap Welcome Web

- [x] Welcome/setup admin web hanya muncul saat database belum memiliki user/operator sama sekali.
- [x] Status bootstrap backend kini mengembalikan `operatorCount` dan menjadikan `needsSetup` berbasis jumlah `operator_profiles`, bukan hanya `adminCount`.
- [x] Halaman Admin web menampilkan `User count` agar status bootstrap lebih mudah diaudit.

## Update 2026-06-05 - Redesign Scan Mobile

- [x] Halaman Scan mobile dibuat lebih sederhana dengan kamera sebagai area utama.
- [x] Overlay scan, status audio/task, progress, input resi, dan tombol rekam diringkas tanpa mengubah callback rekaman.
- [x] Notifikasi scan tetap memakai state dan timer lama agar flow operasional tidak berubah.

## Aturan Stop-Go

- Stop jika lint atau build web gagal setelah pemindahan.
- Stop jika endpoint backend berubah tanpa pengganti di client.
- Stop jika file shared mulai memuat logic UI khusus.
- Go lanjut hanya jika satu sprint selesai dan stabil di semua app yang terdampak.

## Checklist Validasi Setiap Sprint

- [ ] Web build berhasil
- [ ] Backend build/run berhasil
- [ ] Mobile build/run berhasil jika sudah ada
- [ ] Tidak ada import path yang patah
- [ ] Tidak ada duplikasi logic utama
- [ ] Kontrak API tetap konsisten

## Checklist Command per Tahap

### Setelah Sprint 1

- `npm run lint`
- `npm run build`

### Setelah Sprint 2

- `npm run lint`
- `npm run build`
- `npm run preview`

### Setelah Sprint 3

- `npm run api:dev`
- `npm run api:start`
- `npm run build`

### Setelah Sprint 4

- `npm run lint`
- `npm run build:web`
- `npm run build:backend`
- `npm run build:mobile`

### Setelah Sprint 5

- `npm run lint`
- `npm run build:web`
- `npm run build:backend`
- `npm run build:mobile`
- smoke test login, scan, rekam, history, settings, dan admin web


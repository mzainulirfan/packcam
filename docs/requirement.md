# Requirement Pakti Packcam

Tanggal konsolidasi: 2026-06-03

Dokumen ini menjadi sumber requirement fungsional dan non-fungsional Pakti Packcam.

## Requirement Utama

- Sistem mendukung bootstrap admin, login, logout, session cookie, dan role access.
- Admin dapat mengelola operator, settings, health, dan audit.
- Operator dapat scan resi, preview kamera, merekam video, stop, simpan, dan lanjut resi berikutnya.
- Sistem mendukung task `qc` dan `packing` per resi.
- Recording harus memiliki metadata lengkap: resi, task, operator, file, status, waktu, durasi, dan note.
- Backend menyimpan metadata di SQLite dan file video di folder upload server.
- History dapat mencari, memfilter, preview, download, copy metadata, dan export.
- History mobile dapat membagikan video ke aplikasi terpasang melalui native share sheet.
- Saat target share adalah WhatsApp atau aplikasi yang sensitif format, backend wajib menyiapkan salinan MP4 kompatibel sebelum file dikirim.
- Mobile app harus bisa login, scan, recording, history, session, dan theme.

## Non-Fungsional

- Recording tidak boleh hilang diam-diam; kegagalan harus terlihat sebagai error atau last error.
- Endpoint protected harus memvalidasi session di backend.
- Password tidak boleh disimpan plaintext.
- Browser harus mendukung kamera dan `MediaRecorder`.
- Rekaman browser yang berasal dari WebM tidak boleh sekadar diberi ekstensi `.mp4`; jika dibutuhkan MP4, backend harus transcode ke container dan codec MP4 yang valid.
- File MP4 untuk share harus memakai H.264, AAC, `yuv420p`, dan `faststart`.
- Akses kamera mobile di LAN harus memakai HTTPS atau secure context.
- Logic shared ditempatkan di `packages/shared`, tipe domain di `packages/types`, dan API client di `packages/api-client`.

## Requirement Runtime dan Share 2026-06-07

- Frontend production Vercel harus mengarah ke API tunnel HTTPS, misalnya `VITE_API_BASE_URL=https://api-pakti.zakado.id`.
- Backend lokal dan Cloudflared tunnel harus bisa dijalankan di background pada Windows.
- Endpoint share recording harus membuat atau memakai cache file MP4 kompatibel di folder upload server.
- Share mobile harus mengambil file hasil endpoint share, bukan langsung memakai file recording asli.

## Sumber Gabungan

- `01-database-dan-konfigurasi-dasar.md`
- `02-kamera-dan-preview.md`
- `03-input-scan-barcode.md`
- `04-rekam-video-inti.md`
- `05-stabilitas-dan-recovery.md`
- `06-riwayat-dan-pencarian.md`
- `07-preview-video-dan-akses-file.md`
- `08-settings-dan-ux.md`
- `09-export-dan-fitur-tambahan.md`
- `11-konfigurasi-sistem.md`
- `18-web-full-sqlite-plan.md`
- `19-backend-api-sqlite-server-plan.md`
- `21-proses-packing-qc-plan.md`
- `22-rencana-pengembangan-settings.md`
- `23-rencana-pengembangan-history.md`
- `24-rencana-pengembangan-user.md`
- `25-rencana-admin-multi-task.md`

---

## Sumber: `01-database-dan-konfigurasi-dasar.md`

# Tahap 1 - Database dan Konfigurasi Dasar

## Tujuan

Menyediakan tempat penyimpanan metadata dan setting dasar aplikasi.

## Ruang Lingkup

- Buat tabel `recordings`.
- Buat tabel `app_settings`.
- Siapkan migrasi database.
- Siapkan helper untuk baca/tulis setting.
- Siapkan helper path folder video.

## Tugas

1. Definisikan skema SQLite awal.
2. Implementasikan migrasi dan inisialisasi DB.
3. Buat fungsi CRUD ringan untuk setting.
4. Buat validasi dasar untuk path dan nilai setting.

## Hasil yang Diharapkan

- Database bisa dibuat otomatis saat aplikasi dibuka.
- Setting dasar bisa disimpan dan dibaca ulang.
- Data inti punya struktur yang konsisten sejak awal.

## Selesai Jika

- Tabel utama sudah tersedia.
- Setting default bisa dipakai tanpa crash.
- Tidak ada query manual yang tersebar di banyak file.

---

## Sumber: `02-kamera-dan-preview.md`

# Tahap 2 - Kamera dan Preview

## Tujuan

Memastikan kamera berjalan dan preview tampil sebelum fitur rekam dihubungkan.

## Ruang Lingkup

- Akses kamera default.
- Tampilkan preview di halaman scan.
- Tambahkan pilihan device kamera.
- Tangani error permission kamera.

## Tugas

1. Implementasikan akses `getUserMedia`.
2. Render preview video di UI.
3. Tambahkan daftar device kamera jika tersedia.
4. Tampilkan pesan error yang jelas jika kamera gagal.

## Hasil yang Diharapkan

- Kamera aktif dan terlihat di layar.
- Pengguna bisa memilih kamera jika ada lebih dari satu.
- Masalah permission mudah didiagnosis.

## Selesai Jika

- Preview stabil.
- Tidak ada error saat reload normal.
- Kamera bisa dipakai sebagai dasar fitur rekam.

---

## Sumber: `03-input-scan-barcode.md`

# Tahap 3 - Input Scan Barcode

## Tujuan

Menjadikan barcode scanner sebagai pemicu utama alur kerja.

## Ruang Lingkup

- Buat komponen input barcode.
- Tangkap input scanner mode keyboard wedge.
- Trigger proses saat `Enter` terbaca.
- Tambahkan validasi dasar resi.

## Tugas

1. Buat input yang selalu siap menerima fokus.
2. Tangkap input cepat dari barcode scanner.
3. Validasi panjang dan karakter resi.
4. Tampilkan feedback jika input tidak valid.

## Hasil yang Diharapkan

- Resi masuk dengan stabil dari scanner.
- Input manual tetap bisa dipakai untuk testing.
- Data invalid tidak langsung memicu proses rekam.

## Selesai Jika

- Scan barcode menghasilkan event yang konsisten.
- Tidak ada double trigger dari satu scan.
- Flow input siap disambungkan ke rekaman.

---

## Sumber: `04-rekam-video-inti.md`

# Tahap 4 - Rekam Video Inti

## Tujuan

Mewujudkan alur utama Pakti end-to-end.

## Ruang Lingkup

- Scan pertama memulai rekaman.
- Scan berikutnya menghentikan rekaman sebelumnya.
- File video disimpan ke folder lokal.
- Metadata disimpan ke database.
- Tampilkan indikator `RECORDING`.

## Tugas

1. Hubungkan event scan dengan state rekaman.
2. Implementasikan start dan stop recording.
3. Simpan file video dengan nama berbasis resi.
4. Update row database saat rekaman selesai.

## Hasil yang Diharapkan

- Satu resi menghasilkan satu file video.
- Transisi antar resi berjalan otomatis.
- Data rekaman tercatat rapi.

## Selesai Jika

- Alur scan -> record -> stop -> save berjalan penuh.
- File video benar-benar tersimpan di disk.
- Metadata bisa ditelusuri dari database.

---

## Sumber: `05-stabilitas-dan-recovery.md`

# Tahap 5 - Stabilitas dan Recovery

## Tujuan

Mengurangi risiko kehilangan data saat terjadi gangguan.

## Ruang Lingkup

- Tangani aplikasi ditutup saat merekam.
- Tambahkan auto-save saat stop.
- Recovery saat startup jika ada rekaman aktif.
- Cek disk space sebelum rekaman.
- Tambahkan debounce scan.

## Tugas

1. Simpan status rekaman secara aman.
2. Finalisasi rekaman saat aplikasi close.
3. Pulihkan state yang belum selesai ketika startup.
4. Tambahkan peringatan jika disk menipis.

## Hasil yang Diharapkan

- Rekaman lebih aman dari crash atau shutdown mendadak.
- Duplikasi input lebih mudah dicegah.
- Aplikasi lebih siap dipakai harian.

## Selesai Jika

- Kasus force close bisa dipulihkan.
- Disk penuh terdeteksi sebelum error fatal.
- Scan ganda tidak memicu state rusak.

---

## Sumber: `06-riwayat-dan-pencarian.md`

# Tahap 6 - Riwayat dan Pencarian

## Tujuan

Menyediakan akses cepat ke data rekaman yang sudah tersimpan.

## Ruang Lingkup

- Buat halaman `History`.
- Tampilkan tabel riwayat rekaman.
- Tambahkan filter resi, tanggal, dan status.
- Tambahkan pagination.

## Tugas

1. Ambil data dari SQLite berdasarkan filter.
2. Render tabel yang mudah dibaca.
3. Tambahkan sort dan pagination.
4. Tampilkan state kosong dan error dengan jelas.

## Hasil yang Diharapkan

- Rekaman lama mudah dicari.
- Data besar tetap nyaman dilihat.
- Admin bisa melakukan audit ringan dari UI.

## Selesai Jika

- Search berjalan stabil.
- Pagination tidak merusak filter.
- Data riwayat tampil konsisten.

---

## Sumber: `07-preview-video-dan-akses-file.md`

# Tahap 7 - Preview Video dan Akses File

## Tujuan

Membuat video hasil rekaman bisa dicek langsung dari aplikasi.

## Ruang Lingkup

- Buat halaman `Player`.
- Tampilkan video lokal.
- Tambahkan tombol buka folder file.
- Tambahkan info file dasar.

## Tugas

1. Sambungkan file path ke video player.
2. Pastikan file lokal bisa diputar dari UI.
3. Tambahkan aksi cepat untuk membuka lokasi file.
4. Tampilkan metadata file yang relevan.

## Hasil yang Diharapkan

- Operator bisa verifikasi hasil rekaman.
- Akses ke file lokal lebih cepat.
- Tidak perlu keluar aplikasi untuk cek video.

## Selesai Jika

- Video bisa diputar dari riwayat.
- Path file terbuka dengan benar.
- Preview bekerja untuk file yang sudah selesai direkam.

---

## Sumber: `08-settings-dan-ux.md`

# Tahap 8 - Settings dan UX

## Tujuan

Membuat aplikasi nyaman dipakai dan mudah disesuaikan.

## Ruang Lingkup

- Buat halaman `Settings`.
- Atur folder video.
- Atur kamera default.
- Atur resolusi dan bitrate.
- Tambahkan notifikasi sukses/gagal.

## Tugas

1. Sediakan form pengaturan yang jelas.
2. Simpan setting ke database.
3. Terapkan setting saat aplikasi dibuka.
4. Rapikan feedback UI untuk aksi penting.

## Hasil yang Diharapkan

- Pengguna bisa menyesuaikan aplikasi tanpa ubah kode.
- UX dasar lebih enak dipakai operator.
- Setting tersimpan antar sesi.

## Selesai Jika

- Setting bisa diubah dan dipakai ulang.
- Pengguna tahu ketika perubahan berhasil.
- UI tidak membingungkan saat pindah halaman.

---

## Sumber: `09-export-dan-fitur-tambahan.md`

# Tahap 9 - Export dan Fitur Tambahan

## Tujuan

Menambah nilai operasional setelah fitur inti stabil.

## Ruang Lingkup

- Export CSV atau XLSX.
- Tambahkan audit trail scan.
- Tambahkan konversi MP4.
- Tambahkan opsi backup atau arsip.

## Tugas

1. Pilih format export yang paling relevan.
2. Catat event scan penting ke log.
3. Sediakan opsi konversi jika dibutuhkan.
4. Pertimbangkan alur backup yang sederhana.

## Hasil yang Diharapkan

- Data lebih mudah dipakai admin.
- Riwayat aktivitas lebih mudah diaudit.
- Aplikasi lebih siap untuk kebutuhan lanjutan.

## Selesai Jika

- Export berjalan dari data filter.
- Log scan tersimpan.
- Fitur tambahan tidak mengganggu alur utama.

---

## Sumber: `11-konfigurasi-sistem.md`

# Tahap 11 - Konfigurasi Sistem

## Tujuan

Menyediakan pusat konfigurasi untuk identitas dan tampilan aplikasi agar Pakti mudah disesuaikan tanpa mengubah banyak kode.

## Ruang Lingkup

- Ganti nama aplikasi.
- Ubah tagline atau deskripsi singkat aplikasi.
- Ubah warna utama dan aksen tema.
- Ubah brand text yang tampil di login, sidebar, dan header.
- Siapkan nilai default yang bisa dipakai lintas halaman.
- Pastikan konfigurasi ini tersimpan dan mudah dipakai ulang.

## Komponen Konfigurasi

1. Identitas aplikasi
   - nama aplikasi
   - tagline
   - logo / inisial brand

2. Tema visual
   - primary color
   - accent color
   - border color
   - background color
   - text color

3. Branding UI
   - teks brand di sidebar
   - judul di login
   - nama di header
   - label footer atau watermark jika diperlukan

4. Opsi sistem
   - mode tampilan default
   - format label singkat
   - preferensi tampilan dasar

## Tugas

1. Definisikan struktur data konfigurasi sistem.
2. Tambahkan default config yang aman.
3. Buat helper untuk membaca dan menyimpan konfigurasi.
4. Hubungkan konfigurasi ke komponen UI utama.
5. Terapkan warna utama dari satu sumber data.
6. Terapkan nama aplikasi dan tagline dari satu sumber data.
7. Sediakan halaman atau section khusus untuk mengubah konfigurasi.
8. Tinjau konsistensi tampilan setelah config berubah.

## Hasil yang Diharapkan

- Nama aplikasi bisa diganti tanpa ubah banyak file.
- Tagline bisa diubah dari satu tempat.
- Warna utama aplikasi konsisten di seluruh UI.
- Brand Pakti mudah diubah ke identitas sistem lain jika diperlukan.

## Selesai Jika

- Nama aplikasi dan tagline bersumber dari konfigurasi.
- Warna utama dan aksen mengikuti config.
- UI utama tetap stabil setelah konfigurasi diubah.
- Nilai default tetap aman jika konfigurasi belum diisi.

---

## Sumber: `18-web-full-sqlite-plan.md`

# Plan Migrasi ke Full Web + SQLite

Dokumen ini merancang perubahan arah produk dari aplikasi desktop/Tauri menjadi aplikasi web penuh, dengan SQLite tetap dipakai sebagai database utama.

## Tujuan

- Mengubah aplikasi menjadi bisa diakses dari browser tanpa dependency Tauri atau desktop wrapper.
- Tetap mempertahankan SQLite sebagai sumber data utama.
- Menjaga alur inti tetap sama:
  - login operator
  - scan resi
  - rekam proses packing
  - simpan video
  - lihat history
  - kelola settings, users, dan health
- Menghindari rework besar dengan memigrasikan lapisan data secara bertahap.

## Rekomendasi Arsitektur

### Opsi yang direkomendasikan

- Frontend: React/Vite seperti sekarang, tetap menjadi SPA web.
- Backend: API server ringan di Node.js.
- Database: SQLite di server.
- Penyimpanan video: filesystem server atau storage yang setara.
- Upload video: browser merekam video, lalu mengirim hasil rekaman ke backend.

### Alasan

- SQLite paling stabil dipakai sebagai database server-side kecil sampai menengah.
- Aplikasi web lebih mudah diakses banyak device.
- Lebih aman daripada menyimpan data bisnis penting di localStorage atau IndexedDB browser.
- Alur upload video lebih mudah dikontrol dibanding memaksa database browser menyimpan blob besar.

### Catatan penting

- Jika targetnya hanya satu perangkat dan offline lokal, SQLite browser-side via WASM/OPFS juga memungkinkan.
- Namun untuk aplikasi web penuh yang diakses dari browser biasa, model server-side SQLite lebih masuk akal.
- Dokumen ini memakai asumsi server-side SQLite sebagai target utama.

## Kondisi Saat Ini

Repo masih bercampur antara web dan desktop:

- Ada adapter storage web dan SQLite.
- Ada bridge Tauri untuk file system dan SQLite native.
- Ada path video desktop-specific.
- Ada logic yang masih mengasumsikan akses file lokal via desktop runtime.

Artinya, migrasi perlu membuang ketergantungan berikut:

- bridge desktop/Tauri yang sebelumnya dipakai untuk file system dan path native
- semua jalur `desktop runtime` yang hanya relevan di Tauri
- akses file lokal langsung dari browser

## Prinsip Desain Baru

1. Browser hanya bertugas untuk UI, kamera, scan input, dan upload hasil.
2. Server menangani penyimpanan data bisnis, auth, logging, dan metadata.
3. Video final disimpan di server, bukan di browser storage.
4. SQLite menjadi sumber data tunggal untuk metadata dan state aplikasi.
5. Akses data dilakukan melalui repository/API, bukan langsung dari UI.

## Ruang Lingkup Migrasi

### Yang tetap di frontend web

- Login dan setup admin
- Dashboard shell
- Scan barcode
- Preview kamera
- Recording video di browser
- History, settings, users, health
- Validasi UI dan state interaksi

### Yang pindah ke backend

- Auth dan session operator
- CRUD operator profile
- CRUD settings dan system config
- Penyimpanan recording metadata
- Penyimpanan scan log
- Penyimpanan video file
- Last error dan bootstrap state
- Export data jika ingin hasil yang konsisten lintas user/device

### Yang dihapus atau diganti

- Tauri command bridge
- native file picker desktop
- native read/write/remove file helper
- desktop path resolver
- storage backend yang bergantung pada runtime desktop

## Desain Backend

### Modul backend minimum

- Auth service
- Operator service
- Recording service
- Scan log service
- Settings/system config service
- Health/reset service
- File upload/download service

### Tabel SQLite minimum

- `operator_profiles`
- `operator_session`
- `settings`
- `system_config`
- `recordings`
- `scan_logs`
- `bootstrap_state`
- `last_error`

### File video

- Video tidak disimpan sebagai blob besar di SQLite kecuali untuk kasus sangat kecil atau prototipe.
- Rekomendasi utama:
  - metadata di SQLite
  - file video di filesystem server
  - path file disimpan di tabel recordings

## Rancangan Flow Recording Baru

### Flow utama

1. Operator scan resi.
2. Browser mulai recording video di kamera.
3. Saat resi berikutnya masuk:
   - recording aktif dihentikan
   - hasil rekaman di-encode
   - video di-upload ke backend
   - backend menyimpan file dan metadata ke SQLite
   - UI menampilkan progress saving
4. Setelah upload dan save selesai 100%, browser mulai recording baru.

### Aturan penting

- Jangan mulai recording baru sebelum server mengonfirmasi save selesai.
- Kamera stream di browser tetap aktif selama pergantian resi.
- Progress saving wajib terlihat di area preview.
- Jika upload gagal, status harus masuk `error` dan tidak diam-diam lanjut recording baru.

## State Management Baru

State yang disarankan:

- `idle`
- `recording`
- `stopping`
- `saving`
- `ready_to_record_next`
- `error`

Tambahan state pendukung:

- `currentResi`
- `queuedResi`
- `savingResi`
- `uploadProgress`
- `lastSavedResi`
- `lastError`

## Strategi Implementasi

### Tahap 1: Pisahkan akses data dari UI

- Buat interface repository untuk semua domain data.
- UI hanya memanggil service/repository, bukan storage langsung.
- Siapkan adapter web sementara yang masih memakai implementasi lama.

### Tahap 2: Buat backend API

- Buat endpoint auth, operator, settings, scan logs, recordings, health.
- Buat koneksi SQLite di server.
- Tambahkan migrasi schema dan seed awal.

### Tahap 3: Migrasi auth dan bootstrap

- Pindahkan login, session, dan setup admin ke backend.
- Pastikan first-run admin tetap berjalan di web.

### Tahap 4: Migrasi recording metadata

- Simpan draft recording ke backend saat scan dimulai.
- Simpan hasil save final ke SQLite setelah upload selesai.
- Tambahkan status `uploading` atau `saving` di backend bila diperlukan.

### Tahap 5: Migrasi upload video

- Browser mengirim video ke backend lewat endpoint upload.
- Backend menulis file video ke filesystem.
- Backend memperbarui row SQLite setelah file sukses disimpan.

### Tahap 6: Migrasi history, users, settings

- History membaca data dari API.
- Users CRUD dipindahkan ke API.
- Settings dan system config juga dipindahkan ke API.

### Tahap 7: Hapus jalur desktop

- Hapus Tauri bridge dan helper native.
- Hapus path resolver desktop.
- Hapus dependency build desktop.
- Rapikan kode yang tersisa agar benar-benar web only.

## Rekomendasi Teknis

### Backend

- Gunakan Node.js dengan framework ringan seperti Fastify atau Express.
- Gunakan SQLite dengan driver yang stabil.
- Tambahkan migrasi schema, seed data, dan layer repository.
- Simpan file video di folder upload terstruktur per tanggal/resi.

### Frontend

- Pertahankan React + Vite.
- Gunakan `fetch`/API client terpusat.
- Buat hook baru untuk auth, settings, recordings, dan history berbasis API.
- Pertahankan komponen UI yang sudah dirapikan.

### Upload video

- Untuk video pendek, upload satu blob setelah recording selesai cukup sederhana.
- Untuk video lebih panjang, pertimbangkan chunked upload atau stream upload.
- Progress bar harus mengikuti progress upload, bukan hanya status lokal.

### Keamanan

- Validasi semua input di server.
- Sanitize nama file dan path.
- Tambahkan autentikasi sesi yang aman untuk akses API.
- Jika dibuka publik, batasi akses dengan login dan role admin/operator.

## Contoh Pseudocode

```ts
async function handleNextResiScan(resiNumber: string) {
  if (state.mode === 'saving') {
    queueResi(resiNumber)
    return
  }

  if (state.mode === 'recording') {
    state.mode = 'stopping'
    const blob = await stopRecorderAndCollectBlob()

    state.mode = 'saving'
    await uploadVideoToServer({
      resiNumber: state.currentResi,
      blob,
      onProgress: (progress) => {
        state.uploadProgress = progress
      },
    })

    state.mode = 'ready_to_record_next'
    await startRecording(resiNumber)
    return
  }

  await startRecording(resiNumber)
}
```

## Checklist Testing

### Functional

- Scan resi pertama memulai recording normal.
- Scan resi kedua menghentikan recording pertama dulu.
- Saving video pertama tampil progress sampai selesai.
- Recording kedua hanya mulai setelah saving selesai.
- Preview kamera tetap aktif selama transisi.
- Timer recording kedua benar-benar reset dan berjalan normal.

### Reliability

- Test recording 2-3 menit lalu pindah resi.
- Test recording lebih lama untuk melihat freeze atau memory leak.
- Test upload gagal lalu retry.
- Test refresh browser di tengah recording.
- Test koneksi lambat saat upload.

### Data integrity

- Video tersimpan dengan nama dan path yang benar.
- Metadata SQLite cocok dengan file video di server.
- History tampil sesuai data terakhir.
- Reset data benar-benar membersihkan data sesuai scope.

### UX

- Loading/progress saving terlihat jelas di preview.
- Status `saving` dan `ready_to_record_next` mudah dipahami operator.
- Tombol stop tetap terjangkau.
- Tidak ada horizontal scroll baru pada layar kecil.

## Risiko Utama

1. Video upload bisa jadi bottleneck kalau durasi recording panjang.
2. SQLite server-side perlu locking strategy yang rapi saat concurrent writes.
3. File storage harus konsisten dengan row metadata SQLite.
4. Migrasi dari desktop ke web bisa mematahkan asumsi lama di file picker dan path lokal.

## Urutan Kerja yang Disarankan

1. Finalisasi target arsitektur server-side SQLite.
2. Buat repository/API abstraction.
3. Bangun backend auth dan SQLite schema.
4. Migrasi recording upload.
5. Migrasi history, settings, users.
6. Hapus Tauri dan file helper desktop.
7. Uji ulang flow scan-record-save secara end-to-end.

## Kriteria Selesai

- Aplikasi bisa dibuka dari browser tanpa Tauri.
- Database utama memakai SQLite di server.
- Flow recording dan saving stabil untuk durasi panjang.
- UI preview menampilkan progress saving dengan jelas.
- Semua halaman utama tetap berjalan dari web.
- Tidak ada ketergantungan runtime desktop yang tersisa di jalur produksi.

---

## Sumber: `19-backend-api-sqlite-server-plan.md`

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

---

## Sumber: `21-proses-packing-qc-plan.md`

# Plan Penambahan Flow Packing dan QC

Dokumen ini merangkum rencana penambahan flow kerja baru pada Pakti. Saat ini sistem hanya punya satu flow scan -> rekam -> simpan untuk proses packing. Flow yang ingin ditambahkan adalah proses QC, dengan alur teknis scan dan recording yang tetap sama. Urutan bisnis yang baru adalah QC lebih dulu, lalu packing setelah QC selesai.

## Asumsi

- Flow kedua yang dimaksud adalah `QC`.
- Alur dasar tidak berubah:
  - scan resi
  - mulai rekam
  - stop rekam
  - simpan video
- Satu resi bisa diproses QC dan packing pada waktu berbeda.
- Satu resi bisa diproses oleh operator yang berbeda untuk QC dan packing.
- Operator nanti punya task spesifik, misalnya `packing` atau `qc`.
- Data packing dan QC harus bisa berdiri sendiri, tapi tetap terhubung ke resi yang sama.

## Target Akhir

- Sistem mendukung dua task operasional:
  - packing
  - QC
- Flow scan sampai saving tetap sama untuk kedua task.
- Resi yang sudah selesai di QC boleh diproses packing.
- Resi yang belum selesai di QC tidak boleh diproses packing.
- History, admin, dan audit bisa membedakan data packing dan QC.
- Operator hanya melihat task yang sesuai perannya.

## Prinsip Desain

- Satu mekanisme recording dipakai ulang untuk dua task.
- Task menjadi atribut kerja, bukan flow UI yang benar-benar berbeda.
- Data hasil proses harus tersimpan dengan konteks task.
- Validasi duplicate harus mempertimbangkan urutan task dan status task, bukan hanya resi.
- Recovery dan finalize harus tetap konsisten untuk task packing maupun QC.

## Perubahan Data Model

### Recording

Tambahkan atribut task pada recording:

- `qc`
- `packing`

Field yang perlu dipikirkan:

- `taskType`
- `operatorRole` atau `taskRole`
- `taskStatus` bila dibutuhkan

Tujuannya:

- membedakan video packing dan video QC untuk resi yang sama
- memudahkan history filter
- memudahkan admin audit dan export

### Operator

Operator profile perlu punya task utama:

- `packing`
- `qc`
- kemungkinan `both` jika nanti dibutuhkan

Tujuannya:

- operator packing hanya masuk alur packing setelah QC resi selesai
- operator QC hanya masuk alur QC
- admin tetap bisa membuat operator lintas task bila diperlukan

### Scan Log

Log scan perlu menyimpan konteks task:

- task apa yang sedang dikerjakan
- operator siapa yang melakukan scan
- resi diproses pada flow packing atau QC

### Session / Auth

Session login juga perlu membawa informasi task utama operator supaya:

- UI bisa menampilkan mode kerja aktif
- navigasi bisa membatasi page yang relevan
- scan page tahu task aktif tanpa perlu input manual berulang

## Aturan Bisnis Baru

### 1. Task dipisahkan per recording

- Satu recording harus punya task yang jelas: packing atau QC.
- Recording packing dan QC untuk resi yang sama harus dianggap entitas berbeda.

### 2. Duplicate rules berdasarkan urutan task

- Resi yang sudah selesai di `qc` masih bisa diproses di `packing`.
- Resi yang belum selesai di `qc` tidak boleh diproses di `packing`.
- Resi yang sama hanya dianggap duplicate jika task yang sama sudah selesai.

### 3. Operator mengikuti urutan task

- Operator packing hanya bisa memulai recording packing jika QC resi tersebut sudah selesai.
- Operator QC hanya bisa memulai recording QC.
- Admin boleh punya akses lebih luas jika diperlukan.

### 4. Alur scan tetap sama

- Tidak ada perubahan pada urutan:
  - scan
  - rekam
  - stop
  - save
- Perubahan hanya ada pada konteks task yang dipakai saat proses berjalan, status QC, dan saat data disimpan.

### 5. Video file dan metadata tetap terpisah

- Video QC dan packing untuk resi yang sama harus punya metadata berbeda.
- Path file boleh dibedakan lewat folder atau penamaan.

## Rancangan UI

### Scan Page

- Tambahkan indikator task aktif, misalnya `Packing` atau `QC`.
- Operator yang login melihat mode kerja yang sesuai task.
- Saat scan, sistem harus menyimpan task aktif ke recording draft.
- Bila operator packing mencoba memproses resi yang belum QC, tampilkan pesan yang jelas.

### Login / Users

- Saat membuat atau mengedit operator, admin perlu memilih task:
  - packing
  - qc
  - both jika nanti dipakai
- Halaman login bisa menampilkan label task operator setelah berhasil masuk.

### History

- Tambahkan filter task:
  - semua
  - packing
  - qc
- Row history harus menampilkan task.
- Detail history harus memperlihatkan task dan operator yang memproses.

### Admin / Audit

- Panel admin perlu menampilkan ringkasan terpisah untuk packing dan QC.
- Recent recording bisa dikelompokkan atau diberi label task.

## Rancangan Backend

### Endpoint Recording

Endpoint existing tetap dipakai, tetapi payload dan response perlu membawa task.

Hal yang perlu dipastikan:

- draft recording bisa dibuat dengan `taskType`
- chunk upload tetap menggunakan recording id yang sama
- finalize tetap menyimpan task ke metadata
- recover tetap tahu task apa yang sedang dipulihkan

### Query History

Query list recording perlu mendukung:

- filter task
- filter status
- filter operator
- filter resi

### Validasi

- Server harus menolak recording yang task-nya tidak sesuai dengan role operator bila aturan ini diaktifkan.
- Server harus memastikan task tersimpan di metadata final.

## Rencana Implementasi

### Tahap 1 - Desain Domain

- Tambahkan enum/task type untuk `packing` dan `qc`.
- Perluas tipe operator agar punya task utama.
- Perluas tipe recording agar menyimpan task.

### Tahap 2 - Backend Schema dan API

- Tambahkan kolom task pada tabel operator dan recordings.
- Tambahkan task pada scan log jika perlu.
- Update endpoint recording, login, users, dan history.
- Update response shape agar frontend menerima data task.

### Tahap 3 - Frontend Session dan Startup

- Bawa task operator ke session state.
- Tampilkan task aktif di header atau scan page.
- Pastikan bootstrap/login tetap berjalan seperti sekarang.

### Tahap 4 - Scan Flow

- Tambahkan context task ke recording draft.
- Pastikan scan -> record -> stop -> save tetap identik.
- Pastikan resi yang sudah selesai di QC bisa diproses packing, tetapi packing tidak bisa jalan sebelum QC selesai.

### Tahap 5 - History dan Admin

- Tambahkan filter task di history.
- Tambahkan label task di detail dan preview.
- Tambahkan ringkasan task di admin audit.

### Tahap 6 - Validasi dan Cleanup

- Audit semua duplicate/unique rule agar tidak hanya berbasis resi dan juga menghormati urutan QC -> packing.
- Rapikan pesan error agar jelas menyebut packing atau QC.
- Hapus asumsi lama yang menganggap hanya ada satu flow packing.

## Daftar Risiko

- Duplicate rule bisa salah kalau masih hanya berdasarkan resi.
- History bisa membingungkan kalau task tidak ditampilkan jelas.
- Operator bisa salah memilih task jika UI tidak cukup tegas.
- Recovery recording bisa salah konteks jika task tidak disimpan di draft.

## Checklist Selesai

- [ ] Operator punya task utama packing atau QC
- [ ] Recording menyimpan task aktif
- [ ] Scan flow tetap sama untuk packing dan QC
- [ ] Resi QC boleh diproses packing
- [ ] Resi yang belum QC tidak boleh diproses packing
- [ ] History bisa filter packing dan QC
- [ ] Admin bisa melihat data per task
- [ ] Recovery dan finalize tetap bekerja untuk dua task
- [ ] Tipe frontend dan backend sudah sinkron
- [ ] Testing alur packing dan QC sudah lolos

## Catatan

Kalau nanti ingin menambahkan flow lain selain QC dan packing, struktur ini sebaiknya diperluas dengan pendekatan yang sama:

- task sebagai atribut domain
- flow scan tetap dipakai ulang
- validasi duplicate berbasis kombinasi `resi + task + urutan status`

---

## Sumber: `22-rencana-pengembangan-settings.md`

# Rencana Pengembangan Halaman Settings

Dokumen ini merangkum arah pengembangan halaman `Settings` agar lebih rapi, fokus, dan mudah dipakai untuk operasional harian.

## Tujuan

- Membuat halaman Settings lebih mudah dipahami.
- Memisahkan pengaturan operasional dan branding secara jelas.
- Mengurangi elemen yang tidak perlu.
- Menambah feedback yang lebih jelas saat user mengubah konfigurasi.

## Arah Pengembangan

### 1. Rapikan Struktur Halaman

- Pisahkan halaman menjadi 2 bagian utama:
  - `Operational`
  - `Branding`
- `Operational` berisi:
  - folder video
  - format rekaman
  - perangkat kamera
  - bitrate
  - auto-open folder
- `Branding` berisi:
  - app name
  - tagline
  - brand mark

### 2. Tambahkan UX yang Lebih Aman

- Tampilkan status perubahan yang belum disimpan.
- Tambahkan informasi kapan konfigurasi terakhir tersimpan.
- Buat tombol reset per bagian, bukan hanya reset total.
- Tampilkan peringatan kalau folder video tidak valid atau tidak bisa diakses.

### 3. Perbaiki Pengelolaan Folder Video

- Tampilkan path aktif secara jelas.
- Tambahkan tombol untuk copy path.
- Tambahkan tombol buka folder.
- Validasi path di server agar error bisa dijelaskan dengan spesifik.

### 4. Sederhanakan Branding

- Branding sebaiknya tetap dibatasi ke:
  - app name
  - tagline
  - brand mark
- Warna tema tidak perlu jadi input user.
- Tema aplikasi bisa tetap fixed agar settings tidak terlalu penuh.

### 5. Tambahkan Feedback Teknis

- Tampilkan status koneksi server.
- Tampilkan status simpan terakhir.
- Tampilkan pesan error yang lebih spesifik.
- Tampilkan indikator kalau ada perubahan yang belum disimpan.

## Prioritas Implementasi

1. Rapikan layout dan struktur section.
2. Tambahkan feedback simpan/reset yang lebih jelas.
3. Tambahkan tombol copy/open folder.
4. Validasi path video di server.
5. Rapikan branding agar tetap minimal.

## Catatan

- Fokus utama halaman Settings adalah operasional.
- Jika nanti kebutuhan branding bertambah, lebih baik dipindah ke modal atau subsection kecil.
- Halaman ini sebaiknya tetap ringan dan tidak dipenuhi pengaturan yang jarang dipakai.

---

## Sumber: `23-rencana-pengembangan-history.md`

# Rencana Pengembangan Halaman History

Dokumen ini merangkum arah pengembangan halaman `History` agar pencarian, detail data, dan aksi terhadap rekaman video lebih cepat dipakai operator maupun admin.

## Tujuan

- Memperkuat pencarian dan filtering data rekaman.
- Membuat detail per resi lebih jelas.
- Menyediakan aksi cepat untuk file video dan metadata.
- Menangani kasus duplicate, repeat QC, dan data yang sudah tidak valid.

## Arah Pengembangan

### 1. Perkuat Pencarian dan Filter

- Tambahkan filter berdasarkan:
  - resi
  - task (`qc` / `packing`)
  - status
  - operator
  - rentang tanggal
- Tambahkan quick filter:
  - `QC only`
  - `Packing only`
  - `Completed`
  - `Error`
- Simpan filter terakhir yang digunakan agar tidak perlu set ulang setiap membuka halaman.

### 2. Buat Detail per Resi Lebih Jelas

- Saat user klik satu resi, tampilkan ringkasan semua rekaman terkait dalam satu panel.
- Bedakan video QC dan packing secara visual.
- Tampilkan urutan proses, status terakhir, dan operator yang memproses.
- Pastikan history tetap mudah dipindai walaupun satu resi punya banyak entri.

### 3. Tambahkan Aksi Cepat

- Preview video langsung dari list.
- Copy path file video.
- Copy resi atau metadata penting.
- Buka folder file video dari history.
- Download video dari browser bila diperlukan.

### 4. Tangani Duplicate dan Repeat QC

- Tampilkan indikator kalau resi pernah diulang QC.
- Jelaskan data mana yang sudah tidak valid karena repeat QC.
- Pisahkan tampilan data valid dan data yang di-invalidate.
- Hindari user salah membaca rekaman lama sebagai data aktif.

### 5. Tambahkan Export yang Lebih Berguna

- Export CSV atau XLSX berdasarkan filter aktif.
- Export data hanya QC, hanya packing, atau semua task.
- Sertakan metadata dan path file bila dibutuhkan.

### 6. Rapikan UX Mobile

- Buat panel detail lebih ringkas di layar kecil.
- Pastikan aksi penting tetap mudah diakses tanpa scroll berlebihan.
- Jaga ukuran tombol agar tetap nyaman dipakai di mobile.

## Prioritas Implementasi

1. Filter dan quick filter.
2. Detail per resi yang lebih jelas.
3. Aksi cepat untuk preview, copy, dan open folder.
4. Penanganan repeat QC dan data invalid.
5. Export yang lebih berguna.
6. Penyempurnaan UX mobile.

## Catatan

- Halaman `History` harus tetap cepat dipakai untuk audit data harian.
- Fokus utama adalah membedakan QC dan packing dengan jelas tanpa membuat UI terlalu berat.
- Kalau nanti data berkembang, struktur filter dan detail sebaiknya dibuat modular agar mudah diperluas.

---

## Sumber: `24-rencana-pengembangan-user.md`

# Rencana Pengembangan Halaman Users

Dokumen ini merangkum arah pengembangan halaman `Users` agar pengelolaan akun operator dan admin lebih cepat, aman, dan mudah diaudit.

## Tujuan

- Membuat pengelolaan akun lebih jelas dan terstruktur.
- Mempercepat pencarian user saat jumlah akun bertambah.
- Mengurangi risiko salah edit, salah reset password, atau salah hapus akun.
- Menyediakan status dan feedback yang lebih informatif saat aksi CRUD dijalankan.

## Arah Pengembangan

### 1. Perkuat Pencarian dan Filter

- Tambahkan filter berdasarkan:
  - role (`admin` / `operator`)
  - task (`qc` / `packing`)
  - status akun bila nanti diperlukan
- Pertahankan search global untuk:
  - full name
  - username
  - operator code
  - role
- Tambahkan quick filter:
  - `All`
  - `Admin only`
  - `Operator only`
  - `QC only`
  - `Packing only`
- Simpan filter terakhir agar user tidak perlu atur ulang setiap membuka halaman.

### 2. Rapikan Detail Akun

- Tampilkan ringkasan akun yang sedang dipilih dalam panel detail.
- Bedakan informasi utama dan metadata teknis secara visual.
- Tampilkan informasi berikut dengan lebih jelas:
  - full name
  - username
  - operator code
  - role
  - task
  - last used at
- Jika akun sedang diedit, tampilkan state edit secara tegas supaya user tahu data mana yang sedang aktif.

### 3. Perkuat Keamanan Aksi

- Tambahkan konfirmasi yang lebih jelas untuk aksi berisiko:
  - reset password
  - delete user
  - ubah role admin
- Tambahkan guard agar minimal satu admin tetap tersedia.
- Jika akun yang sedang dipakai session aktif diedit, tampilkan peringatan yang jelas.
- Sediakan indikator ketika username atau operator code bentrok dengan akun lain.

### 4. Tambahkan Aksi Cepat

- Copy username, operator code, dan full name langsung dari detail.
- Tambahkan tombol untuk membuka modal edit dari daftar.
- Tambahkan tombol reset password yang mudah dijangkau namun tetap aman.
- Tambahkan shortcut untuk membuat akun baru dengan nilai default yang relevan.

### 5. Tambahkan Feedback CRUD yang Lebih Jelas

- Tampilkan status berhasil/gagal untuk setiap aksi.
- Tampilkan pesan error yang spesifik dari server.
- Tampilkan loading state saat:
  - daftar user dimuat
  - form disimpan
  - password direset
  - user dihapus
- Pastikan feedback tidak menimpa pesan penting sebelumnya tanpa alasan.

### 6. Rapikan UX Mobile

- Buat daftar user tetap mudah dipindai di layar kecil.
- Pastikan tombol aksi tidak terlalu rapat.
- Pindahkan detail yang panjang ke panel atau modal yang lebih ringkas.
- Jaga agar form create/edit tetap nyaman diisi di mobile.

### 7. Siapkan Dasar Audit dan Ekstensi

- Jika nanti dibutuhkan, tambahkan riwayat perubahan user:
  - dibuat
  - diedit
  - reset password
  - dihapus
- Siapkan struktur agar nanti mudah menambah:
  - export CSV
  - import user massal
  - pencatatan last updated by

## Prioritas Implementasi

1. Filter dan search yang lebih kuat.
2. Keamanan aksi CRUD dan guard admin.
3. Feedback loading, sukses, dan error yang lebih jelas.
4. Penyempurnaan detail panel dan aksi cepat.
5. Penyempurnaan UX mobile.
6. Dasar audit dan fitur lanjutan.

## Catatan

- Halaman `Users` harus tetap ringan karena dipakai untuk tugas operasional harian.
- Validasi server tetap menjadi sumber kebenaran utama untuk akun dan role.
- Struktur UI sebaiknya modular agar nanti mudah ditambah audit log atau bulk action.

---

## Sumber: `25-rencana-admin-multi-task.md`

# Rencana Admin Multi-Task

Dokumen ini merangkum rencana penyesuaian agar user dengan role `admin` bisa menjalankan `qc` dan `packing` tanpa bentrok dengan alur operator biasa.

## Tujuan

- Memisahkan konsep `role` dari `task`.
- Membuat admin bisa memilih task aktif sebelum scan dimulai.
- Menjaga history tetap konsisten karena setiap rekaman tetap menyimpan task actual.
- Mencegah perubahan task saat recording masih berjalan.

## Prinsip Desain

### 1. Role Tidak Sama Dengan Task

- `role` hanya menentukan hak akses.
- `task` menentukan proses yang sedang dikerjakan.
- Admin harus dianggap fleksibel, bukan operator dengan task tunggal.

### 2. Admin Punya Task Aktif

- Admin boleh memilih `qc` atau `packing`.
- Pilihan task aktif berlaku untuk sesi login saat ini.
- Task aktif bisa diganti hanya saat status masih idle atau belum recording.

### 3. Data Rekaman Tetap Satu Task

- Setiap recording tetap menyimpan satu `taskType`.
- History tidak boleh menyatukan QC dan packing dalam satu field yang ambigu.
- Rekaman admin harus tetap bisa diaudit per task seperti operator biasa.

## Arah Implementasi

### 1. Perluas Model User dan Session

- Tambahkan konsep `allowedTasks` atau `taskMode` untuk profil user.
- Admin mendapatkan akses ke:
  - `qc`
  - `packing`
- Operator biasa tetap punya satu task default sesuai profil.
- Session login perlu menyimpan `activeTask`.

### 2. Tambahkan Task Switcher di Scan

- Tampilkan switcher task di halaman `Scan` untuk admin.
- Sembunyikan switcher untuk operator biasa.
- Default task bisa mengikuti pilihan terakhir atau default `qc`.
- Saat recording aktif, task switcher harus disabled atau meminta stop dulu.

### 3. Validasi di Server

- Server harus memeriksa apakah task yang dipilih valid untuk role user.
- Jika role `admin`, izinkan `qc` dan `packing`.
- Jika role `operator`, tolak task yang tidak sesuai profil.
- Backend tetap menjadi sumber kebenaran utama.

### 4. Rapikan UX di Users dan History

- Di halaman `Users`, tampilkan admin sebagai user fleksibel.
- Jangan paksa admin terlihat seperti operator dengan task tunggal.
- Di halaman `History`, tetap tampilkan task actual per record.
- Tambahkan label yang jelas kalau akun punya akses fleksibel.

### 5. Cegah Bentrok Saat Recording

- Ganti task hanya ketika sesi belum recording.
- Jangan ubah task aktif di tengah proses capture video.
- Jika user mencoba ganti task saat recording, tampilkan pesan yang jelas.

## Prioritas Implementasi

1. Ubah model session dan validasi task.
2. Tambahkan task switcher di Scan untuk admin.
3. Rapikan UI Users agar admin ditampilkan sebagai fleksibel.
4. Pastikan History tetap menyimpan task actual.
5. Tambahkan guard saat task diubah ketika recording aktif.

## Catatan

- Solusi yang paling aman adalah menyimpan `activeTask` di session, bukan di profil.
- Admin boleh berpindah task sebelum scan, tetapi tidak ketika recording sedang aktif.
- Dengan model ini, data history tetap bersih dan tidak bentrok dengan alur operator biasa.


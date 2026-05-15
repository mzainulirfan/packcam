# Plan Implementasi Tauri / Aplikasi Desktop

Dokumen ini memecah migrasi PackCam dari web/Vite ke desktop Tauri menjadi sub-tahap yang lebih kecil dan teknis.

## Tujuan Utama

- Menjadikan PackCam aplikasi desktop yang bisa dipakai offline.
- Memindahkan penyimpanan video ke filesystem lokal.
- Memindahkan data operasional ke SQLite lokal.
- Mempertahankan workflow operator yang sudah stabil di versi web.

## Prinsip Migrasi

- Pindahkan satu lapis dulu, jangan sekaligus.
- UI dipertahankan sebanyak mungkin.
- Layer data dipisah dari komponen UI.
- Fitur web-only diganti bertahap dengan fitur desktop-native.
- Setiap sub-tahap harus bisa diverifikasi sendiri.

## Tahap 0 - Persiapan Teknis

Tujuan: menyiapkan batas kerja sebelum masuk Tauri.

### 0.1 Inventarisasi browser-only

- `localStorage`
- `IndexedDB`
- `showDirectoryPicker`
- `MediaRecorder` web
- preview video berbasis blob browser

### 0.2 Inventarisasi fitur desktop

- filesystem lokal
- SQLite
- dialog folder native
- dialog file native
- window app desktop

### 0.3 Kunci ruang lingkup

- UI React tetap dipakai ulang.
- State aplikasi tetap dipertahankan.
- Perubahan utama difokuskan ke data dan filesystem.

Hasil:

- Daftar jelas bagian mana yang harus diganti dan bagian mana yang tetap dipakai.

## Tahap 1 - Bootstrap Tauri

Tujuan: aplikasi bisa dijalankan sebagai desktop app dasar tanpa mengubah perilaku UI.

### 1.1 Pasang Tauri

- Tambahkan dependency Tauri.
- Siapkan konfigurasi dasar Tauri.
- Tambahkan command build desktop.

### 1.2 Buat entry desktop

- Siapkan entry untuk mode desktop.
- Pastikan mode web tetap jalan.
- Pastikan mode desktop bisa dibuka tanpa memecah UI yang ada.

### 1.3 Window dasar

- Atur ukuran window awal.
- Atur title aplikasi.
- Atur icon dasar.

### 1.4 Smoke test

- Buka aplikasi desktop.
- Pastikan React app ter-render.
- Pastikan navigasi dasar masih jalan.

Hasil:

- PackCam bisa dibuka sebagai shell desktop awal.

## Tahap 2 - Abstraksi Data

Tujuan: membuat satu layer data yang bisa dipakai baik di web sementara maupun di desktop nanti.

### 2.1 Definisikan repository

- repository `operator`
- repository `settings`
- repository `system config`
- repository `recordings`
- repository `scan logs`
- repository `last error`

### 2.2 Tentukan kontrak data

- model `operator profile`
- model `operator session`
- model `recording record`
- model `scan log`
- model `app settings`
- model `system config`

### 2.3 Pisahkan akses storage

- UI tidak membaca storage langsung.
- UI hanya memanggil service/repository.
- Simpan data lewat satu jalur yang konsisten.

### 2.4 Siapkan migrasi dari browser

- baca data lama dari `localStorage`/`IndexedDB` jika ada.
- pindahkan ke storage desktop jika perlu.
- jangan hilangkan data lama tanpa proses migrasi yang jelas.

Hasil:

- UI sudah siap pindah ke SQLite tanpa bongkar besar-besaran.

## Tahap 3 - SQLite Lokal

Tujuan: mengganti storage browser dengan database desktop.

### 3.1 Buat skema database

- `operator_profiles`
- `operator_session`
- `app_settings`
- `system_config`
- `recordings`
- `scan_logs`
- `last_error`

### 3.2 Buat migrasi

- migrasi schema awal
- migrasi data legacy
- migrasi perubahan field jika ada revisi

### 3.3 CRUD dasar

- create
- read
- update
- delete
- query filter untuk history dan users

### 3.4 Validasi data

- cegah duplikasi user
- cegah duplikasi kode operator
- cegah data recording duplicate yang tidak valid

Hasil:

- Data operasional tersimpan di SQLite lokal.

## Tahap 4 - Filesystem Video

Tujuan: video tersimpan sebagai file asli, bukan blob browser.

### 4.1 Resolver path

- tentukan root folder video
- tentukan struktur folder tanggal
- tentukan naming file rekaman

### 4.2 Writer video

- tulis file hasil rekaman ke disk
- simpan metadata path di SQLite

### 4.3 Recovery file

- deteksi file yang belum tersimpan sempurna
- ulangi save jika perlu
- tandai error jika file gagal dibuat

### 4.4 Preview file lokal

- preview di history membaca file asli
- support video player dari path lokal

Hasil:

- Rekaman benar-benar menjadi file video di komputer user.

## Tahap 5 - Kamera dan Recording Desktop

Tujuan: workflow scan dan record tetap sama di desktop.

### 5.1 Akses kamera

- uji permission kamera
- pilih device kamera
- preview kamera tetap aktif

### 5.2 Pipeline record

- scan resi pertama mulai rekam
- scan resi sama melanjutkan proses
- scan resi baru memicu save lalu lanjut
- tombol stop tetap menyimpan sesi terakhir

### 5.3 Watermark

- watermark resi
- watermark waktu
- watermark benar-benar terbakar ke video hasil rekam

### 5.4 Error handling

- kamera gagal
- device tidak ada
- permission ditolak
- recorder gagal start/stop

Hasil:

- Alur operasional kamera dan recording tetap stabil di desktop.

## Tahap 6 - Auth, User, dan Role

Tujuan: auth lokal desktop tetap konsisten dengan perilaku sekarang.

### 6.1 Session login

- simpan session operator aktif di storage desktop
- login hanya untuk akun yang sudah ada

### 6.2 Role

- `admin`
- `operator`

### 6.3 Pembatasan akses

- `Users`
- `Settings`
- `Health`

### 6.4 Data user

- username
- kode operator
- password hash
- full name
- role

Hasil:

- Sistem auth tetap berjalan seperti sekarang, tapi storage-nya desktop-native.

## Tahap 7 - History, Preview, Export

Tujuan: fitur riwayat bekerja dengan file lokal dan SQLite.

### 7.1 History query

- filter by user
- filter by status
- filter by date
- search by resi/file/path

### 7.2 Preview modal

- preview video modal tetap ada
- tombol download
- tombol copy path

### 7.3 Export

- CSV
- Excel-compatible XML
- mengikuti data yang sedang terfilter

### 7.4 Pagination

- tampil hanya jika data melewati satu halaman

Hasil:

- History tetap jadi pusat verifikasi hasil rekaman.

## Tahap 8 - Settings Desktop

Tujuan: mengganti kontrol browser-only dengan kontrol desktop-native jika perlu.

### 8.1 Folder picker native

- pilih folder video lewat dialog native
- simpan root path ke SQLite

### 8.2 Brand config

- app name
- tagline
- brand mark
- primary color
- accent color

### 8.3 Config operasional

- format video
- resolusi
- bitrate
- kamera default
- auto open folder

Hasil:

- Settings siap dipakai di desktop tanpa ketergantungan browser picker.

## Tahap 9 - Packaging

Tujuan: menghasilkan build desktop yang bisa dipasang.

### 9.1 Build release

- build debug
- build release
- cek asset output

### 9.2 Installer

- Windows installer
- icon aplikasi
- metadata versi

### 9.3 Validasi distribusi

- install bersih
- run pertama
- run setelah update

Hasil:

- Aplikasi siap didistribusikan.

## Tahap 10 - Hardening Desktop

Tujuan: memastikan aplikasi aman dipakai harian.

### 10.1 Crash recovery

- app ditutup saat recording
- app crash saat save
- app restart saat ada sesi aktif

### 10.2 Storage tests

- disk penuh
- permission folder gagal
- SQLite rusak / locked

### 10.3 Kamera tests

- kamera ditolak
- kamera dipakai app lain
- device dilepas

### 10.4 Data migration

- migrasi dari versi web
- migrasi dari schema lama

Hasil:

- Aplikasi desktop lebih tahan dipakai operasional.

## Urutan Implementasi yang Disarankan

1. Tahap 0: persiapan teknis
2. Tahap 1: bootstrap Tauri
3. Tahap 2: abstraksi data
4. Tahap 3: SQLite lokal
5. Tahap 4: filesystem video
6. Tahap 5: kamera dan recording desktop
7. Tahap 6: auth, user, dan role
8. Tahap 7: history, preview, export
9. Tahap 8: settings desktop
10. Tahap 9: packaging
11. Tahap 10: hardening

## Kriteria Selesai

- PackCam bisa dijalankan sebagai aplikasi desktop.
- Data tersimpan di SQLite lokal.
- Video tersimpan sebagai file lokal.
- Workflow operator tetap sama seperti versi web.
- UI tetap konsisten dengan design system PackCam.

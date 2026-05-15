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

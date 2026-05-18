# 26 - Stack dan Arsitektur Aplikasi

Dokumen ini menjelaskan teknologi yang dipakai Pakti dan bagaimana komponen aplikasinya saling terhubung.

## Ringkasan Stack

- Frontend: React 19
- Bahasa utama: TypeScript
- Build tool: Vite
- Styling: Tailwind CSS
- Ikon: Lucide React dan Boxicons
- Backend API: Node.js dengan Express
- Storage lokal: SQLite melalui `better-sqlite3`
- Utilitas dev server: `tsx`

## Pembagian Komponen

### Frontend

Frontend berjalan di browser dan menangani:

- tampilan login
- halaman dashboard
- input scan barcode
- preview kamera
- history rekaman
- pengelolaan user
- pengaturan sistem dan branding

### Backend API

Backend berjalan sebagai server lokal dan menangani:

- autentikasi session
- penyimpanan dan pembacaan data aplikasi
- pengelolaan user/operator
- pengaturan sistem
- pembuatan dan pembaruan recording
- log scan dan history
- akses file video dan storage pendukung

### Database

Data aplikasi disimpan di SQLite pada folder `server-data`.

Data yang disimpan antara lain:

- profil user/operator
- session login
- recording video
- log scan
- pengaturan aplikasi
- konfigurasi branding
- status bootstrap dan error terakhir

## Alur Runtime

1. Browser memuat aplikasi frontend.
2. Frontend membaca session dan konfigurasi dari API lokal.
3. Jika user login valid, dashboard ditampilkan.
4. Saat scan dimulai, frontend berkomunikasi dengan backend untuk validasi dan pencatatan proses.
5. Rekaman video dan metadata disimpan ke storage lokal.
6. History, user, settings, dan health membaca data yang sama dari backend.

## Kenapa Struktur Ini Dipakai

- UI tetap ringan karena logic utama dibagi antara browser dan server lokal.
- Data lebih konsisten karena semua halaman membaca sumber yang sama.
- Storage lokal cocok untuk workflow operasional yang berjalan di satu perangkat.
- Backend API membuat proses login, recording, dan history lebih mudah divalidasi.

## Catatan Implementasi

- Frontend dibangun dengan Vite agar cepat di dev dan build.
- Backend dijalankan sebagai proses terpisah supaya API dan UI bisa dikontrol sendiri.
- SQLite dipilih karena sederhana, cepat, dan tidak butuh database server tambahan.
- Kamera diproses lewat browser API, jadi aplikasi harus dijalankan pada environment yang mengizinkan akses kamera.

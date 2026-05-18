# Pakti

Pakti adalah aplikasi web untuk merekam proses QC dan packing paket secara lebih rapi. Aplikasi ini dipakai untuk login operator, memindai resi, merekam proses packing lewat kamera, menyimpan history rekaman, dan mengelola data operasional dari satu dashboard.

## Fitur

- Login operator berbasis username dan password
- Scan resi lewat input barcode atau input manual
- Preview kamera sebelum dan saat recording
- Recording video per resi
- History rekaman dengan filter, detail, preview, dan export
- Manajemen user/operator untuk admin
- Pengaturan aplikasi dan branding
- Halaman health untuk cek status data dan reset

## Stack

- React 19
- TypeScript
- Vite
- Tailwind CSS
- SQLite berbasis web untuk penyimpanan data aplikasi

## Struktur Halaman

- `Scan` untuk input resi, preview kamera, dan proses recording
- `History` untuk melihat, memfilter, dan mengekspor rekaman
- `Users` untuk mengelola akun operator
- `Settings` untuk pengaturan video, kamera, folder output, dan branding
- `Health` untuk cek status data dan reset storage

## Menjalankan Project

```bash
npm install
npm run dev:full
```

## Build

```bash
npm run build
```

## Script Tersedia

- `npm run dev` - jalankan Vite dev server saja
- `npm run dev:full` - jalankan frontend dan backend API sekaligus
- `npm run api:dev` - jalankan backend API saja
- `npm run build` - build frontend
- `npm run preview` - preview hasil build
- `npm run lint` - jalankan ESLint

## Data dan Penyimpanan

- Di browser, data aplikasi disimpan ke SQLite berbasis web
- Folder video default berada di `Documents/Pakti/videos`
- Format video default adalah `webm`

## Konfigurasi Default

- Nama aplikasi: `Pakti`
- Tagline: `Aplikasi yang membantu UMKM merekam proses QC dan packing paket secara lebih rapi.`
- Warna utama: `#111113`
- Warna aksen: `#4f46e5`

## Catatan

- Aplikasi ini memakai kamera perangkat dan `MediaRecorder`, jadi jalankan di environment yang mengizinkan akses kamera.
- Halaman `Users` dan beberapa menu administrasi hanya tersedia untuk role `admin`.
- Untuk setup admin pertama, backend API harus aktif. Gunakan `npm run dev:full` agar frontend dan API berjalan bersama.

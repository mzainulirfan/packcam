# PackCam

PackCam adalah aplikasi perekaman packing berbasis barcode resi. Aplikasi ini dipakai untuk login operator, memindai resi, merekam proses packing lewat kamera, menyimpan history rekaman, dan mengelola data operasional dari satu dashboard.

## Fitur

- Login operator berbasis username dan password
- Scan resi lewat input barcode atau input manual
- Preview kamera sebelum dan saat recording
- Recording video per resi
- History rekaman dengan filter, detail, preview, dan export
- Manajemen user/operator untuk admin
- Pengaturan aplikasi dan branding
- Halaman health untuk cek runtime, data, dan reset

## Stack

- React 19
- TypeScript
- Vite
- Tauri 2 untuk mode desktop
- SQLite di runtime desktop

## Struktur Halaman

- `Scan` untuk input resi, preview kamera, dan proses recording
- `History` untuk melihat, memfilter, dan mengekspor rekaman
- `Users` untuk mengelola akun operator
- `Settings` untuk pengaturan video, kamera, folder output, dan branding
- `Health` untuk cek status runtime dan reset data

## Menjalankan Project

### Mode Web

```bash
npm install
npm run dev
```

### Mode Desktop Tauri

```bash
npm install
npm run tauri:dev
```

## Build

### Build Web

```bash
npm run build
```

### Build Desktop

```bash
npm run tauri:build
```

## Script Tersedia

- `npm run dev` - jalankan Vite dev server
- `npm run build` - build frontend
- `npm run preview` - preview hasil build
- `npm run lint` - jalankan ESLint
- `npm run tauri:dev` - jalankan aplikasi desktop dalam mode development
- `npm run tauri:build` - build aplikasi desktop

## Data dan Penyimpanan

- Di browser, data disimpan lewat storage web
- Di desktop Tauri, data disimpan lewat backend SQLite
- Folder video default berada di `Documents/PackCam/videos`
- Format video default adalah `webm`

## Konfigurasi Default

- Nama aplikasi: `PackCam`
- Tagline: `Perekaman packing berbasis scan barcode resi.`
- Warna utama: `#111113`
- Warna aksen: `#4f46e5`

## Catatan

- Aplikasi ini memakai kamera perangkat dan `MediaRecorder`, jadi jalankan di environment yang mengizinkan akses kamera.
- Halaman `Users` dan beberapa menu administrasi hanya tersedia untuk role `admin`.

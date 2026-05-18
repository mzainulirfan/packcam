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

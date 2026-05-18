# 27 - Checklist Migrasi ke shadcn/ui

Checklist ini dipakai untuk migrasi bertahap dari komponen UI lokal ke shadcn/ui tanpa merusak layout dan alur kerja Pakti.

## Target Utama

- [ ] Menyeragamkan pola komponen UI ke standar shadcn/ui
- [ ] Mempermudah maintenance komponen dasar
- [ ] Mempertahankan visual dan perilaku khas Pakti
- [ ] Menghindari rewrite besar yang berisiko merusak halaman aktif

## Checklist Implementasi

### 1. Audit Komponen

- [ ] Inventaris semua komponen di `src/components/ui`
- [ ] Kelompokkan komponen dasar yang bisa diganti langsung
- [ ] Kelompokkan komponen interaktif yang butuh Radix primitives
- [ ] Kelompokkan komponen custom yang lebih baik tetap dipertahankan
- [ ] Tetapkan urutan prioritas migrasi

Target awal:

- [ ] `Button`
- [ ] `Input`
- [ ] `Card`
- [ ] `Label`
- [ ] `Alert`
- [ ] `Separator`

### 2. Pasang Dependensi

- [ ] Tambahkan dependensi shadcn/ui yang diperlukan
- [ ] Tambahkan Radix primitives yang dibutuhkan komponen interaktif
- [ ] Cek apakah ada utilitas tambahan yang perlu dipakai
- [ ] Pastikan dependensi tidak bentrok dengan stack yang sudah ada

### 3. Migrasi Komponen Dasar

- [ ] Migrasikan `Button` ke pola shadcn/ui
- [ ] Migrasikan `Input` ke pola shadcn/ui
- [ ] Migrasikan `Card` ke pola shadcn/ui
- [ ] Migrasikan `Label` ke pola shadcn/ui
- [ ] Migrasikan `Alert` ke pola shadcn/ui
- [ ] Migrasikan `Separator` ke pola shadcn/ui
- [ ] Tetap gunakan `cn`
- [ ] Tetap gunakan `class-variance-authority`
- [ ] Jaga prop interface tetap kompatibel

### 4. Migrasi Dialog dan Overlay

- [ ] Audit semua modal dan dialog yang ada
- [ ] Migrasikan overlay modal ke pola shadcn/ui atau setara
- [ ] Pertahankan `static backdrop`
- [ ] Pertahankan tombol close yang konsisten
- [ ] Pertahankan layout modal yang ringkas
- [ ] Verifikasi modal di halaman History
- [ ] Verifikasi modal di halaman Users
- [ ] Verifikasi modal di halaman Settings
- [ ] Verifikasi modal di halaman Health

### 5. Rapikan Komponen Kompleks

- [ ] Audit komponen kompleks yang masih custom
- [ ] Pertimbangkan migrasi dropdown
- [ ] Pertimbangkan migrasi tabs
- [ ] Pertimbangkan migrasi toast
- [ ] Pertimbangkan migrasi popover
- [ ] Pertimbangkan migrasi helper table jika memang diperlukan
- [ ] Pertahankan komponen yang sangat domain-specific jika lebih cocok custom

### 6. Verifikasi Per Halaman

- [ ] Cek halaman Scan
- [ ] Cek halaman History
- [ ] Cek halaman Users
- [ ] Cek halaman Settings
- [ ] Cek halaman Login
- [ ] Cek halaman Welcome
- [ ] Pastikan spacing tetap konsisten
- [ ] Pastikan responsive layout tetap aman
- [ ] Pastikan akses mobile tetap nyaman
- [ ] Pastikan perilaku modal tetap benar
- [ ] Pastikan state interaksi tidak berubah

## Komponen yang Sebaiknya Tetap Custom

- [ ] `CameraPreview`
- [ ] `BarcodeInput`
- [ ] `StageCard`
- [ ] Komponen workflow recording
- [ ] Komponen yang sangat spesifik ke domain operasional Pakti

## Risiko yang Perlu Dipantau

- [ ] Perubahan spacing antar komponen
- [ ] Perubahan perilaku modal dan backdrop
- [ ] Perubahan ukuran tombol dan input
- [ ] Perubahan pada komponen yang punya state kompleks
- [ ] Perubahan kecil yang memicu regresi layout di mobile

## Kriteria Selesai

- [ ] Komponen dasar UI sudah mengikuti pola shadcn/ui
- [ ] Halaman utama tetap berfungsi sama
- [ ] Tidak ada regresi lint atau build
- [ ] Tampilan tetap konsisten dengan identitas visual Pakti

## Catatan

- [ ] Migrasi tidak wajib 100 persen
- [ ] Komponen lokal boleh dipertahankan jika memang lebih cocok untuk kebutuhan aplikasi
- [ ] Fokus utama adalah konsistensi, kemudahan maintenance, dan stabilitas UI

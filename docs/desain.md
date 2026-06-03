# Desain Pakti Packcam

Tanggal konsolidasi: 2026-06-03

Dokumen ini menjadi sumber desain produk dan UI Pakti Packcam.

## Arah Desain

Pakti Packcam adalah alat kerja operasional. UI harus terasa cepat, ringkas, dan mudah dipindai saat operator sedang memegang paket, scanner, atau ponsel.

Karakter desain:

- Utilitarian dan jelas.
- Visual bersih dengan permukaan terang di web dashboard.
- Mobile boleh lebih kontras, tetapi tetap fokus ke task.
- Status proses harus langsung terbaca.
- Aksi utama selalu dekat dengan konteksnya.

## Struktur Layar

- Login dan bootstrap admin.
- Dashboard web dengan grup Operasional dan Administrasi.
- Scan sebagai workflow utama.
- History untuk audit bukti rekaman.
- Users untuk akun operator.
- Settings untuk operasional dan branding.
- Health/Admin untuk diagnosa dan audit server.
- Mobile untuk scan, history, session, theme, dan menu sheet.

## Prinsip UI

- Ikuti design system yang sudah ada.
- Hindari halaman marketing.
- Gunakan modal untuk preview, detail, export, dan aksi destruktif.
- Gunakan badge kecil untuk status.
- Gunakan select untuk pilihan finite seperti task, status, format, dan camera device.
- Text panjang seperti path file harus truncate atau break-all.

## Sumber Gabungan

- `12-design-system.md`
- `11-redesign-halaman-scan.md`
- `16-redesign-halaman-login.md`
- `27-rencana-migrasi-shadcn-ui.md`

---

## Sumber: `12-design-system.md`

# Pakti Design System

Dokumen ini merangkum gaya visual Pakti yang saat ini sudah dipakai di UI, supaya konsisten saat menambah halaman, komponen, atau detail interaksi baru.

## Prinsip Dasar

- Minimalis, tegas, dan fungsional.
- Fokus ke operasional operator, bukan dekorasi.
- Hierarki visual harus jelas: judul, kontrol, isi, lalu status.
- Semua elemen harus terasa ringan, rapat, dan mudah dipindai.
- Hindari efek visual yang terlalu ramai atau bergerak tanpa tujuan.

## Warna

### Warna Utama

- `--brand`: `#111113`
- Dipakai untuk:
  - brand mark
  - tombol utama
  - state aktif
  - teks paling tegas

### Warna Pendukung

- `--brand-soft`: `#f2f2f3`
- `--brand-accent`: `#4f46e5`
- `--brand-contrast`: `#ffffff`

### Warna Netral

- `--bg`: `#f7f7f5`
- `--surface`: `#ffffff`
- `--border`: `#e5e5e1`
- `--text`: `#4e4e55`
- `--text-muted`: `#71717a`
- `--text-strong`: `#111113`

### Arah Pemakaian

- Background aplikasi harus netral dan terang.
- Surface card tetap putih.
- Border tipis dan halus.
- Aksen warna dipakai secukupnya, bukan dominan.

## Tipografi

- Font utama: `Inter`.
- Judul harus singkat dan tegas.
- Teks bantu harus lebih kecil dan lebih muted.
- Uppercase hanya untuk label kecil, status, dan eyebrow.
- Hindari paragraf panjang jika bisa diganti dengan label singkat.

### Skala Umum

- Judul halaman: sekitar `1rem` sampai `1.1rem`
- Judul section: sekitar `0.95rem` sampai `1rem`
- Label kecil: sekitar `0.72rem`
- Teks bantu: sekitar `0.76rem` sampai `0.85rem`

## Layout

### Shell Utama

- Layout utama berbentuk dashboard full-page.
- Sidebar di kiri, content di kanan.
- Content tidak di-center.
- Header harus compact dan sticky/fixed sesuai kebutuhan halaman.

### Grid Dasar

- Gunakan grid dua kolom untuk halaman yang butuh detail panel.
- Gunakan satu kolom penuh jika fokus utama ada pada tabel atau form utama.
- Hindari wrapper lebar yang terlalu besar jika tidak diperlukan.

## Sidebar

- Sidebar bersifat full sidebar, bukan rail kecil.
- Menu dikelompokkan berdasarkan fungsionalitas:
  - Operasional
  - Administrasi
- Brand block harus ringkas.
- Menu item harus rapat dan jelas.
- Hover cukup berupa background halus.
- Active state lebih tegas daripada hover, tetapi tidak berlebihan.

### Menu Item

- Icon memakai `Boxicons`.
- Icon tidak perlu dibungkus kotak.
- Icon dan label harus sejajar.
- Jarak antar menu harus rapat, tanpa efek pergeseran saat hover.

## Header

- Header minimalis.
- Hindari card status yang berat.
- Username operator ditampilkan singkat.
- Jika ada scroll, header boleh memakai blur tipis dan border/shadow ringan.

## Card dan Surface

- Card memakai radius kecil sampai sedang, biasanya `12px` sampai `14px`.
- Border tipis, tidak tebal.
- Padding card tidak terlalu longgar.
- Section penting bisa memakai card, tetapi jangan semua elemen dibuat card jika tidak perlu.

## Tombol

### Bentuk

- Rounded moderat, bukan pill penuh.
- Radius umum: `10px` sampai `12px`.
- Tinggi tombol harus nyaman disentuh, tetapi tetap compact.

### Varian

- `action-button`: tombol netral.
- `action-button--primary`: aksi utama.
- `action-button--danger`: aksi destruktif.

### Aturan Pakai

- Satu konteks hanya butuh satu tombol utama.
- Tombol netral untuk aksi pendukung.
- Tombol danger harus dipakai untuk aksi penghapusan data.

## Form Field

### Bentuk

- Field berbentuk rounded tipis.
- Border netral.
- Focus state jelas, tapi tidak mencolok.
- Label selalu di atas field.

### Ukuran

- Field harus compact.
- Tinggi field tidak terlalu besar.
- Padding internal rapat agar form terasa padat dan efisien.

### Validasi

- State error memakai ring/border merah.
- Teks error juga merah.
- Jangan pakai banyak copy jika bisa disederhanakan.

## Table

- Tabel adalah komponen utama untuk data list.
- Header tabel harus uppercase kecil.
- Row padding rapat.
- Hover row halus.
- Baris aktif diberi highlight ringan.
- Aksi di kolom kanan harus rapi dan tidak terlalu lebar.
- Pagination disembunyikan jika data belum melewati batas halaman.

## Status

### Record Status

- `completed`: hijau lembut
- `recording`: kuning/coklat lembut
- `error`: merah lembut
- `idle`: netral

### Prinsip

- Status harus cepat dibaca.
- Jangan gunakan warna yang terlalu terang.
- Badge status harus kecil dan konsisten.

## Modal

- Modal dipakai untuk aksi penting:
  - preview
  - confirm delete
  - range date
- Width modal mengikuti kebutuhan, tetapi tetap ringkas.
- Modal harus punya header, body, dan actions yang jelas.
- Konfirmasi destruktif harus selalu muncul lewat modal peringatan.

## Komponen Khusus

### Health

- Dipakai untuk diagnosa dan reset data.
- Reset scan-only dan reset all data harus dibedakan jelas.
- Reset all data harus memakai modal peringatan yang eksplisit.

### Users

- Tabel user harus compact.
- Nama user bisa diklik untuk edit.
- Role selector memakai button radio.
- Password field harus punya toggle eye inline.

### History

- Filter bar harus compact.
- Preview video ada di modal.
- Operator filter hanya tampil untuk admin.
- Pagination hanya tampil saat data melewati satu halaman.

### Scan

- Fokus utama:
  - input resi
  - preview kamera
  - status proses
  - alert operasional
- Elemen yang tidak penting harus dihilangkan.

## Spacing

- Gunakan spacing kecil dan konsisten.
- Jarak umum antar elemen: `8px`, `10px`, `12px`, `14px`, `16px`.
- Hindari gap besar jika tidak memberi nilai fungsi.

## Motion

- Motion harus sangat ringan.
- Boleh dipakai untuk:
  - hover state
  - blur header saat scroll
  - modal open/close
- Hindari animasi berlebihan.

## Do and Don't

### Do

- Gunakan permukaan putih dan border tipis.
- Buat status dan aksi tegas, singkat, dan jelas.
- Gunakan layout yang kompak dan efisien.

### Don't

- Jangan center-kan dashboard.
- Jangan gunakan banyak card dekoratif.
- Jangan beri shadow atau glow berlebihan.
- Jangan membuat tombol, field, dan badge terlalu besar tanpa alasan.

## Ringkasan Token Utama

- Background: `#f7f7f5`
- Surface: `#ffffff`
- Border: `#e5e5e1`
- Text utama: `#111113`
- Text biasa: `#4e4e55`
- Text muted: `#71717a`
- Brand utama: `#111113`
- Accent: `#4f46e5`

## Catatan Implementasi

- Jika ingin mengubah style global, mulai dari token warna di `src/index.css`.
- Jika ingin mengubah struktur komponen, ikuti pola yang sudah dipakai di `App.css`.
- Saat menambah halaman baru, pastikan style-nya tetap mengarah ke bahasa visual ini.

---

## Sumber: `11-redesign-halaman-scan.md`

# Tahap 11 - Redesign Halaman Scan

## Tujuan

Menyederhanakan halaman `Scan` agar lebih fokus ke alur kerja operator saat input resi dan proses rekam berlangsung.

## Ruang Lingkup

- Tata ulang layout halaman `Scan` agar lebih ringan dan mudah dipindai.
- Prioritaskan komponen utama:
  - input scan resi
  - status proses
  - preview kamera
  - status rekaman
- Hilangkan elemen visual yang tidak mendukung workflow inti.
- Pertahankan watermark resi dan waktu pada preview kamera.
- Pastikan tampilan tetap nyaman di desktop dan mobile.

## Arah Desain

- Layout dibuat sederhana, informatif, dan operasional.
- Input resi harus menjadi fokus utama.
- Preview kamera harus tetap dominan.
- Notifikasi proses dibuat singkat dan jelas.
- Hindari card, label, dan teks tambahan yang mengganggu fokus.

## Tugas

1. Rapikan struktur konten halaman `Scan`.
2. Sederhanakan panel input resi dan feedback status.
3. Buat panel kamera lebih jelas sebagai area utama proses.
4. Kurangi elemen dekoratif yang tidak diperlukan.
5. Pastikan status `recording`, `queued`, `saving`, dan `completed` tetap mudah dibaca.
6. Tinjau ulang spacing, border, dan hierarchy visual.
7. Uji responsif pada ukuran layar kecil dan besar.

## Hasil yang Diharapkan

- Halaman `Scan` terasa lebih bersih dan cepat dipahami.
- Operator bisa langsung fokus ke scan dan monitoring rekaman.
- Tidak ada elemen UI yang membuat halaman terasa penuh atau berat.
- Alur kerja tetap jelas tanpa mengorbankan informasi penting.

## Selesai Jika

- Layout Scan sudah minimal dan konsisten.
- Tidak ada elemen yang tidak diperlukan tersisa.
- Input resi, preview kamera, dan status rekam tampil paling dominan.
- Tampilan tetap stabil di desktop dan mobile.

---

## Sumber: `16-redesign-halaman-login.md`

# Tahap 16 - Redesign Halaman Login

## Tujuan

Mendesain ulang halaman login agar lebih modern, rapi, dan terasa konsisten dengan pendekatan UI berbasis Tailwind CSS dan shadcn/ui.

## Kondisi Saat Ini

- Halaman login masih memakai class manual dari `src/App.css`.
- Struktur login masih sederhana dan belum memakai komponen UI yang terstandar.
- Proyek belum memiliki setup Tailwind CSS maupun shadcn/ui.
- Layar login juga dipakai pada alur first-run/admin setup, jadi perubahan perlu mempertimbangkan ulang pemakaian gaya yang sama.

## Ruang Lingkup

- Redesign halaman login operator di `src/pages/OperatorLoginPage.tsx`.
- Tinjau ulang layar login terkait first-run bila masih memakai pola visual yang sama.
- Migrasi styling login dari CSS manual ke Tailwind CSS.
- Gunakan komponen shadcn/ui untuk elemen yang umum:
  - `Card`
  - `Button`
  - `Input`
  - `Label`
  - `Alert` atau komponen status yang setara
  - `Separator` bila diperlukan
- Pertahankan alur login yang sudah ada:
  - input username
  - input password
  - toggle tampil/sembunyikan password
  - status pesan error dan info
  - loading state saat submit

## Arah Desain

- Tampilan harus lebih bersih, fokus, dan mudah dipindai.
- Hierarki visual perlu jelas:
  - brand
  - judul login
  - deskripsi singkat
  - form
  - feedback status
- Gunakan layout yang terasa modern tetapi tetap ringan untuk aplikasi desktop.
- Hindari dekorasi berlebihan yang tidak membantu proses login.
- Buat pengalaman mobile tetap nyaman, walau prioritas utama tetap desktop.
- Pastikan style tetap cocok dengan karakter Pakti: tegas, operasional, dan tidak ramai.

## Rencana Kerja

1. Audit struktur login yang ada saat ini.
2. Tambahkan dan konfigurasi Tailwind CSS ke proyek.
3. Setup shadcn/ui dan komponen dasar yang dibutuhkan untuk login.
4. Tentukan ulang layout login:
   - container utama
   - panel brand / informasi aplikasi
   - panel form login
   - area pesan status
5. Refactor `OperatorLoginPage.tsx` agar memakai komponen shadcn/ui.
6. Pindahkan styling spesifik login dari `App.css` ke utility Tailwind atau komponen baru.
7. Rapikan state interaksi:
   - validasi input kosong
   - state loading
   - pesan error
   - toggle password visibility
8. Uji responsif pada ukuran layar kecil, sedang, dan besar.
9. Uji aksesibilitas dasar:
   - label input
   - focus state
   - kontras warna
   - navigasi keyboard
10. Bersihkan style lama yang sudah tidak dipakai.

## Detail Implementasi

### Setup Awal

- Tambahkan konfigurasi Tailwind CSS sesuai struktur Vite yang dipakai proyek.
- Buat atau sesuaikan file token global bila diperlukan.
- Tambahkan setup shadcn/ui yang sesuai dengan pola proyek React saat ini.

### Desain Layout

- Gunakan satu layout login yang lebih terstruktur, misalnya:
  - panel kiri untuk brand dan value proposition
  - panel kanan untuk form login
- Jika layar terlalu sempit, ubah menjadi satu kolom.
- Area form harus tetap menjadi fokus utama.

### Komponen Form

- Gunakan `Input` dan `Label` yang konsisten.
- Gunakan `Button` untuk aksi login dan toggle password.
- Tampilkan pesan validasi/error dengan komponen status yang jelas.
- Pastikan loading state tetap terlihat saat proses autentikasi berlangsung.

### Konsistensi Visual

- Tetapkan token warna, radius, spacing, dan shadow yang konsisten.
- Batasi variasi ukuran komponen agar login terasa ringkas.
- Pertahankan identitas brand Pakti melalui logo/mark, judul aplikasi, dan tagline.

## File yang Kemungkinan Terdampak

- `src/pages/OperatorLoginPage.tsx`
- `src/pages/WelcomePage.tsx`
- `src/App.css`
- `src/index.css`
- file konfigurasi Tailwind dan shadcn/ui

## Hasil yang Diharapkan

- Halaman login terlihat lebih modern dan profesional.
- Struktur UI lebih konsisten dengan shadcn/ui.
- Styling login lebih mudah dirawat karena memakai utility Tailwind.
- Alur login tetap sederhana dan cepat dipakai operator.
- Layout tetap stabil di desktop dan mobile.

## Selesai Jika

- Tailwind CSS dan shadcn/ui sudah aktif di proyek.
- Halaman login sudah memakai komponen baru, bukan lagi mengandalkan styling manual lama.
- Toggle password, loading state, dan pesan error tetap berjalan.
- Tampilan login sudah diuji di beberapa ukuran layar.
- Tidak ada style login lama yang masih aktif tanpa sengaja.

---

## Sumber: `27-rencana-migrasi-shadcn-ui.md`

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


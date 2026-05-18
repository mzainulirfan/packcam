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

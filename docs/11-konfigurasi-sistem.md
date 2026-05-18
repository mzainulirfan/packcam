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

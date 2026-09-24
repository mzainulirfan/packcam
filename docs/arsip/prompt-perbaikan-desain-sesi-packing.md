# Prompt: Perbaikan UI Halaman "Riwayat Sesi Packing" (Pakti)

## Konteks
Halaman ini menampilkan daftar sesi packing per petugas: kode sesi, progress, total upah, periode kerja, serta aksi History/Detail. Ada juga bar seleksi massal untuk bayar/share, dan tabel "Riwayat Pembayaran" di bagian bawah.

## Tugas
Perbaiki komponen tabel "Daftar sesi" dan elemen pendukungnya sesuai poin di bawah. Jangan ubah struktur data atau alur fungsional (checkbox, bayar, share, export tetap ada), hanya presentasi visual dan pengelompokan data. **Palet warna harus tetap monokrom/netral** — jangan pakai warna-warni; pembeda status cukup lewat bobot visual (filled vs outline, bold vs regular), bukan warna hijau/merah/kuning.

## Perubahan yang diminta

1. **Kelompokkan baris sesi per petugas**
   - Saat ini setiap sesi ditampilkan sebagai baris terpisah meski petugasnya sama (contoh: "sani" muncul 5 kali berturut-turut).
   - Ganti jadi header grup per petugas (avatar inisial, nama, jumlah sesi, jumlah paket, total upah di ujung kanan header), lalu baris-baris sesi individual di bawahnya dengan indentasi.
   - Tujuan: total upah per petugas langsung terlihat tanpa perlu mencentang manual.

2. **Sederhanakan kolom aksi jadi satu tombol utama**
   - Saat ini setiap baris punya dua tombol dengan bobot visual sama: "History" dan "Detail".
   - Jadikan "Detail" sebagai satu-satunya tombol di baris (button outline kecil). Riwayat/history bisa dipindah jadi tautan atau tab di dalam halaman Detail, bukan tombol terpisah di tabel.

3. **Ganti badge status jadi sistem monokrom berbasis bobot**
   - Hilangkan badge "closed" dari tampilan baris (informasi teknis, tidak perlu tampil ke user biasa; taruh di Detail jika diperlukan).
   - Status bayar: "Dibayar" → pill solid gelap (`background: var(--fill-primary)`, `color: var(--on-primary)`). "Belum" → pill outline netral (`border: 0.5px solid var(--border-strong)`, `color: var(--text-secondary)`). Tidak ada warna hijau/merah, cukup kontras solid vs outline.

4. **Perjelas label stat card "Belum/Sudah"**
   - Ganti format pecahan ambigu ("4/3 sesi") menjadi teks eksplisit: "4 belum · 3 sudah".

5. **Sembunyikan bar "Aksi terpilih" saat tidak ada seleksi**
   - Bar ini saat ini selalu tampil penuh meski 0 sesi dicentang, memakan ruang vertikal.
   - Ganti jadi counter kecil "0 terpilih" di header tabel. Begitu ada checkbox dicentang, baru tampilkan bar aksi (Copy, WA, Bayar, Hapus Kosong) secara dinamis, misalnya sebagai sticky bar atau expand di bawah header tabel.

6. **Selaraskan gaya tabel "Riwayat Pembayaran" dengan tabel utama**
   - Gunakan header kolom, padding, dan ukuran font yang konsisten dengan tabel "Daftar sesi" di atasnya, supaya terasa satu sistem, bukan dua tabel berbeda gaya yang ditumpuk.

## Prinsip desain yang harus diikuti
- **Tidak ada warna semantik (hijau/merah/kuning).** Semua state dibedakan lewat kontras netral: solid gelap vs outline vs teks abu-abu (`--text-muted`, `--text-secondary`).
- Elemen yang bisa diklik harus punya satu bobot visual yang konsisten (button outline untuk aksi sekunder, solid untuk aksi utama/primer di level halaman seperti Export Bayar).
- Kelompokkan data yang punya relasi jelas (petugas → sesi-sesinya) alih-alih menampilkan flat list yang mengulang label yang sama.
- Sembunyikan UI yang belum relevan (bar aksi massal) sampai user benar-benar melakukan sesuatu yang membutuhkannya.
- Pertahankan tipografi, spacing, dan struktur breadcrumb/header yang sudah konsisten dengan halaman lain (History Dokumentasi), agar seluruh aplikasi terasa satu sistem.

## Output yang diharapkan
Kode komponen (React/HTML/CSS sesuai stack yang dipakai) untuk halaman "Riwayat Sesi Packing" — termasuk stat card, filter bar, tabel "Daftar sesi" yang sudah dikelompokkan per petugas, bar aksi terpilih yang dinamis, dan tabel "Riwayat Pembayaran" yang gayanya selaras — siap diintegrasikan ke codebase yang sudah ada.

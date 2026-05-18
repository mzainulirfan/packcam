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

# Rencana Pengembangan Halaman Settings

Dokumen ini merangkum arah pengembangan halaman `Settings` agar lebih rapi, fokus, dan mudah dipakai untuk operasional harian.

## Tujuan

- Membuat halaman Settings lebih mudah dipahami.
- Memisahkan pengaturan operasional dan branding secara jelas.
- Mengurangi elemen yang tidak perlu.
- Menambah feedback yang lebih jelas saat user mengubah konfigurasi.

## Arah Pengembangan

### 1. Rapikan Struktur Halaman

- Pisahkan halaman menjadi 2 bagian utama:
  - `Operational`
  - `Branding`
- `Operational` berisi:
  - folder video
  - format rekaman
  - perangkat kamera
  - bitrate
  - auto-open folder
- `Branding` berisi:
  - app name
  - tagline
  - brand mark

### 2. Tambahkan UX yang Lebih Aman

- Tampilkan status perubahan yang belum disimpan.
- Tambahkan informasi kapan konfigurasi terakhir tersimpan.
- Buat tombol reset per bagian, bukan hanya reset total.
- Tampilkan peringatan kalau folder video tidak valid atau tidak bisa diakses.

### 3. Perbaiki Pengelolaan Folder Video

- Tampilkan path aktif secara jelas.
- Tambahkan tombol untuk copy path.
- Tambahkan tombol buka folder.
- Validasi path di server agar error bisa dijelaskan dengan spesifik.

### 4. Sederhanakan Branding

- Branding sebaiknya tetap dibatasi ke:
  - app name
  - tagline
  - brand mark
- Warna tema tidak perlu jadi input user.
- Tema aplikasi bisa tetap fixed agar settings tidak terlalu penuh.

### 5. Tambahkan Feedback Teknis

- Tampilkan status koneksi server.
- Tampilkan status simpan terakhir.
- Tampilkan pesan error yang lebih spesifik.
- Tampilkan indikator kalau ada perubahan yang belum disimpan.

## Prioritas Implementasi

1. Rapikan layout dan struktur section.
2. Tambahkan feedback simpan/reset yang lebih jelas.
3. Tambahkan tombol copy/open folder.
4. Validasi path video di server.
5. Rapikan branding agar tetap minimal.

## Catatan

- Fokus utama halaman Settings adalah operasional.
- Jika nanti kebutuhan branding bertambah, lebih baik dipindah ke modal atau subsection kecil.
- Halaman ini sebaiknya tetap ringan dan tidak dipenuhi pengaturan yang jarang dipakai.

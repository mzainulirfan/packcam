# Tahap 2 - Kamera dan Preview

## Tujuan

Memastikan kamera berjalan dan preview tampil sebelum fitur rekam dihubungkan.

## Ruang Lingkup

- Akses kamera default.
- Tampilkan preview di halaman scan.
- Tambahkan pilihan device kamera.
- Tangani error permission kamera.

## Tugas

1. Implementasikan akses `getUserMedia`.
2. Render preview video di UI.
3. Tambahkan daftar device kamera jika tersedia.
4. Tampilkan pesan error yang jelas jika kamera gagal.

## Hasil yang Diharapkan

- Kamera aktif dan terlihat di layar.
- Pengguna bisa memilih kamera jika ada lebih dari satu.
- Masalah permission mudah didiagnosis.

## Selesai Jika

- Preview stabil.
- Tidak ada error saat reload normal.
- Kamera bisa dipakai sebagai dasar fitur rekam.

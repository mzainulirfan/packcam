# Tahap 5 - Stabilitas dan Recovery

## Tujuan

Mengurangi risiko kehilangan data saat terjadi gangguan.

## Ruang Lingkup

- Tangani aplikasi ditutup saat merekam.
- Tambahkan auto-save saat stop.
- Recovery saat startup jika ada rekaman aktif.
- Cek disk space sebelum rekaman.
- Tambahkan debounce scan.

## Tugas

1. Simpan status rekaman secara aman.
2. Finalisasi rekaman saat aplikasi close.
3. Pulihkan state yang belum selesai ketika startup.
4. Tambahkan peringatan jika disk menipis.

## Hasil yang Diharapkan

- Rekaman lebih aman dari crash atau shutdown mendadak.
- Duplikasi input lebih mudah dicegah.
- Aplikasi lebih siap dipakai harian.

## Selesai Jika

- Kasus force close bisa dipulihkan.
- Disk penuh terdeteksi sebelum error fatal.
- Scan ganda tidak memicu state rusak.

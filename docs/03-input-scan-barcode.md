# Tahap 3 - Input Scan Barcode

## Tujuan

Menjadikan barcode scanner sebagai pemicu utama alur kerja.

## Ruang Lingkup

- Buat komponen input barcode.
- Tangkap input scanner mode keyboard wedge.
- Trigger proses saat `Enter` terbaca.
- Tambahkan validasi dasar resi.

## Tugas

1. Buat input yang selalu siap menerima fokus.
2. Tangkap input cepat dari barcode scanner.
3. Validasi panjang dan karakter resi.
4. Tampilkan feedback jika input tidak valid.

## Hasil yang Diharapkan

- Resi masuk dengan stabil dari scanner.
- Input manual tetap bisa dipakai untuk testing.
- Data invalid tidak langsung memicu proses rekam.

## Selesai Jika

- Scan barcode menghasilkan event yang konsisten.
- Tidak ada double trigger dari satu scan.
- Flow input siap disambungkan ke rekaman.

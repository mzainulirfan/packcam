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

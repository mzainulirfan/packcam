# Redesign History mobile Pakti

Tanggal: 2026-11-13
Status: Disetujui pengguna; diimplementasikan

## Tujuan
Membuat riwayat dokumentasi mobile cepat dipindai, mudah dicari, dan konsisten dengan halaman Akun yang baru. Scope adalah History mobile, filter, dan presentasi detail terkait.

## Review kode
- App.tsx menetapkan monospace untuk seluruh halaman, kartu, dan filter; label manusia kurang terbedakan dari resi dan data mesin.
- Header menggabungkan jumlah, identitas, rentang data, tombol perluas jangkauan, dan refresh dalam satu baris sempit.
- Kartu menumpuk status dokumentasi, tahap kerja, identitas, upah, dan kesiapan berbagi; teks sering 11px.
- Kartu memakai div role=button dengan tombol salin di dalamnya. Keydown dari tombol salin dapat mencapai handler kartu dan membuka detail.
- Pencarian belum memiliki accessible label eksplisit; tombol scanner tidak memiliki nama aksesibel eksplisit.
- Tombol filter memakai [+]/[-] sebagai indikator; pilihan tugas belum mengekspos state terpilih.
- Filter sheet panjang, sehingga perlu pembatasan tinggi dan scroll agar tindakan tetap terjangkau.
- Header detail memotong resi, sementara tombol salin/tutup berukuran 36px.
Review berdasarkan pembacaan kode dan graph tersimpan, belum inspeksi browser.

## Pendekatan
1. Direkomendasikan: daftar ringkas dengan detail bertahap. Identitas resi dan kelengkapan tampil di daftar, detail operasional tetap tersedia di sheet. Mengurangi kepadatan tanpa mengubah API.
2. Pertahankan semua informasi pada kartu dan rapikan tipografi. Perubahan lebih kecil, tetapi beban visual dan panjang daftar tetap tinggi.

## Rancangan
Gunakan Geist untuk antarmuka, monospace hanya untuk resi, nomor pesanan dan nilai numerik. Pertahankan token terang/gelap Pakti dan samakan radius, ruang, serta heading dengan Akun.

Susunan:
- Judul History dan keterangan cakupan akun.
- Baris jumlah resi dan rentang data yang benar-benar dimuat. Pisahkan refresh dan perluas jangkauan agar header tidak sesak.
- Pencarian berlabel dengan tombol scan 44px.
- Pilihan Semua / QC / Packing dengan state terpilih yang jelas dan Filter dengan indikator aktif yang mudah dimengerti.
- Ringkasan filter aktif dan akses reset.
- Kelompok tanggal dengan kartu resi ringkas: resi dapat membungkus, nomor pesanan sekunder, status kelengkapan, ringkasan QC/Packing, waktu dan status berbagi penting.
- Tombol buka detail dan salin menjadi target interaktif terpisah; tanpa kontrol interaktif bersarang.
- State loading, error, hasil kosong dan pencarian tanpa hasil dibedakan.
- Filter sheet dapat discroll, tindakan penutup terjangkau, pilihan memiliki label/state aksesibel.
- Detail: header resi membungkus, kontrol 44px, hierarki media dan metadata lebih jelas, tindakan berbagi utama dibedakan dari hapus.

Sketsa:
History
Dokumentasi akun saya
[jumlah resi]                 [Refresh]
Data dimuat: [rentang]       [Muat lainnya]
[Cari resi atau pesanan             ][Scan]
[Semua] [QC] [Packing]            [Filter]
[Filter aktif / Reset]

Hari ini
[Nomor resi                         ][Salin]
[Nomor pesanan]
[Status dokumentasi]
QC selesai                  Packing selesai
[Waktu]                    [Buka detail]

## Batasan
Pertahankan logika filter, grouping, jangkauan pemuatan bertahap, batas audit admin, pencarian barcode, persiapan file, share native/WhatsApp/Shopee, preview media, dan konfirmasi hapus. Tidak mengubah endpoint, aturan kepemilikan atau status bisnis. Tidak mengklaim rentang semua waktu ketika data hanya sebagian dimuat. Pertahankan perubahan lokal yang ada.

## Validasi
Build mobile, scoped lint, tes mobile history yang sudah tersedia, pemeriksaan perubahan dan review aksesibilitas. Periksa 320px, nama/nomor panjang, kedua tema, akun operator/admin, state loading/error/empty melalui browser jika tersedia. Jalankan graphify update bila CLI tersedia; pada sesi ini CLI belum terpasang.

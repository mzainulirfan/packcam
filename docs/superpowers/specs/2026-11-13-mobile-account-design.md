# Redesign akun mobile Pakti

Tanggal: 2026-11-13
Status: Disetujui pengguna; diimplementasikan

## Tujuan
Membuat identitas akun, mode kerja, dan tindakan akun mudah dipahami pada layar mobile, serta merapikan akses laporan admin.

## Review kode saat ini
- Identitas, pengaturan mode kerja, dan laporan operasional admin memiliki pemisahan visual yang lemah.
- Teks pendukung banyak memakai ukuran 11 px; beberapa tombol laporan memakai tinggi 28 px.
- Tombol panel lipat belum mengekspos aria-expanded dan aria-controls.
- Informasi pembatasan pembayaran lewat web muncul berulang.
- Avatar memakai warna acak deterministik yang kurang menyatu dengan palet Pakti.
- SessionTab.tsx sudah memiliki perubahan lokal; implementasi harus mempertahankan fungsi yang ada.

Review ini berdasarkan kode, belum berdasarkan inspeksi browser.

## Pendekatan
1. Direkomendasikan: rapikan halaman akun yang ada. Identitas menjadi fokus, mode kerja dikelompokkan, laporan admin tetap tersedia melalui panel lipat. Scope kecil dan menjaga alur yang sudah digunakan.
2. Pisahkan laporan admin ke halaman khusus. Halaman akun lebih singkat, tetapi memerlukan perubahan navigasi dan alur baru.

## Desain yang diusulkan
Gaya tenang dan utilitarian memakai Geist serta palet terang/gelap Pakti. Avatar monogram netral, heading jelas, pemisah tipis, radius konsisten, tanpa dekorasi berlebihan.

Urutan halaman:
- Judul Akun dan deskripsi singkat.
- Identitas: avatar, nama yang dapat membungkus, kode operator monospace, role.
- Informasi sesi: waktu masuk.
- Mode kerja: pilihan QC/Packing untuk admin; informasi mode yang ditentukan admin untuk operator. Status sibuk terlihat dan kontrol tetap terkunci sesuai perilaku lama.
- Khusus admin: bagian Laporan packing dengan panel sesi dan pembayaran. Filter, ringkasan, salin, dan WhatsApp dipertahankan. Keterangan pembayaran lewat web cukup sekali.
- Tindakan keluar dengan konfirmasi yang sudah ada.

Sketsa:
Akun
Identitas dan akses kerja Anda
[AB] Nama operator
     KODE · Admin / Operator
Masuk pada [waktu]

Mode kerja
[ QC           | Packing ]

Laporan packing (admin)
[Sesi packing                 v]
[Riwayat pembayaran           v]

[Keluar dari perangkat ini]

## Batasan dan aksesibilitas
Tidak menambah endpoint atau mengubah aturan upah, autentikasi, dan kepemilikan hasil kerja. Pertahankan perubahan lokal serta integrasi parent component. Target sentuh utama minimum 44 px, focus-visible jelas, panel lipat memiliki semantik lengkap, mendukung reduced motion, nama panjang, layar 320 px, dan kedua tema.

## Validasi implementasi
Build mobile, lint file yang diubah, pemeriksaan perubahan terhadap baseline lokal, serta pemeriksaan browser bila tooling tersedia. Jalankan graphify update setelah perubahan kode; laporkan bila CLI tidak tersedia.

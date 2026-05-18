# Rencana Pengembangan Halaman History

Dokumen ini merangkum arah pengembangan halaman `History` agar pencarian, detail data, dan aksi terhadap rekaman video lebih cepat dipakai operator maupun admin.

## Tujuan

- Memperkuat pencarian dan filtering data rekaman.
- Membuat detail per resi lebih jelas.
- Menyediakan aksi cepat untuk file video dan metadata.
- Menangani kasus duplicate, repeat QC, dan data yang sudah tidak valid.

## Arah Pengembangan

### 1. Perkuat Pencarian dan Filter

- Tambahkan filter berdasarkan:
  - resi
  - task (`qc` / `packing`)
  - status
  - operator
  - rentang tanggal
- Tambahkan quick filter:
  - `QC only`
  - `Packing only`
  - `Completed`
  - `Error`
- Simpan filter terakhir yang digunakan agar tidak perlu set ulang setiap membuka halaman.

### 2. Buat Detail per Resi Lebih Jelas

- Saat user klik satu resi, tampilkan ringkasan semua rekaman terkait dalam satu panel.
- Bedakan video QC dan packing secara visual.
- Tampilkan urutan proses, status terakhir, dan operator yang memproses.
- Pastikan history tetap mudah dipindai walaupun satu resi punya banyak entri.

### 3. Tambahkan Aksi Cepat

- Preview video langsung dari list.
- Copy path file video.
- Copy resi atau metadata penting.
- Buka folder file video dari history.
- Download video dari browser bila diperlukan.

### 4. Tangani Duplicate dan Repeat QC

- Tampilkan indikator kalau resi pernah diulang QC.
- Jelaskan data mana yang sudah tidak valid karena repeat QC.
- Pisahkan tampilan data valid dan data yang di-invalidate.
- Hindari user salah membaca rekaman lama sebagai data aktif.

### 5. Tambahkan Export yang Lebih Berguna

- Export CSV atau XLSX berdasarkan filter aktif.
- Export data hanya QC, hanya packing, atau semua task.
- Sertakan metadata dan path file bila dibutuhkan.

### 6. Rapikan UX Mobile

- Buat panel detail lebih ringkas di layar kecil.
- Pastikan aksi penting tetap mudah diakses tanpa scroll berlebihan.
- Jaga ukuran tombol agar tetap nyaman dipakai di mobile.

## Prioritas Implementasi

1. Filter dan quick filter.
2. Detail per resi yang lebih jelas.
3. Aksi cepat untuk preview, copy, dan open folder.
4. Penanganan repeat QC dan data invalid.
5. Export yang lebih berguna.
6. Penyempurnaan UX mobile.

## Catatan

- Halaman `History` harus tetap cepat dipakai untuk audit data harian.
- Fokus utama adalah membedakan QC dan packing dengan jelas tanpa membuat UI terlalu berat.
- Kalau nanti data berkembang, struktur filter dan detail sebaiknya dibuat modular agar mudah diperluas.

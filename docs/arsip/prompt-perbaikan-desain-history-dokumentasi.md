# Prompt: Perbaikan UI Halaman "History Dokumentasi" (Pakti)

## Konteks
Halaman ini menampilkan riwayat dokumentasi QC/packing paket (nomor resi, operator, kelengkapan dokumentasi, dan status pengiriman) dalam bentuk tabel dengan 3 stat card di atasnya dan filter bar di bawahnya.

## Tugas
Perbaiki komponen tabel dan header halaman `History Dokumentasi` sesuai poin-poin berikut. Jangan ubah struktur data atau alur fungsional, hanya presentasi visual dan kejelasan interaksi.

## Perubahan yang diminta

1. **Pisahkan status dari aksi di kolom terakhir**
   - Saat ini kolom "Aksi" menampilkan tombol "Terkirim" (non-interaktif) dan "Kirim" (interaktif) dengan gaya visual yang sama, sehingga terlihat seperti dua tombol yang bisa diklik.
   - Ganti jadi kolom "Status":
     - Jika sudah terkirim → tampilkan sebagai badge/pill (bukan tombol), warna hijau (`background: var(--bg-success)`, `color: var(--text-success)`), ikon centang, teks "Terkirim ke @username".
     - Jika belum terkirim → tampilkan sebagai tombol aktif berwarna aksen (`background: var(--fill-accent)`, `color: var(--on-accent)`), teks "Kirim sekarang".
   - Tujuan: user langsung bisa membedakan mana informasi status dan mana aksi yang bisa diklik.

2. **Sederhanakan kolom "Dokumentasi"**
   - Hilangkan bungkus kotak abu-abu (yang saat ini terlihat seperti elemen interaktif).
   - Tampilkan sebagai teks biasa dengan ikon centang kecil berwarna hijau di depan: `✓ 2/2 dokumentasi`.

3. **Beri warna semantik pada stat card**
   - Card "Total Dokumentasi" tetap netral (abu-abu/putih).
   - Card "Dokumentasi Lengkap" (saat 100%) diberi latar hijau muda (`var(--bg-success)`) dengan teks hijau tua (`var(--text-success)`) — menandakan status baik.
   - Card "Perlu Perhatian" diberi latar merah/kuning muda HANYA jika nilainya > 0; jika nilainya 0, biarkan netral.

4. **Rapikan filter bar**
   - Satukan search bar dan 3 dropdown filter (tugas, user, periode) dalam satu baris flex-wrap yang rapi, dengan lebar search bar mengambil sisa ruang (`flex: 1`).
   - Tombol "Reset" bisa dijadikan ikon kecil (misalnya ikon refresh) di ujung kanan baris filter, bukan tombol teks penuh, agar tidak memenuhi baris di layar sempit.

5. **Perjelas indikator baris "baru" / ter-highlight**
   - Border biru di sisi kiri baris saat ini tidak punya makna yang jelas (hover? selected? baru?).
   - Jika maksudnya menandai entri terbaru, ganti dengan badge kecil bertuliskan "Baru" di sebelah nomor resi, bukan border warna tanpa label.
   - Jika maksudnya adalah baris yang sedang dipilih/hover, gunakan `background: var(--fill-ghost-hover)` saat hover, dan hilangkan border kiri tersebut.

## Prinsip desain yang harus diikuti
- Warna hanya dipakai untuk membawa makna (status baik/buruk/netral), bukan dekorasi.
- Elemen yang terlihat seperti tombol harus benar-benar bisa diklik; elemen status/informasi tidak boleh memakai gaya tombol.
- Gunakan token warna semantik (`--bg-success`, `--text-success`, `--fill-accent`, dll) alih-alih warna abu-abu datar untuk semua state, agar mata bisa langsung scan status tanpa membaca teks satu per satu.
- Pertahankan tipografi dan spacing yang sudah konsisten dengan desain awal (jangan redesain total, cukup perbaikan target di atas).

## Output yang diharapkan
Kode komponen (React/HTML/CSS sesuai stack yang dipakai) untuk tabel "Dokumentasi paket" dan header stat card yang sudah mengikuti perubahan di atas, siap diintegrasikan ke halaman History Dokumentasi yang sudah ada.

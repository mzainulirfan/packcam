# Rencana Admin Multi-Task

Dokumen ini merangkum rencana penyesuaian agar user dengan role `admin` bisa menjalankan `qc` dan `packing` tanpa bentrok dengan alur operator biasa.

## Tujuan

- Memisahkan konsep `role` dari `task`.
- Membuat admin bisa memilih task aktif sebelum scan dimulai.
- Menjaga history tetap konsisten karena setiap rekaman tetap menyimpan task actual.
- Mencegah perubahan task saat recording masih berjalan.

## Prinsip Desain

### 1. Role Tidak Sama Dengan Task

- `role` hanya menentukan hak akses.
- `task` menentukan proses yang sedang dikerjakan.
- Admin harus dianggap fleksibel, bukan operator dengan task tunggal.

### 2. Admin Punya Task Aktif

- Admin boleh memilih `qc` atau `packing`.
- Pilihan task aktif berlaku untuk sesi login saat ini.
- Task aktif bisa diganti hanya saat status masih idle atau belum recording.

### 3. Data Rekaman Tetap Satu Task

- Setiap recording tetap menyimpan satu `taskType`.
- History tidak boleh menyatukan QC dan packing dalam satu field yang ambigu.
- Rekaman admin harus tetap bisa diaudit per task seperti operator biasa.

## Arah Implementasi

### 1. Perluas Model User dan Session

- Tambahkan konsep `allowedTasks` atau `taskMode` untuk profil user.
- Admin mendapatkan akses ke:
  - `qc`
  - `packing`
- Operator biasa tetap punya satu task default sesuai profil.
- Session login perlu menyimpan `activeTask`.

### 2. Tambahkan Task Switcher di Scan

- Tampilkan switcher task di halaman `Scan` untuk admin.
- Sembunyikan switcher untuk operator biasa.
- Default task bisa mengikuti pilihan terakhir atau default `qc`.
- Saat recording aktif, task switcher harus disabled atau meminta stop dulu.

### 3. Validasi di Server

- Server harus memeriksa apakah task yang dipilih valid untuk role user.
- Jika role `admin`, izinkan `qc` dan `packing`.
- Jika role `operator`, tolak task yang tidak sesuai profil.
- Backend tetap menjadi sumber kebenaran utama.

### 4. Rapikan UX di Users dan History

- Di halaman `Users`, tampilkan admin sebagai user fleksibel.
- Jangan paksa admin terlihat seperti operator dengan task tunggal.
- Di halaman `History`, tetap tampilkan task actual per record.
- Tambahkan label yang jelas kalau akun punya akses fleksibel.

### 5. Cegah Bentrok Saat Recording

- Ganti task hanya ketika sesi belum recording.
- Jangan ubah task aktif di tengah proses capture video.
- Jika user mencoba ganti task saat recording, tampilkan pesan yang jelas.

## Prioritas Implementasi

1. Ubah model session dan validasi task.
2. Tambahkan task switcher di Scan untuk admin.
3. Rapikan UI Users agar admin ditampilkan sebagai fleksibel.
4. Pastikan History tetap menyimpan task actual.
5. Tambahkan guard saat task diubah ketika recording aktif.

## Catatan

- Solusi yang paling aman adalah menyimpan `activeTask` di session, bukan di profil.
- Admin boleh berpindah task sebelum scan, tetapi tidak ketika recording sedang aktif.
- Dengan model ini, data history tetap bersih dan tidak bentrok dengan alur operator biasa.

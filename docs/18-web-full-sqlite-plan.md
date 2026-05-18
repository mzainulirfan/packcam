# Plan Migrasi ke Full Web + SQLite

Dokumen ini merancang perubahan arah produk dari aplikasi desktop/Tauri menjadi aplikasi web penuh, dengan SQLite tetap dipakai sebagai database utama.

## Tujuan

- Mengubah aplikasi menjadi bisa diakses dari browser tanpa dependency Tauri atau desktop wrapper.
- Tetap mempertahankan SQLite sebagai sumber data utama.
- Menjaga alur inti tetap sama:
  - login operator
  - scan resi
  - rekam proses packing
  - simpan video
  - lihat history
  - kelola settings, users, dan health
- Menghindari rework besar dengan memigrasikan lapisan data secara bertahap.

## Rekomendasi Arsitektur

### Opsi yang direkomendasikan

- Frontend: React/Vite seperti sekarang, tetap menjadi SPA web.
- Backend: API server ringan di Node.js.
- Database: SQLite di server.
- Penyimpanan video: filesystem server atau storage yang setara.
- Upload video: browser merekam video, lalu mengirim hasil rekaman ke backend.

### Alasan

- SQLite paling stabil dipakai sebagai database server-side kecil sampai menengah.
- Aplikasi web lebih mudah diakses banyak device.
- Lebih aman daripada menyimpan data bisnis penting di localStorage atau IndexedDB browser.
- Alur upload video lebih mudah dikontrol dibanding memaksa database browser menyimpan blob besar.

### Catatan penting

- Jika targetnya hanya satu perangkat dan offline lokal, SQLite browser-side via WASM/OPFS juga memungkinkan.
- Namun untuk aplikasi web penuh yang diakses dari browser biasa, model server-side SQLite lebih masuk akal.
- Dokumen ini memakai asumsi server-side SQLite sebagai target utama.

## Kondisi Saat Ini

Repo masih bercampur antara web dan desktop:

- Ada adapter storage web dan SQLite.
- Ada bridge Tauri untuk file system dan SQLite native.
- Ada path video desktop-specific.
- Ada logic yang masih mengasumsikan akses file lokal via desktop runtime.

Artinya, migrasi perlu membuang ketergantungan berikut:

- bridge desktop/Tauri yang sebelumnya dipakai untuk file system dan path native
- semua jalur `desktop runtime` yang hanya relevan di Tauri
- akses file lokal langsung dari browser

## Prinsip Desain Baru

1. Browser hanya bertugas untuk UI, kamera, scan input, dan upload hasil.
2. Server menangani penyimpanan data bisnis, auth, logging, dan metadata.
3. Video final disimpan di server, bukan di browser storage.
4. SQLite menjadi sumber data tunggal untuk metadata dan state aplikasi.
5. Akses data dilakukan melalui repository/API, bukan langsung dari UI.

## Ruang Lingkup Migrasi

### Yang tetap di frontend web

- Login dan setup admin
- Dashboard shell
- Scan barcode
- Preview kamera
- Recording video di browser
- History, settings, users, health
- Validasi UI dan state interaksi

### Yang pindah ke backend

- Auth dan session operator
- CRUD operator profile
- CRUD settings dan system config
- Penyimpanan recording metadata
- Penyimpanan scan log
- Penyimpanan video file
- Last error dan bootstrap state
- Export data jika ingin hasil yang konsisten lintas user/device

### Yang dihapus atau diganti

- Tauri command bridge
- native file picker desktop
- native read/write/remove file helper
- desktop path resolver
- storage backend yang bergantung pada runtime desktop

## Desain Backend

### Modul backend minimum

- Auth service
- Operator service
- Recording service
- Scan log service
- Settings/system config service
- Health/reset service
- File upload/download service

### Tabel SQLite minimum

- `operator_profiles`
- `operator_session`
- `settings`
- `system_config`
- `recordings`
- `scan_logs`
- `bootstrap_state`
- `last_error`

### File video

- Video tidak disimpan sebagai blob besar di SQLite kecuali untuk kasus sangat kecil atau prototipe.
- Rekomendasi utama:
  - metadata di SQLite
  - file video di filesystem server
  - path file disimpan di tabel recordings

## Rancangan Flow Recording Baru

### Flow utama

1. Operator scan resi.
2. Browser mulai recording video di kamera.
3. Saat resi berikutnya masuk:
   - recording aktif dihentikan
   - hasil rekaman di-encode
   - video di-upload ke backend
   - backend menyimpan file dan metadata ke SQLite
   - UI menampilkan progress saving
4. Setelah upload dan save selesai 100%, browser mulai recording baru.

### Aturan penting

- Jangan mulai recording baru sebelum server mengonfirmasi save selesai.
- Kamera stream di browser tetap aktif selama pergantian resi.
- Progress saving wajib terlihat di area preview.
- Jika upload gagal, status harus masuk `error` dan tidak diam-diam lanjut recording baru.

## State Management Baru

State yang disarankan:

- `idle`
- `recording`
- `stopping`
- `saving`
- `ready_to_record_next`
- `error`

Tambahan state pendukung:

- `currentResi`
- `queuedResi`
- `savingResi`
- `uploadProgress`
- `lastSavedResi`
- `lastError`

## Strategi Implementasi

### Tahap 1: Pisahkan akses data dari UI

- Buat interface repository untuk semua domain data.
- UI hanya memanggil service/repository, bukan storage langsung.
- Siapkan adapter web sementara yang masih memakai implementasi lama.

### Tahap 2: Buat backend API

- Buat endpoint auth, operator, settings, scan logs, recordings, health.
- Buat koneksi SQLite di server.
- Tambahkan migrasi schema dan seed awal.

### Tahap 3: Migrasi auth dan bootstrap

- Pindahkan login, session, dan setup admin ke backend.
- Pastikan first-run admin tetap berjalan di web.

### Tahap 4: Migrasi recording metadata

- Simpan draft recording ke backend saat scan dimulai.
- Simpan hasil save final ke SQLite setelah upload selesai.
- Tambahkan status `uploading` atau `saving` di backend bila diperlukan.

### Tahap 5: Migrasi upload video

- Browser mengirim video ke backend lewat endpoint upload.
- Backend menulis file video ke filesystem.
- Backend memperbarui row SQLite setelah file sukses disimpan.

### Tahap 6: Migrasi history, users, settings

- History membaca data dari API.
- Users CRUD dipindahkan ke API.
- Settings dan system config juga dipindahkan ke API.

### Tahap 7: Hapus jalur desktop

- Hapus Tauri bridge dan helper native.
- Hapus path resolver desktop.
- Hapus dependency build desktop.
- Rapikan kode yang tersisa agar benar-benar web only.

## Rekomendasi Teknis

### Backend

- Gunakan Node.js dengan framework ringan seperti Fastify atau Express.
- Gunakan SQLite dengan driver yang stabil.
- Tambahkan migrasi schema, seed data, dan layer repository.
- Simpan file video di folder upload terstruktur per tanggal/resi.

### Frontend

- Pertahankan React + Vite.
- Gunakan `fetch`/API client terpusat.
- Buat hook baru untuk auth, settings, recordings, dan history berbasis API.
- Pertahankan komponen UI yang sudah dirapikan.

### Upload video

- Untuk video pendek, upload satu blob setelah recording selesai cukup sederhana.
- Untuk video lebih panjang, pertimbangkan chunked upload atau stream upload.
- Progress bar harus mengikuti progress upload, bukan hanya status lokal.

### Keamanan

- Validasi semua input di server.
- Sanitize nama file dan path.
- Tambahkan autentikasi sesi yang aman untuk akses API.
- Jika dibuka publik, batasi akses dengan login dan role admin/operator.

## Contoh Pseudocode

```ts
async function handleNextResiScan(resiNumber: string) {
  if (state.mode === 'saving') {
    queueResi(resiNumber)
    return
  }

  if (state.mode === 'recording') {
    state.mode = 'stopping'
    const blob = await stopRecorderAndCollectBlob()

    state.mode = 'saving'
    await uploadVideoToServer({
      resiNumber: state.currentResi,
      blob,
      onProgress: (progress) => {
        state.uploadProgress = progress
      },
    })

    state.mode = 'ready_to_record_next'
    await startRecording(resiNumber)
    return
  }

  await startRecording(resiNumber)
}
```

## Checklist Testing

### Functional

- Scan resi pertama memulai recording normal.
- Scan resi kedua menghentikan recording pertama dulu.
- Saving video pertama tampil progress sampai selesai.
- Recording kedua hanya mulai setelah saving selesai.
- Preview kamera tetap aktif selama transisi.
- Timer recording kedua benar-benar reset dan berjalan normal.

### Reliability

- Test recording 2-3 menit lalu pindah resi.
- Test recording lebih lama untuk melihat freeze atau memory leak.
- Test upload gagal lalu retry.
- Test refresh browser di tengah recording.
- Test koneksi lambat saat upload.

### Data integrity

- Video tersimpan dengan nama dan path yang benar.
- Metadata SQLite cocok dengan file video di server.
- History tampil sesuai data terakhir.
- Reset data benar-benar membersihkan data sesuai scope.

### UX

- Loading/progress saving terlihat jelas di preview.
- Status `saving` dan `ready_to_record_next` mudah dipahami operator.
- Tombol stop tetap terjangkau.
- Tidak ada horizontal scroll baru pada layar kecil.

## Risiko Utama

1. Video upload bisa jadi bottleneck kalau durasi recording panjang.
2. SQLite server-side perlu locking strategy yang rapi saat concurrent writes.
3. File storage harus konsisten dengan row metadata SQLite.
4. Migrasi dari desktop ke web bisa mematahkan asumsi lama di file picker dan path lokal.

## Urutan Kerja yang Disarankan

1. Finalisasi target arsitektur server-side SQLite.
2. Buat repository/API abstraction.
3. Bangun backend auth dan SQLite schema.
4. Migrasi recording upload.
5. Migrasi history, settings, users.
6. Hapus Tauri dan file helper desktop.
7. Uji ulang flow scan-record-save secara end-to-end.

## Kriteria Selesai

- Aplikasi bisa dibuka dari browser tanpa Tauri.
- Database utama memakai SQLite di server.
- Flow recording dan saving stabil untuk durasi panjang.
- UI preview menampilkan progress saving dengan jelas.
- Semua halaman utama tetap berjalan dari web.
- Tidak ada ketergantungan runtime desktop yang tersisa di jalur produksi.

# Tahap 17 - Bugfix Perekaman Video Proses Packing

## Tujuan

Memperbaiki bug perekaman video saat pergantian resi agar video baru tidak freeze, proses saving berjalan berurutan, dan preview tetap aktif setelah rekaman sebelumnya selesai disimpan.

## Latar Belakang Masalah

Sistem saat ini bekerja dengan alur:

- resi discan
- recording dimulai
- scan resi berikutnya memicu penyimpanan video sebelumnya
- setelah itu sistem memulai recording baru

Bug yang terjadi:

- setelah recording berjalan cukup lama, sekitar 2-3 menit, scan resi kedua memicu pergantian rekaman
- video pertama berhasil diarahkan ke proses penyimpanan
- video kedua mulai secara logis, tetapi preview tampak diam atau freeze
- timer perekaman tetap berjalan, sehingga state terlihat aktif padahal frame video tidak benar-benar bergerak

## Hipotesis Penyebab Bug

Kemungkinan penyebab yang perlu dianalisis:

- recording baru dimulai terlalu cepat sebelum proses encoding/saving video sebelumnya benar-benar selesai
- `MediaRecorder` atau stream output masih berada pada state transisi saat instance baru dibuat
- stream kamera dipakai ulang tanpa sinkronisasi yang cukup setelah stop/save selesai
- preview dan recording session saling bergantung pada objek stream yang belum stabil
- proses background save masih berjalan, tetapi sistem sudah menganggap recording berikutnya siap
- ada race condition antara event `stop`, event `onstop`, pembuatan draft baru, dan pengaktifan recorder baru

## Ruang Lingkup

- Perbaikan alur recording di `src/hooks/useRecordingSession.ts`
- Penyesuaian status/state recording untuk mendukung proses saving yang eksplisit
- Penambahan indikator progress atau loading pada area preview saat saving berjalan
- Penyesuaian UI di halaman scan agar status proses lebih jelas
- Penambahan checklist testing untuk skenario scan beruntun dan recording panjang

## State Management yang Diusulkan

Gunakan state machine yang lebih eksplisit agar transisi lebih aman:

- `idle`
- `recording`
- `stopping`
- `saving`
- `ready_to_record_next`
- `error`

Makna tiap state:

- `idle`: kamera siap, belum ada recording aktif
- `recording`: frame sedang direkam untuk resi aktif
- `stopping`: recorder sedang dihentikan, data sedang dipindahkan ke proses finalisasi
- `saving`: file video sedang di-encode / disimpan ke storage
- `ready_to_record_next`: saving selesai, kamera siap dipakai untuk recording berikutnya
- `error`: ada gangguan pada recorder, kamera, atau proses save

## Flow Baru yang Diharapkan

Urutan proses yang harus dipakai:

1. resi discan
2. recording lama dihentikan
3. proses saving video lama dimulai
4. tampil progress bar / loading di area preview
5. proses saving selesai 100%
6. baru mulai recording baru untuk resi berikutnya

## Aturan Penting

- Scan resi baru tidak boleh langsung memulai recording baru jika saving belum selesai.
- Camera stream jangan dimatikan jika masih dibutuhkan untuk recording berikutnya.
- Proses encoding dan saving harus ditunggu sampai benar-benar selesai sebelum recorder baru dibuat.
- State `saving` harus menjadi blok transisi yang mencegah start recording baru.
- Jika ada antrian resi berikutnya, resi itu disimpan sebagai pending sampai state `ready_to_record_next`.
- UI harus memperlihatkan bahwa sistem sedang menyimpan, bukan seolah-olah recording baru sudah aktif.

## Rancangan Implementasi

### 1. Refactor Session Flow

- Pisahkan logika `stop recording`, `save artifact`, dan `start next recording`.
- Hindari start recorder baru di callback yang masih berada dalam siklus save lama.
- Jadikan penyimpanan video lama sebagai operasi yang selesai dulu baru mengizinkan start berikutnya.

### 2. Tambahkan Guard untuk Transisi

- Pastikan `handleScan()` tidak memanggil `startRecording()` saat state masih `stopping` atau `saving`.
- Simpan resi berikutnya ke `queuedResi` atau `pendingResi`.
- Setelah save selesai, cek apakah ada resi pending lalu start recording berikutnya.

### 3. Progress UI di Preview

- Saat state `saving`, tampilkan progress bar atau loading indicator pada area preview.
- Jika progress detail sulit diukur, tampilkan loading bar indeterminate yang jelas.
- Ubah pesan status di preview agar operator tahu video sedang diproses.

### 4. Kualitas Preview

- Preview kamera harus tetap aktif dan tidak freeze setelah pergantian resi.
- Pastikan sumber stream tetap valid saat berpindah dari recording lama ke recording baru.
- Jika perlu, delay singkat bisa dipakai hanya untuk memastikan recorder lama benar-benar release sebelum recorder baru dibuat.

### 5. Penanganan Error

- Jika save gagal, state masuk ke `error`.
- Tampilkan pesan error yang jelas di UI.
- Pastikan user bisa retry tanpa harus refresh aplikasi.

## Rekomendasi Teknis

- Gunakan `async/await` untuk membuat alur transisi lebih mudah diikuti.
- Simpan operasi save dalam satu fungsi finalisasi yang mengembalikan promise selesai.
- Pisahkan:
  - `beginRecording(resi)`
  - `stopCurrentRecording()`
  - `saveCurrentRecording()`
  - `startQueuedRecording()`
- Gunakan boolean guard atau token transisi untuk mencegah start ganda.
- Pertimbangkan `AbortController` atau token session untuk membatalkan proses lama jika state sudah berubah.
- Tambahkan log debugging sementara untuk memantau urutan event:
  - scan diterima
  - stop dipanggil
  - save mulai
  - save selesai
  - recording berikutnya mulai

## Contoh Alur Logika

```text
state = recording
pendingResi = null

scan(resiBaru):
  if state == recording:
    pendingResi = resiBaru
    stopCurrentRecording()
    state = stopping
    return

  if state in (stopping, saving):
    pendingResi = resiBaru
    return

  if state == idle or state == ready_to_record_next:
    beginRecording(resiBaru)
    state = recording

onStopRecorder():
  state = saving
  showProgressPreview()
  await saveCurrentRecording()
  state = ready_to_record_next

  if pendingResi exists:
    beginRecording(pendingResi)
    pendingResi = null
    state = recording
  else:
    state = idle
```

## Checklist Testing

### Skenario Dasar

- Scan resi pertama lalu pastikan recording mulai normal.
- Scan resi kedua setelah 2-3 menit recording berjalan.
- Pastikan recording lama berhenti dulu.
- Pastikan progress saving tampil pada preview.
- Pastikan recording baru hanya mulai setelah saving selesai.

### Skenario Freeze

- Uji pergantian resi berulang dalam waktu singkat.
- Pastikan preview video tidak freeze setelah recording kedua dimulai.
- Pastikan timer tidak berjalan sementara frame diam tanpa alasan.

### Skenario Saving

- Uji saat storage lambat atau file video besar.
- Pastikan state tetap di `saving` sampai promise save selesai.
- Pastikan tidak ada recording baru yang start prematur.

### Skenario Error

- Simulasikan gagal save.
- Pastikan masuk ke state `error`.
- Pastikan pesan error tampil jelas.
- Pastikan user bisa retry tanpa restart aplikasi.

### Skenario Recovery

- Setelah error, coba scan resi baru.
- Pastikan sistem kembali bisa merekam normal.
- Pastikan kamera stream tetap tersedia jika tidak ada gangguan hardware.

### Skenario UI

- Progress bar/loading terlihat jelas saat saving.
- Tombol aksi tidak membingungkan user saat transisi.
- Status di preview sesuai dengan state aktual.

## File yang Kemungkinan Terdampak

- `src/hooks/useRecordingSession.ts`
- `src/pages/ScanPage.tsx`
- `src/components/CameraPreview.tsx`
- `src/data/recordings.ts`
- `src/data/scanLogs.ts`
- `src/data/types.ts`

## Hasil yang Diharapkan

- Recording baru tidak freeze setelah pergantian resi.
- Saving video lama selalu selesai dulu sebelum recording baru dimulai.
- UI menampilkan progress yang jelas selama proses saving.
- Preview kamera tetap stabil dan sinkron dengan state sistem.
- Alur scan menjadi lebih dapat diprediksi dan aman untuk pemakaian harian.

## Selesai Jika

- Skenario recording lama lalu scan resi kedua berjalan tanpa freeze.
- Saving muncul sebagai proses eksplisit di UI.
- Recording baru selalu dimulai setelah saving selesai.
- Tidak ada race condition yang membuat preview diam atau state salah.
- Checklist testing lulus untuk durasi rekaman pendek dan panjang.

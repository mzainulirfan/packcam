# Plan Penambahan Flow Packing dan QC

Dokumen ini merangkum rencana penambahan flow kerja baru pada Pakti. Saat ini sistem hanya punya satu flow scan -> rekam -> simpan untuk proses packing. Flow yang ingin ditambahkan adalah proses QC, dengan alur teknis scan dan recording yang tetap sama. Urutan bisnis yang baru adalah QC lebih dulu, lalu packing setelah QC selesai.

## Asumsi

- Flow kedua yang dimaksud adalah `QC`.
- Alur dasar tidak berubah:
  - scan resi
  - mulai rekam
  - stop rekam
  - simpan video
- Satu resi bisa diproses QC dan packing pada waktu berbeda.
- Satu resi bisa diproses oleh operator yang berbeda untuk QC dan packing.
- Operator nanti punya task spesifik, misalnya `packing` atau `qc`.
- Data packing dan QC harus bisa berdiri sendiri, tapi tetap terhubung ke resi yang sama.

## Target Akhir

- Sistem mendukung dua task operasional:
  - packing
  - QC
- Flow scan sampai saving tetap sama untuk kedua task.
- Resi yang sudah selesai di QC boleh diproses packing.
- Resi yang belum selesai di QC tidak boleh diproses packing.
- History, admin, dan audit bisa membedakan data packing dan QC.
- Operator hanya melihat task yang sesuai perannya.

## Prinsip Desain

- Satu mekanisme recording dipakai ulang untuk dua task.
- Task menjadi atribut kerja, bukan flow UI yang benar-benar berbeda.
- Data hasil proses harus tersimpan dengan konteks task.
- Validasi duplicate harus mempertimbangkan urutan task dan status task, bukan hanya resi.
- Recovery dan finalize harus tetap konsisten untuk task packing maupun QC.

## Perubahan Data Model

### Recording

Tambahkan atribut task pada recording:

- `qc`
- `packing`

Field yang perlu dipikirkan:

- `taskType`
- `operatorRole` atau `taskRole`
- `taskStatus` bila dibutuhkan

Tujuannya:

- membedakan video packing dan video QC untuk resi yang sama
- memudahkan history filter
- memudahkan admin audit dan export

### Operator

Operator profile perlu punya task utama:

- `packing`
- `qc`
- kemungkinan `both` jika nanti dibutuhkan

Tujuannya:

- operator packing hanya masuk alur packing setelah QC resi selesai
- operator QC hanya masuk alur QC
- admin tetap bisa membuat operator lintas task bila diperlukan

### Scan Log

Log scan perlu menyimpan konteks task:

- task apa yang sedang dikerjakan
- operator siapa yang melakukan scan
- resi diproses pada flow packing atau QC

### Session / Auth

Session login juga perlu membawa informasi task utama operator supaya:

- UI bisa menampilkan mode kerja aktif
- navigasi bisa membatasi page yang relevan
- scan page tahu task aktif tanpa perlu input manual berulang

## Aturan Bisnis Baru

### 1. Task dipisahkan per recording

- Satu recording harus punya task yang jelas: packing atau QC.
- Recording packing dan QC untuk resi yang sama harus dianggap entitas berbeda.

### 2. Duplicate rules berdasarkan urutan task

- Resi yang sudah selesai di `qc` masih bisa diproses di `packing`.
- Resi yang belum selesai di `qc` tidak boleh diproses di `packing`.
- Resi yang sama hanya dianggap duplicate jika task yang sama sudah selesai.

### 3. Operator mengikuti urutan task

- Operator packing hanya bisa memulai recording packing jika QC resi tersebut sudah selesai.
- Operator QC hanya bisa memulai recording QC.
- Admin boleh punya akses lebih luas jika diperlukan.

### 4. Alur scan tetap sama

- Tidak ada perubahan pada urutan:
  - scan
  - rekam
  - stop
  - save
- Perubahan hanya ada pada konteks task yang dipakai saat proses berjalan, status QC, dan saat data disimpan.

### 5. Video file dan metadata tetap terpisah

- Video QC dan packing untuk resi yang sama harus punya metadata berbeda.
- Path file boleh dibedakan lewat folder atau penamaan.

## Rancangan UI

### Scan Page

- Tambahkan indikator task aktif, misalnya `Packing` atau `QC`.
- Operator yang login melihat mode kerja yang sesuai task.
- Saat scan, sistem harus menyimpan task aktif ke recording draft.
- Bila operator packing mencoba memproses resi yang belum QC, tampilkan pesan yang jelas.

### Login / Users

- Saat membuat atau mengedit operator, admin perlu memilih task:
  - packing
  - qc
  - both jika nanti dipakai
- Halaman login bisa menampilkan label task operator setelah berhasil masuk.

### History

- Tambahkan filter task:
  - semua
  - packing
  - qc
- Row history harus menampilkan task.
- Detail history harus memperlihatkan task dan operator yang memproses.

### Admin / Audit

- Panel admin perlu menampilkan ringkasan terpisah untuk packing dan QC.
- Recent recording bisa dikelompokkan atau diberi label task.

## Rancangan Backend

### Endpoint Recording

Endpoint existing tetap dipakai, tetapi payload dan response perlu membawa task.

Hal yang perlu dipastikan:

- draft recording bisa dibuat dengan `taskType`
- chunk upload tetap menggunakan recording id yang sama
- finalize tetap menyimpan task ke metadata
- recover tetap tahu task apa yang sedang dipulihkan

### Query History

Query list recording perlu mendukung:

- filter task
- filter status
- filter operator
- filter resi

### Validasi

- Server harus menolak recording yang task-nya tidak sesuai dengan role operator bila aturan ini diaktifkan.
- Server harus memastikan task tersimpan di metadata final.

## Rencana Implementasi

### Tahap 1 - Desain Domain

- Tambahkan enum/task type untuk `packing` dan `qc`.
- Perluas tipe operator agar punya task utama.
- Perluas tipe recording agar menyimpan task.

### Tahap 2 - Backend Schema dan API

- Tambahkan kolom task pada tabel operator dan recordings.
- Tambahkan task pada scan log jika perlu.
- Update endpoint recording, login, users, dan history.
- Update response shape agar frontend menerima data task.

### Tahap 3 - Frontend Session dan Startup

- Bawa task operator ke session state.
- Tampilkan task aktif di header atau scan page.
- Pastikan bootstrap/login tetap berjalan seperti sekarang.

### Tahap 4 - Scan Flow

- Tambahkan context task ke recording draft.
- Pastikan scan -> record -> stop -> save tetap identik.
- Pastikan resi yang sudah selesai di QC bisa diproses packing, tetapi packing tidak bisa jalan sebelum QC selesai.

### Tahap 5 - History dan Admin

- Tambahkan filter task di history.
- Tambahkan label task di detail dan preview.
- Tambahkan ringkasan task di admin audit.

### Tahap 6 - Validasi dan Cleanup

- Audit semua duplicate/unique rule agar tidak hanya berbasis resi dan juga menghormati urutan QC -> packing.
- Rapikan pesan error agar jelas menyebut packing atau QC.
- Hapus asumsi lama yang menganggap hanya ada satu flow packing.

## Daftar Risiko

- Duplicate rule bisa salah kalau masih hanya berdasarkan resi.
- History bisa membingungkan kalau task tidak ditampilkan jelas.
- Operator bisa salah memilih task jika UI tidak cukup tegas.
- Recovery recording bisa salah konteks jika task tidak disimpan di draft.

## Checklist Selesai

- [ ] Operator punya task utama packing atau QC
- [ ] Recording menyimpan task aktif
- [ ] Scan flow tetap sama untuk packing dan QC
- [ ] Resi QC boleh diproses packing
- [ ] Resi yang belum QC tidak boleh diproses packing
- [ ] History bisa filter packing dan QC
- [ ] Admin bisa melihat data per task
- [ ] Recovery dan finalize tetap bekerja untuk dua task
- [ ] Tipe frontend dan backend sudah sinkron
- [ ] Testing alur packing dan QC sudah lolos

## Catatan

Kalau nanti ingin menambahkan flow lain selain QC dan packing, struktur ini sebaiknya diperluas dengan pendekatan yang sama:

- task sebagai atribut domain
- flow scan tetap dipakai ulang
- validasi duplicate berbasis kombinasi `resi + task + urutan status`
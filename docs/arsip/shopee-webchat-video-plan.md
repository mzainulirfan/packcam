# Shopee Webchat Video Sending Plan

## Tujuan

Membantu operator mengirim video bukti packing/QC dari Pakti ke pembeli Shopee melalui Shopee Seller Webchat.

Target awal bukan auto-send penuh, tetapi semi-otomatis:

1. Pakti mendeteksi video sudah siap dibagikan.
2. Pakti/extension mengetahui order Shopee berdasarkan resi.
3. Extension membuka Shopee Webchat.
4. Extension mencari customer berdasarkan `buyerUsername`.
5. Extension menyiapkan chat dan attach video.
6. Operator review lalu klik kirim secara manual.

## Prinsip Implementasi

- Hindari auto-send penuh pada fase awal untuk mencegah salah kirim dan risiko dianggap spam oleh Shopee.
- Semua aksi kirim harus punya status yang bisa diaudit.
- Extension harus fail-safe: jika chat tidak ditemukan, attachment gagal, atau video terlalu besar, tampilkan error jelas.
- Backend tetap menjadi source of truth untuk recording, order Shopee, dan status pengiriman chat.
- DOM Shopee Webchat bisa berubah, jadi extractor/automation harus kecil, terisolasi, dan mudah disesuaikan.

## Data Yang Dibutuhkan

Data yang sudah tersedia dari integrasi Shopee order:

- `orderNumber`
- `trackingNumber` / resi
- `buyerUsername`
- `shippingChannel`
- `items[].productName`
- `items[].quantity`

Data recording yang sudah tersedia:

- `recording.id`
- `recording.resiNumber`
- `recording.taskType`
- `recording.filePath`
- `recording.shareFilePath`
- `recording.shareFileReady`
- `recording.status`

Data baru yang perlu ditambahkan:

- `chat_send_status`: `pending | prepared | sent | failed | cancelled`
- `chat_send_attempts`
- `chat_prepared_at`
- `chat_sent_at`
- `chat_error`
- `chat_target_username`
- `chat_message_template`

## Backend Model

Tambahkan tabel baru `recording_chat_sends`.

Kolom:

- `id TEXT PRIMARY KEY`
- `recording_id TEXT NOT NULL`
- `order_id TEXT`
- `resi_number TEXT NOT NULL`
- `order_number TEXT`
- `buyer_username TEXT NOT NULL`
- `task_type TEXT NOT NULL`
- `video_file_path TEXT NOT NULL`
- `status TEXT NOT NULL`
- `attempts INTEGER NOT NULL DEFAULT 0`
- `message_template TEXT`
- `error_message TEXT`
- `prepared_at TEXT`
- `sent_at TEXT`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

Index:

- `idx_recording_chat_sends_recording_id`
- `idx_recording_chat_sends_status`
- `idx_recording_chat_sends_buyer_username`
- `idx_recording_chat_sends_resi_number`

## Backend API

### `POST /api/recordings/:id/chat-send/prepare`

Membuat job kirim chat untuk recording.

Input optional:

```json
{
  "messageTemplate": "Halo kak, berikut video packing untuk pesanan {{orderNumber}} resi {{resiNumber}}."
}
```

Behavior:

- Validasi session login.
- Validasi recording ada dan bisa diakses session.
- Validasi recording sudah `completed`.
- Validasi `shareFileReady === true` atau siapkan share file lebih dulu.
- Cari order Shopee dari `recording.resiNumber`.
- Ambil `buyerUsername` dari order.
- Buat/update row `recording_chat_sends` status `pending`.
- Return job detail + URL file video.

### `GET /api/chat-sends/pending`

Dipakai extension untuk mengambil job pending.

Auth:

- Session admin/operator atau `X-Pakti-Extension-Key`.

Return:

```json
{
  "jobs": [
    {
      "id": "...",
      "recordingId": "...",
      "resiNumber": "...",
      "orderNumber": "...",
      "buyerUsername": "...",
      "videoUrl": "https://api-pakti.zakado.id/files/...",
      "message": "..."
    }
  ]
}
```

### `POST /api/chat-sends/:id/prepared`

Dipakai extension setelah berhasil membuka chat dan attach video.

Behavior:

- Status menjadi `prepared`.
- `prepared_at` diisi.
- `attempts` bertambah.

### `POST /api/chat-sends/:id/sent`

Dipakai extension/operator setelah pesan dikirim.

Behavior:

- Status menjadi `sent`.
- `sent_at` diisi.

### `POST /api/chat-sends/:id/failed`

Dipakai extension jika cari customer/attach/upload gagal.

Input:

```json
{
  "error": "Customer tidak ditemukan"
}
```

Behavior:

- Status menjadi `failed`.
- `error_message` diisi.
- `attempts` bertambah.

## Web UI Pakti

### History Web

Tambahkan tombol pada detail/history recording:

- `Kirim ke Shopee Chat`

Kondisi tombol aktif:

- Recording status `completed`.
- Share file siap atau bisa disiapkan.
- Order Shopee untuk resi ditemukan.
- Order punya `buyerUsername`.

Saat klik:

- Panggil `POST /api/recordings/:id/chat-send/prepare`.
- Tampilkan status: `Menunggu extension Shopee Webchat`.
- Buka instruksi: buka `https://seller.shopee.co.id/new-webchat/conversations` lalu klik extension.

### Admin Web

Tambahkan section kecil:

- Recent chat sends
- Pending chat sends
- Failed chat sends

## Mobile UI Pakti

Tambahkan tombol yang sama pada detail history mobile:

- `Kirim ke Shopee Chat`

Catatan:

- Mobile kemungkinan hanya membuat job pending.
- Proses attach/kirim tetap dilakukan di desktop Chrome extension karena Shopee Seller Webchat dan extension berjalan di browser desktop.

## Chrome Extension

Tambahkan mode baru di extension:

- `Sync Orders`
- `Prepare Shopee Chat`

### Flow Prepare Chat

1. Operator buka Shopee Webchat:
   - `https://seller.shopee.co.id/new-webchat/conversations`
2. Operator klik extension.
3. Extension fetch `GET /api/chat-sends/pending`.
4. Extension ambil job pertama atau tampilkan daftar job pending.
5. Extension isi field search customer:
   - selector awal: `input.shopee-react-input__input[placeholder="Cari Semua"]`
6. Extension cari `buyerUsername`.
7. Extension pilih conversation yang match.
8. Extension download video blob dari `videoUrl`.
9. Extension attach file ke input upload Shopee Webchat.
10. Extension isi message template jika field chat tersedia.
11. Extension menandai job `prepared`.
12. Operator review dan klik send.
13. Setelah operator konfirmasi di extension, extension menandai job `sent`.

## Selector Shopee Webchat Yang Perlu Dipetakan

Known dari user:

```html
<input class="shopee-react-input__input" type="input" placeholder="Cari Semua" value="">
```

Masih perlu mapping:

- Selector hasil pencarian customer.
- Cara membedakan username exact match vs nama/display lain.
- Selector area composer chat.
- Selector tombol attach file.
- Selector input file internal.
- Selector tombol send.
- Indikator upload selesai.
- Indikator upload gagal.

## Risiko Dan Mitigasi

### Salah Customer

Risiko:

- Search username bisa menampilkan hasil mirip.

Mitigasi:

- Exact match username wajib.
- Tampilkan username target sebelum attach.
- Jangan auto-send di fase awal.

### Video Terlalu Besar

Risiko:

- Shopee Webchat menolak upload.

Mitigasi:

- Pastikan share file MP4 dikompresi.
- Tambahkan validasi ukuran maksimal sebelum prepare.
- Tampilkan error jika melebihi limit.

### Shopee Mengubah DOM

Risiko:

- Extension gagal cari field/tombol.

Mitigasi:

- Isolasi semua selector di satu file extension.
- Tambahkan status error jelas.
- Simpan screenshot/HTML contoh untuk update selector.

### Abuse/Spam Detection

Risiko:

- Auto-send massal bisa dianggap spam.

Mitigasi:

- Fase awal semi-otomatis.
- Throttle prepare job.
- Operator tetap review manual.

## Fase Implementasi

### Phase 1 - Backend Job Queue

- [ ] Tambah schema `recording_chat_sends`.
- [ ] Tambah store `chatSendStore`.
- [ ] Tambah endpoint prepare job dari recording.
- [ ] Tambah endpoint pending/prepared/sent/failed.
- [ ] Tambah types dan API client helpers.
- [ ] Build backend.

### Phase 2 - Web History UI

- [ ] Tambah tombol `Kirim ke Shopee Chat` di detail history web.
- [ ] Disable tombol jika recording/order belum valid.
- [ ] Tampilkan status job chat send.
- [ ] Tambah panel admin recent/pending/failed chat sends.
- [ ] Build web.

### Phase 3 - Mobile History UI

- [ ] Tambah tombol prepare job di detail history mobile.
- [ ] Tampilkan instruksi bahwa pengiriman dilakukan lewat desktop Chrome extension.
- [ ] Build mobile.

### Phase 4 - Extension Webchat Mode

- [ ] Tambah tab/mode `Prepare Chat` di popup extension.
- [ ] Fetch pending jobs dari backend.
- [ ] Tampilkan daftar job pending.
- [ ] Buka/validasi halaman Shopee Webchat.
- [ ] Isi search customer `Cari Semua`.
- [ ] Pilih conversation exact match.
- [ ] Attach video blob.
- [ ] Isi message template.
- [ ] Mark job `prepared`.
- [ ] Operator klik send manual.
- [ ] Mark job `sent` dari popup setelah operator konfirmasi.

### Phase 5 - Hardening

- [ ] Validasi ukuran video maksimal.
- [ ] Retry/failure state lebih jelas.
- [ ] Audit log di admin.
- [ ] Throttle job prepare.
- [ ] Tambah manual override username jika Shopee search gagal.

## Testing Checklist

- [ ] Prepare job gagal jika recording belum completed.
- [ ] Prepare job gagal jika resi belum punya order Shopee.
- [ ] Prepare job sukses jika recording completed dan order Shopee ada.
- [ ] Pending job muncul di extension.
- [ ] Extension bisa search customer di Webchat.
- [ ] Extension hanya memilih exact username match.
- [ ] Extension bisa attach video.
- [ ] Extension tidak auto-send tanpa operator review.
- [ ] Status `prepared` tersimpan.
- [ ] Status `sent` tersimpan setelah operator konfirmasi.
- [ ] Status `failed` tersimpan jika search/attach gagal.

## Open Questions

- Berapa maksimal ukuran video yang diterima Shopee Webchat?
- Apakah Shopee menerima `webm`, atau wajib `mp4`?
- Apakah username pembeli selalu bisa dicari di Webchat dengan `buyerUsername` dari order card?
- Apakah pesan perlu template berbeda untuk QC dan Packing?
- Apakah semua video dikirim, atau hanya video packing final?

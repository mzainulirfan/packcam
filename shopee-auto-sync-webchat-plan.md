# Plan: Shopee Auto Sync + Webchat Auto Send

## Tujuan

Mengurangi kerja manual operator untuk integrasi Shopee:

- Order Shopee yang terlihat di halaman Seller otomatis disinkronkan ke Pakti.
- Recording packing hari ini yang sudah selesai otomatis dibuatkan job kirim video.
- Semua pengiriman chat, baik video paket maupun informasi paket dikirim, hanya berjalan lewat tab Shopee Webchat.
- Sidebar/minichat Seller Center tidak digunakan untuk pengiriman chat.

## Prinsip Desain Teknis

- Backend tetap menjadi source of truth untuk recording, order, queue, status, dan dedupe.
- Extension hanya melakukan dua hal:
  - membaca DOM Shopee Seller order page untuk sync order
  - mengoperasikan DOM Shopee Webchat untuk kirim chat
- Auto send hanya boleh aktif di `https://seller.shopee.co.id/new-webchat/conversations` atau domain Shopee Webchat setara.
- Status `sent` tidak boleh di-reset oleh auto prepare.
- Status `cancelled` tidak boleh otomatis di-retry.
- Default auto video hanya memakai recording `packing`, bukan `qc`.

## Pipeline 1: Auto Sync Order Shopee

### Lokasi Aktif

Extension aktif di halaman Shopee Seller order, terutama:

```text
https://seller.shopee.co.id/portal/sale/order?type=shipping
```

### Flow

1. Extension mendeteksi halaman order shipping.
2. Extension menjalankan `extractOrders()` dari DOM order yang terlihat.
3. Extension mengirim hasil ke backend:

```http
POST /api/import/shopee/orders
```

Payload:

```json
{
  "orders": [
    {
      "source": "shopee",
      "orderNumber": "...",
      "trackingNumber": "...",
      "buyerUsername": "...",
      "shippingChannel": "...",
      "items": []
    }
  ]
}
```

4. Backend melakukan upsert order.
5. Extension dapat melanjutkan prepare shipping chat dari order yang terlihat:

```http
POST /api/shopee/shipping-chat/prepare
```

### Dedupe

Extension menyimpan signature di `sessionStorage`, misalnya gabungan:

```text
orderNumber|trackingNumber|buyerUsername
```

Jika signature belum berubah, extension tidak perlu sync ulang.

### Interval

Saran interval awal:

- initial scan: 2,5 detik setelah page load
- repeat scan: 15-30 detik
- hanya sync kalau signature berubah
- scan konservatif boleh scroll ringan satu layar untuk menangkap kartu tambahan, lalu kembali ke posisi awal

## Pipeline 2: Auto Prepare Video Chat

### Lokasi Logic

Logic utama ada di backend, bukan extension.

### Endpoint Baru

```http
POST /api/chat-sends/auto-prepare-ready
```

### Tugas Endpoint

Endpoint mencari recording yang siap dibuatkan job chat video.

Kriteria awal:

- `recordings.status = 'completed'`
- `recordings.record_date = today local`
- `recordings.task_type = 'packing'`
- ada order Shopee dengan `orders.tracking_number = recordings.resi_number`
- order punya `buyer_username`
- belum ada `recording_chat_sends` untuk recording tersebut dengan status:
  - `pending`
  - `prepared`
  - `sent`
- jika status sebelumnya `failed` atau `cancelled`, jangan auto-create ulang kecuali ada aksi retry/manual.

### Flow Endpoint

1. Query recording packing hari ini yang `completed`.
2. Cocokkan dengan order Shopee berdasarkan resi.
3. Skip jika order/buyer tidak ada.
4. Skip jika job aktif atau sudah `sent`.
5. Siapkan share file:

```ts
prepareRecordingShareFile(recording.id)
```

6. Buat job:

```ts
prepareRecordingChatSend({
  recordingId: recording.id,
  videoFilePath: shareFile.filePath,
})
```

7. Return ringkasan:

```json
{
  "created": [],
  "skipped": [],
  "failed": []
}
```

### Batch Limit

Batasi jumlah kerja per call:

- default: 5 recording
- maximum: 20 recording

Alasan:

- transcode/share file bisa berat
- menghindari delay panjang pada satu request

## Pipeline 3: Webchat Worker

### Lokasi Aktif

Hanya aktif di:

```text
https://seller.shopee.co.id/new-webchat/conversations
```

### Flow

1. Extension membaca config API.
2. Extension memanggil auto prepare:

```http
POST /api/chat-sends/auto-prepare-ready
```

3. Extension mengambil pending video chat:

```http
GET /api/chat-sends/pending
```

4. Jika ada job video chat, kirim dulu.
5. Jika tidak ada job video chat, ambil shipping chat:

```http
GET /api/shopee/shipping-chat/next
```

6. Extension mencari buyer di Webchat search.
7. Jika buyer ditemukan:
   - pilih conversation
   - attach video jika ada `videoUrl`
   - isi pesan
   - klik/send
   - mark `prepared`
   - mark `sent`
8. Jika buyer tidak ditemukan:
   - mark `cancelled`
   - lanjut job berikutnya
9. Jika error lain:
   - mark `failed`
   - lanjut sesuai retry limit backend

## Prioritas Queue

Prioritas awal:

1. Video chat packing (`/api/chat-sends/pending`)
2. Shipping info chat (`/api/shopee/shipping-chat/next`)

Alasan:

- video packing lebih spesifik ke recording yang baru selesai
- shipping info bisa dikirim setelahnya jika queue video kosong

## Status Handling

### Success

```http
POST /api/chat-sends/:id/prepared
POST /api/chat-sends/:id/sent
```

atau untuk shipping:

```http
POST /api/shopee/shipping-chat/:id/prepared
POST /api/shopee/shipping-chat/:id/sent
```

### Buyer Tidak Ditemukan

```http
POST /api/chat-sends/:id/cancelled
```

atau:

```http
POST /api/shopee/shipping-chat/:id/cancelled
```

### Error Teknis

```http
POST /api/chat-sends/:id/failed
```

atau:

```http
POST /api/shopee/shipping-chat/:id/failed
```

### Retry Manual Admin

```http
POST /api/chat-sends/:id/retry
POST /api/shopee/shipping-chat/:id/retry
```

Retry hanya untuk status `failed` atau `cancelled`. Status `sent` tetap hard stop dan tidak di-reset otomatis.

## Perubahan Backend

### File

```text
services/backend/src/store/chatSendStore.ts
services/backend/src/app.ts
```

### Function Baru

```ts
prepareReadyRecordingChatSendsForToday(options?: {
  limit?: number
  taskType?: 'packing' | 'qc'
})
```

### Endpoint Baru

```http
POST /api/chat-sends/auto-prepare-ready
```

Request opsional:

```json
{
  "limit": 5,
  "taskType": "packing"
}
```

## Perubahan Extension

### File

```text
apps/shopee-extension/content.js
apps/shopee-extension/popup.js
apps/shopee-extension/popup.html
apps/shopee-extension/popup.css
apps/shopee-extension/README.md
```

### Content Script

- Auto sync order hanya aktif di halaman order shipping.
- Auto send chat hanya aktif di tab Webchat.
- Sebelum mengambil pending chat, panggil `/api/chat-sends/auto-prepare-ready`.
- Hapus semua flow pengiriman via sidebar/minichat.

### Popup

- Tampilkan status bahwa mode aktif adalah `webchat only`.
- Tambah informasi singkat:
  - order page = sync/prepare queue
  - webchat page = send queue
- Optional: tombol manual `[auto-prepare-ready]` untuk debugging.

## Risiko Dan Mitigasi

### Risiko: Video Terkirim Dobel

Mitigasi:

- backend tidak auto-create job jika sudah ada status `pending`, `prepared`, atau `sent`
- status `sent` menjadi hard stop

### Risiko: Buyer Tidak Ditemukan

Mitigasi:

- mark `cancelled`
- simpan error message
- tidak retry otomatis

### Risiko: Share File Belum Siap / Transcode Lama

Mitigasi:

- batasi batch auto prepare
- proses hanya beberapa recording per call
- simpan failed reason jika file gagal dibuat

### Risiko: DOM Shopee Berubah

Mitigasi:

- selector tetap kecil dan terisolasi di extension
- jika gagal cari buyer/composer/send button, mark `failed` atau `cancelled`

### Risiko: Auto Sync Terlalu Sering

Mitigasi:

- gunakan signature `sessionStorage`
- interval 15-30 detik
- sync hanya jika data terlihat berubah

## Implementasi Bertahap

### Phase 1: Auto Sync Order

- Extension auto import order yang terlihat di halaman shipping.
- Reuse endpoint `/api/import/shopee/orders`.
- Reuse prepare shipping chat.

### Phase 2: Backend Auto Prepare Video Chat

- Tambah function query recording packing hari ini.
- Tambah endpoint `/api/chat-sends/auto-prepare-ready`.
- Generate share file otomatis.
- Buat job chat video otomatis.

### Phase 3: Webchat Worker Integration

- Extension Webchat memanggil auto prepare.
- Extension kirim video chat pending.
- Jika kosong, kirim shipping chat pending.

### Phase 4: UI/Monitoring

- Popup menampilkan mode aktif.
- Admin/History sudah menampilkan status queue.
- Popup menampilkan ringkasan auto prepare.
- Admin bisa filter status dan retry manual job `failed`/`cancelled` untuk video chat dan shipping chat.
- Admin menampilkan metrik automation: order sync, pending queue, sent/failed hari ini, dan heartbeat Webchat worker.
- Extension mengirim heartbeat ke backend saat tab Webchat worker aktif.

## Acceptance Criteria

- Operator tidak perlu klik `Siapkan Shopee Chat` satu per satu dari detail rekaman.
- Order Shopee yang terlihat di halaman shipping otomatis tersync.
- Recording packing hari ini otomatis dibuat job video chat jika order Shopee tersedia.
- Semua chat dikirim hanya dari tab Shopee Webchat.
- Buyer tidak ditemukan otomatis `cancelled` dan antrean lanjut.
- Chat sukses tercatat `sent` di Pakti.
- Tidak ada pengiriman via sidebar/minichat.

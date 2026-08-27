# Plan: Shopee Shipping Chat Notification

## Tujuan

Menambahkan fitur pada extension Shopee untuk mengirim chat otomatis ke pembeli saat pesanan sudah masuk tab `Pesanan Dikirim`.

Pesan yang dikirim berisi informasi bahwa pesanan sudah diproses dan masuk proses pengiriman.

## Contoh Pesan

```text
Halo kak {nama_pembeli}, pesanan kakak {nomor_pesanan} dengan resi {nomor_resi} sudah masuk proses pengiriman.

Silakan pantau update pengiriman melalui aplikasi Shopee ya kak. Terima kasih sudah berbelanja.
```

## Scope

- Extension membaca halaman Shopee tab `Pesanan Dikirim`.
- URL target tab dikirim: `https://seller.shopee.co.id/portal/sale/order?type=shipping`.
- Extension mengambil daftar nomor pesanan yang tampil.
- Extension mencocokkan nomor pesanan dengan data order yang sudah pernah tersimpan di backend.
- Jika cocok dan belum pernah dikirim notifikasi pengiriman, extension membuat/memproses queue chat.
- Jika ada lebih dari satu pesanan, pengiriman dilakukan antre satu per satu dengan jeda antar pesan.
- Status pengiriman chat dicatat agar tidak terkirim berulang.

## Non-Scope Awal

- Tidak mengubah proses chat QC/video yang sudah ada.
- Tidak attach video pada chat notifikasi pengiriman.
- Tidak mengirim chat untuk order yang tidak punya `buyerUsername`.
- Tidak mencoba bypass limitasi Shopee atau perubahan keamanan webchat.

## Data Yang Dibutuhkan

Dari order Shopee yang sudah tersimpan:

- `orderNumber`
- `trackingNumber`
- `buyerUsername`
- `orderStatus`
- `items` jika nanti ingin dipakai di pesan

Dari halaman Shopee tab `Pesanan Dikirim`:

- `orderNumber`
- status visual bahwa order berada di tab dikirim
- opsional: `trackingNumber`, jika tersedia di DOM

## Data Model Baru

Tambahkan tabel baru agar status fitur ini terpisah dari queue chat QC/video.

Nama tabel yang disarankan:

`shipping_chat_sends`

Kolom:

- `id`
- `order_id`
- `order_number`
- `tracking_number`
- `buyer_username`
- `message`
- `status`: `pending`, `prepared`, `sent`, `failed`, `cancelled`
- `attempt_count`
- `last_error`
- `sent_at`
- `created_at`
- `updated_at`

Constraint:

- Unique per `order_number` dan `buyer_username`, agar tidak double-send.

## Backend API

Endpoint yang disarankan:

### `POST /api/shopee/shipping-chat/prepare`

Input:

```json
{
  "orderNumbers": ["250827ABC123", "250827ABC124"]
}
```

Behavior:

- Cari order berdasarkan `orderNumber`.
- Skip order yang tidak ditemukan.
- Skip order tanpa `buyerUsername`.
- Skip order yang sudah punya shipping chat dengan status `sent` atau `pending`.
- Buat queue baru untuk order yang valid.
- Return daftar queue yang dibuat dan daftar order yang diskip beserta alasannya.

Response:

```json
{
  "created": [],
  "skipped": []
}
```

### `GET /api/shopee/shipping-chat/next`

Behavior:

- Ambil satu queue `pending` paling lama.
- Return data buyer dan message.

### `POST /api/shopee/shipping-chat/:id/sent`

Behavior:

- Tandai queue sebagai `sent`.
- Set `sent_at`.

### `POST /api/shopee/shipping-chat/:id/failed`

Behavior:

- Tambah `attempt_count`.
- Simpan `last_error`.
- Jika attempt masih di bawah batas, status bisa tetap `pending`.
- Jika sudah melewati batas, status menjadi `failed`.

## Extension Flow

### 1. Scan Tab Pesanan Dikirim

Extension berjalan saat user berada di halaman Shopee Seller Center bagian pesanan dikirim.

URL yang didukung:

`https://seller.shopee.co.id/portal/sale/order?type=shipping`

Deteksi halaman:

- Host harus `seller.shopee.co.id`.
- Path harus `/portal/sale/order`.
- Query parameter `type` harus bernilai `shipping`.
- Jika Shopee menambahkan query lain, extension tetap boleh jalan selama `type=shipping` ada.

Tugas:

- Deteksi halaman/tab aktif.
- Pastikan URL cocok dengan tab shipping: `/portal/sale/order?type=shipping`.
- Scrape card/baris order.
- Ambil `orderNumber` dari setiap order.
- Kirim daftar `orderNumber` ke backend `prepare`.

### 2. Process Queue Chat

Extension mengambil queue dari backend satu per satu.

Flow:

- Panggil `GET /api/shopee/shipping-chat/next`.
- Jika tidak ada queue, berhenti.
- Buka Shopee Webchat untuk `buyerUsername`.
- Isi pesan.
- Kirim pesan.
- Panggil endpoint `sent` jika berhasil.
- Jika gagal, panggil endpoint `failed`.
- Tunggu jeda sebelum lanjut queue berikutnya.

Jeda awal yang disarankan:

- 8-12 detik antar pesan.
- Retry maksimal 2-3 kali per queue.

## Queue Rules

- Satu order hanya boleh dikirim satu kali.
- Queue `sent` tidak boleh diproses ulang.
- Queue `pending` tidak boleh dibuat dua kali untuk order yang sama.
- Queue `failed` boleh disiapkan ulang hanya lewat aksi eksplisit/manual.
- Jika browser/webchat belum siap, queue jangan ditandai `sent`.

## UI Web Yang Bisa Ditambahkan Nanti

Di halaman history atau admin:

- Badge status notifikasi pengiriman.
- Tombol `Siapkan chat pengiriman`.
- Filter status shipping chat.
- Log error jika pengiriman gagal.

## Risiko Teknis

- DOM Shopee dapat berubah sewaktu-waktu, sehingga scraper perlu dibuat defensif.
- Webchat Shopee bisa lambat, perlu wait/retry yang aman.
- Auto-send terlalu cepat berisiko dianggap spam, perlu delay.
- Beberapa order mungkin tidak punya `buyerUsername` di data lokal.
- Nomor pesanan bisa tampil dengan format berbeda di halaman Shopee.

## Strategi Implementasi Bertahap

### Tahap 1: Backend Queue

- Tambah schema `shipping_chat_sends`.
- Tambah store untuk create/read/update queue.
- Tambah API prepare/next/sent/failed.
- Tambah unit/manual test untuk unique dan idempotency.

### Tahap 2: Extension Scraper

- Deteksi halaman tab `Pesanan Dikirim`.
- Scrape nomor pesanan.
- Kirim order number ke endpoint prepare.
- Log hasil created/skipped.

### Tahap 3: Extension Chat Sender

- Ambil queue next.
- Buka webchat buyer.
- Isi message.
- Kirim otomatis dengan jeda.
- Update status sent/failed.

### Tahap 4: UI Monitoring

- Tampilkan status notifikasi pengiriman di web.
- Tambahkan retry manual untuk queue failed.

## Acceptance Criteria

- Order di tab `Pesanan Dikirim` bisa dikenali extension.
- Order number yang match dengan backend dibuatkan queue.
- Queue tidak dibuat dobel untuk order yang sama.
- Chat terkirim otomatis satu per satu dengan jeda.
- Status queue berubah menjadi `sent` setelah berhasil.
- Jika gagal, error tercatat dan queue tidak hilang.
- Fitur chat QC/video yang sudah ada tetap berjalan normal.

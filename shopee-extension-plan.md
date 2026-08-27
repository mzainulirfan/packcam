# Shopee Seller Chrome Extension Plan

## Tujuan

- Membuat Chrome Extension untuk mengambil data pesanan dari halaman Seller Shopee.
- Data yang diambil: nomor pesanan, nomor resi, produk, variasi/SKU jika ada, dan jumlah item.
- Data disimpan ke backend Pakti agar tersedia saat proses scan di mobile/web.
- Mobile/web tetap bisa scan seperti sekarang, tetapi dapat menampilkan konteks order jika data sudah tersedia.

## Prinsip Implementasi

- Tidak menyimpan credential Shopee.
- Extension hanya membaca halaman Seller Shopee yang sudah dibuka oleh user.
- Backend tetap menjadi sumber data utama untuk mobile/web.
- Import order bersifat upsert agar aman jika extension sync berulang.
- Mulai dari alur sederhana dan stabil sebelum optimasi selector/API capture.
- Jangan mengubah flow scan existing sampai data order terbukti stabil.

## Arsitektur

### 1. Chrome Extension

- Manifest V3.
- Content script berjalan di halaman Seller Shopee.
- Background service worker mengatur queue dan retry sync.
- Popup/options page untuk status dan konfigurasi.

Komponen:

- `manifest.json`
- `src/content/shopeeExtractor.ts`
- `src/background/syncQueue.ts`
- `src/popup/Popup.tsx`
- `src/options/Options.tsx` opsional
- `src/api/paktiClient.ts`
- `src/storage/extensionStorage.ts`

### 2. Backend Pakti

- Tambah schema SQLite untuk order Shopee.
- Tambah store khusus order.
- Tambah endpoint import dan lookup.
- Tambah CORS support untuk extension origin.

Komponen:

- `services/backend/src/store/orderStore.ts`
- endpoint import order Shopee
- endpoint lookup order by resi/order number
- migration/schema update di DB setup

### 3. Mobile/Web Pakti

- Saat scan resi, mobile/web lookup data order dari backend.
- Jika data ditemukan, tampilkan nomor pesanan dan daftar produk.
- Jika tidak ditemukan, scan tetap jalan seperti sekarang pada tahap awal.

## Data Yang Diambil Dari Shopee

Minimal:

- `orderNumber`
- `trackingNumber`
- `items[]`
- `productName`
- `quantity`

Opsional:

- `sku`
- `variationName`
- `buyerUsername`
- `orderStatus`
- `paidAt`
- `createdAtShopee`
- `imageUrl`
- `rawPayload`

## Data Model Backend

### Tabel `orders`

- `id`
- `source`
- `order_number`
- `tracking_number`
- `buyer_username`
- `order_status`
- `raw_payload`
- `created_at`
- `updated_at`

Constraint:

- unique `source`, `order_number`
- index `tracking_number`

### Tabel `order_items`

- `id`
- `order_id`
- `sku`
- `product_name`
- `variation_name`
- `quantity`
- `image_url`
- `created_at`
- `updated_at`

Relasi:

- `order_items.order_id` mengarah ke `orders.id`
- Saat order di-upsert, item lama untuk order tersebut bisa diganti dengan snapshot terbaru.

## Kontrak API Backend

### `POST /api/import/shopee/orders`

Dipakai extension untuk upload batch order.

Request:

```json
{
  "orders": [
    {
      "orderNumber": "250101ABC123",
      "trackingNumber": "SPXID123456789",
      "buyerUsername": "buyer_name",
      "orderStatus": "Siap Dikirim",
      "items": [
        {
          "sku": "SKU-001",
          "productName": "Nama Produk",
          "variationName": "Hitam / L",
          "quantity": 2,
          "imageUrl": "https://..."
        }
      ],
      "rawPayload": {}
    }
  ]
}
```

Response:

```json
{
  "ok": true,
  "data": {
    "imported": 10,
    "updated": 8,
    "skipped": 0
  }
}
```

### `GET /api/orders/by-resi/:resi`

Dipakai mobile/web saat scan.

Response jika ditemukan:

```json
{
  "ok": true,
  "data": {
    "order": {
      "orderNumber": "250101ABC123",
      "trackingNumber": "SPXID123456789",
      "items": []
    }
  }
}
```

Response jika tidak ditemukan:

```json
{
  "ok": true,
  "data": {
    "order": null
  }
}
```

### `GET /api/orders/by-order/:orderNumber`

Dipakai untuk debug/detail admin.

### `GET /api/orders/recent`

Opsional untuk halaman admin/history.

## Security

- Tambahkan API key sederhana untuk endpoint import extension.
- API key disimpan di extension storage lokal user.
- Backend membaca `SHOPEE_EXTENSION_API_KEY` dari environment.
- Extension mengirim header `X-Pakti-Extension-Key`.
- Endpoint lookup tetap mengikuti auth/session existing jika dipakai oleh mobile/web.
- CORS backend harus mengizinkan `chrome-extension://<extension-id>` setelah extension ID final diketahui.

## Flow Extension

1. User membuka halaman Seller Shopee.
2. Content script mendeteksi halaman order/list/detail.
3. Extractor membaca data order dari DOM atau data runtime halaman.
4. Data dinormalisasi ke format Pakti.
5. Data disimpan sementara ke extension storage.
6. Background worker mengirim batch ke backend.
7. Jika backend tidak aktif, data masuk queue.
8. Retry dilakukan saat popup dibuka, saat halaman berubah, atau interval service worker aktif.
9. Popup menampilkan status sync terakhir.

## Flow Mobile/Web Saat Scan

1. Operator scan resi.
2. App menjalankan flow recording existing.
3. App memanggil lookup order by resi ke backend.
4. Jika order ditemukan, tampilkan:
   - nomor pesanan
   - nomor resi
   - daftar produk
   - total qty
5. Jika order tidak ditemukan, tampilkan status ringan: data pesanan belum tersedia.
6. Pada tahap awal, scan tidak diblokir jika order tidak ditemukan.

## Tahapan Implementasi

### Phase 1: Backend Order Store

File baru:

- `services/backend/src/store/orderStore.ts`

Pekerjaan:

- Tambah schema `orders` dan `order_items`.
- Tambah fungsi upsert order batch.
- Tambah lookup by resi.
- Tambah lookup by order number.
- Tambah endpoint import dan lookup.

Validasi:

- `npm run build -w @pakti/backend`
- test manual `POST /api/import/shopee/orders`
- test manual `GET /api/orders/by-resi/:resi`

### Phase 2: Extension Skeleton

File baru:

- `apps/extension/manifest.json`
- `apps/extension/src/background/syncQueue.ts`
- `apps/extension/src/content/shopeeExtractor.ts`
- `apps/extension/src/popup/Popup.tsx`
- `apps/extension/src/api/paktiClient.ts`

Pekerjaan:

- Setup workspace extension.
- Build extension output.
- Popup menampilkan status API URL dan tombol sync.
- Content script bisa mengirim hasil dummy ke background.

Validasi:

- Extension bisa di-load unpacked di Chrome.
- Popup terbuka tanpa error.
- Background worker menerima pesan dari content script.

### Phase 3: Shopee DOM Extractor

Pekerjaan:

- Baca halaman Seller Shopee order list/detail.
- Extract nomor pesanan.
- Extract nomor resi.
- Extract produk dan qty.
- Simpan `rawPayload` untuk debugging.

Validasi:

- Buka halaman Seller Shopee dengan order nyata.
- Klik sync halaman ini.
- Popup menampilkan jumlah order yang terbaca.
- Data masuk backend.

Catatan:

- Selector Shopee berisiko berubah.
- Perlu sample DOM aktual sebelum membuat extractor final.

### Phase 4: Sync Queue dan Retry

Pekerjaan:

- Queue order yang belum terkirim.
- Retry jika backend mati.
- Tampilkan error terakhir di popup.
- Batasi batch size.

Validasi:

- Backend dimatikan, sync masuk queue.
- Backend dinyalakan, queue terkirim.
- Data tidak dobel karena upsert.

### Phase 5: Mobile/Web Order Lookup

Pekerjaan:

- Tambah API client order lookup.
- Mobile scan menampilkan info order by resi.
- Web scan/history bisa menampilkan info order jika dibutuhkan.

Validasi:

- Scan resi yang ada di DB order.
- Scan resi yang belum ada di DB order.
- Flow recording tetap sama.

### Phase 6: Hardening

Pekerjaan:

- API key untuk extension import.
- CORS extension origin.
- Admin page untuk lihat order terakhir opsional.
- Logging import terakhir.
- Export/debug raw payload opsional.

Validasi:

- Request tanpa API key ditolak.
- Request dengan API key diterima.
- Lookup mobile/web tetap berjalan.

## Risiko

- Struktur DOM Seller Shopee dapat berubah sewaktu-waktu.
- Order list Shopee bisa virtualized sehingga tidak semua order ada di DOM.
- Data resi bisa belum muncul jika order belum diproses.
- Browser extension service worker bisa tidur, sehingga retry perlu sederhana dan resilient.
- Backend lokal/tunnel harus aktif agar extension bisa sync.

## Keputusan Yang Perlu Dikonfirmasi

- Apakah scan harus tetap boleh jalan jika data order belum tersedia?
- Apakah endpoint import extension harus memakai API key dari awal?
- Apakah data yang diambil cukup dari halaman list, atau wajib juga halaman detail order?
- Apakah item produk perlu ditampilkan di mobile saat scan, atau cukup di web/history?
- Apakah extension akan dipakai hanya oleh admin di satu komputer atau beberapa akun/operator?

## Rekomendasi Urutan

1. Implement backend order store dan endpoint.
2. Implement extension skeleton.
3. Ambil sample DOM Seller Shopee aktual.
4. Implement extractor minimal.
5. Implement sync queue.
6. Integrasi lookup di mobile scan.
7. Hardening auth/CORS/logging.

# Pakti Shopee Sync Extension

Chrome MV3 extension untuk extract order dari Shopee Seller dan import ke Pakti API.

## Load Lokal

1. Buka `chrome://extensions`.
2. Aktifkan `Developer mode`.
3. Klik `Load unpacked`.
4. Pilih folder `apps/shopee-extension`.

## Config

- `API Base URL`: default `https://api-pakti.zakado.id`, bisa diganti ke `http://localhost:3001` untuk local backend.
- `Extension API Key`: isi sama dengan env backend `SHOPEE_EXTENSION_API_KEY`.

Jika `SHOPEE_EXTENSION_API_KEY` tidak diset di backend, endpoint import tetap bisa dipakai lewat sesi admin Pakti, tetapi flow extension lintas domain sebaiknya memakai API key.

## Cara Pakai

1. Buka halaman order/detail order di Shopee Seller.
2. Klik extension `Pakti Shopee Sync`.
3. Klik `Extract & Sync`.

Extractor saat ini memakai heuristic DOM umum. Mapping final perlu disesuaikan setelah ada contoh DOM/screenshot dari halaman Shopee Seller yang dipakai operasional.

## Prepare Shopee Chat

1. Dari Pakti Web History, buka detail recording dan klik `prepare-shopee-chat`.
2. Buka halaman `https://seller.shopee.co.id/new-webchat/conversations`.
3. Klik extension lalu klik `Load Pending Chats`.
4. Pilih job yang ingin diproses.
5. Klik `Prepare Shopee Chat`.
6. Extension akan mencari pembeli di tab Webchat, melampirkan video jika tersedia, mengirim pesan, dan menandai job sebagai `sent`.

Pengiriman chat hanya berjalan di tab Shopee Webchat (`/new-webchat/conversations`). Sidebar/minichat Seller Center tidak dipakai.

## Shipping Chat

1. Buka halaman `https://seller.shopee.co.id/portal/sale/order?type=shipping`.
2. Extension otomatis sync order yang terlihat dan menyiapkan antrean shipping chat saat halaman terbuka.
3. Jika perlu menjalankan manual, klik extension lalu klik `Prepare Shipping Chats`.
4. Buka `https://seller.shopee.co.id/new-webchat/conversations`.
5. Biarkan tab Webchat terbuka. Extension akan memproses antrean shipping chat dari tab ini.

## Auto Video Chat

1. Pastikan order Shopee sudah tersync dari halaman shipping.
2. Biarkan tab `https://seller.shopee.co.id/new-webchat/conversations` terbuka.
3. Extension otomatis meminta backend menyiapkan job video untuk recording `packing` hari ini yang sudah selesai dan punya order Shopee.
4. Extension mengirim video chat dari tab Webchat dan menandai job sebagai `sent`.
5. Jika buyer tidak ditemukan di Webchat, job ditandai `cancelled` agar antrean lanjut.

Popup menampilkan mode tab aktif:

- `[x] order sync`: halaman order shipping, extension dapat sync order dan prepare shipping queue.
- `[x] webchat worker`: halaman Webchat, extension dapat auto-prepare dan mengirim antrean chat.
- `[~] seller page`: halaman Seller Center lain, bukan halaman utama automation.
- `[!] unsupported`: tab bukan Shopee Seller.

Tombol `[auto-prepare-video]` dapat dipakai untuk memaksa backend mengecek recording `packing` hari ini dan membuat job video chat tanpa membuka detail rekaman satu per satu.

Job `failed` atau `cancelled` bisa dipantau dan di-retry manual dari Admin Console Pakti. Job `sent` tidak akan di-reset oleh auto-prepare maupun retry otomatis.

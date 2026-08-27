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
6. Extension akan mengisi field `Cari Semua` dengan username pembeli dan menyalin detail job ke clipboard.
7. Operator tetap memilih chat yang benar, attach video dari URL, dan kirim manual.
8. Setelah terkirim, klik `Mark Last Chat Sent`.

Auto-attach dan auto-send belum diaktifkan sampai selector upload Webchat dan batas ukuran video Shopee tervalidasi.

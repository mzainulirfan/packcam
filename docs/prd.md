# PRD Pakti Packcam

Tanggal konsolidasi: 2026-06-03

Dokumen ini menjadi sumber utama untuk konteks produk Pakti Packcam.

## Ringkasan Produk

Pakti Packcam adalah aplikasi operasional untuk merekam bukti proses QC dan packing paket. Aplikasi membantu operator memindai resi, merekam video proses kerja, menyimpan metadata rekaman, dan menelusuri history ketika terjadi komplain atau audit.

Produk berjalan sebagai aplikasi lokal berbasis web:

- Web dashboard untuk operator dan admin.
- Mobile web app untuk workflow scan dan history di perangkat genggam.
- Backend lokal untuk autentikasi, konfigurasi, database SQLite, upload chunk video, dan akses file rekaman.

## Tujuan Produk

- Mempercepat pencatatan bukti QC dan packing.
- Mengurangi risiko rekaman salah nama, hilang, atau tidak bisa ditelusuri.
- Memudahkan audit per resi, operator, task, status, dan tanggal.
- Memberi workflow yang dapat dipakai di laptop maupun mobile.
- Menjaga setup tetap ringan dengan server lokal dan SQLite.

## Pengguna Utama

- Operator QC: melakukan pemeriksaan barang sebelum packing.
- Operator Packing: merekam proses pengemasan.
- Admin Operasional: mengelola operator, settings, health, dan audit.
- Owner atau Supervisor: mencari bukti ketika ada komplain.

## Scope Produk

- Bootstrap admin pertama.
- Login operator berbasis username, kode operator, password, dan role.
- Role `admin` dan `operator`.
- Task kerja `qc` dan `packing`.
- Scan resi lewat input manual/barcode dan kamera.
- Preview kamera, watermark, recording, upload chunk, finalize, dan recovery.
- Mobile scan queue menjaga recording aktif tetap berjalan ketika kamera membaca resi duplikat atau resi yang sudah selesai diproses.
- History dengan filter, grouping per resi, preview, download, copy, export, dan share file video.
- Share video mobile menyiapkan salinan MP4 kompatibel WhatsApp dari backend sebelum membuka native share sheet.
- Users, Settings, Health, Admin, dan mobile workflow.

## Update Produk 2026-06-07

- Backend lokal dapat dipakai oleh frontend Vercel melalui Cloudflared tunnel `https://api-pakti.zakado.id`.
- Runtime Windows dapat dijalankan di background agar backend dan tunnel tetap aktif tanpa terminal terlihat.
- Alur share mobile diperkuat: video asli dari MediaRecorder tidak langsung dikirim ke WhatsApp, tetapi dikonversi dulu menjadi MP4 H.264/AAC yang lebih kompatibel.
- File share kompatibel dibuat on-demand di storage backend sehingga rekaman lama WebM atau MP4 bermasalah tetap bisa dibagikan ulang.

## Sumber Gabungan

- `README.md`
- `26-stack-dan-arsitektur.md`

---

## Sumber: `README.md`

# Pakti Implementation Plan

Dokumen ini memecah rencana pengerjaan Pakti menjadi beberapa tahap kecil agar implementasi lebih ringan dan mudah diverifikasi.

## Daftar Tahap

1. [00 - Persiapan Project](./00-persiapan-project.md)
2. [01 - Database dan Konfigurasi Dasar](./01-database-dan-konfigurasi-dasar.md)
3. [02 - Kamera dan Preview](./02-kamera-dan-preview.md)
4. [03 - Input Scan Barcode](./03-input-scan-barcode.md)
5. [04 - Rekam Video Inti](./04-rekam-video-inti.md)
6. [05 - Stabilitas dan Recovery](./05-stabilitas-dan-recovery.md)
7. [06 - Riwayat dan Pencarian](./06-riwayat-dan-pencarian.md)
8. [07 - Preview Video dan Akses File](./07-preview-video-dan-akses-file.md)
9. [08 - Settings dan UX](./08-settings-dan-ux.md)
10. [09 - Export dan Fitur Tambahan](./09-export-dan-fitur-tambahan.md)
11. [10 - Hardening dan Distribusi](./10-hardening-dan-distribusi.md)
12. [11 - Konfigurasi Sistem](./11-konfigurasi-sistem.md)
13. [12 - Design System](./12-design-system.md)
14. [16 - Redesign Halaman Login](./16-redesign-halaman-login.md)
15. [17 - Bugfix Perekaman Video Proses Packing](./17-bugfix-perekaman-video-proses-packing.md)
16. [18 - Web Full SQLite Plan](./18-web-full-sqlite-plan.md)
17. [19 - Backend API SQLite Server-Side Plan](./19-backend-api-sqlite-server-plan.md)
18. [24 - Rencana Pengembangan Users](./24-rencana-pengembangan-user.md)
19. [25 - Rencana Admin Multi-Task](./25-rencana-admin-multi-task.md)
20. [26 - Stack dan Arsitektur Aplikasi](./26-stack-dan-arsitektur.md)
21. [27 - Rencana Migrasi shadcn/ui](./27-rencana-migrasi-shadcn-ui.md)
22. [28 - Rencana Migrasi Monorepo Aman](./28-rencana-migrasi-monorepo-aman.md)

## Cara Pakai

- Kerjakan tahap secara berurutan.
- Jangan lanjut ke tahap berikutnya sebelum tahap saat ini stabil.
- Jika tahap terlalu besar, pecah lagi menjadi task kecil per file atau per komponen.

---

## Sumber: `26-stack-dan-arsitektur.md`

# 26 - Stack dan Arsitektur Aplikasi

Dokumen ini menjelaskan teknologi yang dipakai Pakti dan bagaimana komponen aplikasinya saling terhubung.

## Ringkasan Stack

- Frontend: React 19
- Bahasa utama: TypeScript
- Build tool: Vite
- Styling: Tailwind CSS
- Ikon: Lucide React dan Boxicons
- Backend API: Node.js dengan Express
- Storage lokal: SQLite melalui `better-sqlite3`
- Utilitas dev server: `tsx`

## Pembagian Komponen

### Frontend

Frontend berjalan di browser dan menangani:

- tampilan login
- halaman dashboard
- input scan barcode
- preview kamera
- history rekaman
- pengelolaan user
- pengaturan sistem dan branding

### Backend API

Backend berjalan sebagai server lokal dan menangani:

- autentikasi session
- penyimpanan dan pembacaan data aplikasi
- pengelolaan user/operator
- pengaturan sistem
- pembuatan dan pembaruan recording
- log scan dan history
- akses file video dan storage pendukung

### Database

Data aplikasi disimpan di SQLite pada folder `server-data`.

Data yang disimpan antara lain:

- profil user/operator
- session login
- recording video
- log scan
- pengaturan aplikasi
- konfigurasi branding
- status bootstrap dan error terakhir

## Alur Runtime

1. Browser memuat aplikasi frontend.
2. Frontend membaca session dan konfigurasi dari API lokal.
3. Jika user login valid, dashboard ditampilkan.
4. Saat scan dimulai, frontend berkomunikasi dengan backend untuk validasi dan pencatatan proses.
5. Rekaman video dan metadata disimpan ke storage lokal.
6. History, user, settings, dan health membaca data yang sama dari backend.

## Kenapa Struktur Ini Dipakai

- UI tetap ringan karena logic utama dibagi antara browser dan server lokal.
- Data lebih konsisten karena semua halaman membaca sumber yang sama.
- Storage lokal cocok untuk workflow operasional yang berjalan di satu perangkat.
- Backend API membuat proses login, recording, dan history lebih mudah divalidasi.

## Catatan Implementasi

- Frontend dibangun dengan Vite agar cepat di dev dan build.
- Backend dijalankan sebagai proses terpisah supaya API dan UI bisa dikontrol sendiri.
- SQLite dipilih karena sederhana, cepat, dan tidak butuh database server tambahan.
- Kamera diproses lewat browser API, jadi aplikasi harus dijalankan pada environment yang mengizinkan akses kamera.


# Checklist Implementasi Tauri / Desktop per File

Dokumen ini memecah migrasi PackCam ke Tauri menjadi checklist file/module supaya pengerjaan bisa dilakukan satu per satu.

## 1. Entry App dan Shell Desktop

### File yang ada sekarang

- `src/main.tsx`
- `src/App.tsx`
- `src/App.css`
- `src/index.css`
- `vite.config.ts`

### Checklist

- [ ] Pastikan `App` tetap bisa dirender dari web dan desktop.
- [ ] Tambahkan desktop entry point jika diperlukan oleh Tauri.
- [ ] Siapkan window state dasar.
- [ ] Pastikan title dan branding tetap konsisten.
- [ ] Pastikan CSS shell utama tetap bekerja di desktop.

## 2. App Navigation dan UI State

### File yang ada sekarang

- `src/app/navigation.ts`
- `src/app/uiState.ts`

### Checklist

- [ ] Tambahkan validasi page yang tetap aman untuk desktop.
- [ ] Pastikan state navigasi tidak tergantung browser-only behavior.
- [ ] Hapus state yang sudah tidak diperlukan.
- [ ] Pastikan page akses admin tetap konsisten.
- [ ] Siapkan mekanisme reset page jika data storage berubah.

## 3. Operator Session dan Auth

### File yang ada sekarang

- `src/app/operatorSession.ts`
- `src/pages/OperatorLoginPage.tsx`

### Checklist

- [ ] Pindahkan storage session ke storage desktop.
- [ ] Pastikan login tetap berbasis username + password.
- [ ] Pastikan role `admin` dan `operator` tetap ada.
- [ ] Pastikan daftar operator tersimpan tetap bisa dipakai.
- [ ] Siapkan migrasi dari auth browser ke auth desktop.
- [ ] Pastikan logout membersihkan session desktop.

## 4. Storage Abstraction

### File yang ada sekarang

- `src/data/storage.ts`
- `src/data/defaultSettings.ts`
- `src/data/systemConfig.ts`
- `src/data/settings.ts`
- `src/data/types.ts`

### Checklist

- [ ] Pisahkan storage interface dari implementasi browser.
- [ ] Buat adapter desktop untuk storage lokal.
- [ ] Simpan settings di SQLite.
- [ ] Simpan system config di SQLite.
- [ ] Simpan last error di storage desktop.
- [ ] Pastikan helper baca/tulis tetap punya API yang stabil.

## 5. User Management

### File yang ada sekarang

- `src/pages/UsersPage.tsx`
- `src/data/types.ts`
- `src/app/operatorSession.ts`

### Checklist

- [ ] Pindahkan CRUD user ke repository desktop.
- [ ] Pastikan validasi duplikat tetap berjalan.
- [ ] Pastikan role switch tetap dipakai.
- [ ] Pastikan default admin tetap tersedia.
- [ ] Pastikan modal create/edit/reset tetap bekerja.
- [ ] Pastikan operator session aktif ikut ter-update jika user dihapus atau diganti.

## 6. Scan Workflow dan Recording

### File yang ada sekarang

- `src/pages/ScanPage.tsx`
- `src/hooks/useBarcodeScanner.ts`
- `src/hooks/useCameraStream.ts`
- `src/hooks/useRecordingSession.ts`
- `src/hooks/useWatermarkedStream.ts`
- `src/hooks/useStorageEstimate.ts`
- `src/components/CameraPreview.tsx`
- `src/components/BarcodeInput.tsx`
- `src/data/recordings.ts`
- `src/data/scanLogs.ts`

### Checklist

- [ ] Ganti penyimpanan blob ke file filesystem.
- [ ] Ganti path video ke path lokal desktop.
- [ ] Pastikan background save tetap aman saat scan cepat.
- [ ] Pastikan watermark tetap terbakar ke output video.
- [ ] Pastikan recovery session tetap ada.
- [ ] Pastikan scan log dan recording log tetap tersimpan ke SQLite.
- [ ] Pastikan preview kamera tetap berjalan di webview desktop.

## 7. History dan Preview

### File yang ada sekarang

- `src/pages/HistoryPage.tsx`
- `src/data/exporters.ts`
- `src/utils/download.ts`

### Checklist

- [ ] Baca preview video dari filesystem lokal.
- [ ] Tetap dukung modal preview video.
- [ ] Pertahankan tombol download dan copy path.
- [ ] Pastikan filter history tetap berbasis SQLite query.
- [ ] Pastikan pagination tetap stabil.
- [ ] Pastikan admin dan operator melihat data sesuai hak akses.

## 8. Settings dan Brand Config

### File yang ada sekarang

- `src/pages/SettingsPage.tsx`
- `src/data/systemConfig.ts`
- `src/config/defaultSystemConfig.ts`

### Checklist

- [ ] Ganti folder picker browser dengan dialog native desktop.
- [ ] Pastikan path root video disimpan ke storage desktop.
- [ ] Pertahankan brand config.
- [ ] Pertahankan config video dan kamera.
- [ ] Pastikan update settings langsung mempengaruhi UI global.

## 9. Health dan Reset Data

### File yang ada sekarang

- `src/pages/HealthPage.tsx`
- `src/data/storage.ts`

### Checklist

- [ ] Pastikan health menampilkan status desktop yang relevan.
- [ ] Pertahankan reset data scan-only.
- [ ] Pertahankan reset all data dengan modal peringatan.
- [ ] Pastikan reset all data benar-benar menghapus storage desktop termasuk user.
- [ ] Pertahankan clear error.

## 10. Design System dan UI Consistency

### File yang ada sekarang

- `docs/12-design-system.md`
- `src/App.css`
- `src/index.css`

### Checklist

- [ ] Pertahankan token warna yang sudah ada.
- [ ] Pertahankan ukuran field dan tombol yang compact.
- [ ] Pastikan sidebar, header, card, table, dan modal konsisten.
- [ ] Jika ada komponen desktop-native baru, ikuti style guide yang sama.

## 11. Desktop Native Files yang Akan Ditambah

### File/folder target

- `src-tauri/`
- `src-tauri/tauri.conf.*`
- `src-tauri/src/main.rs`
- `src-tauri/src/lib.rs`
- file helper desktop untuk filesystem dan SQLite

### Checklist

- [ ] Buat shell Tauri.
- [ ] Tambahkan command desktop native.
- [ ] Tambahkan filesystem helper.
- [ ] Tambahkan SQLite helper.
- [ ] Tambahkan dialog native helper.
- [ ] Tambahkan window event handler bila diperlukan.

## 12. Build dan Release

### File yang ada sekarang

- `package.json`
- `vite.config.ts`

### Checklist

- [ ] Tambahkan script build desktop.
- [ ] Tambahkan script dev desktop.
- [ ] Tambahkan script packaging.
- [ ] Pastikan version metadata konsisten.
- [ ] Tambahkan icon aplikasi desktop.
- [ ] Siapkan output installer.

## 13. Urutan Kerja Paling Aman

1. `src/main.tsx`, `src/App.tsx`, `src/App.css`
2. `src/app/uiState.ts`, `src/app/navigation.ts`
3. `src/app/operatorSession.ts`
4. `src/data/storage.ts`, `src/data/settings.ts`, `src/data/systemConfig.ts`
5. `src/data/recordings.ts`, `src/data/scanLogs.ts`
6. `src/pages/ScanPage.tsx`
7. `src/pages/HistoryPage.tsx`
8. `src/pages/SettingsPage.tsx`
9. `src/pages/UsersPage.tsx`
10. `src/pages/HealthPage.tsx`
11. `src-tauri/*`
12. `package.json`, `vite.config.ts`

## 14. Kriteria Tiap File Selesai

- File masih lolos build.
- File masih lolos lint.
- File tidak mengubah perilaku UI di luar scope migrasi.
- File punya jalur migrasi yang jelas ke desktop.


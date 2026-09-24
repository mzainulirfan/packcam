# Review & Redesign Plan — Halaman History Pakti

## 1. Ringkasan

Halaman **History** saat ini sudah memiliki struktur dasar yang cukup jelas: navigasi di sidebar, area header, ringkasan jumlah dokumentasi, filter, dan tabel daftar dokumentasi paket.

Masalah utamanya bukan pada kelengkapan fitur, tetapi pada **hierarki visual, kepadatan informasi, keterbacaan, dan efisiensi interaksi**. Tampilan masih terasa seperti panel administrasi generik dengan banyak garis/border, ruang kosong besar, serta elemen penting yang belum memiliki prioritas visual yang kuat.

Target redesign adalah membuat halaman terasa lebih modern, lebih cepat dipindai, dan lebih fokus pada pekerjaan utama operator/admin: **mencari resi, melihat status dokumentasi QC/Packing, lalu membuka detail paket yang membutuhkan tindakan**.

---

## 2. Review Desain Saat Ini

### 2.1 Hal yang Sudah Baik

1. **Struktur navigasi cukup jelas**
   - Sidebar membedakan area `Operasional` dan `Administrasi`.
   - Menu aktif `History` sudah terlihat berbeda dari menu lain.
   - User dapat memahami posisi halaman dengan cepat.

2. **Fungsi utama sudah tersedia**
   - Pencarian.
   - Filter task.
   - Filter user/operator.
   - Rentang tanggal.
   - Reset filter.
   - Export.
   - Tabel dokumentasi.
   - Aksi detail dan copy resi.

3. **Informasi status QC dan Packing dipisahkan**
   - Ini penting karena user dapat langsung melihat tahapan mana yang sudah selesai.

4. **Status akhir menggunakan warna**
   - `Lengkap` dan `Belum lengkap` sudah memiliki pembeda visual.

5. **Video tidak langsung dimuat**
   - Copywriting menyebut video hanya dimuat setelah preview dipilih.
   - Ini merupakan keputusan yang baik untuk performa halaman.

---

## 3. Masalah UI Saat Ini

### 3.1 Terlalu Banyak Border dan Container

Hampir setiap bagian ditempatkan di dalam kotak dengan border:
- wrapper halaman,
- section header,
- summary,
- filter,
- daftar dokumentasi,
- tabel,
- tombol.

Akibatnya halaman terasa berat secara visual dan hierarchy antar-area menjadi kurang jelas.

**Redesign:**
- Gunakan satu container utama.
- Gunakan card hanya untuk area yang memang membutuhkan grouping.
- Kurangi border dan gunakan kombinasi `background`, `spacing`, dan `divider`.

---

### 3.2 Hierarki Visual Header Kurang Kuat

Saat ini terdapat beberapa label:
- `[OPERASIONAL]`
- `History`
- `[SECTION]`
- `History`
- `[HISTORY]`
- `3 dokumentasi paket`

Kata **History** muncul beberapa kali dalam jarak yang berdekatan.

Hal ini menciptakan redundansi dan memperpanjang scan path.

**Redesign:**

Cukup gunakan:

```text
History Dokumentasi
Pantau dokumentasi QC dan packing berdasarkan resi.

[Export]
```

Kemudian tampilkan statistik sebagai summary card di bawah header.

---

### 3.3 Terlalu Banyak Ruang Kosong di Desktop

Area konten hanya mengisi bagian atas layar sementara bagian bawah sangat kosong.

Hal ini membuat tabel terlihat kecil walaupun desktop memiliki ruang horizontal dan vertikal yang besar.

**Redesign:**
- Tingkatkan ukuran container tabel.
- Gunakan row height yang nyaman.
- Tampilkan pagination atau jumlah hasil di bawah tabel.
- Hindari wrapper yang membuat konten berhenti terlalu awal.

---

### 3.4 Summary Belum Informatif

Saat ini summary hanya:

> 3 dokumentasi paket

Padahal informasi yang paling penting justru:
- berapa yang lengkap,
- berapa yang belum lengkap,
- QC selesai,
- Packing selesai.

**Redesign:**

Gunakan 3 summary cards:

| Card | Contoh |
|---|---:|
| Total Dokumentasi | 3 |
| Lengkap | 1 |
| Belum Lengkap | 2 |

Jika datanya relevan, dapat ditambah:

| Card | Contoh |
|---|---:|
| QC Selesai | 3 |
| Packing Selesai | 1 |

Namun untuk menjaga kesederhanaan, tiga card pertama sudah cukup.

---

## 4. Masalah UX Saat Ini

### 4.1 Search dan Filter Terlihat Sama Penting

Search resi adalah aktivitas yang kemungkinan paling sering digunakan, tetapi ukuran dan visualnya hampir sama dengan filter lainnya.

**Redesign:**
- Search dibuat paling dominan.
- Filter sekunder ditempatkan di sebelah kanan atau baris kedua.
- Tambahkan clear button pada search.

Contoh placeholder:

```text
Cari nomor resi...
```

Tidak perlu memasukkan terlalu banyak keyword seperti:

```text
Cari resi, file, path, status...
```

karena membuat tujuan search menjadi kurang jelas.

---

### 4.2 Filter Tanggal Kurang Jelas

Dua date picker berdampingan tanpa label membuat user harus menebak mana:
- tanggal mulai,
- tanggal akhir.

**Redesign:**

Gunakan:

```text
Tanggal
[ Mulai ] — [ Sampai ]
```

atau date-range picker jika tersedia.

---

### 4.3 Reset Filter Terlalu Dominan

Tombol Reset sekarang memiliki lebar sangat besar hingga memenuhi sisa area filter.

Secara hierarchy, `Reset` merupakan secondary action dan tidak perlu sebesar itu.

**Redesign:**
- Gunakan tombol ghost kecil.
- Tempatkan di ujung kanan filter.
- Tampilkan hanya ketika ada filter aktif.

Contoh:

```text
Reset filter
```

---

### 4.4 Status QC/Packing Sulit Dipindai

Saat ini status menggunakan kombinasi teks:

```text
✓ Selesai
— Belum ada
```

Namun belum memiliki indikator visual yang cukup kuat.

**Redesign:**

Gunakan status badge:

```text
✓ Selesai
○ Belum ada
```

Dengan aturan:
- selesai = success / hijau,
- belum ada = neutral / abu,
- gagal/error jika ada = destructive / merah.

---

### 4.5 Status Akhir Terlalu Panjang

Badge status akhir dibuat hampir selebar kolom sehingga terlihat seperti input field.

**Redesign:**

Badge cukup selebar kontennya:

```text
✓ Lengkap
! Belum lengkap
```

Bukan full width.

---

### 4.6 Aksi Terlalu Banyak Terlihat Sekaligus

Setiap row memiliki:
- Detail
- Copy resi

Hal ini membuat sisi kanan tabel cukup ramai.

**Redesign yang disarankan:**

Primary action:

```text
Lihat detail
```

Secondary action dipindahkan ke menu:

```text
⋯
- Copy resi
- Buka video QC
- Buka video Packing
```

Jika hanya ada dua aksi, `Copy resi` dapat tetap menggunakan icon-only button dengan tooltip.

---

## 5. Struktur Halaman Baru

### Desktop

```text
┌──────────────────────────────────────────────────────────────┐
│ History Dokumentasi                              [ Export ]   │
│ Pantau dokumentasi QC dan packing berdasarkan resi.          │
├──────────────────────────────────────────────────────────────┤
│ [ Total 3 ]       [ Lengkap 1 ]       [ Belum Lengkap 2 ]   │
├──────────────────────────────────────────────────────────────┤
│ 🔍 Cari nomor resi...                                        │
│                                                              │
│ [ Semua Task ] [ Semua Operator ] [ Mulai — Sampai ] Reset   │
├──────────────────────────────────────────────────────────────┤
│ 3 dokumentasi                                                │
│                                                              │
│ RESI      OPERATOR    QC      PACKING    UPDATE    STATUS     │
│ ------------------------------------------------------------ │
│ SPX...     admin      ✓       ○          ...       Belum ... │
│ SPX...     admin      ✓       ○          ...       Belum ... │
│ SPX...     admin      ✓       ✓          ...       Lengkap   │
│                                                              │
│                                     1–3 dari 3               │
└──────────────────────────────────────────────────────────────┘
```

---

## 6. Layout Redesign

### 6.1 Page Container

Rekomendasi:

```text
max-width: 1440px
padding desktop: 24–32px
padding tablet: 20–24px
padding mobile: 16px
```

Konten utama tidak perlu memiliki border luar.

---

### 6.2 Header

Struktur:

```text
History Dokumentasi
Pantau dokumentasi QC dan packing berdasarkan resi.

                                      [ Export ]
```

Title:
- 24–28 px
- semibold/bold.

Description:
- 14 px
- muted foreground.

---

### 6.3 Summary Cards

Gunakan tiga card horizontal.

Contoh:

```text
┌────────────────┐
│ Total          │
│ 3 dokumentasi  │
└────────────────┘

┌────────────────┐
│ Lengkap        │
│ 1 paket        │
└────────────────┘

┌────────────────┐
│ Belum lengkap  │
│ 2 paket        │
└────────────────┘
```

Card tidak perlu terlalu tinggi.

Rekomendasi:
- height: 88–100 px
- radius: 10–12 px
- border tipis
- shadow sangat ringan atau tanpa shadow.

---

## 7. Filter Bar Baru

### Baris 1

Search full width:

```text
🔍 Cari nomor resi...
```

### Baris 2

```text
[ Semua Task ▼ ]

[ Semua Operator ▼ ]

[ 20 Agu 2026 — 25 Agu 2026 ]

[ Reset ]
```

Jika filter aktif, dapat tampil chip:

```text
Filter aktif: QC ×
```

---

## 8. Redesign Tabel

### Kolom

Rekomendasi:

```text
Resi
Operator
QC
Packing
Terakhir diperbarui
Status
Aksi
```

`UPDATE` sebaiknya diganti menjadi:

```text
Terakhir diperbarui
```

karena lebih jelas untuk user non-teknis.

---

### 8.1 Kolom Resi

Resi adalah identifier paling penting.

Gunakan:
- medium/semi-bold,
- font mono opsional,
- hover state,
- clickable.

Contoh:

```text
SPXID065994720298
```

Klik resi membuka detail.

---

### 8.2 Operator

Tidak perlu terlalu dominan.

Contoh:

```text
admin
```

Jika user memiliki avatar atau initial:

```text
[A] admin
```

boleh digunakan, tetapi tidak wajib.

---

### 8.3 QC dan Packing

Gunakan badge kecil.

Contoh:

```text
✓ Selesai
```

dan:

```text
○ Belum ada
```

---

### 8.4 Status Dokumentasi

Gunakan pill badge.

Lengkap:

```text
✓ Lengkap
```

Belum lengkap:

```text
! Belum lengkap
```

Jangan menggunakan badge full width.

---

### 8.5 Aksi

Rekomendasi:

```text
[ Lihat detail ] [ Copy ]
```

atau:

```text
[ Lihat detail ] [ ⋯ ]
```

Untuk desktop, alternatif kedua lebih bersih.

---

## 9. Row Interaction

Seluruh row dapat dibuat clickable.

Hover:

```text
background: muted / 40%
cursor: pointer
```

Namun tombol di dalam row tetap harus dapat diklik tanpa memicu row action.

Interaksi:

```text
Klik row
      ↓
Buka detail dokumentasi
```

---

## 10. Empty State

Saat belum ada data:

```text
Belum ada dokumentasi

Dokumentasi QC dan packing yang sudah direkam
akan muncul di halaman ini.

[ Mulai Scan ]
```

Jika hasil search kosong:

```text
Dokumentasi tidak ditemukan

Tidak ada dokumentasi yang cocok dengan
filter atau nomor resi tersebut.

[ Reset filter ]
```

---

## 11. Loading State

Saat data dimuat, gunakan skeleton tabel.

Contoh:

```text
██████████████
████████
██████
██████
██████████
```

Hindari spinner besar di tengah halaman.

---

## 12. Copywriting

### Saat ini

```text
History
```

Rekomendasi:

```text
History Dokumentasi
```

---

### Saat ini

```text
Index dokumentasi QC dan Packing. Pilih resi untuk membuka video, metadata, dan aksi lanjutan.
```

Rekomendasi:

```text
Pantau dokumentasi QC dan packing berdasarkan nomor resi.
```

Lebih pendek dan langsung menjelaskan fungsi halaman.

---

### Saat ini

```text
Daftar dokumentasi
```

Rekomendasi:

```text
Dokumentasi paket
```

---

### Saat ini

```text
Klik resi untuk membuka detail. Video hanya dimuat setelah preview dipilih.
```

Rekomendasi:

```text
Klik nomor resi untuk melihat video QC, video packing, dan detail dokumentasi.
```

Informasi teknis mengenai lazy loading video tidak perlu ditampilkan kepada user.

---

### Saat ini

```text
UPDATE
```

Rekomendasi:

```text
Terakhir diperbarui
```

---

### Saat ini

```text
Copy resi
```

Rekomendasi tetap:

```text
Copy resi
```

Setelah diklik tampil toast:

```text
Nomor resi berhasil disalin.
```

---

## 13. Sidebar

Sidebar saat ini sudah cukup baik, namun dapat dirapikan.

### Perubahan

Logo:

```text
Pakti
Paket Tercatat, Bukti Terjaga
```

tetap dapat dipertahankan.

Menu:

```text
OPERASIONAL

Scan
History


ADMINISTRASI

Users
Settings


SYSTEM

Health
Admin
```

`Health` dan `Admin` lebih cocok dimasukkan ke kategori `System`.

---

### Active State

History saat aktif:

```text
background: sidebar-accent
border: none
```

Tidak perlu border putih yang terlalu kuat.

Gunakan:
- background sedikit lebih terang,
- icon aktif,
- font medium.

---

## 14. Design Tokens

Rekomendasi visual tetap mempertahankan karakter monokrom dashboard saat ini, tetapi dibuat lebih modern.

### Radius

```text
Card       : 10–12px
Input      : 8px
Button     : 8px
Badge      : 999px
```

### Spacing

Gunakan basis 4 px:

```text
4
8
12
16
20
24
32
```

### Border

```text
1px solid border
```

Gunakan border hanya ketika benar-benar dibutuhkan.

---

## 15. Typography

Rekomendasi hierarchy:

```text
Page title
24–28px / 600–700

Section title
16–18px / 600

Body
14px / 400

Table
13–14px / 400

Label
12px / 500

Metadata
12px / 400
```

Hindari penggunaan terlalu banyak teks kapital dan letter spacing.

Label seperti:

```text
[ SECTION ]
[ HISTORY ]
```

dapat dihapus.

---

## 16. Responsive Design

### Desktop ≥ 1280 px

- Sidebar tetap.
- Summary cards 3 kolom.
- Filter satu atau dua baris.
- Tabel penuh.

### Tablet 768–1279 px

- Sidebar dapat collapsed.
- Summary cards tetap 3 kolom jika cukup.
- Filter wrapping.
- Tabel horizontal scroll jika diperlukan.

### Mobile < 768 px

Tabel jangan dipaksa menjadi tabel desktop.

Gunakan list card:

```text
SPXID065994720298

Operator
admin

QC
✓ Selesai

Packing
○ Belum ada

Status
! Belum lengkap

24 Agu 2026 · 15:34

[ Lihat detail ]
```

---

## 17. Accessibility

Pastikan:

- status tidak hanya dibedakan berdasarkan warna;
- icon memiliki label atau tooltip;
- focus state terlihat;
- contrast minimal memenuhi WCAG AA;
- button memiliki target minimal sekitar 40×40 px;
- input memiliki label yang dapat dibaca screen reader;
- table header menggunakan semantic `<th>`;
- row action dapat diakses dengan keyboard.

---

## 18. Rekomendasi Komponen

Jika menggunakan component library seperti shadcn/ui, struktur komponen dapat dibuat sebagai berikut:

```text
HistoryPage
├── PageHeader
│   └── ExportButton
├── HistoryStats
│   ├── StatCard
│   ├── StatCard
│   └── StatCard
├── HistoryFilters
│   ├── SearchInput
│   ├── TaskSelect
│   ├── OperatorSelect
│   ├── DateRangePicker
│   └── ResetButton
└── HistoryTable
    ├── StatusBadge
    ├── RowActions
    ├── EmptyState
    └── Pagination
```

---

## 19. Prioritas Implementasi

### P0 — Wajib

- [ ] Hilangkan label `[SECTION]` dan `[HISTORY]`.
- [ ] Satukan hierarchy header.
- [ ] Redesign filter.
- [ ] Perbaiki badge QC/Packing.
- [ ] Perbaiki badge status akhir.
- [ ] Perbaiki kolom aksi.
- [ ] Buat row lebih mudah dipindai.
- [ ] Tambahkan empty state.
- [ ] Tambahkan loading skeleton.
- [ ] Buat mobile card layout.

### P1 — Disarankan

- [ ] Tambahkan summary cards.
- [ ] Tambahkan pagination.
- [ ] Filter aktif sebagai chip.
- [ ] Toast setelah copy resi.
- [ ] Seluruh row clickable.
- [ ] Simpan filter di URL query parameters.

### P2 — Enhancement

- [ ] Saved filter.
- [ ] Bulk export.
- [ ] Multi-select dokumentasi.
- [ ] Sort berdasarkan tanggal/status/operator.
- [ ] Kolom dapat dikustomisasi.
- [ ] Auto refresh data history.

---

## 20. Urutan Pengerjaan Redesign

### Tahap 1 — Visual Cleanup

Fokus:
- spacing,
- typography,
- border,
- hierarchy,
- card,
- badge.

Belum mengubah logic.

---

### Tahap 2 — Filter & Table UX

Fokus:
- search,
- date range,
- filter,
- status,
- row actions,
- sorting,
- pagination.

---

### Tahap 3 — Detail Interaction

Fokus:
- klik resi,
- preview dokumentasi,
- video QC,
- video packing,
- metadata,
- copy resi.

---

### Tahap 4 — Responsive & Accessibility

Fokus:
- tablet,
- mobile,
- keyboard navigation,
- screen reader,
- contrast.

---

## 21. Target Hasil Akhir

Redesign sebaiknya membuat halaman terasa seperti **dashboard operasional dokumentasi paket**, bukan sekadar tabel admin.

Prioritas informasi setelah redesign:

```text
1. Nomor resi
2. Status dokumentasi
3. Status QC
4. Status Packing
5. Update terakhir
6. Operator
7. Aksi lanjutan
```

Dengan hierarchy tersebut, admin dapat melihat dalam beberapa detik:

```text
Paket mana yang belum lengkap?
Tahap mana yang belum selesai?
Siapa operatornya?
Kapan terakhir diperbarui?
Bagaimana membuka dokumentasinya?
```

---

## 22. Arah Visual yang Direkomendasikan

Karakter desain:

```text
Minimal
Operational
Dense but readable
Desktop-first
Neutral / monochrome
Status-driven
```

Hindari:
- terlalu banyak border,
- terlalu banyak label teknis,
- terlalu banyak card,
- button yang terlalu besar,
- status full-width,
- informasi teknis yang tidak diperlukan user.

Pertahankan:
- sidebar gelap,
- background konten terang,
- tampilan profesional,
- penggunaan warna hanya untuk status dan feedback.


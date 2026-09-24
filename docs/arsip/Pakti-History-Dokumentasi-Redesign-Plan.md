# Review UI/UX & Plan Redesign — History Dokumentasi Pakti

## 1. Ringkasan

Halaman **History Dokumentasi** sudah memiliki fondasi yang baik: sidebar, header, summary, search/filter, tabel, export, dan pagination. Masalah utamanya bukan kekurangan fitur, tetapi **hierarki visual, kepadatan data, keterbacaan status, dan efisiensi scanning**.

Arah redesign: pertahankan karakter Pakti yang sederhana dan operasional, namun buat halaman terasa seperti **workspace dokumentasi** yang tenang, cepat dipindai, dan mudah digunakan untuk pengecekan paket.

---

## 2. Yang Sudah Baik

- Struktur halaman sudah logis: summary → filter → tabel → pagination.
- Search dan filter berada dekat dengan dataset yang dikontrol.
- Informasi paket cukup lengkap: resi, pesanan, waktu, operator, status, pengiriman, dan aksi.
- Sidebar konsisten dan active state History mudah dikenali.
- Pagination sudah tersedia sehingga siap untuk data yang terus bertambah.
- Tombol Export diletakkan sebagai page-level action, bukan bercampur dengan aksi per baris.

---

## 3. Masalah Utama pada Desain Saat Ini

### 3.1 Header dan konten terasa terlalu berjauhan

Area kosong antara page header dengan data cukup besar. Dampaknya:

- halaman terasa kurang padat meski tabel sangat padat,
- fokus pengguna terputus antara judul dan data,
- area above-the-fold kurang maksimal.

**Perbaikan:**

- top padding halaman: `32px`
- breadcrumb → title: `8px`
- title → subtitle: `8px`
- header → summary: `24px`

### 3.2 Summary cards terlalu tinggi

Tiga kartu hanya menampilkan angka sederhana tetapi mengambil ruang vertikal cukup banyak.

**Perbaikan:** gunakan compact cards dengan tinggi ± `92–104px`, angka menjadi focal point dan icon hanya supporting element.

### 3.3 Toolbar terlalu padat

Saat ini banyak kontrol berada dalam satu garis:

`Search | Semua task | QC | Packing | Semua user | Hari ini | Kemarin | 7 hari | Custom | Reset`

Masalah:

- hierarchy antar-filter tidak jelas,
- task memakai pola campuran dropdown + segmented buttons,
- tanggal bersaing dengan user filter,
- sulit dipertahankan saat responsive.

### 3.4 Badge hitam terlalu dominan

Status `Lengkap` dan `Dibayar` memakai pill hitam pekat. Karena muncul berulang, status normal justru menjadi elemen paling dominan di tabel.

**Prinsip redesign:** status normal harus subtle; anomali yang perlu perhatian harus lebih menonjol.

### 3.5 Kolom Resi terlalu rapat

Resi, nomor pesanan, dan timestamp memiliki bobot visual yang terlalu mirip. Pengguna seharusnya menemukan nomor resi terlebih dahulu dalam satu kali scanning.

### 3.6 Kolom Terkirim mencampur dua jenis informasi

Contoh seperti `Terkirim · nurbany` atau `Antri · dapoermakmertua` mencampur:

1. status pengiriman,
2. akun/customer tujuan.

Pill panjang membuat tujuan terlihat seperti status.

### 3.7 Kolom Aksi ambigu

Button `Terkirim` / `Antri` terlihat seperti status, bukan action. Jika row memang dapat diklik untuk detail, aksi utama tidak perlu dibuat seperti tombol besar.

---

## 4. Arah Redesign

Target utama halaman adalah membuat pengguna dapat menjawab empat pertanyaan dalam beberapa detik:

1. Paket mana yang saya cari?
2. Dokumentasinya lengkap atau tidak?
3. Siapa yang mengerjakannya?
4. Sudah dikirim atau belum?

Semua elemen yang tidak membantu menjawab empat pertanyaan tersebut dibuat lebih subtle atau dipindahkan ke detail drawer.

---

## 5. Struktur Halaman Baru

```text
┌─────────────────────────────────────────────────────────────┐
│ OPERASIONAL / HISTORY                                       │
│                                                             │
│ History Dokumentasi                          [ Export ▾ ]    │
│ Telusuri dokumentasi QC dan packing...                      │
│                                                             │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐             │
│ │ Total       │ │ Lengkap     │ │ Perhatian   │             │
│ │ 13 paket    │ │ 13 paket    │ │ 0 paket     │             │
│ └─────────────┘ └─────────────┘ └─────────────┘             │
│                                                             │
│ Search........................   Task ▾ User ▾  Periode ▾   │
│                                                             │
│ Dokumentasi paket                                13 hasil    │
│ ─────────────────────────────────────────────────────────   │
│ Paket           Operator   Dokumentasi   Pengiriman     ›   │
│ SPXID...        admin      ✓ Lengkap     ✓ Terkirim          │
│ 260829...                  2/2 dok.       @nurbany           │
│ 30 Agu 17:55                                                │
│ ─────────────────────────────────────────────────────────   │
│ ...                                                         │
│                                                             │
│ 1–10 dari 13                                   ‹ 1 2 ›      │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Header Redesign

### Breadcrumb

`OPERASIONAL / HISTORY`

Style:

- 11–12px
- weight 600
- uppercase
- muted

### Judul

`History Dokumentasi`

Style:

- 32–36px
- Inter 700
- letter-spacing sekitar `-0.7px`

### Subtitle

Copy saat ini cukup panjang. Rekomendasi:

> Telusuri dokumentasi QC dan packing berdasarkan resi, pesanan, operator, atau periode.

Lebih ringkas dan menjelaskan kemampuan halaman.

---

## 7. Summary Cards Baru

Gunakan tiga card:

### Total dokumentasi

```text
13
paket
```

### Dokumentasi lengkap

```text
13
100%
```

### Perlu perhatian

```text
0
paket
```

Saya menyarankan mengganti label `Belum lengkap` menjadi **Perlu perhatian** supaya scalable untuk kondisi lain seperti:

- dokumentasi belum lengkap,
- video gagal upload,
- pembayaran belum tercatat,
- proses tertunda.

Visual card:

- background putih
- border `#E6E6E6`
- radius `12px`
- tanpa heavy shadow
- icon 18–20px dalam container subtle

---

## 8. Toolbar Baru

### Desktop

```text
[ 🔍 Cari resi atau nomor pesanan................ ]
[ Task: Semua ▾ ] [ User: Semua ▾ ] [ 7 hari terakhir ▾ ]
```

Jika ruang cukup, semua dapat berada dalam satu baris.

### Task filter

Hindari kombinasi `Semua task / QC / Packing` yang semuanya tampil permanen.

Gunakan dropdown:

```text
✓ Semua task
  QC
  Packing
```

Keuntungan:

- toolbar lebih bersih,
- lebih scalable jika task bertambah,
- pola interaksi konsisten dengan filter user.

### Active filter chips

Jika ada filter aktif:

```text
[ Packing × ] [ admin × ] [ Kemarin × ]   Reset semua
```

Pengguna dapat melihat state filter tanpa membuka dropdown.

---

## 9. Search

Placeholder saat ini:

`Cari resi / pesanan...`

Rekomendasi:

`Cari resi atau nomor pesanan...`

Search sebaiknya juga menerima:

- nomor resi,
- nomor pesanan,
- nama operator,
- username tujuan jika relevan.

---

## 10. Redesign Tabel

Kolom yang disarankan:

| Kolom | Isi |
|---|---|
| Paket | Resi + nomor pesanan + timestamp |
| Operator | Avatar + nama |
| Dokumentasi | Status dokumentasi |
| Pengiriman | Status + akun tujuan |
| Aksi | Chevron / menu |

Kolom `Status` yang sekarang terlalu umum sebaiknya diganti menjadi **Dokumentasi**.

---

## 11. Hierarki Kolom Paket

Gunakan hierarchy:

```text
SPXID060792962908
260829MAR88Y7N
30 Agu 2026 · 17:55
```

Style:

- resi: `14px / 600`
- no. pesanan: `12px / 400`
- timestamp: `11–12px / 400`, muted

Label `No. Pesanan` tidak perlu ditulis pada setiap row karena menambah noise.

---

## 12. Operator

Struktur sederhana:

```text
(A) admin
```

Avatar:

- 28–32px
- monochrome
- initial

Nama:

- 13px
- weight 500

Tidak perlu styling dekoratif tambahan.

---

## 13. Dokumentasi Status

Hindari pill hitam besar untuk status normal.

### Opsi yang direkomendasikan

```text
✓ Lengkap
2/2 dokumentasi
```

Jika incomplete:

```text
! Belum lengkap
1/2 dokumentasi
```

Status normal:

- foreground `#31302E`
- background `#F6F5F4`
- border `#E6E6E6`

Status bermasalah dapat memakai semantic treatment yang lebih terlihat.

---

## 14. Pembayaran

Jika `Dibayar` bukan informasi yang harus dipindai di setiap row, pertimbangkan memindahkannya ke drawer detail.

Jika tetap perlu di tabel, tampilkan kecil di bawah status dokumentasi:

```text
✓ Lengkap
Dibayar
```

Bukan dua badge hitam yang sama kuat.

---

## 15. Pengiriman

Pisahkan status dengan akun tujuan.

### Sudah terkirim

```text
✓ Terkirim
@nurbany
```

### Dalam antrean

```text
○ Dalam antrean
@dapoermakmertua
```

Username dibuat muted agar status tetap menjadi informasi utama.

---

## 16. Aksi per Row

Jika klik row membuka detail, gunakan:

```text
›
```

atau menu:

```text
⋯
```

Jangan gunakan tombol status-like di kolom aksi.

Hover row:

```css
background: #FBFAF9;
cursor: pointer;
```

Selected row ketika drawer terbuka:

```css
background: #F6F5F4;
border-left: 3px solid #0075DE;
```

---

## 17. Detail Dokumentasi dengan Drawer

Klik row sebaiknya membuka **drawer kanan**, bukan modal besar.

```text
┌─────────────────────────────┐
│ Detail dokumentasi       ×  │
│                             │
│ SPXID060792962908           │
│ Order 260829...             │
│                             │
│ STATUS                      │
│ ✓ Dokumentasi lengkap       │
│                             │
│ QC                          │
│ Operator: admin             │
│ 30 Agu 2026 · 17:51         │
│ [ Preview video ]           │
│                             │
│ PACKING                     │
│ Operator: admin             │
│ 30 Agu 2026 · 17:55         │
│ [ Preview video ]           │
│                             │
│ PENGIRIMAN                  │
│ ✓ Terkirim                  │
│ @nurbany                    │
│                             │
│ [ Salin resi ]              │
└─────────────────────────────┘
```

Keuntungan:

- user tetap melihat daftar history,
- mudah pindah antar paket,
- cocok untuk pengecekan dokumentasi cepat,
- detail tidak membuat tabel semakin penuh.

---

## 18. Export

Tombol Export sudah tepat sebagai page action, tetapi sebaiknya berupa dropdown:

```text
Export ▾
```

Menu:

```text
Export data saat ini
Export semua data
──────────────
CSV
Excel
```

Jika filter aktif, tampilkan konteks seperti:

`Export 13 dokumentasi`

---

## 19. Pagination

Refinement:

```text
1–10 dari 13 dokumentasi                 ‹  1  2  ›
```

Kata `Menampilkan` bisa dihilangkan karena tidak menambah informasi penting.

---

## 20. Sidebar

Sidebar saat ini secara struktur sudah baik.

Active state direkomendasikan:

- background `#F6F5F4`
- left indicator biru 3px
- icon biru
- text hitam / semibold

Section label tetap:

- `OPERASIONAL`
- `ADMINISTRASI`
- `SYSTEM`

Style:

- 11px
- weight 600
- uppercase
- muted

---

## 21. Visual System

Mengikuti design system Notion-like yang sudah dipakai pada Pakti.

### Warna

```css
--primary: #0075DE;
--primary-active: #005BAB;

--canvas: #F6F5F4;
--surface: #FFFFFF;

--ink: #000000;
--ink-secondary: #31302E;
--ink-muted: #615D59;
--ink-faint: #A39E98;

--border: #E6E6E6;
```

Prinsip:

> Biru hanya untuk primary action, active navigation, link, dan focus state.

Jangan menggunakan banyak warna sebagai struktur interface.

---

## 22. Typography

Gunakan:

```css
font-family: Inter, system-ui, sans-serif;
```

### Page title

```text
34px / 700
letter-spacing: -0.7px
```

### Section title

```text
15–16px / 600
```

### Body

```text
14px / 400
```

### Table primary

```text
13–14px / 500–600
```

### Metadata

```text
11–12px / 400
```

### Column header / eyebrow

```text
11px / 600
uppercase
letter-spacing: 0.08em
```

---

## 23. Radius

Gunakan radius secara konsisten:

```text
Input                 5–8px
Filter button         8px
Card                  12px
Large container       12–16px
Primary CTA           full pill
Small badge           5px
```

Jangan membuat semua elemen menjadi pill.

---

## 24. Elevation

Mayoritas surface:

```text
border: 1px solid #E6E6E6
shadow: none
```

Gunakan shadow hanya untuk:

- dropdown,
- popover,
- modal,
- drawer,
- floating menu.

Hal ini mempertahankan halaman admin yang ringan dan tenang.

---

## 25. Hugeicons Stroke Rounded

Rekomendasi mapping:

| Fungsi | Icon |
|---|---|
| History | Clock |
| Search | Search |
| Export | Download |
| Total dokumentasi | Package |
| Lengkap | Checkmark Circle |
| Perlu perhatian | Alert Circle |
| Filter | Filter Horizontal |
| User | User |
| Calendar | Calendar |
| More | More Horizontal |
| Detail | Arrow Right / Chevron Right |
| QC | Check List |
| Packing | Package |
| Copy resi | Copy |
| Video | Video |
| Close | Cancel |

Default icon size: `18px`.

---

## 26. Responsive

### Desktop > 1200px

- sidebar fixed,
- 3 summary cards,
- toolbar satu baris,
- full data table.

### Tablet 768–1199px

- sidebar collapsible,
- summary dapat tetap 3 kolom,
- filter wrap,
- metadata tabel disederhanakan.

### Mobile < 768px

Jangan memaksakan tabel horizontal.

Gunakan card list:

```text
SPXID060792962908
260829MAR88Y7N

✓ Dokumentasi lengkap
admin

30 Agu 2026 · 17:55

✓ Terkirim · @nurbany                     ›
```

---

## 27. Loading, Empty, dan Error State

### Loading

Gunakan skeleton untuk:

- summary cards,
- count,
- tabel rows.

### Empty state

```text
Belum ada dokumentasi

Dokumentasi QC dan packing akan muncul di sini
setelah proses scan dilakukan.
```

### No search result

```text
Dokumentasi tidak ditemukan

Coba ubah kata kunci atau filter yang digunakan.
```

### Error

```text
Gagal memuat history

Coba muat ulang data.
[ Muat ulang ]
```

---

## 28. Copywriting

### Page title

`History Dokumentasi` dapat dipertahankan bila istilah History sudah konsisten di seluruh aplikasi.

Alternatif Bahasa Indonesia penuh:

`Riwayat Dokumentasi`

### Subtitle tabel

Rekomendasi:

> Pilih paket untuk melihat dokumentasi QC dan packing.

### Search

Gunakan:

> Cari resi atau nomor pesanan...

---

## 29. Prioritas Implementasi

### P0 — Wajib

1. Rapikan hierarchy header.
2. Compact-kan summary cards.
3. Simplifikasi toolbar/filter.
4. Kurangi dominasi badge hitam.
5. Perbaiki hierarchy informasi resi.
6. Jadikan row dapat diklik.
7. Pisahkan status pengiriman dan akun tujuan.
8. Terapkan Inter secara konsisten.

### P1 — Sangat disarankan

1. Drawer detail dokumentasi.
2. Active-filter chips.
3. Export dropdown.
4. Empty/loading/error states.
5. Responsive mobile card.

### P2 — Enhancement

1. Column sorting.
2. Saved filters.
3. Bulk export.
4. Date range picker.
5. Keyboard navigation.

---

## 30. Struktur Komponen

Jika menggunakan Next.js + TailwindCSS + shadcn:

```text
history/
├── page.tsx
├── components/
│   ├── history-header.tsx
│   ├── history-summary.tsx
│   ├── history-toolbar.tsx
│   ├── active-filters.tsx
│   ├── history-table.tsx
│   ├── history-row.tsx
│   ├── documentation-status.tsx
│   ├── shipping-status.tsx
│   ├── history-pagination.tsx
│   ├── documentation-drawer.tsx
│   ├── history-empty-state.tsx
│   └── history-skeleton.tsx
```

---

## 31. Suggested Data Model

```ts
type DocumentationHistory = {
  id: string

  trackingNumber: string
  orderNumber: string
  createdAt: string

  operator: {
    id: string
    name: string
  }

  documentation: {
    qc: boolean
    packing: boolean
    status: "complete" | "incomplete"
  }

  payment: {
    status: "paid" | "unpaid"
  }

  shipping: {
    status: "queued" | "sent"
    username?: string
  }
}
```

---

## 32. Acceptance Criteria Redesign

Redesign dianggap berhasil bila:

- user dapat menemukan resi tertentu dengan cepat,
- status dokumentasi dapat dipahami tanpa membaca banyak badge,
- status normal tidak mengalahkan resi secara visual,
- anomali lebih mudah terlihat daripada status normal,
- filter aktif selalu terlihat jelas,
- detail QC/Packing dapat dibuka tanpa meninggalkan daftar,
- tampilan tetap usable di mobile tanpa horizontal table yang panjang,
- primary blue hanya digunakan pada CTA dan state aktif,
- seluruh typography menggunakan Inter,
- icon menggunakan Hugeicons Stroke Rounded secara konsisten.

---

## 33. Kesimpulan

Desain saat ini sudah cukup matang secara fungsi, tetapi terlalu banyak elemen memiliki bobot visual yang sama. Redesign tidak perlu mengubah seluruh arsitektur halaman.

Fokus utamanya adalah:

- **mengurangi visual noise**,
- **memperkuat hierarchy**,
- **membuat scanning resi lebih cepat**,
- **menyederhanakan filter**,
- **memindahkan detail ke drawer**,
- **mengurangi penggunaan badge hitam**,
- **membuat anomali lebih terlihat dibanding status normal**.

Target akhirnya adalah halaman History yang terasa seperti **workspace operasional yang tenang dan efisien**, bukan tabel administrasi yang penuh kontrol.

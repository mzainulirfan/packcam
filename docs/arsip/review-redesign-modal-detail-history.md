# Review & Redesign Plan — Modal Detail History

## 1. Ringkasan

Modal **Detail History** saat ini sudah memiliki fungsi yang cukup lengkap. Informasi penting seperti nomor resi, status QC/Packing, user, waktu, file rekaman, path penyimpanan, video preview, serta quick action sudah tersedia.

Masalah utama bukan pada kelengkapan fitur, tetapi pada **hierarki visual dan penyusunan informasi**. Hampir semua elemen memiliki bobot visual yang sama, sehingga operator perlu membaca banyak bagian sebelum menemukan informasi yang benar-benar penting.

Secara perilaku, modal ini sudah lebih mirip **halaman detail penuh** daripada modal sederhana. Karena itu, redesign sebaiknya tetap mempertahankan konsep modal, tetapi menggunakan pola **full-screen detail dialog** atau **large detail dialog** dengan struktur yang lebih jelas.

---

## 2. Tujuan Redesign

Redesign harus membantu operator menjawab tiga pertanyaan utama dalam beberapa detik:

1. **Resi apa yang sedang dibuka?**
2. **Proses apa yang sudah selesai?**
3. **Di mana bukti video QC/Packing-nya?**

Fokus redesign:

- memperkuat hierarchy informasi;
- mempercepat scanning informasi;
- mengurangi visual noise;
- memperjelas status;
- mempermudah akses video;
- menyederhanakan technical information;
- memperjelas fungsi setiap tombol;
- mempertahankan karakter visual monospaced/industrial aplikasi.

---

## 3. Masalah Utama pada Desain Saat Ini

### 3.1 Header belum memiliki hierarchy yang kuat

Saat ini bagian atas menampilkan:

- `Detail history`
- nomor resi;
- user/operator.

Nomor resi seharusnya menjadi informasi paling dominan karena menjadi identitas utama dokumentasi.

### Rekomendasi

Gunakan struktur:

```text
Detail dokumentasi

SPXID066657386858   [Salin resi]
Packing • Selesai • 25 Agu 2026, 18:05
```

`Detail history` cukup menjadi label kecil atau eyebrow.

Nomor resi menjadi judul utama dengan font lebih besar dan weight lebih kuat.

Tambahkan tombol **Salin resi** di dekat nomor resi.

---

## 4. Panel Kiri Terlalu Terfragmentasi

Saat ini informasi seperti:

- Ringkasan resi;
- Waktu;
- Catatan;
- File;
- Path;

dipisahkan menjadi banyak card kecil.

Hal ini membuat area kiri terasa seperti kumpulan field teknis daripada sebuah detail dokumentasi.

### Rekomendasi

Kelompokkan menjadi tiga bagian utama:

1. **Ringkasan**
2. **Informasi rekaman**
3. **Aksi**

Contoh:

```text
RINGKASAN

QC        Selesai
Packing   Selesai
Rekaman   2

INFORMASI

Operator  admin
Durasi    3 detik
Ukuran    593 KB

Catatan
Video sudah diberi watermark.

Detail teknis >
```

---

## 5. Kurangi Informasi yang Berulang

Saat ini informasi berikut muncul beberapa kali:

- jenis proses;
- nomor resi;
- user `admin`;
- tanggal;
- nama file.

Informasi berulang membuat modal terasa lebih padat tanpa meningkatkan usefulness.

### Rekomendasi

Metadata lengkap cukup ditampilkan **sekali** pada panel informasi.

Area video cukup menampilkan:

```text
Rekaman Packing
25 Agu 2026 • 18:05 • admin
```

Nama file dan path tidak perlu selalu terlihat.

---

## 6. Technical Metadata Sebaiknya Disembunyikan

Informasi seperti:

```text
packing_SPXID066657386858_20260825_180506_150.webm
Documents/Pakti/videos/...
```

berguna untuk debugging atau administrasi, tetapi bukan informasi utama operator.

### Rekomendasi

Masukkan ke bagian collapsible:

```text
Detail teknis >
```

Saat dibuka:

```text
Nama file
packing_SPXID...

Lokasi file
Documents/Pakti/videos/...

Format
WEBM

Ukuran
593 KB
```

Dengan cara ini interface tetap bersih tetapi informasi teknis masih dapat diakses.

---

## 7. Perbaikan Copywriting

Beberapa label saat ini masih terasa seperti developer/internal command.

### Sebelum

```text
selected · packing
[repeat-qc]
[copy-resi]
[copy-meta]
[folder]
[prepare-shopee-chat]
[unduh]
[hapus]
```

### Rekomendasi

```text
Rekaman Packing
Ulangi QC
Salin resi
Salin metadata
Buka folder
Siapkan pesan Shopee
Unduh video
Hapus video
```

Karakter `[+]`, `[x]`, atau command-style masih dapat dipertahankan jika memang merupakan bagian dari identitas visual aplikasi, tetapi teks aksi harus tetap mudah dipahami operator.

---

## 8. Status Harus Lebih Kontekstual

Status `Lengkap` saat ini masih terlalu umum.

Operator perlu mengetahui **apa yang lengkap**.

### Rekomendasi

Gunakan status:

```text
QC Selesai
Packing Selesai
2 Rekaman
```

Status sebaiknya menggunakan badge/chip.

Contoh:

```text
[✓ QC Selesai]  [✓ Packing Selesai]  [2 Rekaman]
```

Badge membantu operator melakukan scanning informasi lebih cepat.

---

## 9. Redesign Area Video

Video dokumentasi kemungkinan besar direkam menggunakan HP dalam orientasi portrait.

Saat ini video portrait dimasukkan ke dalam player landscape yang sangat lebar sehingga menghasilkan area hitam besar di kiri dan kanan.

### Masalah

- banyak ruang terbuang;
- video terlihat kecil;
- fokus visual berkurang;
- modal terasa terlalu lebar.

### Rekomendasi

Video mengikuti rasio aslinya.

Contoh:

```text
            ┌────────────────┐
            │                │
            │                │
            │  VIDEO         │
            │  PORTRAIT      │
            │                │
            │                │
            └────────────────┘
```

Gunakan:

```text
max-height: 480px – 560px
object-fit: contain
```

Video tetap diletakkan di tengah area media.

Jika video landscape, player dapat mengikuti lebar container.

---

## 10. Perbaikan Tabs QC dan Packing

Saat ini tersedia:

```text
QC · 1
Packing · 1
```

Konsep tab sudah tepat, tetapi active state masih terlalu tipis.

### Rekomendasi

Gunakan:

```text
QC (1)      Packing (1)
             ━━━━━━━━━━━
```

Active tab:

- font weight lebih tinggi;
- underline 2px;
- kontras teks lebih kuat.

Tidak perlu menggunakan border panjang di seluruh area tab.

---

## 11. Penempatan Aksi

Saat ini beberapa aksi tersebar di beberapa lokasi.

Contohnya:

```text
repeat-qc
copy-resi
copy-meta
folder
prepare-shopee-chat
unduh
hapus
```

### Rekomendasi

Pisahkan berdasarkan konteks.

#### Aksi terhadap resi

Letakkan di sidebar:

```text
AKSI

[Ulangi QC]
[Buka folder]
[Salin metadata]
[Siapkan pesan Shopee]
```

#### Aksi terhadap video

Letakkan dekat video:

```text
[Unduh video]   [Hapus video]
```

Dengan struktur ini, operator dapat langsung memahami objek yang dipengaruhi oleh setiap tindakan.

---

## 12. Destructive Action

Tombol **Hapus** saat ini memiliki treatment hampir sama dengan tombol biasa.

Padahal aksi ini bersifat destructive.

### Rekomendasi

Gunakan visual berbeda untuk:

```text
Hapus video
```

Setelah diklik, tampilkan confirmation dialog:

```text
Hapus rekaman?

Rekaman packing ini akan dihapus secara permanen.

[Batal] [Hapus rekaman]
```

Hapus hanya dilakukan setelah operator melakukan konfirmasi.

---

## 13. Layout yang Direkomendasikan

Modal menggunakan layout dua kolom.

### Sidebar

Lebar:

```text
320–360px
```

Berisi:

- ringkasan status;
- informasi rekaman;
- catatan;
- detail teknis;
- aksi resi.

### Content Area

Menggunakan sisa ruang.

Berisi:

- tab QC/Packing;
- metadata rekaman;
- video;
- aksi video.

---

## 14. Wireframe Redesign

```text
┌───────────────────────────────────────────────────────────────┐
│ Detail dokumentasi                                      ×    │
│ SPXID066657386858    [Salin resi]                            │
│ Packing • Selesai • 25 Agu 2026, 18:05                       │
├──────────────────────┬────────────────────────────────────────┤
│                      │                                        │
│ RINGKASAN            │    QC (1)       PACKING (1)            │
│                      │                   ━━━━━━━━━             │
│ QC        Selesai    │                                        │
│ Packing   Selesai    │    Rekaman Packing                     │
│ Rekaman   2          │    25 Agu 2026 • 18:05 • admin         │
│                      │                                        │
│ INFORMASI            │           ┌───────────────┐             │
│ Operator   admin     │           │               │             │
│ Durasi     3 detik   │           │    VIDEO      │             │
│ Ukuran     593 KB    │           │   PORTRAIT    │             │
│                      │           │               │             │
│ Catatan              │           └───────────────┘             │
│ Video sudah diberi   │                                        │
│ watermark            │    [Unduh video] [Hapus video]         │
│                      │                                        │
│ Detail teknis    >   │                                        │
│                      │                                        │
│ AKSI                 │                                        │
│ [Ulangi QC]          │                                        │
│ [Buka folder]        │                                        │
│ [Siapkan pesan]      │                                        │
│                      │                                        │
└──────────────────────┴────────────────────────────────────────┘
```

---

## 15. Hierarki Visual

Urutan hierarchy yang direkomendasikan:

### Level 1 — Identitas

```text
SPXID066657386858
```

Nomor resi adalah elemen paling kuat.

### Level 2 — Status

```text
QC Selesai
Packing Selesai
```

### Level 3 — Bukti dokumentasi

```text
Video QC / Packing
```

### Level 4 — Metadata

```text
Operator
Waktu
Durasi
Ukuran
```

### Level 5 — Technical information

```text
Nama file
Path
Format
```

Technical information tidak perlu selalu terlihat.

---

## 16. Penggunaan Border

Desain saat ini menggunakan cukup banyak border.

Akibatnya interface terasa:

- padat;
- administratif;
- berat secara visual.

### Rekomendasi

Gunakan border hanya untuk:

- modal container;
- pemisah sidebar dan content;
- tabs;
- beberapa actionable component.

Antar section di sidebar cukup menggunakan:

- whitespace;
- heading kecil;
- spacing;
- separator tipis jika diperlukan.

---

## 17. Spacing

Gunakan spacing konsisten.

Rekomendasi:

```text
Modal padding       : 20–24px
Section gap         : 24px
Item gap            : 8–12px
Header → content    : 16–20px
Button gap          : 8px
```

Tujuannya bukan membuat modal menjadi jauh lebih besar, tetapi memberikan ruang visual agar pengguna lebih mudah memproses informasi.

---

## 18. Modal Behavior

Karena kontennya cukup kompleks, gunakan:

```text
width: 90–94vw
max-width: 1440px
height: 88–92vh
```

Modal header dibuat **sticky**.

Yang melakukan scroll adalah content modal.

Contoh struktur:

```text
Modal
├── Sticky Header
└── Scrollable Content
    ├── Sidebar
    └── Media Area
```

Jangan membuat keseluruhan halaman background ikut scroll ketika modal aktif.

---

## 19. Responsive Behavior

### Desktop

Gunakan dua kolom:

```text
320–360px | flexible
```

### Tablet

Sidebar dapat diperkecil:

```text
280px | flexible
```

### Mobile

Gunakan satu kolom:

```text
Header
Status
Tabs
Video
Metadata
Actions
```

Untuk mobile, video sebaiknya muncul sebelum technical metadata.

---

## 20. Recommended Information Architecture

```text
Detail Dokumentasi
│
├── Header
│   ├── Nomor resi
│   ├── Salin resi
│   ├── Proses
│   ├── Status
│   └── Waktu
│
├── Sidebar
│   ├── Ringkasan
│   │   ├── QC
│   │   ├── Packing
│   │   └── Jumlah rekaman
│   │
│   ├── Informasi
│   │   ├── Operator
│   │   ├── Durasi
│   │   ├── Ukuran
│   │   └── Catatan
│   │
│   ├── Detail teknis
│   │   ├── Nama file
│   │   ├── Path
│   │   └── Format
│   │
│   └── Aksi
│       ├── Ulangi QC
│       ├── Buka folder
│       ├── Salin metadata
│       └── Siapkan pesan Shopee
│
└── Content
    ├── Tabs
    │   ├── QC
    │   └── Packing
    │
    ├── Rekaman
    │   ├── Jenis
    │   ├── Waktu
    │   ├── Operator
    │   └── Video
    │
    └── Video Actions
        ├── Unduh video
        └── Hapus video
```

---

## 21. Prioritas Implementasi

### P0 — Wajib

- perkuat hierarchy header;
- jadikan nomor resi sebagai judul utama;
- sederhanakan sidebar;
- optimalkan portrait video;
- perjelas active tab;
- perbaiki copywriting tombol;
- pindahkan technical metadata ke collapsible;
- tambahkan confirmation untuk hapus video.

### P1 — Sangat Direkomendasikan

- badge status;
- tombol Salin resi di header;
- sticky modal header;
- pembagian sidebar 320–360px;
- pengurangan border;
- konsistensi spacing.

### P2 — Enhancement

- keyboard shortcut untuk menutup modal;
- keyboard navigation pada tab;
- preview fullscreen video;
- toast setelah copy/unduh;
- tooltip untuk aksi yang tidak umum;
- indikator loading saat video dibuka.

---

## 22. Kesimpulan

Fondasi workflow modal saat ini sudah benar dan tidak membutuhkan perubahan fungsi besar.

Redesign sebaiknya fokus pada:

- hierarchy;
- grouping informasi;
- pengurangan visual noise;
- optimalisasi media;
- penyederhanaan technical information;
- copywriting;
- penempatan action.

Target akhirnya adalah membuat operator dapat memahami isi modal dalam beberapa detik:

> **Resi apa → status proses → bukti videonya.**

Dengan struktur ini, modal tetap mempertahankan karakter visual aplikasi saat ini, tetapi menjadi lebih cepat digunakan, lebih bersih, dan lebih mudah dipahami oleh operator.

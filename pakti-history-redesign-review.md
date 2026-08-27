# Review & Rencana Redesign Halaman History — Pakti Mobile

## 1. Ringkasan

Secara fungsi, halaman **History** sudah cukup jelas. Pengguna dapat:

- Mencari resi.
- Memfilter berdasarkan task.
- Melihat rekaman dokumentasi.
- Membagikan video.
- Menghapus recording.
- Berpindah antara halaman Scan, History, dan Akun.

Namun, untuk penggunaan operasional dengan jumlah history yang semakin banyak, desain saat ini akan terasa terlalu panjang dan padat.

Masalah utama adalah setiap resi menampilkan video player besar secara langsung. Akibatnya, satu resi dapat memakan hampir satu layar penuh. Jika nantinya terdapat puluhan, ratusan, atau ribuan dokumentasi, pengguna akan kesulitan melakukan scanning informasi secara cepat.

---

## 2. Tujuan Redesign

Redesign halaman History sebaiknya berfokus pada:

1. Mempercepat pencarian dokumentasi berdasarkan resi.
2. Membuat daftar history lebih compact.
3. Mempermudah pengguna melihat status QC dan Packing.
4. Mengurangi scroll yang terlalu panjang.
5. Memisahkan informasi ringkas dan detail dokumentasi.
6. Mengurangi risiko salah menekan aksi destruktif seperti hapus.
7. Tetap mempertahankan karakter visual Pakti yang industrial/terminal.

---

# 3. Temuan Utama

## 3.1 Video Player Terlalu Besar

### Kondisi sekarang

Video langsung ditampilkan dalam player besar pada setiap card.

Dampaknya:

- Satu card memakan ruang sangat besar.
- Sedikit resi yang terlihat dalam satu layar.
- Pengguna harus melakukan scroll panjang.
- History menjadi lebih seperti halaman pemutar video daripada daftar dokumentasi.

### Rekomendasi

Pada halaman History, tampilkan video sebagai **thumbnail compact**.

Contoh:

```text
┌──────────────────────────────────────────┐
│ SPXID065994720298               Selesai  │
│ 1 dokumentasi                            │
│                                          │
│ ┌─────────────┐  QC                      │
│ │  Thumbnail  │  24 Agu 2026 • 15:34    │
│ │    ▶ 0:07   │  oleh admin              │
│ └─────────────┘                          │
│                                          │
│                              Lihat detail│
└──────────────────────────────────────────┘
```

Ukuran thumbnail disarankan sekitar **100–130 px tinggi** pada mobile.

Video player penuh hanya ditampilkan setelah pengguna membuka detail dokumentasi.

---

# 4. Gunakan Halaman Detail Dokumentasi

Ketika card ditekan, pengguna diarahkan ke halaman detail atau bottom sheet.

Contoh:

```text
SPXID065994720298

QC
24 Agu 2026, 15:34
Direkam oleh admin

┌─────────────────────────────┐
│                             │
│          VIDEO              │
│                             │
└─────────────────────────────┘

[ Bagikan ]       [ WhatsApp ]

⋮ Opsi lainnya
```

Dengan pola ini:

- History tetap ringan.
- Video lebih fokus saat dibuka.
- Aksi sharing dan delete tidak mengganggu daftar utama.
- Pengguna dapat melihat lebih banyak resi dalam satu layar.

---

# 5. Hierarki Informasi Card

Informasi utama sebaiknya memiliki urutan:

```text
Resi
↓
Status dokumentasi
↓
Task
↓
Waktu
↓
Petugas
↓
Video
```

Nomor resi harus menjadi elemen paling dominan.

Contoh:

```text
SPXID065994720298

QC
24 Agu 2026 • 15:34

oleh admin
```

Tambahkan tombol **Copy Resi** kecil agar nomor resi dapat digunakan kembali dengan cepat.

---

# 6. Perbaikan Status

## Masalah

Saat ini tulisan **Selesai** muncul lebih dari satu kali:

- Di kanan nomor resi.
- Di baris task QC.

Hal tersebut dapat membuat status ambigu.

## Rekomendasi

Bedakan:

### Status dokumentasi keseluruhan

Contoh:

```text
Lengkap
Belum lengkap
```

### Status per task

Contoh:

```text
QC        ✓ Selesai
Packing   — Belum ada
```

Card dapat menjadi:

```text
SPXID065994720298                 Lengkap

QC                               ✓ Selesai
Packing                          — Belum ada
```

Pendekatan ini lebih relevan untuk aplikasi dokumentasi QC dan Packing.

---

# 7. Status Dokumentasi yang Disarankan

Gunakan tiga status utama:

### Lengkap

Semua dokumentasi wajib sudah tersedia.

```text
✓ Lengkap
```

### Belum Lengkap

Sebagian task sudah memiliki dokumentasi.

```text
! Belum lengkap
```

### Belum Ada Dokumentasi

Belum terdapat recording.

```text
— Belum ada
```

---

# 8. Redesign Filter

## Kondisi sekarang

```text
FILTER TASK

[ All ] [ QC ] [ Packing ]

[        Semua akun        ] [ Reset ]
```

Filter memakan ruang cukup besar.

## Rekomendasi

Filter utama:

```text
[ Semua ] [ QC ] [ Packing ]   [ Filter ⚙ ]
```

Filter yang paling sering digunakan tetap terlihat.

Filter lanjutan dipindahkan ke bottom sheet.

Contoh:

```text
Filter history

Akun
[ Semua akun ▼ ]

Status dokumentasi
○ Semua
○ Lengkap
○ Belum lengkap

Tanggal
[ Semua waktu ▼ ]

[Reset]              [Terapkan]
```

---

# 9. Search Bar

Search merupakan fungsi utama halaman History.

Disarankan menggunakan placeholder:

```text
Cari nomor resi...
```

atau:

```text
Cari atau scan nomor resi...
```

Di sebelah kanan dapat ditambahkan tombol scanner.

Contoh:

```text
[ 🔎 Cari nomor resi...             ] [ ⛶ ]
```

Tujuannya agar pengguna dapat:

1. Mengetik resi.
2. Paste resi.
3. Scan barcode/resi.

---

# 10. Tombol Refresh

## Kondisi sekarang

Tombol refresh berdiri sendiri di kanan atas dan terlihat seperti control terpisah.

## Rekomendasi

Pindahkan ke header:

```text
History                             ↻
32 dokumentasi
```

Alternatif yang lebih baik:

- Auto refresh saat membuka halaman.
- Pull-to-refresh pada mobile.
- Refresh setelah recording baru berhasil di-upload.

Dengan demikian tombol refresh tidak perlu terlalu dominan.

---

# 11. Redesign Aksi Share dan Delete

## Kondisi sekarang

Setiap card memiliki:

```text
[ Share ] [ WhatsApp ]

[      Hapus recording      ]
```

Masalah:

- Card menjadi tinggi.
- Tombol hapus terlalu dominan.
- Risiko salah tekan meningkat.
- Aksi sekunder mengganggu informasi utama.

## Rekomendasi

Pada History cukup:

```text
[ Lihat video ]                [ ⋮ ]
```

Menu overflow:

```text
Bagikan
Bagikan ke WhatsApp
Salin nomor resi

────────────

Hapus dokumentasi
```

Aksi **Hapus dokumentasi** tetap menggunakan warna destructive/red.

---

# 12. Confirmation Dialog untuk Delete

Jangan langsung menghapus ketika pengguna menekan menu Hapus.

Gunakan confirmation dialog:

```text
Hapus dokumentasi?

Video QC untuk resi
SPXID065994720298 akan dihapus.

Tindakan ini tidak dapat dibatalkan.

[ Batal ]          [ Hapus ]
```

---

# 13. Handling Video Portrait

Video berasal dari HP sehingga kemungkinan besar berformat portrait.

Saat ini video portrait berada di player landscape sehingga menghasilkan area hitam besar di kiri dan kanan.

## Pada History

Gunakan thumbnail:

```css
object-fit: cover;
```

Card hanya membutuhkan preview visual.

## Pada Detail

Video asli tetap ditampilkan menggunakan:

```css
object-fit: contain;
```

sehingga video tidak terpotong.

---

# 14. Redesign Header

## Kondisi sekarang

```text
[ History ]

Resi — 3 catatan    akun 001
```

## Rekomendasi

Gunakan:

```text
History
32 dokumentasi paket
```

atau:

```text
History
Dokumentasi QC & Packing
```

Kemudian search:

```text
[ 🔎 Cari atau scan nomor resi... ] [ Scan ]
```

Informasi akun tidak perlu berada di area headline kecuali account scope memang sangat penting.

---

# 15. Penggunaan Gaya Bracket

Visual Pakti menggunakan elemen seperti:

```text
[ History ]

[ Scan ]

[ Akun ]

[ QC ]
```

Style tersebut cukup menarik karena memberikan kesan:

- Industrial.
- Scanner.
- Terminal.
- Tool operasional.

Namun bracket sebaiknya tidak digunakan di terlalu banyak elemen.

## Disarankan digunakan untuk:

- Navigation aktif.
- Section heading tertentu.
- Branding.
- Mode/task tertentu.

## Hindari digunakan pada:

- Semua tombol.
- Semua filter.
- Semua status.
- Semua label.

Hal ini membuat desain tetap memiliki identitas tanpa terasa terlalu ramai.

---

# 16. Bottom Navigation

## Kondisi sekarang

Active state halaman History belum terlalu kuat.

## Rekomendasi

Berikan active indicator.

Contoh:

```text
     Scan           History          Akun
      ⛶               ◴               ♙
                 ─────────
```

Alternatif:

```text
Scan       [ History ]       Akun
```

Atau gunakan subtle filled background untuk item aktif.

---

# 17. Grouping Berdasarkan Waktu

Jika jumlah history sudah banyak, pisahkan berdasarkan waktu:

```text
Hari ini

[ Card ]
[ Card ]

Kemarin

[ Card ]

22 Agustus 2026

[ Card ]
[ Card ]
```

Ini mempermudah pengguna memahami kronologi.

---

# 18. Rekomendasi Struktur Card Baru

```text
┌───────────────────────────────────────┐
│ SPXID065994720298          ✓ Lengkap  │
│                                       │
│ ┌───────────┐  QC                     │
│ │           │  24 Agu 2026 • 15:34   │
│ │ ▶  0:07   │  oleh admin             │
│ │           │                         │
│ └───────────┘                         │
│                                       │
│ Packing                     Belum ada │
│                                       │
│                              Lihat ›  │
└───────────────────────────────────────┘
```

Card tidak perlu memiliki terlalu banyak button.

Seluruh card dapat dibuat clickable.

---

# 19. Rekomendasi Layout Halaman

```text
┌───────────────────────────────────────┐
│ PAKTI MOBILE                     ☼  ↪ │
│ Pakti                                 │
│                                       │
│ History                            ↻   │
│ 32 dokumentasi paket                  │
│                                       │
│ [ 🔎 Cari nomor resi...       ] [ ⛶ ] │
│                                       │
│ [ Semua ] [ QC ] [ Packing ] [ ⚙ ]   │
│                                       │
│ Hari ini                              │
│                                       │
│ ┌───────────────────────────────────┐ │
│ │ SPXID065994720298       ✓ Lengkap │ │
│ │                                   │ │
│ │ ┌───────────┐ QC                  │ │
│ │ │   ▶ 0:07  │ 15:34              │ │
│ │ │ thumbnail │ oleh admin          │ │
│ │ └───────────┘                     │ │
│ │                                   │ │
│ │                         Lihat  ›   │ │
│ └───────────────────────────────────┘ │
│                                       │
│ ┌───────────────────────────────────┐ │
│ │ SPXID060908941948    Belum lengkap│ │
│ │                                   │ │
│ │ ┌───────────┐ QC                  │ │
│ │ │   ▶ 0:11  │ 14:57              │ │
│ │ │ thumbnail │ oleh admin          │ │
│ │ └───────────┘                     │ │
│ │                                   │ │
│ │                         Lihat  ›   │ │
│ └───────────────────────────────────┘ │
│                                       │
│ Kemarin                               │
│ ...                                   │
│                                       │
├───────────────────────────────────────┤
│     ⛶             ◴             ♙     │
│    Scan         [History]        Akun │
└───────────────────────────────────────┘
```

---

# 20. Spacing

Gunakan sistem spacing konsisten:

```text
4px  → micro spacing
8px  → icon / small gap
12px → internal component
16px → standard padding
24px → section spacing
32px → major section
```

Rekomendasi card:

```text
padding: 16px
gap: 12px
border-radius: 8–12px
```

---

# 21. Typography

Rekomendasi hierarchy:

### Nomor resi

```text
16–17px
font-weight: 700
```

### Task

```text
14–15px
font-weight: 600
```

### Metadata

```text
12–13px
font-weight: 400
```

### Status

```text
12px
font-weight: 600
```

Nomor resi harus menjadi bagian yang paling mudah dipindai.

---

# 22. Recommended Flow

## Melihat dokumentasi

```text
History
↓
Cari / pilih resi
↓
Tap card
↓
Detail dokumentasi
↓
Play video
```

## Share dokumentasi

```text
Detail
↓
Share
↓
Native Share / WhatsApp
```

## Delete

```text
Detail
↓
Menu ⋮
↓
Hapus dokumentasi
↓
Confirmation dialog
↓
Delete
```

---

# 23. Prioritas Implementasi

## Priority 1 — High

- Ubah video player menjadi thumbnail.
- Buat halaman/detail dokumentasi.
- Compact card.
- Perjelas hierarchy nomor resi.
- Kurangi tombol pada card.
- Tambahkan confirmation untuk delete.

## Priority 2 — Medium

- Redesign filter.
- Tambahkan status Lengkap / Belum lengkap.
- Perjelas status QC dan Packing.
- Group history berdasarkan tanggal.
- Perbaiki active state bottom navigation.

## Priority 3 — Enhancement

- Pull-to-refresh.
- Copy nomor resi.
- Scan langsung dari search.
- Sorting terbaru/terlama.
- Filter berdasarkan akun.
- Filter berdasarkan tanggal.

---

# 24. Kesimpulan

Desain History Pakti saat ini sudah berfungsi, tetapi masih terlalu berorientasi pada **menampilkan video** daripada **mencari dokumentasi**.

Halaman History sebaiknya diperlakukan sebagai **index dokumentasi**, sedangkan video player, share, WhatsApp, dan delete dipindahkan ke halaman detail.

Perubahan paling penting adalah:

1. Mengubah video menjadi thumbnail.
2. Membuat card lebih compact.
3. Menampilkan status QC/Packing secara jelas.
4. Menyederhanakan filter.
5. Memindahkan aksi sekunder ke halaman detail.
6. Memperjelas hierarchy informasi.
7. Mempertahankan gaya terminal Pakti secara lebih terkendali.

Dengan pola tersebut, halaman History akan tetap nyaman digunakan ketika data berkembang dari beberapa resi menjadi ratusan atau ribuan dokumentasi.

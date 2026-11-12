# Plan: Auto Antrean Bukti Shopee (QC Selesai)

## Tujuan
Antrean bukti Shopee (`recording_chat_sends`) sebelumnya hanya bisa diisi manual via `HistoryPage → Shopee Chat` per resi. Sekarang begitu **video QC selesai** (`status=completed`), backend langsung memasukkannya ke antrean otomatis.

- **Durasi/interval klik kirim di extension tidak diubah** (`content.js` → `new-webchat` tetap seperti sekarang).
- Yang otomatis hanya *trigger masuk antrean*: `pending` dibuat backend, lalu saat tab `https://seller.shopee.co.id/new-webchat/conversations` dibuka antrean jalan sendiri.
- Foto/video packing **tidak lagi wajib** sebagai syarat masuk antrean. Kalau nanti packing selesai, lampirannya menyusul ke job yang sama.

## Kondisi Sebelumnya
- **Shipping**: `prepareShippingChatSends` (`shippingChatSendStore.ts`) dipicu setelah `order_status = dikirim` + klik `Prepare shipping chat` → `shipping_chat_sends` (`pending→prepared→sent` via `apps/shopee-extension/content.js` di `type=shipping`).
- **Bukti QC/packing**: `prepareRecordingChatSend` (`chatSendStore.ts`, endpoint `POST /api/recordings/:id/chat-send/prepare` di `app.ts`) dipanggil manual dari `HistoryPage.tsx` (`handlePrepareShopeeChat` / `handleBulkQueueSelected`).
- Auto-queue lama mensyaratkan `qc=completed` **dan** `packing=completed`, sehingga resi yang hanya punya QC tidak pernah masuk antrean sendiri.

## Prinsip
- **Hanya auto-queue**, tidak ubah delay/throttle `content.js`, tidak ubah `markPrepared`/`markSent`.
- Idempoten: kalau sudah ada job `pending/prepared/sent` untuk resi itu, jangan bikin duplikat.
- Video QC selalu jadi file utama (primary) dan `recording_id` job, supaya upsert `UNIQUE(recording_id, buyer_username)` stabil walau lampiran berubah.
- Trigger per resi (bukan scan harian).

## Desain (implementasi)

### 1. Trigger di `services/backend/src/store/recordingStore.ts`
`scheduleRecordingWatermark(recording)` memanggil `scheduleAutoQueueShopeeProof(recording)` untuk:
- video (MP4 maupun WEBM), dan
- **foto packing** (dulu langsung `return` sebelum auto-queue).

`scheduleAutoQueueShopeeProof` merantai pekerjaan ke `watermarkQueue`:

```ts
watermarkQueue = watermarkQueue
  .then(() => autoQueueShopeeProofForResi(recording.resi_number))
  .catch((error) => reportLastError(...))
```

Artinya file share dibuat **setelah** watermark selesai, jadi yang diantrekan bukan video mentah.

`autoQueueShopeeProofForResi(resiNumber, { prepareShareFile })`:

1. Cari video QC `completed` terbaru untuk resi. Tidak ada → berhenti.
2. **Guard order**: `getShopeeOrderByResi(resi)` harus ada dan `buyerUsername` terisi. Kalau tidak, biarkan manual (History butuh prompt username).
3. Cek job existing `pending/prepared/sent`:
   - `sent` → berhenti, job terkirim tidak boleh diubah.
   - `recording_id` berbeda dari video QC terbaru (mis. QC diulang) → berhenti agar tidak duplikat; resi itu tetap bisa diantrekan manual.
4. Panggil `prepareBundledRecordingChatSend({ recordingId: qcVideo.id, keepStatus: Boolean(existing), ... })`.

### 2. `keepStatus` di `services/backend/src/store/chatSendStore.ts`
`prepareRecordingChatSend` / `prepareBundledRecordingChatSend` menerima `keepStatus?: boolean`.

Pada upsert `ON CONFLICT(recording_id, buyer_username)`:

| Status lama | `keepStatus` | Status hasil |
|---|---|---|
| `sent` | apa pun | `sent` (tidak berubah) |
| `prepared` | `true` | `prepared`, `prepared_at` dipertahankan |
| `prepared` | `false` | `pending`, `prepared_at` direset |
| `pending` | apa pun | `pending` |
| belum ada | — | `pending` |

Dipakai auto-queue saat foto/video packing menyusul: lampiran diperbarui tanpa mereset progres extension (mencegah double-pick / kirim ulang).

### 3. Scheduler penjaga
Tidak diaktifkan pada perubahan ini. Endpoint `POST /api/chat-sends/auto-prepare-ready` tetap ada sebagai jalur manual/ekstensi (`taskType` bisa `qc` atau `packing`), default pemanggil masih `packing`.

### 4. FE `HistoryPage.tsx`
Tidak diubah. `handlePrepareShopeeChat` / `handleBulkQueueSelected` tetap jadi fallback manual, terutama untuk resi tanpa order Shopee / `buyerUsername`.

Badge “auto” di History **belum** ditambahkan karena butuh kolom `source` di `recording_chat_sends` plus perubahan tipe di `packages/types` — bisa jadi pekerjaan lanjutan.

### 5. Extension `apps/shopee-extension/content.js`
Tidak diubah. Tetap poll `/api/chat-sends/pending` → `prepared` → `sent` dengan delay/throttle yang sama.

## Verifikasi
- `npm run test:chat-send` — 14 test lulus, termasuk:
  - tidak membuat job tanpa order Shopee / `buyerUsername`;
  - job `pending` dibuat dari video QC saja (tanpa foto packing);
  - foto packing menyusul → lampiran jadi 2, status `prepared` tetap;
  - job `sent` tidak diubah;
  - resi dengan job milik rekaman QC lain dilewati.
- `npm run test:packing-photo` — 5 test lulus (foto packing tetap tersimpan dan memicu jalur auto-queue).
- `npx tsc -b` bersih; `eslint` pada file yang diubah bersih.

Uji manual yang disarankan:
- Scan QC resi yang order Shopee-nya sudah tersinkron → `recording_chat_sends` muncul `pending` tanpa klik → buka `new-webchat` → `prepared` → `sent`.
- Resi tanpa order / `buyer_username` → tidak ada job otomatis; antre manual dari History tetap bisa.
- Selesai packing foto setelah video QC terkirim → job `sent` tidak berubah.

## Tidak Diubah
- `apps/shopee-extension/content.js` delay/throttle klik kirim.
- `markPrepared`/`markSent` interval.
- `shipping_chat_sends` flow.
- `HistoryPage` manual `Shopee Chat` (tetap fallback).
- Skema database (tidak ada migrasi).

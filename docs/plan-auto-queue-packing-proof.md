# Plan: Auto Antrean Bukti Packing Tanpa Ubah Durasi Klik Kirim

## Tujuan
Bukti packing (video/foto) saat ini antreannya manual via `HistoryPage → Shopee Chat` per resi. Diinginkan otomatis seperti `Pengiriman info` (setelah `dikirim` + `Prepare shipping chat`), tapi **durasi/interval klik kirim tidak diubah** — hanya trigger masuk antreannya yang jadi otomatis setelah `QC` dan `Packing` lengkap.

- Durasi klik kirim di extension (`content.js` → `new-webchat`) tetap seperti sekarang (delay/throttle yang sudah ada), tidak diutak-atik.
- Yang otomatis hanya: begitu `qc=completed` **dan** `packing=completed` untuk 1 `resiNumber`, BE langsung `prepareRecordingChatSend` → `pending/prepared`, lalu saat buka tab `https://seller.shopee.co.id/new-webchat/conversations` antrean jalan sendiri seperti sekarang.

## Kondisi Sekarang
- **Shipping**: `prepareShippingChatSends` (`shippingChatSendStore.ts`) dipicu setelah `order_status = dikirim` + klik `Prepare shipping chat` → `shipping_chat_sends` (`pending→prepared→sent` via `apps/shopee-extension/content.js` di `type=shipping`).
- **Packing proof**: `prepareRecordingChatSend` (`recordingStore.ts:799`, `app.ts:1144 POST /api/recordings/:id/chat-send/prepare`) dipanggil manual dari `HistoryPage.tsx:639 handlePrepareShopeeChat` per resi → `recording_chat_sends`.

## Prinsip
- **Hanya auto-queue**, tidak ubah `content.js` delay, tidak ubah `markPrepared`/`markSent` throttle, tidak ubah `queue` di extension.
- Idempoten: kalau sudah ada `pending/prepared/sent` untuk resi itu, jangan bikin duplikat.
- Pakai `Asia/Jakarta` untuk hari, tapi trigger per resi (bukan per hari).

## Desain

### 1. BE Watcher di `recordingStore.ts`
- Setelah `finalizeRecording` sukses (`status=completed`):
  ```ts
  async function tryAutoQueuePackingProof(resiNumber: string) {
    const normalized = resiNumber.trim()
    if (!normalized) return
    const prog = getTaskProgressByResi(normalized) // atau getGroupStatus via recordings
    const qcDone = prog.qc?.status === 'completed'
    const packingDone = prog.packing?.status === 'completed'
    if (!qcDone || !packingDone) return
    const latestPacking = db.prepare(
      `SELECT id FROM recordings WHERE resi_number=? AND task_type='packing' AND status='completed' ORDER BY updated_at DESC LIMIT 1`
    ).get(normalized) as { id: string } | undefined
    if (!latestPacking) return
    const existing = db.prepare(
      `SELECT id FROM recording_chat_sends WHERE resi_number=? AND status IN ('pending','prepared','sent') LIMIT 1`
    ).get(normalized)
    if (existing) return
    await prepareRecordingChatSend(latestPacking.id) // reuse existing (buyerUsername/orderNumber dari getShopeeOrderByResi fallback order_number)
    broadcastBackendEvent('chat-sends-updated', { resiNumber: normalized, source: 'auto-packing-proof' })
  }
  ```
- Panggil `void tryAutoQueuePackingProof(resiNumber)` di akhir `finalizeRecording` (setelah `prepareRecordingShareFile` dan sebelum `return`), dengan `catch` log saja biar tidak gagalkan finalize.

### 2. Scheduler Penjaga (opsional, tanpa ubah durasi)
- Fungsi `prepareReadyRecordingChatSendsForToday()` scan `recordings` yang `completed` dan `getGroupStatus==='completed'` tapi belum ada `recording_chat_sends` → panggil `tryAutoQueue...`.
- Jalankan sekali saat `ensureServerStorage` dan `setInterval 5m` (mirip `prepareShippingChatSends`). Tidak ubah interval kirim, hanya jaga kalau watcher kelewat (server restart, dkk).

### 3. FE `HistoryPage.tsx`
- Tidak tambah tombol. `handlePrepareShopeeChat` tetap untuk manual fallback (misal `buyerUsername` kosong perlu prompt).
- Tambah badge kecil `Auto queued` di `DocumentationStatus` / `ChatDeliveryStatusAction` kalau `chatSend.status==='pending'|'prepared'` dan `source==='auto'` (optional, biar user tahu auto).
- `useEffect` yang sudah `pakti:chat-sends-updated` akan refresh `visibleChatSendByRecordingId` otomatis.

### 4. Extension `apps/shopee-extension/content.js`
- **Tidak diubah durasi klik**. Tetap poll `https://seller.shopee.co.id/new-webchat/conversations` seperti sekarang (`readPendingShopeeChatSendsApi` → `markPrepared` → isi chat).
- Auto-queue BE di atas akan membuat `pending` baru, extension akan pick up di poll berikutnya. Tidak perlu ubah `delay`, `throttle`, atau `out_time`.

### 5. API
- Tidak perlu endpoint baru. Reuse `POST /api/recordings/:id/chat-send/prepare` yang sudah ada. Watcher panggil internal `prepareRecordingChatSend`, bukan via HTTP.

## Verifikasi
- Scan QC + packing 1 resi baru (pakai resi yang ada Shopee order biar `buyerUsername` keisi) → cek `recording_chat_sends` muncul `pending` tanpa klik → buka `new-webchat` → `prepared` → `sent` dengan durasi klik yang sama seperti manual.
- Resi yang `qc` saja / `packing` saja → tidak auto.
- Resi yang sudah ada `pending/prepared/sent` → tidak duplikat.
- `npm run build:vercel` + `graphify update .`

## Tidak Diubah
- `apps/shopee-extension/content.js` delay/throttle klik kirim.
- `markPrepared`/`markSent` interval.
- `shipping_chat_sends` flow.
- `HistoryPage` manual `Shopee Chat` (tetap sebagai fallback).

## Estimasi
- BE: 1 file utama (`recordingStore.ts`) + 1 scheduler kecil.
- FE: 1 file (`HistoryPage.tsx`) untuk badge opsional.
- Risiko rendah, tidak migrasi data.

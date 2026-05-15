# Tahap 4 - Rekam Video Inti

## Tujuan

Mewujudkan alur utama PackCam end-to-end.

## Ruang Lingkup

- Scan pertama memulai rekaman.
- Scan berikutnya menghentikan rekaman sebelumnya.
- File video disimpan ke folder lokal.
- Metadata disimpan ke database.
- Tampilkan indikator `RECORDING`.

## Tugas

1. Hubungkan event scan dengan state rekaman.
2. Implementasikan start dan stop recording.
3. Simpan file video dengan nama berbasis resi.
4. Update row database saat rekaman selesai.

## Hasil yang Diharapkan

- Satu resi menghasilkan satu file video.
- Transisi antar resi berjalan otomatis.
- Data rekaman tercatat rapi.

## Selesai Jika

- Alur scan -> record -> stop -> save berjalan penuh.
- File video benar-benar tersimpan di disk.
- Metadata bisa ditelusuri dari database.

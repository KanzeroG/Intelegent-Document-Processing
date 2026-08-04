# Laporan Hasil Testing Batch 893a7e1d-e2a

Dokumen ini merangkum hasil testing ekstraksi untuk batch `893a7e1d-e2a` berdasarkan artefak hasil evaluasi di `data/batches/893a7e1d-e2a/`.

## Ringkasan Eksekutif

- Jumlah dokumen yang diuji: 60
- Rata-rata waktu proses per dokumen: 50.8 detik
- Waktu proses tercepat: 13.6 detik
- Waktu proses terlama: 62.8 detik
- Total similarity hasil ekstraksi: 97.5%
- Field dengan performa terbaik: `doc_type`, `doc_number`, `vendor`, `doc_date`, `currency`, `subtotal`, `tax_amount`, `total_amount`, `line_item_count`, dan `line_items` masing-masing 100%
- Field yang paling lemah: `buyer` dengan 75.0%

## Inti Temuan

Hasil testing menunjukkan model sudah sangat stabil untuk mayoritas field utama, terutama identitas dokumen, vendor, tanggal, mata uang, nilai subtotal, pajak, total, dan item baris. Hampir semua dokumen berhasil diekstrak dengan benar pada field-field tersebut.

Masalah utama ada pada field `buyer`. Dari 60 dokumen, 15 dokumen terakhir berada di bawah 80% untuk field buyer, sehingga menurunkan rata-rata keseluruhan. Dalam batch raw ini, penurunan tersebut terlihat pada `DOC-046` sampai `DOC-060`.

Catatan penting: pada logika evaluasi backend, receipt memang seharusnya tidak dipenalti untuk buyer karena field itu tidak tercetak di receipt. Namun artefak batch raw ini tetap merekam buyer sebagai 0 untuk dokumen-dokumen tersebut. Karena itu, laporan ini mengikuti angka yang ada di hasil testing batch, sambil memberi konteks bahwa penurunan buyer di receipt perlu diperlakukan hati-hati.

## Ringkasan Per Field

| Field | Akurasi | Catatan |
|---|---:|---|
| doc_type | 100.0% | Konsisten di seluruh dokumen |
| doc_number | 100.0% | Tidak ada mismatch |
| vendor | 100.0% | Konsisten |
| buyer | 75.0% | Turun pada 15 dokumen terakhir |
| doc_date | 100.0% | Konsisten |
| currency | 100.0% | Konsisten |
| subtotal | 100.0% | Konsisten |
| tax_amount | 100.0% | Konsisten |
| total_amount | 100.0% | Konsisten |
| line_item_count | 100.0% | Konsisten |
| line_items | 100.0% | Konsisten |

## Penjelasan Hasil Per Dokumen

Format penjelasan di bawah ini dibuat ringkas agar mudah dipindahkan ke laporan presentasi atau review internal.

| Doc ID | Tipe | Status | Penjelasan |
|---|---|---|---|
| DOC-001 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-002 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-003 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-004 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-005 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-006 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-007 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-008 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-009 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-010 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-011 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-012 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-013 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-014 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-015 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-016 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-017 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-018 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-019 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-020 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-021 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-022 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-023 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-024 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-025 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-026 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-027 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-028 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-029 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-030 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-031 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-032 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-033 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-034 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-035 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-036 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-037 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-038 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-039 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-040 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-041 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-042 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-043 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-044 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-045 | invoice | Baik | Semua field cocok dengan ground truth. |
| DOC-046 | invoice | Perlu perhatian | Buyer turun; pada batch raw field buyer tercatat tidak cocok. |
| DOC-047 | invoice | Perlu perhatian | Buyer turun; pada batch raw field buyer tercatat tidak cocok. |
| DOC-048 | invoice | Perlu perhatian | Buyer turun; pada batch raw field buyer tercatat tidak cocok. |
| DOC-049 | invoice | Perlu perhatian | Buyer turun; pada batch raw field buyer tercatat tidak cocok. |
| DOC-050 | invoice | Perlu perhatian | Buyer turun; pada batch raw field buyer tercatat tidak cocok. |
| DOC-051 | invoice | Perlu perhatian | Buyer turun; pada batch raw field buyer tercatat tidak cocok. |
| DOC-052 | invoice | Perlu perhatian | Buyer turun; pada batch raw field buyer tercatat tidak cocok. |
| DOC-053 | invoice | Perlu perhatian | Buyer turun; pada batch raw field buyer tercatat tidak cocok. |
| DOC-054 | invoice | Perlu perhatian | Buyer turun; pada batch raw field buyer tercatat tidak cocok. |
| DOC-055 | invoice | Perlu perhatian | Buyer turun; pada batch raw field buyer tercatat tidak cocok. |
| DOC-056 | invoice | Perlu perhatian | Buyer turun; pada batch raw field buyer tercatat tidak cocok. |
| DOC-057 | invoice | Perlu perhatian | Buyer turun; pada batch raw field buyer tercatat tidak cocok. |
| DOC-058 | invoice | Perlu perhatian | Buyer turun; pada batch raw field buyer tercatat tidak cocok. |
| DOC-059 | invoice | Perlu perhatian | Buyer turun; pada batch raw field buyer tercatat tidak cocok. |
| DOC-060 | invoice | Perlu perhatian | Buyer turun; pada batch raw field buyer tercatat tidak cocok. |

## Kesimpulan

Batch ini menunjukkan performa ekstraksi yang sangat kuat. Secara umum, model sudah mampu membaca dokumen dengan akurat dan konsisten, dengan total similarity 97.5% dan hampir semua field penting berada di 100%.

Satu area yang perlu dibenahi adalah buyer. Jika target evaluasi memakai receipt, maka evaluasi sebaiknya mengikuti aturan backend yang menganggap buyer pada receipt sebagai N/A agar tidak memberi penalti yang tidak adil. Jika target evaluasi tetap memakai raw batch saat ini, maka buyer memang menjadi titik lemah utama dan perlu penanganan khusus di prompt atau logika pasca-proses.

## Sumber Data

- `data/batches/893a7e1d-e2a/eval_similarity.csv`
- `data/batches/893a7e1d-e2a/eval_exact_match.csv`
- `data/batches/893a7e1d-e2a/extracted_data.csv`
- `data/batches/893a7e1d-e2a/times.csv`
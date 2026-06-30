# Project 4: Intelligent Document Processing (Extraction & Automation)

## Latar Belakang (Background)
Tim keuangan dan operasional menghabiskan waktu berjam-jam untuk memasukkan data secara manual dari faktur (invoice), pesanan pembelian (purchase order), kuitansi (receipt), dan formulir ke dalam sistem mereka. Pekerjaan ini lambat, memakan biaya, rentan terhadap kesalahan (error-prone), dan sulit diskala (scale badly) seiring bertambahnya volume.

Xquisite AI ingin mahasiswa membangun pipeline pemrosesan dokumen cerdas yang menggunakan LLM multimodal untuk membaca dokumen dan menghasilkan data terstruktur yang bersih, lengkap dengan validasi dan langkah peninjauan manusia (human review) sebelum diekspor.

---

## Cakupan & Luaran (Scope & Deliverables)
* Unggah dokumen (PDF atau gambar) dan ekstraksi LLM untuk kolom terstruktur per jenis dokumen (faktur, PO, kuitansi).
* Aturan validasi (total rekonsiliasi, kolom wajib diisi, pemeriksaan format) yang menandai masalah.
* Layar peninjauan *human-in-the-loop* untuk mengoreksi dan menyetujui data yang diekstrak.
* Ekspor ke CSV/JSON dan tiruan endpoint API (mock API endpoint).
* Evaluasi akurasi tingkat kolom terhadap label *ground-truth*.
* Studi kelayakan bisnis biaya-manfaat (cost-benefit business case) dibandingkan entri data manual.

---

## Keterampilan yang Akan Dibangun (Skills Students Will Build)

| Area Keterampilan | Yang Dipraktikkan Mahasiswa |
| :--- | :--- |
| **Prompt Engineering** | Menginstruksikan model untuk mengembalikan kolom yang tepat sesuai kebutuhan |
| **Multimodal LLMs** | Membaca dokumen pindaian dan gambar (visi/vision) |
| **Structured Outputs** | Ekstraksi yang dibatasi skema (pydantic / JSON schema, pemanggilan fungsi) |
| **Validation Logic** | Pemeriksaan aturan bisnis dan penandaan tingkat keyakinan (confidence flagging) |
| **Human-in-the-Loop Design**| Alur kerja peninjauan, koreksi, dan persetujuan |
| **Entrepreneurship** | Analisis biaya-manfaat dan ROI otomatisasi |

---

## Langkah-Langkah Kerja (Work Steps)
1. **Definisikan Skema Ekstraksi (Define Extraction Schemas)** — Modelkan setiap jenis dokumen sebagai skema terstruktur (pydantic), misalnya vendor, tanggal, *line items*, dan total.
2. **Muat Dokumen (Document Loading)** — Konversi PDF/gambar ke bentuk yang dapat dibaca model (PyMuPDF / pdf2image).
3. **Ekstraksi (Extraction)** — Minta LLM multimodal untuk mengembalikan *output* terstruktur; gunakan model penglihatan (vision) untuk pindaian.
4. **Validasi & Penandaan (Validation & Flagging)** — Terapkan aturan bisnis (misalnya, *line items* harus dijumlahkan menjadi total) dan tandai kolom dengan tingkat keyakinan rendah.
5. **Tinjau UI (Review UI)** — Tampilkan dokumen di samping kolom yang diekstrak untuk proses edit-dan-setujui.
6. **Ekspor & API (Export & API)** — Ekspor data yang disetujui ke CSV/JSON dan tiruan endpoint API.
7. **Evaluasi (Evaluation)** — Ukur presisi/perolehan (precision/recall) tingkat kolom terhadap *ground truth* yang telah diberi label.

---

## Contoh Data yang Disediakan (Dummy Data Provided)
*Sumber: LapisAI · Xquisite AI AI Project Offering — President University (Halaman 10)*

$pprox$200 dokumen sintetis (faktur, pesanan pembelian, dan kuitansi) dalam format PDF/PNG, ditambah `ground_truth.csv` dengan kolom berlabel yang benar untuk evaluasi.

| doc_id | doc_type | vendor | total_amount |
| :--- | :--- | :--- | :--- |
| **DOC-001** | invoice | PT Sumber Makmur | 12,450,000 |
| **DOC-002** | purchase_order | CV Mitra Teknik | 3,900,000 |
| **DOC-003** | receipt | Toko Sentosa | 275,000 |

> **Kolom tambahan:** `invoice_date`, `due_date`, `line_items` (JSON), `tax_amount`, `currency`.

---

## Rekomendasi Alat & Teknologi (Recommended Tools & Technologies)
* **Multimodal LLM:** OpenAI GPT-4o (vision) atau model lokal yang memiliki kapabilitas *vision* via Ollama.
* **Pemuatan Dokumen:** PyMuPDF atau pdf2image.
* **Penegakan Skema:** `pydantic` untuk ekstraksi yang dibatasi skema.
* **Antarmuka (UI):** Streamlit untuk UI peninjauan.
* **Format Output:** JSON schema / function calling untuk *output* terstruktur.

# Pemetaan Checklist Proyek AI: Intelligent Document Processing

Berdasarkan gambar checklist yang Anda berikan, berikut adalah pemetaan (mapping) bagaimana Anda dapat mengisi informasi yang dibutuhkan (evidence) berdasarkan kondisi proyek **Intelligent Document Processing (DocExtract)** saat ini.

Mengingat proyek ini menggunakan **Pre-trained Multimodal LLM (Qwen3-VL-4B)** secara *zero-shot/few-shot*, beberapa konsep tradisional Machine Learning (seperti *training split* atau *feature engineering*) akan diadaptasi ke dalam konteks penggunaan LLM.

---

### 1. Problem statement clearly defined
*   **Status / Cara Mengisi:** ✅
*   **Evidence Required (Problem description):** Ambil dari `docs/PROJECT_SUMMARY.md` (bagian The Problem).
*   **Isi:** Proses input data dari invoice, purchase order (PO), dan receipt secara manual oleh tim finance sangat lambat, mahal, rentan terhadap *human error*, dan sulit diskalakan.

### 2. AI objective identified
*   **Status / Cara Mengisi:** ✅
*   **Evidence Required (your task):** Information Extraction (Ekstraksi Informasi).
*   **Isi:** Tugas utamanya adalah mengekstrak data terstruktur (JSON) dari dokumen tidak terstruktur (gambar/PDF) menggunakan model Vision LLM, dengan tambahan layer validasi *business rules* dan *human-in-the-loop review*.

### 3. Dataset collected
*   **Status / Cara Mengisi:** ✅
*   **Evidence Required (Dataset source):** Direktori `Source/`
*   **Isi:** Dataset berupa 60 dokumen PDF sampel (Invoice, PO, Receipt) beserta label kebenarannya (ground truth) yang tersimpan dalam file `Source/ground_truth.csv`.

### 4. Dataset quality assessed
*   **Status / Cara Mengisi:** ✅
*   **Evidence Required (Data analysis report):** Observasi Edge Cases.
*   **Isi:** Meskipun tidak ada notebook khusus untuk EDA, analisis kualitas data dilakukan berdasarkan observasi pada sampel. Misalnya, ditemukan bahwa format angka di Indonesia menggunakan titik untuk ribuan (`Rp 240.000`), dan beberapa dokumen Receipt ternyata tidak mencetak nama "Buyer". Bukti ini dicatat dalam laporan evaluasi (`PROJECT_SUMMARY.md`).

### 5. Data preprocessing completed
*   **Status / Cara Mengisi:** ✅
*   **Evidence Required (Preprocessing notebook / code):** File `backend/app/loaders.py`.
*   **Isi:** Preprocessing dalam konteks vision model adalah rasterisasi dokumen PDF menjadi gambar (base64) menggunakan `PyMuPDF`. Dokumen di-render dengan tingkat zoom (skala) 3.0 agar teks kecil dan angka dapat dibaca dengan jelas oleh model.

### 6. Feature engineering or feature extraction performed
*   **Status / Cara Mengisi:** ✅
*   **Evidence Required (Code & explanation):** File `backend/app/loaders.py` dan `backend/app/validation.py`.
*   **Isi:** In our Vision LLM pipeline, feature extraction happens in three stages. First, **Visual Feature Engineering** (`loaders.py`) rasterizes and scales PDFs to preserve microscopic visual details. Second, **Latent Feature Extraction** uses a pre-trained Vision Transformer (ViT) to convert these visual inputs into dense layout and text embeddings. Finally, **Feature Transformation** (`validation.py`) converts the extracted strings into structured data through formatting normalization and mathematical derivation (e.g., calculating line totals) to guarantee data quality.

### 7. Data split completed (train/validation/test)
*   **Status / Cara Mengisi:** ✅
*   **Evidence Required (Dataset statistics):** Penjelasan pengujian Zero-shot.
*   **Isi:** Karena model LLM digunakan secara *pre-trained* (tanpa fine-tuning), tidak diperlukan proses *training split*. Seluruh dataset (60 dokumen di `Source/`) digunakan murni sebagai **Test Set (Evaluation Set)** untuk mengukur akurasi ekstraksi.

### 8. Baseline model implemented
*   **Status / Cara Mengisi:** ✅
*   **Evidence Required (Training results / Baseline run):** Zero-shot extraction awal.
*   **Isi:** Baseline model adalah performa `qwen/qwen3-vl-4b` yang dipanggil melalui *LM Studio* secara mentah sebelum dilakukan *prompt tuning* lebih lanjut atau sebelum layer validasi di backend diterapkan. Sejarah eksperimen (`PROJECT_SUMMARY.md`) menyebutkan evaluasi dengan Ollama gemma4 dan qwen2.5vl sebagai pembanding awal.

### 9. Model performance evaluated
*   **Status / Cara Mengisi:** ✅
*   **Evidence Required (Accuracy/F1/RMSE, etc.):** Hasil skrip `backend/evaluate.py`.
*   **Isi:** Performa diukur dengan metrik **Field-level Accuracy**. Evaluasi otomatis membandingkan output JSON dengan `ground_truth.csv`. Hasil menunjukkan akurasi ekstraksi ~95-100% pada dokumen uji coba, dan hasilnya dapat diekspor ke `data/eval_results.csv`.

### 10. Hyperparameter tuning conducted
*   **Status / Cara Mengisi:** ✅
*   **Evidence Required (Comparison results):** Penyesuaian konfigurasi Model.
*   **Isi:** Tuning yang dilakukan adalah penyesuaian **Temperature = 0** (agar output LLM lebih deterministik) dan pengaturan **Context Size (`num_ctx`) ~16384** di LM Studio agar model mampu memproses gambar resolusi tinggi (yang menghabiskan ~4-5k token) tanpa error *context overflow*.

### 11. Error analysis performed
*   **Status / Cara Mengisi:** ✅
*   **Evidence Required (Misclassified samples or residual analysis):** `PROJECT_SUMMARY.md` bagian Technical Challenges.
*   **Isi:** Analisis error (kesalahan prediksi) menemukan dua isu utama:
    *   Format angka: Angka `Rp 240.000` sempat terbaca sebagai `240` (diperbaiki via prompt).
    *   Ground truth mismatch: Ground truth mencantumkan 'Buyer' pada receipt, padahal tidak tercetak di gambar dokumen (diperbaiki dengan memberikan status *N/A* pada evaluasi agar sistem tidak salah memberikan penalti).

### 12. Model improvement strategy identified
*   **Status / Cara Mengisi:** ✅
*   **Evidence Required (Planned next steps):** Roadmap di `PROJECT_SUMMARY.md`.
*   **Isi:** Strategi perbaikan (next steps) mencakup pemanfaatan metrik *logprobs* untuk kalkulasi *confidence score* model secara matematis, evaluasi skala besar dengan *charts*, dan pencatatan koreksi (*human review*) untuk potensi *fine-tuning* model kecil di masa depan.

### 13. Final deployment strategy planned
*   **Status / Cara Mengisi:** ✅
*   **Evidence Required (Architecture or deployment plan):** `README.md` Architecture Diagram.
*   **Isi:** Arsitektur lokal telah ditetapkan dengan jelas (React Vite untuk Frontend, FastAPI untuk backend, dan LM Studio untuk serving model LLM), dilengkapi penyimpanan cache SQLite agar data tidak perlu diekstrak ulang jika halaman dimuat ulang.

### 14. Code organized and reproducible
*   **Status / Cara Mengisi:** ✅
*   **Evidence Required (GitHub repository):** Struktur repositori yang ada.
*   **Isi:** Kode sudah dipisah secara modular (`/backend`, `/frontend`, `/data`, `/docs`). Terdapat instruksi yang jelas (`requirements.txt`, `package.json`, `npm install`, dll.) untuk mereproduksi lingkungan secara lokal.

### 15. Documentation updated
*   **Status / Cara Mengisi:** ✅
*   **Evidence Required (README / report):** Dokumen di repo.
*   **Isi:** Proyek memiliki `README.md` yang rinci, aturan teknis di `CLAUDE.md`, rangkuman presentasi di `docs/PROJECT_SUMMARY.md`, dan perhitungan ROI (Return on Investment) di `docs/BUSINESS_CASE.md`.

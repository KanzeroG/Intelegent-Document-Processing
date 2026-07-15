# MVP Status — Project 4: Intelligent Document Processing

**What this document is:** the MVP scope taken straight from `Works/AI Project 4.pdf`,
with an honest assessment of what is done, what is partial, and what is missing.
Every claim below was verified against the running system, not assumed.

**Verdict: all 6 graded deliverables are complete and working.** Two work-step
details are partial (precision/recall wording, per-field confidence), and the
biggest real risk is that our own docs are stale and *undersell* what we built.

Last verified: 2026-07-15 · 90 backend tests passing · frontend builds clean

---

## 1. The MVP, as the PDF defines it

The brief lists exactly six deliverables under **Scope & Deliverables**. These are
the MVP — nothing else in the PDF is a pass/fail item.

| # | Deliverable (PDF wording) | Status |
|---|---|---|
| 1 | Upload of a document (PDF or image) and LLM extraction of structured fields per document type | **Done** |
| 2 | Validation rules (totals reconcile, required fields present, format checks) that flag issues | **Done** |
| 3 | A human-in-the-loop review screen to correct and approve extracted data | **Done** |
| 4 | Export to CSV/JSON and a mock API endpoint | **Done** |
| 5 | A field-level accuracy evaluation against ground-truth labels | **Done** |
| 6 | A cost-benefit business case versus manual data entry | **Done** |

---

## 2. Deliverable-by-deliverable

### 1 — Upload + LLM extraction · Done

A user uploads a PDF or image; a multimodal vision model reads it directly and
returns structured JSON. There is no separate OCR step — the model *is* the OCR.

- `POST /extract` — [main.py](../backend/app/main.py) · accepts file + `doc_type` + optional `model`
- [loaders.py](../backend/app/loaders.py) — PDF → PNG via PyMuPDF (up to 5 pages, stitched); images normalised via Pillow
- [extraction.py](../backend/app/extraction.py) — builds a prompt embedding the pydantic JSON schema, calls the model, strips markdown fences, validates
- [schemas.py](../backend/app/schemas.py) — `Document` (`doc_type, doc_number, vendor, buyer, doc_date, currency, subtotal, tax_amount, total_amount, line_items`) + `LineItem` (`description, qty, unit_price, line_total`)

All three document types are supported: invoice, purchase order, receipt.

**The hard part — Indonesian dot-thousands.** Invoices print `Rp 240.000`, meaning
240000. Vision models read this as the decimal `240`. This is the project's central
accuracy risk, and it cannot be caught by validation: the misread is *uniform*
across subtotal/tax/total, so the figures still reconcile with each other. It is
solved in the prompt, with an explicit rule and worked examples.

### 2 — Validation rules · Done

[validation.py](../backend/app/validation.py) implements **9 rules**, returning
structured issues with `error` (blocks export) or `warning` (human should look)
severity. The PDF names three categories; all three are covered:

| PDF category | Our rules |
|---|---|
| Totals reconcile | line items sum to subtotal; `subtotal + tax = total`; per-line `qty × unit_price = line_total` |
| Required fields present | `vendor`, `total_amount` required; `doc_number` expected |
| Format checks | `doc_date` is a real `YYYY-MM-DD` date; `currency` is a 3-letter code |

Plus a domain rule the dataset requires: **PPN 11%** on invoices and POs, and no
tax line on receipts. Thresholds (PPN rate, tolerance, confidence cutoff) are
admin-configurable at runtime.

This layer is doing real work. When a weaker model was tested, its output was
automatically routed to `in_review` at confidence 79 with an issue raised, while
the strong model passed clean at 99 — no human intervention needed to tell them
apart.

### 3 — Human-in-the-loop review · Done

[ReviewPage.tsx](../frontend/src/pages/ReviewPage.tsx) shows the original document
beside editable extracted fields.

- Edit any field · "Missing" badges on empty ones · confidence score
- Validation panel listing every issue
- **Save Corrections** → `PATCH /documents/{id}` re-runs validation on the human's edits
- **Reject** · **Approve & Export** → posts to the mock API and downloads the JSON
- Amounts render Indonesian-style (`1.812.630`)
- Only `staff`/`admin` may review; `user` gets a read-only view

### 4 — Export + mock API · Done

[export.py](../backend/app/export.py). CSV columns mirror `ground_truth.csv` exactly,
so exports are directly comparable to the labels.

- `GET /documents/{id}/export.json` · `GET /documents/{id}/export.csv`
- `GET /exports/documents.csv?status=approved` — bulk
- `POST /exports/selected.csv` — hand-picked rows
- `POST /mock-api/ingest` — mock downstream ERP, acknowledges receipt

**Only approved documents are exportable** — data must clear human review before
leaving the system. Every export is attributed in the audit trail.

### 5 — Field-level accuracy evaluation · Done

[evaluation.py](../backend/app/evaluation.py) (shared) + [evaluate.py](../backend/evaluate.py) (CLI)
+ admin dashboard (background run with live progress).

**Result: 100% overall, 60/60 documents fully correct** (run 2026-07-08, all 60
labelled docs).

| Field | Accuracy |
|---|---|
| doc_number, vendor, doc_date, currency | 100% (60/60) |
| buyer | 100% (45/45 — N/A on receipts) |
| subtotal, tax_amount, total_amount | 100% (60/60) |
| line_item_count, line_items | 100% (60/60) |

By type: invoice 100% (25), purchase order 100% (20), receipt 100% (15).

One fairness decision worth defending: receipts don't print a buyer, but the
ground truth lists one. Scoring that as a miss would penalise the model for
reading the document correctly — so it is marked N/A rather than wrong.

### 6 — Cost-benefit business case · Done

[BUSINESS_CASE.md](BUSINESS_CASE.md) + a live ROI calculator on the admin dashboard
with editable assumptions.

At 1,000 docs/month, Rp 50,000/hour staff cost:

| | Manual | Automated |
|---|---|---|
| Docs a human touches | 1,000 | ~200 (flagged only) |
| Minutes each | 6 | 3 |
| **Cost/month** | **Rp 5,000,000** | **Rp 500,000** |

~90% saving (≈Rp 54,000,000/year), payback on Rp 15,000,000 setup in ~3.3 months.

The key design decision: `needs_review_fraction` is **driven by the real eval**
(`data/eval_summary.json` — the share of documents *not* fully correct), not
guessed. That wires accuracy directly to money: at 60/60 correct almost nothing
needs review; a model scoring 0/6 fully-correct would force review on every
document and erase the saving entirely.

---

## 3. What is partial

Two items from the PDF's **Work Steps** (the how-to list, not the graded
deliverables) are not literally met. Both are minor — the deliverable bullets they
map to are satisfied.

### Precision/recall wording

Work step 7 says *"Measure field-level **precision/recall**"*. We compute
**exact-match accuracy** per field. The graded deliverable bullet only says
*"field-level accuracy evaluation"*, which we satisfy fully — but if an examiner
reads the work steps, we do not literally produce precision/recall numbers.
Cheap to add if asked.

### Per-field confidence

Work step 4 says *"flag low-confidence fields"*. `validate_document()` accepts a
`field_confidences` map and flags anything below threshold — the wiring exists and
is admin-configurable. But extraction does not yet emit real per-field confidence
(no logprobs from the local server), so the displayed confidence is a **heuristic**:
it penalises validation issues and missing fields. Honest framing for the report:
"confidence score", not "model confidence".

---

## 4. Known deviations from the PDF

Documented deliberately so nobody is surprised in review.

| PDF says | We have | Assessment |
|---|---|---|
| "≈200 synthetic documents" provided | **60** (25 invoice / 20 PO / 15 receipt) | Not a deliverable — the ≈200 sits under *"Dummy Data Provided"*, describing input, not output. No deliverable specifies a document count. 60 labelled docs satisfy the eval requirement fully. |
| Ground truth columns include `invoice_date`, `due_date` | `doc_date`, no `due_date` | `invoice_date` → `doc_date` is a defensible rename (the field covers POs and receipts too, where "invoice_date" would be a misnomer). **`due_date` is simply absent** — the closest thing to a real gap, though it appears in no deliverable and on none of the 60 documents. |
| "Streamlit for the review UI" | React + Vite | Sanctioned: the PDF lists *"Recommended Tools"*, not requirements. Overridden in `CLAUDE.md`. |
| "OpenAI GPT-4o (vision) or a vision-capable local model" | Local Qwen3-VL-4B (default), MiniCPM-V 4.6, Gemini 3.1 Flash-Lite | Within the brief — it explicitly permits either. |

---

## 5. Built beyond the MVP

Not required by the PDF, but present and working:

- **Real authentication** — password login, signed tokens, role-gated routes (`user`/`staff`/`admin`)
- **Admin surface** — user management, runtime-configurable validation thresholds, audit trail of who did what
- **Persistence** — SQLite caches extractions + original files, so reopening never re-runs the model
- **Multi-model registry** — three vision models selectable per upload (`qwen`, `minicpm`, `gemini`), each with its own endpoint, auth and quirks; unknown keys are rejected rather than silently falling back
- **Model Performance page** — per-model latency comparison and a processing log
- **RAG assistant** (bonus) — chat grounded in extracted documents with citations; sanctioned by `CLAUDE.md` as a bonus only, kept secondary to the pipeline. Defaults to the local model and cannot be switched to a hosted one by accident.

Measured latency, same document, all fields correct:

| Model | Time | Notes |
|---|---|---|
| Gemini 3.1 Flash-Lite | ~3.5s | hosted — sends data to Google |
| MiniCPM-V 4.6 | ~7s | local, but drops `doc_number`/`buyer` |
| Qwen3-VL-4B | ~17s | local, the 60/60 baseline |

---

## 6. Risks to fix before submission

Ordered by how much they cost us.

1. **Our own docs are stale and undersell the project.** [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)
   still says login is *"a stubbed role switcher, not real auth"* (it is real auth)
   and that accuracy is *"~95–100% from a small sample — run the full 60-doc eval"*
   (that run finished at 100%). It cites 74 tests; there are 90. [TODO.md](TODO.md)
   lists real auth, admin config, the full eval, multi-page PDFs and the RAG bonus
   as outstanding — **all five are built**. A grader reading these would conclude
   less is done than actually is. This is the highest-value fix in the list.

2. **100% is a presentation risk, not a bug.** Every field, every document, all
   three types. It is believable — the PDFs are digitally generated text whose
   printed values match `ground_truth.csv` by construction — but the PDF's stated
   skill is *"reading **scanned** documents and images"*, and nothing in the set is
   scanned, skewed, or noisy. A perfect score with no error analysis invites
   "did you test anything hard?". Degrading a handful of samples (rotate, blur,
   JPEG-compress) would give a defensible non-trivial number and a robustness story.

3. **If Gemini becomes the default, the business case breaks.** [BUSINESS_CASE.md](BUSINESS_CASE.md)
   claims *"inference runs locally… compute cost ~0"* and *"the model runs
   on-premise; sensitive Indonesian financial data never leaves the machine"*.
   Both stop being true. The money barely moves (≈Rp 9,000–54,000/month against a
   Rp 5,000,000 manual baseline — about 1%), but the privacy argument disappears
   entirely. Fine while Gemini is opt-in and the default stays local; rewrite the
   doc before promoting it.

4. **`data/eval_results.csv` holds ad-hoc test runs**, not a clean full sweep.
   `data/eval_summary.json` — the 100% headline that feeds the ROI calculator — is
   intact. Use the CLI (`evaluate.py`) for model experiments, never the dashboard's
   run button, which overwrites the summary.

---

## 7. How to verify any of this yourself

```bash
# Backend tests (90)
cd backend && ./.venv/bin/python -m pytest tests -q

# Frontend typecheck + build
cd frontend && npm run build

# Accuracy vs ground truth — the headline number
cd backend && ./.venv/bin/python evaluate.py            # all 60 docs
cd backend && ./.venv/bin/python evaluate.py --limit 5  # quick sample

# Benchmark another model (profile key, NOT MODEL_NAME)
DEFAULT_MODEL=gemini ./.venv/bin/python evaluate.py --limit 5
```

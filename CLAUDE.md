# Project 4 — Intelligent Document Processing (Extraction & Automation)

> **For Claude Code:** The attached PDF (`AI_Project4.pdf`) contains the full project
> specification — read it for background, deliverables, and the dummy-data structure. This file
> records the **technical decisions our team has already made** that are NOT in the PDF. When the
> PDF and this file differ, **this file wins** (e.g. the PDF mentions Streamlit/OpenAI; we use a
> local model + React instead).

---

## What We're Building

An intelligent document-processing pipeline. A user uploads a document (invoice, purchase order,
or receipt as PDF/image); a **multimodal vision model reads it directly** and returns clean,
**structured JSON**; the data is **validated** against business rules; a human **reviews and
approves** it; then it's **exported** to CSV/JSON and a mock API.

The six required deliverables (see PDF for detail):
1. Upload + LLM extraction of structured fields per document type
2. Validation rules that flag issues (totals reconcile, required fields, format checks)
3. Human-in-the-loop review screen (correct + approve)
4. Export to CSV/JSON + a mock API endpoint
5. Field-level accuracy evaluation against ground-truth labels
6. A cost-benefit business case vs. manual entry

---

## Tech Stack (decided — do not substitute)

| Layer | Choice | Notes |
|---|---|---|
| Vision model | **qwen/qwen3-vl-4b** (Qwen3-VL-4B) | Multimodal/vision; loaded in LM Studio |
| Model serving | **LM Studio** | OpenAI-compatible server at `http://192.168.1.10:1234/v1` |
| Backend | **Python + FastAPI** | All extraction/validation logic lives here |
| Data models | **pydantic** | Schemas are the extraction "contract" |
| Document loading | **PyMuPDF / pdf2image** | PDF/image → model-readable bytes |
| Frontend | **React + Vite** | Web-based dashboard; talks to FastAPI over HTTP |
| Roles | **user / staff / admin** | Maps to the review workflow (see below) |

**Why these choices matter for the code:**
- The model is served **locally** via LM Studio's OpenAI-compatible endpoint
  (`http://192.168.1.10:1234/v1/chat/completions`); the image is passed as a base64 data-URI
  `image_url`. Model name is `qwen/qwen3-vl-4b`. The model must be **loaded with ~16k context**
  in LM Studio (a rasterized document image is ~4-5k tokens); the OpenAI API has no per-request
  context knob. (History: the team briefly ran `qwen2.5vl:3b` and `gemma4:*` in Ollama —
  gemma4:e4b-mlx has no vision, e2b-qat misread Rupiah figures — then standardized on
  LM Studio + `qwen/qwen3-vl-4b`.)
- **The vision model IS the OCR.** Do NOT add Tesseract/PaddleOCR in the main path. The model
  reads the image and outputs structured fields in one step.
- **Indonesian dot-thousands is THE accuracy risk.** The model reads `Rp 240.000` as `240`.
  The prompt must state explicitly that `.` is a thousands separator (with a worked example).
  Render PDFs at zoom ≈3.0 — lower res made it misread table digits.
- The extraction pipeline MUST run in Python (pydantic, PyMuPDF, the model call). React is
  presentation only — it never touches the model directly.

---

## Architecture

```
React (Vite)  ──HTTP──►  FastAPI (Python)  ──►  LM Studio server (qwen/qwen3-vl-4b)
   UI / review              extraction                 vision model
                            validation
                            export
```

### Role responsibilities
- **user** — upload documents, view their own extraction results/status
- **staff** — the human-in-the-loop reviewer: review flagged extractions, correct fields, approve/reject before export
- **admin** — manage users, view the monitoring dashboard, configure validation rules & schemas, review logs

---

## Suggested Repo Structure

```
/backend
  /app
    main.py            # FastAPI app + routes
    schemas.py         # pydantic models: Invoice, PurchaseOrder, Receipt, LineItem
    extraction.py      # the LM Studio vision call → structured JSON
    validation.py      # business-rule checks (totals reconcile, required fields)
    loaders.py         # PDF/image loading (PyMuPDF/pdf2image)
    export.py          # CSV/JSON export + mock API endpoint
    auth.py            # role scaffold (user/staff/admin) — stubbed is fine initially
  requirements.txt
/frontend              # React + Vite
  /src
    /pages             # upload, review, dashboard
    /components
/data                  # dummy documents + ground_truth.csv
/notebooks             # dataset exploration, evaluation harness
```

---

## Extraction Logic (reference — already prototyped)

The core extraction function: encode image as base64 → send image + a prompt that demands
JSON-only output matching the pydantic schema → strip any markdown fences → `model_validate_json()`.
Use `temperature=0` for deterministic extraction. Feed `Model.model_json_schema()` into the prompt
so the model knows the exact shape to return.

---

## Critical Constraints & Gotchas

1. **Hardware:** MacBook M4 Air, **16GB RAM**, fanless. Only the extraction machine runs the model.
   Full batch evaluation over ~200 docs will be slow — design for single-doc dev now, batch later.
2. **Indonesian number formatting:** invoices show amounts like `12.450.000` (dots = thousands
   separators). The model may misread this as `12.45`. Handle this explicitly — test early on a
   real Rupiah invoice and add cleanup/prompt instructions if needed.
3. **Currency defaults to IDR.** Dates should normalize to `YYYY-MM-DD`.
4. **Markdown fences:** local models often wrap JSON in ```` ```json ````. Always strip before parsing.
5. **Validation is a graded deliverable, not optional.** The validation layer (line items sum to
   total, required fields present) is where engineering judgment shows — prioritize it.

---

## Scope Discipline (what NOT to build)

- **No RAG / chatbot as a core feature** — that's Project 1. A "chat with extracted documents"
  feature is allowed only as a *bonus* after the extraction pipeline is solid.
- **No model training / fine-tuning** — we apply a pre-trained model with good prompting + structured
  outputs, per the brief.
- **No separate OCR engine** in the main path — the vision model handles it.

---

## Code Conventions

- Explain the logic in comments/PR descriptions, not just the code.
- Use clean-code principles; flag potential bugs or improvements proactively.
- Type hints + pydantic everywhere on the Python side.
- Keep the frontend/backend boundary clean: React calls FastAPI; only FastAPI touches the model.

---

## This Session's Task (Vertical Slice)

Build a **thin vertical slice**: one document, end-to-end.

1. Scaffold the repo structure above (backend + frontend skeletons).
2. Define pydantic schemas for `Invoice`, `PurchaseOrder`, `Receipt` (fields: vendor, date,
   total, tax, currency, line_items[]).
3. Implement `extraction.py` calling the LM Studio local server with one sample invoice image.
4. Build a FastAPI `POST /extract` endpoint that loads a document and returns the structured JSON.
5. Build a minimal React page: upload a document → display the extracted fields beside it.
6. Add a stubbed role scaffold (user/staff/admin).

**Definition of done:** one sample invoice can be uploaded through the React UI, extracted via
the local model, and its structured fields displayed. Validation, export, and evaluation come next.

Before writing code, confirm the plan and ask any clarifying questions.

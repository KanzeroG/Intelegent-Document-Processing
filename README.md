# Intelligent Document Processing (Extraction & Automation)

Upload a document (invoice, purchase order, or receipt) → a **local multimodal
vision model** (`qwen/qwen3-vl-4b` via LM Studio) reads it and returns clean,
**structured JSON** → the data is **validated** → a human **reviews & approves**
→ it's **exported**. Project 4 of the LapisAI / Xquisite AI offering.

> Team technical decisions live in [`CLAUDE.md`](CLAUDE.md). When the project
> brief and `CLAUDE.md` differ, `CLAUDE.md` wins (e.g. we use a local model +
> React, not Streamlit/OpenAI).

## Architecture

```
React (Vite)  ──HTTP──►  FastAPI (Python)  ──►  LM Studio server (qwen/qwen3-vl-4b)
   UI / review              extraction                 vision model
                            validation
                            export
```

The **backend + model run locally** (LM Studio on `192.168.1.10:1234`). A
cloud-hosted (e.g. Vercel) frontend cannot reach a model on your laptop, so for
development run everything locally. The frontend's API URL is configurable via
`VITE_API_BASE_URL` for when the backend is reachable elsewhere.

## Current status

Working end-to-end: **upload → extract → validate → review/correct → approve**,
with a DocExtract UI (login, upload, review, dashboard). Extractions are
**cached in SQLite** (`data/docextract.db`) with the original file, so re-opening
the app doesn't re-run the model.

API: `POST /extract` (extract + persist), `GET /documents`, `GET /documents/{id}`,
`GET /documents/{id}/file`, `PATCH /documents/{id}` (save corrections / status;
re-validates edited data).

### Accuracy evaluation (deliverable #5)
Run the extraction over the labelled `Source/` docs and compare to ground truth
(LM Studio must be running):
```bash
cd backend
./.venv/bin/python evaluate.py             # all 60 docs (~30 min)
./.venv/bin/python evaluate.py --limit 5   # quick sample
./.venv/bin/python evaluate.py --ids DOC-001,DOC-026
```
Prints per-field accuracy + writes `data/eval_results.csv`. Admins can also run
it from the Dashboard ("Model Accuracy" card) — a background run with live
progress and per-type results.

### Cost-benefit business case (deliverable #6)
An interactive ROI calculator lives on the Dashboard (manual vs. automated cost,
savings, payback), with the "needs review" rate driven by the real eval. The
written case is in [`docs/BUSINESS_CASE.md`](docs/BUSINESS_CASE.md).

All six deliverables are now in place; remaining work is polish (real auth,
admin config, batch upload).

## Prerequisites

1. **LM Studio** with `qwen/qwen3-vl-4b` loaded (context length ~16k) and its
   server started (OpenAI-compatible at `http://192.168.1.10:1234/v1`).
2. **Python 3.11+** and **Node 18+**.

## Run it

### Backend
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload          # serves on http://localhost:8000
```
Health check: `curl http://localhost:8000/health` → `{"status":"ok"}`.

### Frontend
```bash
cd frontend
cp .env.example .env                    # optional; defaults to localhost:8000
npm install
npm run dev                             # serves on http://localhost:5173
```

Open http://localhost:5173, pick a document and its type, and click **Extract**.
The source document shows on the left, the extracted fields (and any validation
flags) on the right. Use the **Role** switcher (user/staff/admin) to exercise the
stubbed auth — staff/admin views are placeholders for now.

## Repo layout

```
backend/app/   schemas · loaders · extraction · validation · export(stub) · auth(stub) · main
frontend/src/  api.ts · pages/UploadPage.tsx · App.tsx (role switcher)
Source/        documents/ (60 sample PDFs) · ground_truth.csv (labels)
notebooks/     dataset exploration + evaluation harness (later)
```

## Notes & gotchas
- **The vision model is the OCR** — no separate OCR engine in the main path.
- **Indonesian numbers**: `Rp 240.000` (dots = thousands) is handled by an explicit
  prompt instruction + worked example, so it returns `240000`, not `240`. This is the
  single biggest accuracy risk; PDFs are rendered at zoom 3.0 so small digits read cleanly.
- **Context size**: a document image needs `num_ctx` ≈ 16384 in Ollama — the default
  4096 overflows and 400s.
- Dates normalize to `YYYY-MM-DD`; currency defaults to `IDR`. PPN is 11% on invoices/POs.
- React never touches the model directly — only FastAPI does.

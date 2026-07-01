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

The **backend + model run locally** (LM Studio on `127.0.0.1:1234`). A
cloud-hosted (e.g. Vercel) frontend cannot reach a model on your laptop, so for
development run everything locally. The frontend's API URL is configurable via
`VITE_API_BASE_URL` for when the backend is reachable elsewhere.

## Current status — vertical slice

Working end-to-end: **upload → extract → validate → display fields**.
Scaffolded for the next session: full validation rules, CSV/JSON + mock-API
export, accuracy evaluation, the staff review screen, and the admin dashboard.

## Prerequisites

1. **LM Studio** with `qwen/qwen3-vl-4b` loaded (context length ~16k) and its
   server started (OpenAI-compatible at `http://127.0.0.1:1234/v1`).
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

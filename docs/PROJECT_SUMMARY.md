# DocExtract — Project Summary (for slides / presentation)

Slide-ready summary of the Intelligent Document Processing project. Each section
maps to one slide. Numbers marked *(sample)* come from a small eval run — run the
full 60-doc evaluation for a headline figure before citing one.

---

## 1. Title
**DocExtract — Intelligent Document Processing**
Upload → AI extraction → validation → human review → export. Built for Indonesian
invoices, purchase orders, and receipts. Runs 100% locally.

## 2. The Problem
- Finance/ops teams manually key data from invoices/POs/receipts — slow, costly,
  error-prone, and it scales badly.
- Goal: a multimodal LLM reads the document, outputs clean structured data, with
  validation + a human review step before export.

## 3. Architecture
```
React (Vite) --HTTP--> FastAPI (Python) --> LM Studio (qwen/qwen3-vl-4b)
   UI / review          extraction · validation      vision model
                        export · eval · SQLite
```
- **Frontend:** React + Vite + Tailwind (DocExtract design system)
- **Backend:** Python + FastAPI + pydantic
- **Model:** Qwen3-VL-4B via LM Studio (OpenAI-compatible, local) — the model *is* the OCR
- **Storage:** SQLite (caches extractions + the original files)
- Clean boundary: React only calls FastAPI; only FastAPI touches the model.

## 4. The 6 Deliverables (all done)
| # | Deliverable | Status |
|---|---|---|
| 1 | Upload + LLM extraction per document type | Done |
| 2 | Validation rules (flag issues) | Done |
| 3 | Human-in-the-loop review (correct + approve) | Done |
| 4 | Export CSV/JSON + mock API | Done |
| 5 | Field-level accuracy evaluation | Done |
| 6 | Cost-benefit business case | Done |

## 5. Feature — Upload & Extraction
- Drag-and-drop, single or **batch** upload (per-file document type).
- Extract-on-click (stage first, then run) with a live progress bar.
- Vision model returns structured JSON matching a pydantic schema:
  `doc_number, vendor, buyer, doc_date, currency, subtotal, tax_amount,
  total_amount, line_items`.
- Results cached in SQLite → re-open instantly, no re-running the model.

## 6. Feature — Validation (graded deliverable)
Nine business rules, including:
- Required fields present; line items sum to subtotal; **subtotal + tax = total** (error).
- **PPN 11%** check on invoices/POs; receipts have no tax line.
- Format checks: real `YYYY-MM-DD` date, 3-letter currency, doc number present.
- Per-line arithmetic (qty × unit_price = line_total); confidence-flagging hook.
- **74 automated tests** — all 60 ground-truth rows validate clean.

## 7. Feature — Human Review
- Document preview beside **editable** extracted fields.
- **"Missing" badges** on empty fields; a **confidence score** that drops for missing fields.
- **Validation Rules** panel (Calculation Mismatch / Missing Information).
- Actions: **Save Corrections** (re-validates), **Reject**, **Approve & Export**.
- Amounts shown Indonesian-style (`1.812.630`).

## 8. Feature — Export & Dashboard
- Per-document **JSON** + **CSV** download; **Approve & Export** posts to a **mock API**; **bulk "export all approved" CSV**.
- **Admin dashboard:** metric cards, docs-by-type, issues-by-rule, recent activity.
- **ROI calculator** (editable assumptions → savings + payback).
- **Accuracy evaluation** runnable from the dashboard (admin only, background run + live progress).

## 9. Technical Challenges Solved
- **Indonesian dot-thousands:** model read `Rp 240.000` as `240`; fixed with an explicit prompt + worked example → `240000`.
- **Model journey:** LM Studio/Qwen3-VL → Ollama gemma4 (no vision / misread numbers) → qwen2.5vl → back to **Qwen3-VL-4B in LM Studio**.
- **Context overflow:** a rasterized page ≈ 4–5k tokens → model loaded with ~16k context.
- **Date normalization:** `24 Feb 2026` → `2026-02-24` (Indonesian + English months, dd/mm/yyyy).
- **Eval fairness:** discovered receipts don't print a buyer (but ground truth lists one) → marked N/A rather than penalize the model.

## 10. Accuracy (from the eval harness)
- Runs all 60 labelled docs, compares every field to `ground_truth.csv`, reports per-field %.
- *(Sample)* invoice 10/10 fields, receipt 9/9 printed fields; overall ~95–100% on tested docs.
- Run `python evaluate.py` (backend) for the full 60-doc headline number.

## 11. Business Case (ROI)
Example — 1,000 docs/month at default assumptions:
- Manual: **Rp 5,000,000/mo** · Automated (review only): **Rp 500,000/mo**
- **~90% cost reduction**, **~Rp 54M/year saved**, **payback ~3.3 months**
- Also: faster close, auditability, on-prem privacy, cost scales with the *review* fraction, not total volume.
- Full write-up: `docs/BUSINESS_CASE.md`.

## 12. Roles & Team
- Roles: **user** (upload), **staff** (review/approve), **admin** (dashboard, eval, config).
- Teammate's frontend branch integrated and reconciled to the schema; backend kept intact.

## 13. Roadmap / Future
- Real authentication (currently a stubbed role switcher).
- Admin: user management, configurable rules, logs.
- Model confidence via logprobs; larger-scale evaluation with charts.

---

### Accuracy caveats for the deck
- "~95–100%" is from a **small sample** — run the full 60-doc eval before quoting a headline number.
- Login is a **stubbed role switcher**, not real auth — describe it as a "role-based workflow," not "secure login."

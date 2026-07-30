# What's Missing / To Build Next

A contributor-facing checklist of gaps, measured against **AI Project 4.pdf**,
**Source/README.md**, and the roles in **CLAUDE.md**. The six graded
deliverables are all in place; what remains is (A) fuller-spec items implied by
the roles/dashboard, (B) polish/robustness, and (C) the RAG chatbot bonus.

Each item lists **what**, **why**, **where** (files), and **acceptance criteria**.

---

## Status snapshot (already done)
- ✅ Upload + extraction (single **and** batch), local Qwen3-VL-4B via LM Studio
- ✅ Validation (9 rules, 74 tests) - line items→subtotal, subtotal+tax=total, PPN 11%, formats, per-line arithmetic
- ✅ Human review (edit fields, missing badges, confidence, approve/reject/save)
- ✅ Export: per-doc JSON + CSV, mock API, bulk "export approved" CSV
- ✅ Accuracy evaluation: CLI (`backend/evaluate.py`) + admin web (background run)
- ✅ Cost-benefit: ROI calculator on dashboard + `docs/BUSINESS_CASE.md`
- ✅ Persistence: SQLite caches extractions + original files

---

## A. Brief-aligned gaps

### A1. Real authentication (currently stubbed)
- **What:** Replace the role *switcher* with real login - users with a password and a fixed role (user/staff/admin).
- **Why:** CLAUDE.md defines role responsibilities; today anyone can pick any role via a header.
- **Where:** `backend/app/auth.py` (issue/verify a token or session), a `users` table in `db.py`, a real login on `frontend/src/pages/LoginPage.tsx`, send the token instead of `X-Role`.
- **Acceptance:** Wrong password rejected; role comes from the authenticated user, not a client header; admin-only routes (`/eval/run`) enforce it.

### A2. Admin: user management + rule config + logs
- **What:** Admin screens to (a) manage users, (b) configure validation thresholds (PPN rate, tolerances, confidence cutoff), (c) view a log of extractions/approvals.
- **Why:** Listed under the **admin** role in CLAUDE.md; currently only the eval run is admin-gated.
- **Where:** new `backend/app/admin.py` + endpoints; make `validation.py` constants configurable (read from DB/settings); a new admin page in `frontend/src/pages/`.
- **Acceptance:** Admin can change the PPN tolerance and see it affect validation; a logs table lists who approved/rejected what and when.

### A3. Run the full 60-doc evaluation + richer charts
- **What:** Execute the full evaluation and record the headline accuracy; add per-field/by-type charts to the dashboard.
- **Why:** Deliverable #5 wants precision/recall vs ground truth; we have the harness but need the full run + a real number for the report/deck.
- **Where:** run `backend/evaluate.py`; extend the dashboard "Model Accuracy" card (currently bars) with a proper chart lib if desired.
- **Acceptance:** `data/eval_summary.json` reflects all 60 docs; dashboard shows real overall + per-type accuracy.

### A4. Real per-field confidence (optional upgrade)
- **What:** Replace the heuristic confidence with model **logprobs** (token probabilities mapped to each field).
- **Why:** More trustworthy confidence flags for review (PDF work-step 4).
- **Where:** `extraction.py` (request logprobs - verify LM Studio exposes them for qwen3-vl; Ollama did), map token spans → fields, pass into `validate_document(field_confidences=...)`.
- **Acceptance:** Review shows a real per-field %; low-confidence fields auto-flag.

---

## B. Polish / robustness
- **Backend tests beyond validation:** add endpoint tests (extract mocked, documents CRUD, export, eval gating). Today only `test_validation.py` exists.
- **Error/empty states:** friendlier handling when LM Studio is down, malformed PDFs, huge files.
- **Multi-page PDFs:** loaders currently rasterize page 1 only - handle multi-page docs.
- **Deployment notes:** everything is local (model on-device). If hosting the frontend (Vercel), the backend/model still run locally - document the tunnel/relay approach.

---

## C. Bonus - RAG "Chat with your documents"

> Per CLAUDE.md this is a **bonus**, allowed now that the extraction pipeline is
> solid. Keep it clearly secondary to the core deliverables.

**What:** A chat page where a user asks natural-language questions across their
extracted/approved documents - e.g. *"total spend with UD Sinar Terang?"*,
*"which invoices are flagged?"*, *"show POs over Rp 5,000,000"* - with answers
grounded in the data and a **citation** to the source document.

**Two layers (build the simple one first):**
1. **Structured Q&A (recommended first):** most questions are aggregations over
   the SQLite records. Translate the question → a filter/aggregation over the
   `documents` table (or hand the LLM the compact JSON of matching docs) and have
   the model answer + cite `doc_number`s. Fast, accurate, no vector store needed.
2. **True RAG (semantic):** for free-text questions, chunk each document's text
   (extracted fields + line items, or embedded PDF text) → embed → store in a
   vector DB → retrieve top-k → answer with citations.

**Tech (reuse what's already local):**
- **Embeddings:** `text-embedding-nomic-embed-text-v1.5` is **already loaded in
  LM Studio** - call `/v1/embeddings`.
- **Vector store:** ChromaDB or FAISS (local), or even in-memory cosine for the 60-doc scale.
- **Chat model:** the same local Qwen3-VL-4B (text mode) via LM Studio.

**Where:**
- `backend/app/rag.py` - build index from approved docs; `retrieve(query)` → top-k chunks.
- `POST /chat` endpoint - `{question}` → `{answer, citations:[doc_id...]}`.
- `frontend/src/pages/ChatPage.tsx` - chat UI, add "Assistant" to the sidebar; show citations linking to `/review/{id}`.

**Acceptance:**
- Ask "which documents are flagged?" → correct list with doc numbers.
- Ask a semantic question → grounded answer citing the source document(s).
- Answers never invent data not present in the documents (grounding enforced by prompt).

**Scope guardrails (from CLAUDE.md):** no fine-tuning; pre-trained models +
prompting/retrieval only; keep it a bonus tab, not the core flow.

---

## D. Deferred - rename the roles (agreed 30/07/2026, after the final presentation)

- **What:** Rename two of the three roles. `staff` becomes `finance`, and `user`
  becomes `staff`. `admin` is unchanged. Demo accounts follow the new names:
  `finance@demo`, `staff@demo`, `admin@demo`, keeping the existing
  "role + 123" password convention (`finance123`, `staff123`, `admin123`).
  Note that `user@demo` disappears in the process.
- **Why:** "finance" and "staff" describe the actual jobs better than "staff" and
  "user". Deliberately deferred so the presentation runs against the same role
  names as the collected test evidence.
- **Where:**
  - `backend/app/auth.py` - the `Role` enum members and values.
  - `backend/app/db.py` - `_DEFAULT_USERS` (emails, names, roles, passwords).
  - `backend/app/main.py` - role guards and any hard-coded role strings.
  - `frontend/src/api.ts` - the `Role` union type.
  - `frontend/src/App.tsx`, `components/AppShell.tsx`, `components/RequireRole.tsx`,
    `pages/LoginPage.tsx` (demo tabs), `store.tsx`, `lib/auth.ts` (`roleHome`).
  - `backend/tests/*` - the `X-Role` headers and role fixtures.
- **Data migration (required, or the app and its records disagree):**
  - `users.role` - 3 rows.
  - `audit_log.role` - about 60 rows (admin 33, staff 21, user 6 as of 30/07/2026).
  - `documents.uploaded_by` - holds emails, so about 22 rows need remapping if the
    demo emails change. Without this, those documents lose their owner and stop
    being visible to the account that uploaded them.
- **Documentation and evidence to refresh afterwards:**
  - `Works/1.UI-UX Design.docx` - section 4 access matrix.
  - `Works/2.Business Process Document.docx` - Roles and Responsibilities table.
  - `Works/3.Testing Scenario_v3.0.xlsx` - the ROLE column across 147 rows, plus
    the Role Access Matrix sheet.
  - `Works/4.User Manual Template.docx` - Definitions and the sign-in section.
  - `Works/screenshots/` - roughly 50 images showing "Demo Staff", "Demo User"
    and "The User role doesn't have access to this page."

**Two traps to avoid:**

1. **Do not chain find-replace.** Running `user` -> `staff` and then
   `staff` -> `finance` turns everything into `finance`, because the first pass
   creates the input for the second. Swap both at once via a temporary token, or
   edit each site by hand.
2. **Most occurrences of "user" in the code are not the role.** `AuthUser`,
   `get_current_user`, `uploaded_by`, `user.email` must all stay as they are.
   Only role string values and enum members change.

- **Acceptance:** Logging in as `finance@demo` reaches Review Queue, Dashboard and
  Archive but not Settings or the Audit Log; `staff@demo` can upload and see only
  its own documents; `admin@demo` is unchanged; no row in `users` or `audit_log`
  still reads `user`; every document still lists an uploader that exists;
  `pytest` passes.

# Google Stitch Prompt — Project 4 UI (Intelligent Document Processing)

**How to use:** In Google Stitch, attach `AI_Project_Topic_Offering.pdf` and `CLAUDE.md`, then paste the prompt block below. Generate, then iterate per screen if needed. When the design looks right, export the code/Figma and hand it to Claude Code to implement as **React + Vite** talking to the FastAPI backend.

---

## THE PROMPT (copy everything in the block below into Stitch)

```
Design a desktop web application called "DocExtract" — an intelligent document-processing
dashboard for finance/operations teams. Users upload invoices, purchase orders, and receipts;
a vision AI extracts structured data; staff review and correct it; admins monitor the pipeline.
(Full domain context is in the attached PDF "Project 4" and CLAUDE.md — follow them for fields,
workflow, and constraints.)

PLATFORM: Responsive desktop web app (works down to tablet). Not mobile-first.

VISUAL STYLE — Clean enterprise (professional, trustworthy, data-dense):
- Light theme. Page background #F5F7FA, cards/surfaces #FFFFFF.
- Primary color deep navy-blue #1B3A6B; interactive accent #2563EB.
- Text #1A2433 primary, #5B6B7C secondary. Hairline borders #E3E8EF.
- Status colors: success/approved #15803D, warning/flagged #B45309,
  error #B91C1C, in-review #1D4ED8, neutral/pending #64748B.
- Typography: Inter (or system sans). Clear hierarchy, compact line heights.
- Components: 8px rounded cards with subtle shadows, pill-shaped status badges,
  compact tables with light zebra rows, filled-navy primary buttons, outline secondary buttons.
- Keep it calm and businesslike — no gradients or playful illustration.

APP SHELL (consistent on every screen except Login):
- Left sidebar: "DocExtract" logo at top; nav items Upload, Review Queue, Dashboard
  (active item highlighted in navy); at the bottom a user avatar with name and a role badge.
- Top bar: current page title + breadcrumb on the left; a role switcher (User / Staff / Admin)
  and a notifications bell on the right.

USE REALISTIC INDONESIAN DATA THROUGHOUT:
- Currency IDR, formatted with dots as thousands separators, e.g. "Rp 12.450.000".
- Vendors like "PT Sumber Makmur", "CV Mitra Teknik", "Toko Sentosa".
- Document IDs like DOC-001, DOC-002. Dates in YYYY-MM-DD format.

Generate these 4 screens with a single shared design system:

SCREEN 1 — LOGIN / ROLE SELECT
Split layout. Left panel: navy brand area with "DocExtract" and tagline
"Read, validate, and approve documents in seconds." Right panel: a centered white card
with Email and Password fields, a primary "Sign in" button, and a small segmented role
selector (User / Staff / Admin) labelled "Sign in as" for demo purposes. Minimal footer text.

SCREEN 2 — UPLOAD (User role)
Page title "Upload Documents". A large drag-and-drop dropzone reading
"Drag an invoice, purchase order, or receipt here — PDF or PNG", with a "Browse files" button
and a document-type selector (Auto-detect / Invoice / Purchase Order / Receipt).
Below it a "My Documents" table with columns: Doc ID, File name, Type, Uploaded, Status, Action.
Status uses pill badges: Extracted, Flagged, In Review, Approved, Rejected.
Show ~6 realistic rows mixing the three document types and all statuses. Action column has a
"View" link.

SCREEN 3 — REVIEW (Staff role) — THE MOST IMPORTANT SCREEN
A two-pane review workspace for the human-in-the-loop step.
- LEFT pane (~55% width): a document viewer showing a scanned invoice image with zoom and
  page-navigation controls and the doc ID shown above it.
- RIGHT pane (~45% width): a scrollable "Extracted Fields" panel.
  - Header row: Doc ID, a document-type badge, and an overall confidence indicator.
  - Editable fields: Vendor, Invoice Date, Due Date, Currency (IDR), Tax Amount, Total Amount.
    Each field is an editable input with a small per-field confidence dot
    (green = high, amber = low); low-confidence fields are subtly highlighted amber.
  - A "Line Items" editable table: Description, Qty, Unit Price, Amount.
  - A "Validation" panel listing flags with severity icons, for example:
      • RED error: "Line items (Rp 12.000.000) do not reconcile with Total (Rp 12.450.000)"
      • AMBER warning: "Due date is missing"
      • GREEN ok: "All required fields present"
- A sticky bottom action bar: "Reject" (outline red), "Save Corrections" (secondary),
  and "Approve & Export" (primary navy).

SCREEN 4 — DASHBOARD (Admin role)
Page title "Monitoring Dashboard".
- Top row of KPI cards: Total Documents, Pending Review, Approved Today, Flagged,
  and Field-Level Accuracy (%) — each with a small trend indicator.
- A charts row: a bar chart "Documents by Type" (Invoice / Purchase Order / Receipt),
  a line chart "Throughput (documents per day)", and a donut chart
  "Validation Issues by Rule".
- A "Cost–Benefit" summary card comparing Manual Entry vs Automated:
  hours saved and cost saved (show in IDR).
- A "Recent Activity" table: Doc ID, Type, Reviewer, Action (Approved / Rejected / Flagged),
  Timestamp. Show ~6 realistic rows.

Make all four screens visually consistent, production-quality, and uncluttered.
```

---

## After Stitch → handing to Claude Code

When you give the exported design to Claude Code, pair it with this instruction so it builds against your stack (from CLAUDE.md):

> Implement this Stitch design as the **React + Vite** frontend in `/frontend`. It is presentation
> only — all data comes from the FastAPI backend over HTTP; React never calls the model directly.
> Wire the Upload screen to `POST /extract`, render the Review screen from the returned pydantic
> JSON (fields + validation flags), and keep the role scaffold (user / staff / admin). Match the
> field names to the schemas in `schemas.py`.

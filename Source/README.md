# Project 4 — Intelligent Document Processing (Extraction)
## Dummy Data

### Contents
- `documents/` — 60 synthetic business documents as PDF:
  - 25 invoices, 20 purchase orders, 15 receipts.
- `ground_truth.csv` — the correct extracted fields for every document.
  Columns: `doc_id, doc_type, doc_number, vendor, buyer, doc_date, currency,
  line_item_count, subtotal, tax_amount, total_amount, line_items` (line_items is JSON).
  The printed values in each PDF exactly match this file.

### How to use
1. For each PDF, extract structured fields with a (multimodal) LLM into a schema (e.g. pydantic).
2. Apply validation rules (line items sum to subtotal; subtotal + tax = total).
3. Measure field-level accuracy against `ground_truth.csv`.
This starter set (60 docs) follows the same generator pattern and can be scaled to 200+ if needed.

Tax is PPN 11% on invoices and POs; receipts have no separate tax line. All data is fictional.

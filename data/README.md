# Data

The real dataset lives in [`../Source`](../Source): 60 sample PDFs under
`Source/documents/` (25 invoices, 20 purchase orders, 15 receipts) plus
`Source/ground_truth.csv` with the labelled fields.

This `data/` folder holds only runtime artifacts:
- `uploads/` — files written during a session. Git-ignored (only `.gitkeep` tracked).

## `ground_truth.csv` schema (the extraction contract)
Pydantic field names in `backend/app/schemas.py` mirror these columns so the
field-level accuracy evaluation lines up:

| column | notes |
|---|---|
| `doc_id` | e.g. `DOC-001` (eval key, not extracted) |
| `doc_type` | `invoice` \| `purchase_order` \| `receipt` |
| `doc_number` | e.g. `INV-2026-001`, `PO-2026-014` |
| `vendor` | seller / 'From' party |
| `buyer` | 'Bill To' party (absent on receipts) |
| `doc_date` | `YYYY-MM-DD` |
| `currency` | ISO code, defaults to `IDR` |
| `line_item_count` | number of rows |
| `subtotal` | sum of line totals, whole Rupiah |
| `tax_amount` | PPN 11% on invoices/POs; `0` on receipts |
| `total_amount` | `subtotal + tax_amount` |
| `line_items` | JSON array of `{description, qty, unit_price, line_total}` |

> Amounts are whole Rupiah; the printed `.` is a thousands separator
> (`Rp 240.000` = 240000), handled explicitly in the extraction prompt.

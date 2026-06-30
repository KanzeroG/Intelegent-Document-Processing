# Data

Holds the project's documents and labels.

## Layout
- `uploads/` — runtime upload artifacts written by the backend. Git-ignored
  (only `.gitkeep` is tracked). Don't commit real documents here.
- `ground_truth.csv` — *(add later)* the labelled fields used for the
  field-level accuracy evaluation (deliverable #5).

## Sample documents
Drop sample invoices / purchase orders / receipts (PDF or PNG) anywhere under
`data/` and upload them through the UI, or point the backend at them directly.
LapisAI provides ~200 synthetic documents at kickoff.

## `ground_truth.csv` schema (from the project brief)
Field names in the pydantic schemas mirror these columns so evaluation lines up:

| column | notes |
|---|---|
| `doc_id` | e.g. `DOC-001` |
| `doc_type` | `invoice` \| `purchase_order` \| `receipt` |
| `vendor` | seller / issuer name |
| `total_amount` | grand total, plain number |
| `invoice_date` | `YYYY-MM-DD` |
| `due_date` | `YYYY-MM-DD` |
| `line_items` | JSON array |
| `tax_amount` | plain number |
| `currency` | ISO code, defaults to `IDR` |

> Indonesian amounts print with dots as thousands separators (`12.450.000`).
> Both the extraction prompt and a defensive cleanup step convert these to plain
> integers — keep that in mind when preparing ground truth.

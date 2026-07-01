# Cost-Benefit Business Case — Intelligent Document Processing (Deliverable #6)

**Question:** Is automating invoice / PO / receipt data entry with a local
vision model cheaper than manual keying — and if so, by how much?

This case uses the same model as the live **ROI calculator** on the admin
Dashboard, so the numbers below can be reproduced and adjusted in the app.

## The manual baseline

Finance/ops staff currently key each document by hand. Cost per document:

```
manual_cost_per_doc = (manual_minutes / 60) * reviewer_rate
```

Default assumptions (editable in the dashboard):

| Assumption | Default | Basis |
|---|---|---|
| Volume | 1,000 docs / month | mid-size AP department |
| Manual time / doc | 6 min | header + line items, typical invoice |
| Staff cost | Rp 50,000 / hour | Indonesian data-entry / junior finance |
| Review time / flagged doc | 3 min | only correcting AI output, not typing from scratch |
| One-time setup | Rp 15,000,000 | integration + rollout |

## The automated model

The vision model extracts every document; a human only **reviews the ones that
need it** (flagged by validation or low confidence). Cost per month:

```
automated_cost = (volume * needs_review_fraction) * (review_minutes / 60) * rate
```

Model inference runs **locally** (LM Studio on existing hardware), so per-document
compute cost is treated as ~0.

`needs_review_fraction` is not a guess — the Dashboard drives it from the **real
accuracy evaluation** (`data/eval_summary.json`): the share of documents that
were *not* fully correct against `ground_truth.csv`. If no eval has run, it
falls back to a conservative 20%.

## Worked example (defaults, assuming ~20% need review)

| | Manual | Automated |
|---|---|---|
| Docs touched by a human / month | 1,000 (all) | 200 (flagged only) |
| Minutes / doc | 6 | 3 |
| **Cost / month** | **Rp 5,000,000** | **Rp 500,000** |

- **Savings ≈ Rp 4,500,000 / month (~90%)**, ≈ Rp 54,000,000 / year.
- **Payback** on the Rp 15,000,000 setup: **~3.3 months**.

Even at a pessimistic 50% review rate, automated cost is Rp 1,250,000/mo — still a
75% reduction.

## Beyond direct cost

- **Speed:** ~seconds/doc extraction + targeted review vs. minutes of full keying → faster close.
- **Accuracy & auditability:** validation rules catch arithmetic/format errors a human might miss; every field is traceable to the source document in the review screen.
- **Scalability:** cost grows only with the *review* fraction, not total volume — the automated line scales far better as volume rises.
- **Data privacy:** the model runs on-premise; sensitive Indonesian financial data never leaves the machine.

## Caveats

- Figures are **illustrative defaults** — tune them to the client's real volume, wages, and measured review rate.
- `needs_review_fraction` should come from a full 60-doc (or larger) evaluation run, not a small sample.
- Setup cost and staff rates vary by organization; the dashboard makes all of these adjustable so stakeholders can stress-test the case live.

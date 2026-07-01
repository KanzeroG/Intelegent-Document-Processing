"""Field-level accuracy evaluation vs. Source/ground_truth.csv (deliverable #5).

Runs documents through the real extraction pipeline and compares every field to
the labelled ground truth, reporting per-field accuracy so you can see exactly
where the model is strong or weak.

Run it yourself (LM Studio must be running with qwen/qwen3-vl-4b loaded):

    cd backend
    ./.venv/bin/python evaluate.py            # all 60 docs (~30 min on 16GB)
    ./.venv/bin/python evaluate.py --limit 5  # quick sample
    ./.venv/bin/python evaluate.py --ids DOC-001,DOC-026

Writes a per-document CSV and prints a summary table. Requires nothing beyond
the backend venv.
"""

from __future__ import annotations

import argparse
import csv
import json
import time
from pathlib import Path

from app.extraction import extract_document
from app.loaders import load_document_as_base64_png
from app.schemas import DocumentType

_ROOT = Path(__file__).resolve().parents[1]
_GT = _ROOT / "Source" / "ground_truth.csv"
_DOCS = _ROOT / "Source" / "documents"
_OUT = _ROOT / "data" / "eval_results.csv"

# Scalar fields compared for accuracy (line_items handled separately).
_STR_FIELDS = ["doc_number", "vendor", "buyer", "doc_date", "currency"]
_NUM_FIELDS = ["subtotal", "tax_amount", "total_amount", "line_item_count"]
_FIELDS = _STR_FIELDS + _NUM_FIELDS + ["line_items"]

_TYPE = {
    "invoice": DocumentType.INVOICE,
    "purchase_order": DocumentType.PURCHASE_ORDER,
    "receipt": DocumentType.RECEIPT,
}


def _norm_str(v) -> str:
    return str(v or "").strip().casefold()


def _num(v) -> int:
    """Coerce to int; treat missing as 0 (e.g. receipt tax)."""
    if v in (None, ""):
        return 0
    return int(float(v))


def _norm_items(items) -> list[tuple]:
    """Normalize a line-items list to comparable tuples."""
    out = []
    for it in items or []:
        out.append((
            _norm_str(it.get("description")),
            _num(it.get("qty")),
            _num(it.get("unit_price")),
            _num(it.get("line_total")),
        ))
    return out


def _compare(pred: dict, gt: dict) -> dict[str, bool]:
    """Return {field: correct?} for one document."""
    result: dict[str, bool] = {}
    for f in _STR_FIELDS:
        result[f] = _norm_str(pred.get(f)) == _norm_str(gt.get(f))
    for f in _NUM_FIELDS:
        result[f] = _num(pred.get(f)) == _num(gt.get(f))
    result["line_items"] = _norm_items(pred.get("line_items")) == _norm_items(
        json.loads(gt.get("line_items") or "[]")
    )
    return result


def main() -> None:
    ap = argparse.ArgumentParser(description="Evaluate extraction vs ground truth.")
    ap.add_argument("--limit", type=int, default=None, help="only the first N documents")
    ap.add_argument("--ids", type=str, default=None, help="comma-separated doc_ids to run")
    args = ap.parse_args()

    rows = list(csv.DictReader(_GT.open(encoding="utf-8")))
    if args.ids:
        wanted = {s.strip() for s in args.ids.split(",")}
        rows = [r for r in rows if r["doc_id"] in wanted]
    if args.limit:
        rows = rows[: args.limit]

    print(f"Evaluating {len(rows)} document(s)…\n")
    per_field_correct = {f: 0 for f in _FIELDS}
    per_doc_results = []
    docs_all_correct = 0
    t0 = time.time()

    for i, gt in enumerate(rows, 1):
        doc_id = gt["doc_id"]
        pdf = _DOCS / f"{doc_id}.pdf"
        if not pdf.exists():
            print(f"  {doc_id}: PDF missing, skipping")
            continue
        try:
            b64 = load_document_as_base64_png(pdf.read_bytes(), "application/pdf", pdf.name)
            t = time.time()
            doc = extract_document(b64, _TYPE[gt["doc_type"]])
            data = doc.model_dump(mode="json")
            data["line_item_count"] = doc.line_item_count
            cmp = _compare(data, gt)
        except Exception as exc:  # keep going on a single failure
            print(f"  {doc_id}: ERROR {str(exc)[:80]}")
            continue

        for f, ok in cmp.items():
            per_field_correct[f] += int(ok)
        n_ok = sum(cmp.values())
        docs_all_correct += int(n_ok == len(_FIELDS))
        per_doc_results.append({"doc_id": doc_id, "doc_type": gt["doc_type"], **cmp})
        print(f"  [{i}/{len(rows)}] {doc_id} ({gt['doc_type']}) "
              f"{n_ok}/{len(_FIELDS)} fields ok [{time.time() - t:.0f}s]")

    n = len(per_doc_results)
    if n == 0:
        print("No documents evaluated.")
        return

    # Write per-document detail.
    _OUT.parent.mkdir(parents=True, exist_ok=True)
    with _OUT.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=["doc_id", "doc_type", *_FIELDS])
        w.writeheader()
        w.writerows(per_doc_results)

    # Summary.
    print(f"\n{'='*44}\nField-level accuracy over {n} document(s):")
    for f in _FIELDS:
        acc = per_field_correct[f] / n * 100
        print(f"  {f:<16} {acc:6.1f}%  ({per_field_correct[f]}/{n})")
    micro = sum(per_field_correct.values()) / (n * len(_FIELDS)) * 100
    print(f"\n  {'OVERALL (micro)':<16} {micro:6.1f}%")
    print(f"  {'docs fully correct':<16} {docs_all_correct}/{n}")
    print(f"\nElapsed {time.time() - t0:.0f}s · detail written to {_OUT.relative_to(_ROOT)}")


if __name__ == "__main__":
    main()

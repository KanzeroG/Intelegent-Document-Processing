"""Field-level accuracy evaluation vs. Source/ground_truth.csv (deliverable #5).

Runs documents through the real extraction pipeline and compares every field to
the labelled ground truth, reporting per-field accuracy so you can see exactly
where the model is strong or weak. Shares its logic with the admin web endpoint
(see app/evaluation.py).

Run it yourself (LM Studio must be running with qwen/qwen3-vl-4b loaded):

    cd backend
    ./.venv/bin/python evaluate.py            # all 60 docs (~30 min on 16GB)
    ./.venv/bin/python evaluate.py --limit 5  # quick sample
    ./.venv/bin/python evaluate.py --ids DOC-001,DOC-026

Writes a per-document CSV and prints a summary table.
"""

from __future__ import annotations

import argparse
import csv
import time
from pathlib import Path

from app.evaluation import FIELDS, evaluate_rows, load_rows

_OUT = Path(__file__).resolve().parents[1] / "data" / "eval_results.csv"


def main() -> None:
    ap = argparse.ArgumentParser(description="Evaluate extraction vs ground truth.")
    ap.add_argument("--limit", type=int, default=None, help="only the first N documents")
    ap.add_argument("--ids", type=str, default=None, help="comma-separated doc_ids to run")
    args = ap.parse_args()

    rows = load_rows(args.ids.split(",") if args.ids else None, args.limit)
    print(f"Evaluating {len(rows)} document(s)…\n")

    t0 = time.time()
    last = {"t": time.time()}

    def progress(i: int, total: int, doc_id: str) -> None:
        now = time.time()
        print(f"  [{i}/{total}] {doc_id}  [{now - last['t']:.0f}s]")
        last["t"] = now

    summary, per_doc = evaluate_rows(rows, on_progress=progress)
    if not per_doc:
        print("No documents evaluated.")
        return

    _OUT.parent.mkdir(parents=True, exist_ok=True)
    with _OUT.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=["doc_id", "doc_type", *FIELDS])
        w.writeheader()
        w.writerows(per_doc)

    print(f"\n{'='*46}\nField-level accuracy over {summary['n']} document(s):")
    for f in FIELDS:
        info = summary["fields"][f]
        if info["accuracy"] is None:
            print(f"  {f:<16}    n/a  (0/0)")
        else:
            na = "" if info["total"] == summary["n"] else f"  (n/a for {summary['n'] - info['total']})"
            print(f"  {f:<16} {info['accuracy']:6.1f}%  ({info['correct']}/{info['total']}){na}")
    print(f"\n  {'OVERALL (micro)':<16} {summary['overall']:6.1f}%")
    print(f"  {'docs fully correct':<16} {summary['docs_fully_correct']}/{summary['n']}")
    print("\nNote: 'buyer' is N/A for receipts (not printed on the document).")
    print(f"Elapsed {time.time() - t0:.0f}s · detail written to {_OUT}")


if __name__ == "__main__":
    main()

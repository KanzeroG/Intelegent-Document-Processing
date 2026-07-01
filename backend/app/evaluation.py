"""Shared evaluation logic — used by both the CLI (evaluate.py) and the admin
web endpoint. Runs documents through extraction, compares every field to
Source/ground_truth.csv, and produces a per-field / per-type accuracy summary.

The web path runs this in a background thread (a full 60-doc sweep takes ~30
min) and exposes progress + the last summary; the summary is persisted to
data/eval_summary.json so it survives restarts.
"""

from __future__ import annotations

import csv
import json
import threading
import time
from pathlib import Path
from typing import Any, Callable

from .extraction import extract_document
from .loaders import load_document_as_base64_png
from .schemas import DocumentType

_ROOT = Path(__file__).resolve().parents[2]
_GT = _ROOT / "Source" / "ground_truth.csv"
_DOCS = _ROOT / "Source" / "documents"
_SUMMARY_PATH = _ROOT / "data" / "eval_summary.json"

STR_FIELDS = ["doc_number", "vendor", "buyer", "doc_date", "currency"]
NUM_FIELDS = ["subtotal", "tax_amount", "total_amount", "line_item_count"]
FIELDS = STR_FIELDS + NUM_FIELDS + ["line_items"]

_TYPE = {
    "invoice": DocumentType.INVOICE,
    "purchase_order": DocumentType.PURCHASE_ORDER,
    "receipt": DocumentType.RECEIPT,
}


def _norm_str(v: Any) -> str:
    return str(v or "").strip().casefold()


def _num(v: Any) -> int:
    if v in (None, ""):
        return 0
    return int(float(v))


def _norm_items(items: Any) -> list[tuple]:
    return [
        (_norm_str(it.get("description")), _num(it.get("qty")), _num(it.get("unit_price")), _num(it.get("line_total")))
        for it in (items or [])
    ]


def compare(pred: dict, gt: dict, doc_type: str) -> dict[str, bool | None]:
    """{field: correct?} for one doc. None = not applicable (e.g. receipt buyer)."""
    result: dict[str, bool | None] = {}
    for f in STR_FIELDS:
        if f == "buyer" and doc_type == "receipt":
            result[f] = None  # buyer is not printed on receipts
            continue
        result[f] = _norm_str(pred.get(f)) == _norm_str(gt.get(f))
    for f in NUM_FIELDS:
        result[f] = _num(pred.get(f)) == _num(gt.get(f))
    result["line_items"] = _norm_items(pred.get("line_items")) == _norm_items(
        json.loads(gt.get("line_items") or "[]")
    )
    return result


def load_rows(ids: list[str] | None = None, limit: int | None = None) -> list[dict]:
    rows = list(csv.DictReader(_GT.open(encoding="utf-8")))
    if ids:
        wanted = {s.strip() for s in ids}
        rows = [r for r in rows if r["doc_id"] in wanted]
    if limit:
        rows = rows[:limit]
    return rows


def evaluate_rows(
    rows: list[dict],
    on_progress: Callable[[int, int, str], None] | None = None,
) -> tuple[dict, list[dict]]:
    """Run + score the given ground-truth rows. Returns (summary, per_doc_rows)."""
    per_field_correct = {f: 0 for f in FIELDS}
    per_field_total = {f: 0 for f in FIELDS}
    by_type: dict[str, dict[str, int]] = {}
    per_doc: list[dict] = []
    docs_all_correct = 0
    total = len(rows)

    for i, gt in enumerate(rows, 1):
        doc_id = gt["doc_id"]
        pdf = _DOCS / f"{doc_id}.pdf"
        if not pdf.exists():
            if on_progress:
                on_progress(i, total, doc_id)
            continue
        b64 = load_document_as_base64_png(pdf.read_bytes(), "application/pdf", pdf.name)
        doc = extract_document(b64, _TYPE[gt["doc_type"]])
        data = doc.model_dump(mode="json")
        data["line_item_count"] = doc.line_item_count
        cmp = compare(data, gt, gt["doc_type"])

        bt = by_type.setdefault(gt["doc_type"], {"correct": 0, "total": 0, "docs": 0})
        bt["docs"] += 1
        for f, ok in cmp.items():
            if ok is None:
                continue
            per_field_total[f] += 1
            per_field_correct[f] += int(ok)
            bt["total"] += 1
            bt["correct"] += int(ok)
        applicable = [v for v in cmp.values() if v is not None]
        if sum(1 for v in applicable if v) == len(applicable):
            docs_all_correct += 1
        per_doc.append({"doc_id": doc_id, "doc_type": gt["doc_type"],
                        **{f: ("n/a" if v is None else int(v)) for f, v in cmp.items()}})
        if on_progress:
            on_progress(i, total, doc_id)

    n = len(per_doc)
    total_cells = sum(per_field_total.values())
    summary = {
        "ran_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "n": n,
        "fields": {
            f: {
                "correct": per_field_correct[f],
                "total": per_field_total[f],
                "accuracy": round(per_field_correct[f] / per_field_total[f] * 100, 1) if per_field_total[f] else None,
            }
            for f in FIELDS
        },
        "by_type": {
            t: {**v, "accuracy": round(v["correct"] / v["total"] * 100, 1) if v["total"] else 0.0}
            for t, v in by_type.items()
        },
        "overall": round(sum(per_field_correct.values()) / total_cells * 100, 1) if total_cells else 0.0,
        "docs_fully_correct": docs_all_correct,
    }
    return summary, per_doc


# ---- Background run state (for the admin web endpoint) ----------------------

_state: dict[str, Any] = {"running": False, "done": 0, "total": 0, "error": None}
_lock = threading.Lock()


def _load_summary() -> dict | None:
    if _SUMMARY_PATH.exists():
        try:
            return json.loads(_SUMMARY_PATH.read_text())
        except ValueError:
            return None
    return None


def get_status() -> dict:
    with _lock:
        st = {k: _state[k] for k in ("running", "done", "total", "error")}
    st["summary"] = _load_summary()
    return st


def _worker(rows: list[dict]) -> None:
    def progress(i: int, _total: int, _doc_id: str) -> None:
        with _lock:
            _state["done"] = i

    try:
        summary, _ = evaluate_rows(rows, on_progress=progress)
        _SUMMARY_PATH.parent.mkdir(parents=True, exist_ok=True)
        _SUMMARY_PATH.write_text(json.dumps(summary, indent=2))
    except Exception as exc:  # noqa: BLE001 - surface any failure to the UI
        with _lock:
            _state["error"] = str(exc)[:200]
    finally:
        with _lock:
            _state["running"] = False


def start_run(ids: list[str] | None = None, limit: int | None = None) -> bool:
    """Kick off a background evaluation. Returns False if one is already running."""
    with _lock:
        if _state["running"]:
            return False
        rows = load_rows(ids, limit)
        _state.update(running=True, done=0, total=len(rows), error=None)
    threading.Thread(target=_worker, args=(rows,), daemon=True).start()
    return True

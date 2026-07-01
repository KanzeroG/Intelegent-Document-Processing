"""Export approved documents to JSON / CSV, plus a mock downstream API.

Deliverable #4: once a human approves an extraction, the clean structured data
is exported to CSV/JSON and handed to a mock API endpoint (standing in for a
real accounting/ERP system). These helpers operate on the stored record dict
(see db.py), whose `data` already matches the ground-truth field names.
"""

from __future__ import annotations

import csv
import io
import json
from typing import Any

# Column order mirrors Source/ground_truth.csv for a drop-in comparison.
_CSV_COLUMNS = [
    "doc_id", "doc_type", "doc_number", "vendor", "buyer", "doc_date",
    "currency", "line_item_count", "subtotal", "tax_amount", "total_amount",
    "line_items",
]


def _flat_row(rec: dict[str, Any]) -> dict[str, Any]:
    """Flatten a stored record into ground_truth-shaped columns."""
    data = rec.get("data") or {}
    line_items = data.get("line_items", [])
    return {
        "doc_id": rec.get("id"),
        "doc_type": rec.get("doc_type"),
        "doc_number": data.get("doc_number"),
        "vendor": data.get("vendor"),
        "buyer": data.get("buyer"),
        "doc_date": data.get("doc_date"),
        "currency": data.get("currency"),
        "line_item_count": data.get("line_item_count", len(line_items)),
        "subtotal": data.get("subtotal"),
        "tax_amount": data.get("tax_amount"),
        "total_amount": data.get("total_amount"),
        "line_items": json.dumps(line_items, ensure_ascii=False),
    }


def to_json(rec: dict[str, Any]) -> str:
    """Pretty JSON export of one approved record."""
    payload = {
        "doc_id": rec.get("id"),
        "doc_type": rec.get("doc_type"),
        "status": rec.get("status"),
        "confidence": rec.get("confidence"),
        **(rec.get("data") or {}),
    }
    return json.dumps(payload, indent=2, ensure_ascii=False)


def to_csv(rec: dict[str, Any]) -> str:
    """Single-row CSV export (header + row) using ground-truth columns."""
    return to_csv_many([rec])


def to_csv_many(records: list[dict[str, Any]]) -> str:
    """Multi-row CSV export (header + one row per record), ground-truth columns."""
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=_CSV_COLUMNS)
    writer.writeheader()
    for rec in records:
        writer.writerow(_flat_row(rec))
    return buf.getvalue()

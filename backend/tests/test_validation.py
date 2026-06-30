"""Tests for the business-rule validation layer.

Two kinds of checks:
  1. Every row of the real Source/ground_truth.csv must validate cleanly — the
     labelled data satisfies all business rules, so the rules must not
     false-positive on correct data.
  2. Each rule fires on a document with that specific error injected.

Run from the backend/ directory:
    ./.venv/bin/python -m pytest -q
"""

from __future__ import annotations

import csv
import json
from pathlib import Path

import pytest

from app.schemas import Document, DocumentType, LineItem
from app.validation import validate_document

# Source/ground_truth.csv lives two levels up from this file (repo_root/Source).
GROUND_TRUTH = Path(__file__).resolve().parents[2] / "Source" / "ground_truth.csv"


def _row_to_document(row: dict[str, str]) -> Document:
    """Build a Document from one ground_truth.csv row."""
    items = [
        LineItem(
            description=li.get("description", ""),
            qty=li.get("qty"),
            unit_price=li.get("unit_price"),
            line_total=li.get("line_total"),
        )
        for li in json.loads(row["line_items"])
    ]

    def as_int(value: str) -> int | None:
        value = (value or "").strip()
        return int(value) if value else None

    return Document(
        doc_type=DocumentType(row["doc_type"]),
        doc_number=row["doc_number"] or None,
        vendor=row["vendor"] or None,
        buyer=row["buyer"] or None,
        doc_date=row["doc_date"] or None,
        currency=row["currency"] or "IDR",
        subtotal=as_int(row["subtotal"]),
        tax_amount=as_int(row["tax_amount"]),
        total_amount=as_int(row["total_amount"]),
        line_items=items,
    )


def _load_ground_truth() -> list[dict[str, str]]:
    with GROUND_TRUTH.open(newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


# --- 1. Ground truth must be clean -------------------------------------------


def test_ground_truth_file_present() -> None:
    assert GROUND_TRUTH.exists(), f"missing dataset labels at {GROUND_TRUTH}"


@pytest.mark.parametrize("row", _load_ground_truth(), ids=lambda r: r["doc_id"])
def test_ground_truth_row_validates_clean(row: dict[str, str]) -> None:
    """No business-rule issue should fire on correctly-labelled data."""
    issues = validate_document(_row_to_document(row))
    assert issues == [], f"{row['doc_id']} flagged: {[i.message for i in issues]}"


# --- 2. Each rule fires on an injected error ---------------------------------


def _good_invoice(**overrides) -> Document:
    base = dict(
        doc_type=DocumentType.INVOICE,
        doc_number="INV-2026-001",
        vendor="PT Nusa Pangan",
        buyer="PT Nusantara Dynamics",
        doc_date="2026-04-08",
        currency="IDR",
        subtotal=240000,
        tax_amount=26400,
        total_amount=266400,
        line_items=[
            LineItem(description="Tisu Box", qty=4, unit_price=18000, line_total=72000),
            LineItem(description="Pulpen Box", qty=4, unit_price=42000, line_total=168000),
        ],
    )
    base.update(overrides)
    return Document(**base)


def _fields(issues, severity=None):
    return {i.field for i in issues if severity is None or i.severity == severity}


def test_clean_invoice_has_no_issues() -> None:
    assert validate_document(_good_invoice()) == []


def test_missing_required_vendor_is_error() -> None:
    issues = validate_document(_good_invoice(vendor=None))
    assert "vendor" in _fields(issues, "error")


def test_subtotal_plus_tax_not_total_is_error() -> None:
    issues = validate_document(_good_invoice(total_amount=999999))
    assert "total_amount" in _fields(issues, "error")


def test_line_items_sum_mismatch_is_warning() -> None:
    # Inflate subtotal/total so subtotal+tax still reconciles but line sum != subtotal.
    issues = validate_document(_good_invoice(subtotal=300000, total_amount=326400))
    assert "line_items" in _fields(issues, "warning")


def test_per_line_arithmetic_mismatch_is_warning() -> None:
    bad_line = LineItem(description="X", qty=2, unit_price=30000, line_total=99999)
    issues = validate_document(
        _good_invoice(line_items=[bad_line], subtotal=99999, total_amount=110999, tax_amount=11000)
    )
    assert any(f.startswith("line_items[0]") for f in _fields(issues, "warning"))


def test_bad_date_format_is_warning() -> None:
    issues = validate_document(_good_invoice(doc_date="08/04/2026"))
    assert "doc_date" in _fields(issues, "warning")


def test_impossible_calendar_date_is_warning() -> None:
    issues = validate_document(_good_invoice(doc_date="2026-13-40"))
    assert "doc_date" in _fields(issues, "warning")


def test_non_iso_currency_is_warning() -> None:
    issues = validate_document(_good_invoice(currency="Rupiah"))
    assert "currency" in _fields(issues, "warning")


def test_missing_doc_number_is_warning() -> None:
    issues = validate_document(_good_invoice(doc_number=None))
    assert "doc_number" in _fields(issues, "warning")


def test_wrong_ppn_rate_is_warning() -> None:
    # tax far from 11% of subtotal, but subtotal+tax still equals total.
    issues = validate_document(_good_invoice(tax_amount=50000, total_amount=290000))
    assert "tax_amount" in _fields(issues, "warning")


def test_receipt_with_tax_is_warning() -> None:
    issues = validate_document(
        _good_invoice(doc_type=DocumentType.RECEIPT, tax_amount=26400)
    )
    assert "tax_amount" in _fields(issues, "warning")


def test_confidence_hook_flags_low_scores() -> None:
    issues = validate_document(_good_invoice(), field_confidences={"vendor": 0.42})
    assert "vendor" in _fields(issues, "warning")


def test_confidence_hook_silent_when_omitted() -> None:
    assert validate_document(_good_invoice()) == []

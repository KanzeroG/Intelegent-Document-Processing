"""Business-rule validation.

Rules come straight from the dataset's documented invariants:
  1. Required fields are present (vendor, total_amount).
  2. Line items sum to the subtotal.
  3. subtotal + tax_amount == total_amount.
  4. Tax is PPN 11% on invoices and purchase orders; receipts have no tax line.

Plus format / arithmetic checks (PDF deliverable 2 explicitly lists "format
checks"):
  5. doc_date is a real date in YYYY-MM-DD form.
  6. currency is a 3-letter ISO-style code.
  7. doc_number is present (the README says it is always printed).
  8. Each line item's qty * unit_price reconciles with its line_total.

And an optional confidence-flagging hook (PDF work-step 4: "flag low-confidence
fields"). Extraction does not yet emit per-field confidence — Ollama's
`/api/chat` exposes no logprobs — so `validate_document` accepts an optional
`field_confidences` map and flags anything below threshold. This wires the
review UI's per-field confidence behaviour now and lets extraction populate it
later without touching call sites.

Severity convention:
  - "error"   -> a hard contradiction or missing required field; blocks export.
  - "warning" -> something a human should eyeball but may be legitimate.

Each issue is returned as a structured record so the review UI can render it.

Note on the Indonesian dot-thousands risk: a *uniform* misread (every amount
divided by 1000 because dots were read as decimals) still reconciles internally
AND survives the per-line arithmetic check (qty * unit_price scales the same
way), so it is NOT caught here. That class of error must be caught at extraction
time (the prompt) or by the human reviewer. The per-line check below only catches
*non-uniform* misreads (e.g. only line_total misread).
"""

from __future__ import annotations

import re
from datetime import datetime

from pydantic import BaseModel

from .schemas import Document, DocumentType

# Absolute tolerance (in Rupiah) when comparing sums — covers rounding.
_RECONCILE_TOLERANCE = 1
# PPN rate and the fractional tolerance allowed when checking it.
_PPN_RATE = 0.11
_PPN_TOLERANCE = 0.005  # ±0.5 percentage points

_REQUIRED_FIELDS = ("vendor", "total_amount")
_TAXED_TYPES = (DocumentType.INVOICE, DocumentType.PURCHASE_ORDER)

# Format-check patterns.
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_CURRENCY_RE = re.compile(r"^[A-Z]{3}$")

# Default cutoff for the confidence hook; below this a field is flagged.
_DEFAULT_LOW_CONFIDENCE = 0.60


class ValidationIssue(BaseModel):
    """One flagged problem with an extraction."""

    field: str
    severity: str  # "error" | "warning"
    message: str


def validate_document(
    doc: Document,
    field_confidences: dict[str, float] | None = None,
    *,
    low_confidence_threshold: float = _DEFAULT_LOW_CONFIDENCE,
) -> list[ValidationIssue]:
    """Run business rules over an extracted document; return any issues found.

    Args:
        doc: the extracted document to check.
        field_confidences: optional {field_name: 0.0-1.0} map. When provided,
            any field scoring below ``low_confidence_threshold`` is flagged for
            human review. Safe to omit until extraction emits confidences.
        low_confidence_threshold: cutoff for the confidence hook.
    """
    issues: list[ValidationIssue] = []

    def err(field: str, message: str) -> None:
        issues.append(ValidationIssue(field=field, severity="error", message=message))

    def warn(field: str, message: str) -> None:
        issues.append(ValidationIssue(field=field, severity="warning", message=message))

    # 1. Required fields.
    for field in _REQUIRED_FIELDS:
        if getattr(doc, field, None) in (None, ""):
            err(field, f"Required field '{field}' is missing.")

    # 2. Line items sum to subtotal. (A missing/extra line is plausible, so warn.)
    line_totals = [li.line_total for li in doc.line_items if li.line_total is not None]
    if line_totals and doc.subtotal is not None:
        summed = sum(line_totals)
        if abs(summed - doc.subtotal) > _RECONCILE_TOLERANCE:
            warn(
                "line_items",
                f"Line items sum to {summed}, which does not match subtotal {doc.subtotal}.",
            )

    # 3. subtotal + tax == total. A mismatch is a hard arithmetic contradiction -> error.
    if doc.subtotal is not None and doc.total_amount is not None:
        tax = doc.tax_amount or 0
        if abs((doc.subtotal + tax) - doc.total_amount) > _RECONCILE_TOLERANCE:
            err(
                "total_amount",
                f"subtotal ({doc.subtotal}) + tax ({tax}) = {doc.subtotal + tax}, "
                f"but total_amount is {doc.total_amount}.",
            )

    # 4. PPN 11% expectation by document type.
    if doc.doc_type in _TAXED_TYPES:
        if doc.subtotal is not None and doc.tax_amount is not None and doc.subtotal > 0:
            rate = doc.tax_amount / doc.subtotal
            if abs(rate - _PPN_RATE) > _PPN_TOLERANCE:
                warn(
                    "tax_amount",
                    f"Tax is {rate * 100:.1f}% of subtotal; expected PPN 11%.",
                )
    elif doc.doc_type is DocumentType.RECEIPT and doc.tax_amount:
        warn("tax_amount", "Receipts should not have a separate tax line.")

    # 5. Date format: must be a real calendar date in YYYY-MM-DD.
    if doc.doc_date is not None:
        if not _DATE_RE.match(doc.doc_date):
            warn("doc_date", f"Date '{doc.doc_date}' is not in YYYY-MM-DD format.")
        else:
            try:
                datetime.strptime(doc.doc_date, "%Y-%m-%d")
            except ValueError:
                warn("doc_date", f"Date '{doc.doc_date}' is not a valid calendar date.")

    # 6. Currency: expect a 3-letter ISO-style code (defaults to IDR).
    if doc.currency and not _CURRENCY_RE.match(doc.currency):
        warn("currency", f"Currency '{doc.currency}' is not a 3-letter code (e.g. IDR).")

    # 7. doc_number should always be printed on these documents.
    if doc.doc_number in (None, ""):
        warn("doc_number", "Document number is missing; it is normally printed near the top.")

    # 8. Per-line arithmetic: qty * unit_price should equal line_total.
    for idx, li in enumerate(doc.line_items):
        if li.qty is not None and li.unit_price is not None and li.line_total is not None:
            expected = round(li.qty * li.unit_price)
            if abs(expected - li.line_total) > _RECONCILE_TOLERANCE:
                warn(
                    f"line_items[{idx}].line_total",
                    f"'{li.description}': qty ({li.qty}) x unit_price ({li.unit_price}) "
                    f"= {expected}, but line_total is {li.line_total}.",
                )

    # 9. Confidence hook (optional): flag fields the extractor was unsure about.
    if field_confidences:
        for field, score in field_confidences.items():
            if score < low_confidence_threshold:
                warn(
                    field,
                    f"Low extraction confidence ({score:.0%}); please verify this field.",
                )

    return issues

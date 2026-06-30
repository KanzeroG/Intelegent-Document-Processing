"""Business-rule validation.

Rules come straight from the dataset's documented invariants:
  1. Required fields are present (vendor, total_amount).
  2. Line items sum to the subtotal.
  3. subtotal + tax_amount == total_amount.
  4. Tax is PPN 11% on invoices and purchase orders; receipts have no tax line.

Each issue is returned as a structured record so the review UI can render it and
the human reviewer can act on it. Note: a *uniform* misread (e.g. every amount
divided by 1000 because Indonesian dot-thousands were read as decimals) still
reconciles internally and will NOT be flagged here — that class of error must be
caught at extraction time (the prompt) or by the human reviewer.
"""

from __future__ import annotations

from pydantic import BaseModel

from .schemas import Document, DocumentType

# Absolute tolerance (in Rupiah) when comparing sums — covers rounding.
_RECONCILE_TOLERANCE = 1
# PPN rate and the fractional tolerance allowed when checking it.
_PPN_RATE = 0.11
_PPN_TOLERANCE = 0.005  # ±0.5 percentage points

_REQUIRED_FIELDS = ("vendor", "total_amount")
_TAXED_TYPES = (DocumentType.INVOICE, DocumentType.PURCHASE_ORDER)


class ValidationIssue(BaseModel):
    """One flagged problem with an extraction."""

    field: str
    severity: str  # "error" | "warning"
    message: str


def validate_document(doc: Document) -> list[ValidationIssue]:
    """Run business rules over an extracted document; return any issues found."""
    issues: list[ValidationIssue] = []

    def err(field: str, message: str) -> None:
        issues.append(ValidationIssue(field=field, severity="error", message=message))

    def warn(field: str, message: str) -> None:
        issues.append(ValidationIssue(field=field, severity="warning", message=message))

    # 1. Required fields.
    for field in _REQUIRED_FIELDS:
        if getattr(doc, field, None) in (None, ""):
            err(field, f"Required field '{field}' is missing.")

    # 2. Line items sum to subtotal.
    line_totals = [li.line_total for li in doc.line_items if li.line_total is not None]
    if line_totals and doc.subtotal is not None:
        summed = sum(line_totals)
        if abs(summed - doc.subtotal) > _RECONCILE_TOLERANCE:
            warn(
                "line_items",
                f"Line items sum to {summed}, which does not match subtotal {doc.subtotal}.",
            )

    # 3. subtotal + tax == total.
    if doc.subtotal is not None and doc.total_amount is not None:
        tax = doc.tax_amount or 0
        if abs((doc.subtotal + tax) - doc.total_amount) > _RECONCILE_TOLERANCE:
            warn(
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

    return issues

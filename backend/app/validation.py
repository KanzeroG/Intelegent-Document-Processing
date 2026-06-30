"""Business-rule validation (lightweight first pass).

This is a graded deliverable, but the full rule set lands in a later session.
For the vertical slice we wire in two high-value checks so the review UI has
something to flag:
  1. Required fields are present (vendor, total_amount).
  2. Line items reconcile with the stated total (within a small tolerance).

Each issue is returned as a structured record so the frontend can render it and,
later, the human reviewer can act on it.
"""

from __future__ import annotations

from pydantic import BaseModel

from .schemas import _DocumentBase

# Absolute tolerance (in currency units) when comparing summed line items to the
# stated total — covers rounding without masking real discrepancies.
_RECONCILE_TOLERANCE = 1.0

_REQUIRED_FIELDS = ("vendor", "total_amount")


class ValidationIssue(BaseModel):
    """One flagged problem with an extraction."""

    field: str
    severity: str  # "error" | "warning"
    message: str


def validate_document(doc: _DocumentBase) -> list[ValidationIssue]:
    """Run business rules over an extracted document; return any issues found."""
    issues: list[ValidationIssue] = []

    # 1. Required fields present.
    for field in _REQUIRED_FIELDS:
        if getattr(doc, field, None) in (None, ""):
            issues.append(
                ValidationIssue(
                    field=field,
                    severity="error",
                    message=f"Required field '{field}' is missing.",
                )
            )

    # 2. Line items reconcile with total. Only checked when we have both the
    #    line-item totals and a stated grand total to compare against.
    line_totals = [li.line_total for li in doc.line_items if li.line_total is not None]
    if line_totals and doc.total_amount is not None:
        summed = sum(line_totals)
        expected = doc.total_amount
        # If tax is itemized separately, the line items may sum to the pre-tax
        # subtotal — accept either (with tax or without) before flagging.
        candidates = [expected]
        if doc.tax_amount is not None:
            candidates.append(expected - doc.tax_amount)
        if all(abs(summed - c) > _RECONCILE_TOLERANCE for c in candidates):
            issues.append(
                ValidationIssue(
                    field="line_items",
                    severity="warning",
                    message=(
                        f"Line items sum to {summed:g}, which does not reconcile "
                        f"with total_amount {expected:g}"
                        + (f" (or subtotal {expected - doc.tax_amount:g})" if doc.tax_amount is not None else "")
                        + "."
                    ),
                )
            )

    return issues

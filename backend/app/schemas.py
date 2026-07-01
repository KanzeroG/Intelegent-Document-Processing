"""Pydantic schemas — the extraction *contract*.

These models define the exact shape the vision model must return. We feed each
model's JSON schema into the extraction prompt, then validate the model's reply
against it.

Field names mirror the columns in the project's `ground_truth.csv` so the
field-level accuracy evaluation lines up without any renaming:

    doc_id, doc_type, doc_number, vendor, buyer, doc_date, currency,
    line_item_count, subtotal, tax_amount, total_amount, line_items

(`doc_id` is the evaluation key supplied by the dataset, not something we
extract, so it is not part of the extraction schema.)

Document conventions (from the dataset README):
- Tax is PPN 11% on invoices and purchase orders; receipts have no tax line.
- Amounts are whole Indonesian Rupiah; the printed `.` is a thousands separator
  (`Rp 240.000` == 240000), never a decimal point.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class DocumentType(str, Enum):
    """The three document types in scope (matches `doc_type` in the ground truth)."""

    INVOICE = "invoice"
    PURCHASE_ORDER = "purchase_order"
    RECEIPT = "receipt"


class LineItem(BaseModel):
    """A single row in a document's itemized table.

    Keys (`qty`, `unit_price`, `line_total`) match the JSON stored in the
    ground-truth `line_items` column.
    """

    description: str = Field(..., description="Item or service description as printed.")
    qty: float | None = Field(None, description="Quantity ordered/purchased.")
    unit_price: int | None = Field(None, description="Price per unit, whole Rupiah integer (no dots, no 'Rp').")
    line_total: int | None = Field(None, description="qty * unit_price, whole Rupiah integer.")


class Document(BaseModel):
    """Unified extraction schema across invoice / purchase order / receipt.

    Receipts legitimately have no `buyer` and no `tax_amount` (no separate tax
    line), so those stay optional rather than being modeled as separate classes.
    All monetary fields are whole-Rupiah integers — `Rp 240.000` -> 240000.
    """

    doc_type: DocumentType = Field(..., description="invoice | purchase_order | receipt.")
    doc_number: str | None = Field(None, description="Document identifier, e.g. INV-2026-001 / PO-... .")
    vendor: str | None = Field(None, description="Seller / issuer name (the 'From' party).")
    buyer: str | None = Field(None, description="Buyer / 'Bill To' party; usually absent on receipts.")
    doc_date: str | None = Field(None, description="Document date normalized to YYYY-MM-DD.")
    currency: str = Field("IDR", description="ISO currency code; defaults to IDR.")
    subtotal: int | None = Field(None, description="Sum of line totals before tax, whole Rupiah.")
    tax_amount: int | None = Field(None, description="Tax/PPN amount, whole Rupiah; null/0 on receipts.")
    total_amount: int | None = Field(None, description="Grand total (subtotal + tax), whole Rupiah.")
    line_items: list[LineItem] = Field(default_factory=list, description="Itemized rows.")

    @property
    def line_item_count(self) -> int:
        """Derived count, exposed for parity with the ground-truth column."""
        return len(self.line_items)


# Header fields expected per document type (receipts have no buyer / tax line).
# Used to score confidence and flag missing information.
_EXPECTED_FIELDS: dict[DocumentType, tuple[str, ...]] = {
    DocumentType.INVOICE: ("doc_number", "vendor", "buyer", "doc_date", "subtotal", "tax_amount", "total_amount"),
    DocumentType.PURCHASE_ORDER: ("doc_number", "vendor", "buyer", "doc_date", "subtotal", "tax_amount", "total_amount"),
    DocumentType.RECEIPT: ("doc_number", "vendor", "doc_date", "subtotal", "total_amount"),
}


def missing_fields(doc: Document) -> list[str]:
    """Expected header fields (for this doc type) that came back empty."""
    return [f for f in _EXPECTED_FIELDS[doc.doc_type] if getattr(doc, f, None) in (None, "")]

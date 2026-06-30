"""Pydantic schemas — the extraction *contract*.

These models define the exact shape the vision model must return. We feed each
model's JSON schema into the extraction prompt, then validate the model's reply
against it. Field names deliberately mirror the columns in the project's
`ground_truth.csv` (vendor, invoice_date, due_date, total_amount, tax_amount,
currency, line_items) so the later field-level accuracy evaluation lines up
without any renaming.
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

    `line_total` is what the row actually shows; we keep qty/unit_price too so
    validation can later check that qty * unit_price reconciles with line_total.
    """

    description: str = Field(..., description="Item or service description as printed.")
    quantity: float | None = Field(None, description="Units ordered/purchased.")
    unit_price: float | None = Field(None, description="Price per unit, plain number (no thousands separators).")
    line_total: float | None = Field(None, description="Total for this line, plain number.")


class _DocumentBase(BaseModel):
    """Fields shared across every document type.

    All monetary fields are plain numbers in the document's currency — e.g. the
    Indonesian invoice amount `12.450.000` must come back as `12450000`, never
    `12.45`. Dates normalize to ISO `YYYY-MM-DD`.
    """

    vendor: str | None = Field(None, description="Seller / issuer name.")
    invoice_date: str | None = Field(None, description="Primary document date, normalized to YYYY-MM-DD.")
    due_date: str | None = Field(None, description="Payment due date if present, YYYY-MM-DD.")
    currency: str = Field("IDR", description="ISO currency code; defaults to IDR.")
    tax_amount: float | None = Field(None, description="Tax/VAT/PPN amount, plain number.")
    total_amount: float | None = Field(None, description="Grand total, plain number.")
    line_items: list[LineItem] = Field(default_factory=list, description="Itemized rows.")


class Invoice(_DocumentBase):
    """A sales/purchase invoice."""

    invoice_number: str | None = Field(None, description="Invoice identifier if shown.")


class PurchaseOrder(_DocumentBase):
    """A purchase order issued to a vendor."""

    po_number: str | None = Field(None, description="Purchase-order identifier if shown.")


class Receipt(_DocumentBase):
    """A point-of-sale receipt."""

    receipt_number: str | None = Field(None, description="Receipt identifier if shown.")


class UnifiedDocument(_DocumentBase):
    """A master document schema that asks the model to classify the document type."""
    
    doc_type: DocumentType = Field(..., description="The classified type of the document: invoice, purchase_order, or receipt.")
    invoice_number: str | None = Field(None, description="Invoice identifier if shown (only if invoice).")
    po_number: str | None = Field(None, description="Purchase-order identifier if shown (only if purchase_order).")
    receipt_number: str | None = Field(None, description="Receipt identifier if shown (only if receipt).")


# We no longer need SCHEMA_BY_TYPE for the new unified approach, but we keep it for backward compatibility or direct use if needed.
SCHEMA_BY_TYPE: dict[DocumentType, type[_DocumentBase]] = {
    DocumentType.INVOICE: Invoice,
    DocumentType.PURCHASE_ORDER: PurchaseOrder,
    DocumentType.RECEIPT: Receipt,
}

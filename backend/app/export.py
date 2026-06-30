"""Export layer — CSV/JSON + mock API endpoint.

STUB for the vertical slice. The approved-document export (deliverable #4) is
built out in a later session. Signatures are defined here so the rest of the app
can import against a stable interface.
"""

from __future__ import annotations

from .schemas import Document


def to_json(doc: Document) -> str:
    """Serialize an approved document to JSON. (Stub — minimal pass-through.)"""
    return doc.model_dump_json(indent=2)


def to_csv_row(doc: Document) -> dict[str, object]:
    """Flatten a document to a single CSV row keyed by ground_truth columns.

    TODO(next session): write the full CSV with line_items serialized as JSON,
    and add the mock API POST endpoint that downstream systems would consume.
    """
    raise NotImplementedError("CSV export is implemented in a later session.")

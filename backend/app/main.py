"""FastAPI app + routes.

  GET  /health                 -> liveness (does not probe the model)
  POST /extract                -> upload a document, extract, persist, return record
  GET  /documents              -> list saved records (cached extractions)
  GET  /documents/{id}         -> one record
  GET  /documents/{id}/file    -> the original uploaded file (for preview)
  PATCH /documents/{id}        -> save corrections / change status (re-validates)

Extractions are cached in SQLite (see db.py) so re-opening the app doesn't
re-run the vision model. Model access goes to the local LM Studio server
(see extraction.py). React (Vite) is the only client — it never touches the
model directly.
"""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

from . import db
from .auth import Role, get_current_role
from .extraction import ExtractionError, extract_document
from .loaders import load_document_as_base64_png
from .schemas import Document, DocumentType, missing_fields
from .validation import ValidationIssue, validate_document

app = FastAPI(title="Intelligent Document Processing", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    db.init_db()


# --- scoring helpers ---------------------------------------------------------

def _status_from_issues(issues: list[ValidationIssue]) -> str:
    if any(i.severity == "error" for i in issues):
        return "flagged"
    if any(i.severity == "warning" for i in issues):
        return "in_review"
    return "extracted"


def _confidence(doc: Document, issues: list[ValidationIssue]) -> int:
    """Display heuristic: penalize validation issues and missing expected fields."""
    penalty = sum(12 if i.severity == "error" else 4 for i in issues)
    penalty += len(missing_fields(doc)) * 8
    return max(50, 99 - penalty)


def _record(doc: Document, issues: list[ValidationIssue]) -> dict:
    """Assemble a persistable/serializable record from a validated document."""
    data = doc.model_dump(mode="json")
    data["line_item_count"] = doc.line_item_count
    return {
        "doc_number": doc.doc_number,
        "doc_type": doc.doc_type.value,
        "status": _status_from_issues(issues),
        "confidence": _confidence(doc, issues),
        "data": data,
        "issues": [i.model_dump() for i in issues],
    }


# --- routes ------------------------------------------------------------------

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/extract")
async def extract(
    file: UploadFile = File(...),
    doc_type: DocumentType = Form(DocumentType.INVOICE),
    role: Role = Depends(get_current_role),
) -> dict:
    """Load an uploaded document, extract + validate, persist, and return the record."""
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        image_b64 = load_document_as_base64_png(raw, file.content_type, file.filename)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not read document: {exc}") from exc

    try:
        document = extract_document(image_b64, doc_type)
    except ExtractionError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    issues = validate_document(document)
    rec = _record(document, issues)
    rec["id"] = uuid.uuid4().hex
    rec["filename"] = file.filename
    rec["mime"] = file.content_type or "application/octet-stream"
    rec["uploaded_at"] = date.today().isoformat()

    db.insert_document(rec, raw)  # cache the extraction + original file
    return {k: v for k, v in rec.items() if k != "file"}


@app.get("/documents")
def list_documents() -> list[dict]:
    return db.list_documents()


@app.get("/documents/{doc_id}")
def get_document(doc_id: str) -> dict:
    rec = db.get_document(doc_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Document not found.")
    return rec


@app.get("/documents/{doc_id}/file")
def get_document_file(doc_id: str) -> Response:
    got = db.get_file(doc_id)
    if not got:
        raise HTTPException(status_code=404, detail="File not found.")
    data, mime, filename = got
    return Response(content=data, media_type=mime, headers={
        "Content-Disposition": f'inline; filename="{filename}"',
    })


class PatchBody(BaseModel):
    """Fields a reviewer can change: corrected data and/or a new status."""

    data: dict | None = None
    status: str | None = None


@app.patch("/documents/{doc_id}")
def patch_document(doc_id: str, body: PatchBody) -> dict:
    existing = db.get_document(doc_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Document not found.")

    # If corrected data was supplied, re-validate it so issues/confidence/status
    # reflect the human's edits.
    if body.data is not None:
        try:
            document = Document.model_validate(body.data)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=f"Invalid document data: {exc}") from exc
        issues = validate_document(document)
        rec = _record(document, issues)
        # An explicit status (e.g. approved/rejected) overrides the derived one.
        status = body.status or rec["status"]
        db.update_document(
            doc_id, data=rec["data"], issues=rec["issues"],
            status=status, confidence=rec["confidence"],
        )
    elif body.status is not None:
        db.update_document(doc_id, status=body.status)

    return db.get_document(doc_id)  # type: ignore[return-value]

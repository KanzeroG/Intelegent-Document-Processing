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

from . import db, evaluation, export, rag
from .auth import AuthUser, Role, authenticate, create_token, get_current_role, get_current_user
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


# Token-authenticated `user` callers only see their own documents; staff/admin
# (and tokenless callers, e.g. plain <a href> downloads) see everything.
def _is_scoped_user(user: AuthUser) -> bool:
    return user.email is not None and user.role == Role.USER


def _get_visible_document(doc_id: str, user: AuthUser) -> dict:
    """Fetch a record, hiding other uploaders' docs from `user`-role callers.
    404 (not 403) so document ids don't leak existence."""
    rec = db.get_document(doc_id)
    if not rec or (_is_scoped_user(user) and rec.get("uploaded_by") != user.email):
        raise HTTPException(status_code=404, detail="Document not found.")
    return rec


# --- routes ------------------------------------------------------------------

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


class LoginBody(BaseModel):
    email: str
    password: str


@app.post("/auth/login")
def auth_login(body: LoginBody) -> dict:
    """Check demo credentials and issue a signed session token."""
    user = authenticate(body.email, body.password)
    if not user:
        db.add_audit(actor=body.email.strip().lower(), role=None, action="login_failed",
                     detail="Invalid credentials.")
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    db.add_audit(actor=user.email, role=user.role.value, action="login", detail="Signed in.")
    return {"token": create_token(user), "role": user.role.value, "name": user.name, "email": user.email}


@app.get("/auth/me")
def auth_me(user: AuthUser = Depends(get_current_user)) -> dict:
    """Validate a persisted session (the SPA calls this after a page refresh)."""
    if user.email is None:
        raise HTTPException(status_code=401, detail="Not signed in.")
    return {"email": user.email, "role": user.role.value, "name": user.name}


@app.post("/extract")
async def extract(
    file: UploadFile = File(...),
    doc_type: DocumentType = Form(DocumentType.INVOICE),
    user: AuthUser = Depends(get_current_user),
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
    rec["uploaded_by"] = user.email  # None for tokenless (X-Role fallback) callers

    db.insert_document(rec, raw)  # cache the extraction + original file
    db.add_audit(
        actor=user.email, role=user.role.value, action="upload", doc_id=rec["id"],
        detail=f"Extracted '{file.filename}' as {doc_type.value} -> {rec['status']}.",
    )
    return {k: v for k, v in rec.items() if k != "file"}


@app.get("/documents")
def list_documents(user: AuthUser = Depends(get_current_user)) -> list[dict]:
    return db.list_documents(uploaded_by=user.email if _is_scoped_user(user) else None)


@app.get("/documents/{doc_id}")
def get_document(doc_id: str, user: AuthUser = Depends(get_current_user)) -> dict:
    return _get_visible_document(doc_id, user)


@app.get("/documents/{doc_id}/file")
def get_document_file(doc_id: str, user: AuthUser = Depends(get_current_user)) -> Response:
    _get_visible_document(doc_id, user)
    got = db.get_file(doc_id)
    if not got:
        raise HTTPException(status_code=404, detail="File not found.")
    data, mime, filename = got
    return Response(content=data, media_type=mime, headers={
        "Content-Disposition": f'inline; filename="{filename}"',
    })


@app.get("/documents/{doc_id}/export.json")
def export_json(doc_id: str, user: AuthUser = Depends(get_current_user)) -> Response:
    rec = _get_visible_document(doc_id, user)
    db.add_audit(actor=user.email, role=user.role.value, action="export",
                 doc_id=doc_id, detail="Exported JSON.")
    return Response(
        content=export.to_json(rec),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{doc_id}.json"'},
    )


@app.get("/documents/{doc_id}/export.csv")
def export_csv(doc_id: str, user: AuthUser = Depends(get_current_user)) -> Response:
    rec = _get_visible_document(doc_id, user)
    db.add_audit(actor=user.email, role=user.role.value, action="export",
                 doc_id=doc_id, detail="Exported CSV.")
    return Response(
        content=export.to_csv(rec),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{doc_id}.csv"'},
    )


def require_admin(role: Role = Depends(get_current_role)) -> Role:
    """Dependency: only the admin role may proceed (stubbed via X-Role header)."""
    if role != Role.ADMIN:
        raise HTTPException(status_code=403, detail="Admin role required.")
    return role


@app.post("/eval/run")
def eval_run(
    limit: int | None = None,
    user: AuthUser = Depends(get_current_user),
    _: Role = Depends(require_admin),
) -> dict:
    """Start a background accuracy evaluation (admin only). Returns immediately."""
    if not evaluation.start_run(limit=limit):
        raise HTTPException(status_code=409, detail="An evaluation is already running.")
    db.add_audit(actor=user.email, role=user.role.value, action="eval_run",
                 detail=f"Accuracy evaluation started (limit={limit or 'all'}).")
    return {"started": True}


@app.get("/eval/status")
def eval_status() -> dict:
    """Progress + last saved summary of the accuracy evaluation."""
    return evaluation.get_status()


@app.get("/audit")
def audit_log(limit: int = 200, _: Role = Depends(require_admin)) -> list[dict]:
    """The audit trail (admin only): who did what, newest first."""
    return db.list_audit(limit=limit)


@app.get("/exports/documents.csv")
def export_all_csv(status: str = "approved", user: AuthUser = Depends(get_current_user)) -> Response:
    """Bulk CSV of documents, filtered by status (default: approved). Use
    status=all to export everything. One row per doc, ground_truth columns."""
    records = db.list_documents()
    if status != "all":
        records = [r for r in records if r.get("status") == status]
    db.add_audit(actor=user.email, role=user.role.value, action="export",
                 detail=f"Bulk CSV export (status={status}, {len(records)} docs).")
    filename = f"documents_{status}.csv"
    return Response(
        content=export.to_csv_many(records),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/mock-api/ingest")
def mock_ingest(payload: dict) -> dict:
    """Mock downstream system (e.g. an ERP). Accepts an approved document and
    acknowledges receipt — stands in for a real integration."""
    return {
        "received": True,
        "doc_id": payload.get("doc_id"),
        "message": f"Document {payload.get('doc_number') or payload.get('doc_id')} accepted by downstream system.",
    }


class PatchBody(BaseModel):
    """Fields a reviewer can change: corrected data and/or a new status."""

    data: dict | None = None
    status: str | None = None


@app.patch("/documents/{doc_id}")
def patch_document(doc_id: str, body: PatchBody, user: AuthUser = Depends(get_current_user)) -> dict:
    # Review is a staff/admin responsibility. Only token-authenticated `user`
    # callers are rejected — tokenless callers keep the original open behavior.
    if _is_scoped_user(user):
        raise HTTPException(status_code=403, detail="Reviewer (staff/admin) role required.")
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

    # Audit trail: name the review action the way the UI does.
    old_status = existing.get("status")
    if body.status == "approved":
        action, detail = "approve", f"Approved (was {old_status}); exported to downstream system."
    elif body.status == "rejected":
        action, detail = "reject", f"Rejected (was {old_status})."
    elif body.status is not None:
        action, detail = "status_change", f"Status: {old_status} -> {body.status}."
    else:
        action, detail = "update", "Corrections saved; validation re-run."
    db.add_audit(actor=user.email, role=user.role.value, action=action,
                 doc_id=doc_id, detail=detail)

    return db.get_document(doc_id)  # type: ignore[return-value]


# --- RAG chat (bonus) ---------------------------------------------------------

class ChatRequest(BaseModel):
    question: str
    doc_id: str | None = None


class ChatCitation(BaseModel):
    doc_id: str
    doc_number: str | None = None


class ChatResponse(BaseModel):
    answer: str
    citations: list[ChatCitation]


@app.post("/chat")
def chat(body: ChatRequest, user: AuthUser = Depends(get_current_user)) -> ChatResponse:
    """Answer a question grounded in the caller's extracted documents.

    With doc_id: that document's full JSON is the context. Without: the top
    embedding matches across all visible documents are. `user`-role callers are
    scoped to their own uploads, same as GET /documents.
    """
    question = body.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question is empty.")

    visible = db.list_documents(uploaded_by=user.email if _is_scoped_user(user) else None)
    target = None
    if body.doc_id:
        target = next((r for r in visible if r["id"] == body.doc_id), None)
        if target is None:
            raise HTTPException(status_code=404, detail="Document not found.")

    try:
        answer, citations = rag.answer_question(question, visible, target)
    except rag.ChatError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return ChatResponse(
        answer=answer,
        citations=[ChatCitation(**c) for c in citations],
    )

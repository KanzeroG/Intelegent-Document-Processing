"""FastAPI app + routes.

Exposes the vertical slice:
  GET  /health   -> liveness + whether LM Studio is reachable
  POST /extract  -> upload a document, get back validated structured JSON

React (Vite) is the only client; it never touches the model directly — all
model access goes through this backend.
"""

from __future__ import annotations

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .auth import Role, get_current_role
from .extraction import ExtractionError, extract_document
from .loaders import load_document_as_base64_png
from .schemas import DocumentType
from .validation import ValidationIssue, validate_document

app = FastAPI(title="Intelligent Document Processing", version="0.1.0")

# Vite dev server origins. Tighten / make configurable before any deployment.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ExtractResponse(BaseModel):
    """What /extract returns to the frontend."""

    doc_type: DocumentType
    data: dict  # the validated document, as a plain dict
    issues: list[ValidationIssue]


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness check. (Model reachability is surfaced lazily by /extract.)"""
    return {"status": "ok"}


@app.post("/extract", response_model=ExtractResponse)
async def extract(
    file: UploadFile = File(...),
    doc_type: DocumentType = Form(DocumentType.INVOICE),
    role: Role = Depends(get_current_role),
) -> ExtractResponse:
    """Load an uploaded document, extract structured fields, validate, return.

    `role` is resolved from the X-Role header (stubbed auth) — wired in now so
    the endpoint is ready for role-based behavior, though all roles may extract
    in this slice.
    """
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        image_b64 = load_document_as_base64_png(raw, file.content_type, file.filename)
    except Exception as exc:  # malformed PDF/image
        raise HTTPException(status_code=422, detail=f"Could not read document: {exc}") from exc

    try:
        document = extract_document(image_b64, doc_type)
    except ExtractionError as exc:
        # 502: the failure is upstream (the local model), not the client's request.
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    issues = validate_document(document)
    data = document.model_dump(mode="json")
    data["line_item_count"] = document.line_item_count  # parity with ground_truth column
    return ExtractResponse(doc_type=doc_type, data=data, issues=issues)

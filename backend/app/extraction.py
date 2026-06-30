"""Extraction: send a document image to the local vision model, get structured JSON.

Flow:
  base64 image  ->  prompt embedding the pydantic JSON schema  ->  Ollama
  ->  strip markdown fences  ->  model_validate_json()

The model is served locally by **Ollama** (`qwen2.5vl:3b`, a vision model). We
call Ollama's native `/api/chat` endpoint rather than the OpenAI-compatible
shim because we must set `num_ctx`: a rasterized document image is ~3-4k tokens
and overflows Ollama's default 4096-token context, which otherwise 400s.

Indonesian number gotcha (the central accuracy risk): amounts print as
`Rp 240.000`, where `.` is a *thousands separator*. Vision models love to read
this as the decimal `240`, and because the mistake is consistent across
subtotal/tax/total the figures still reconcile internally — so validation can't
catch it. The only effective fix is the prompt, so we instruct the model
explicitly and give a worked example.
"""

from __future__ import annotations

import json
import re

import httpx  # bundled via the openai dependency

from .schemas import Document, DocumentType

# --- Ollama connection (local) -----------------------------------------------
OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL_NAME = "qwen2.5vl:3b"
NUM_CTX = 16384  # must exceed image (~4-5k tokens at zoom 3) + schema prompt + reply
REQUEST_TIMEOUT = 300.0  # seconds; cold model load + inference can be slow on 16GB


class ExtractionError(RuntimeError):
    """Raised when extraction fails (model unreachable, or unparseable output)."""


def _build_prompt(doc_type: DocumentType) -> str:
    """Compose the instruction text, embedding the target JSON schema."""
    schema = json.dumps(Document.model_json_schema(), indent=2)
    return (
        "You are a precise document-extraction engine. Read the attached "
        f"{doc_type.value} image and extract its fields.\n\n"
        "Return ONLY a single JSON object conforming to this JSON schema — no "
        "markdown, no code fences, no commentary:\n\n"
        f"{schema}\n\n"
        "CRITICAL — Indonesian Rupiah amounts:\n"
        "- The '.' character is a THOUSANDS SEPARATOR, never a decimal point.\n"
        "- 'Rp 240.000' means 240000. 'Rp 26.400' means 26400. "
        "'Rp 1.250.000' means 1250000.\n"
        "- Output every money value as a whole integer with the dots removed. "
        "NEVER output a decimal like 240.0 or 266.4.\n\n"
        "Other rules:\n"
        f"- Set doc_type to \"{doc_type.value}\".\n"
        "- doc_number = the document identifier printed near the top, usually "
        "after 'No:' / 'No.' (e.g. INV-2026-001, PO-2026-014). Always capture it.\n"
        "- vendor = the 'From' / issuer party. buyer = the 'Bill To' party "
        "(null on receipts).\n"
        "- subtotal = sum of line totals before tax; tax_amount = PPN if shown "
        "(null on receipts); total_amount = grand total.\n"
        "- For each line item: qty is the count, unit_price is the per-unit "
        "price, line_total = qty * unit_price (all integers).\n"
        "- Dates normalize to YYYY-MM-DD. Currency defaults to IDR.\n"
        "- Use null for any field not present in the document.\n"
    )


_FENCE_RE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.IGNORECASE)


def _strip_fences(text: str) -> str:
    """Remove surrounding markdown code fences local models often add."""
    return _FENCE_RE.sub("", text).strip()


def _extract_json_object(text: str) -> str:
    """Return the outermost {...} block, ignoring any prose around it."""
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end < start:
        return text
    return text[start : end + 1]


def extract_document(image_b64: str, doc_type: DocumentType) -> Document:
    """Run extraction for one document image and return a validated Document.

    Raises ExtractionError on connection failure or unparseable model output.
    """
    payload = {
        "model": MODEL_NAME,
        "stream": False,
        "options": {"temperature": 0, "num_ctx": NUM_CTX},
        "messages": [
            {
                "role": "user",
                "content": _build_prompt(doc_type),
                "images": [image_b64],
            }
        ],
    }

    try:
        resp = httpx.post(OLLAMA_URL, json=payload, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        raise ExtractionError(
            "Could not reach the local vision model. Is Ollama running with "
            f"'{MODEL_NAME}' pulled? ({exc})"
        ) from exc

    content = resp.json().get("message", {}).get("content", "")
    cleaned = _extract_json_object(_strip_fences(content))

    try:
        document = Document.model_validate_json(cleaned)
    except ValueError as exc:
        raise ExtractionError(
            f"Model returned output that did not match the Document schema. "
            f"Raw output:\n{content}"
        ) from exc

    # Trust the user's document-type selection over the model's guess.
    document.doc_type = doc_type
    return document

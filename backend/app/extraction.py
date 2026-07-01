"""Extraction: send a document image to the local vision model, get structured JSON.

Flow:
  base64 image  ->  prompt embedding the pydantic JSON schema  ->  LM Studio
  ->  strip markdown fences  ->  model_validate_json()

The model is served locally by **LM Studio** (`qwen/qwen3-vl-4b`, a vision
model) via its OpenAI-compatible endpoint at `http://127.0.0.1:1234/v1`. The
document image is passed as a base64 data-URI in an `image_url` content part.

Context length note: a rasterized document image is ~4-5k tokens, so the model
must be loaded in LM Studio with a context length of at least ~16k (set on the
model-load screen). The OpenAI-compatible API has no per-request context knob.

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

# --- LM Studio connection (local, OpenAI-compatible) -------------------------
LM_STUDIO_URL = "http://127.0.0.1:1234/v1/chat/completions"
MODEL_NAME = "qwen/qwen3-vl-4b"
REQUEST_TIMEOUT = 300.0  # seconds; inference on the 4B VL model can be slow on 16GB


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
        "- vendor = the 'From' / issuer party. buyer = the 'Bill To' / customer "
        "party — capture it whenever it is printed (invoices, POs, and receipts "
        "that show one); use null only if no buyer appears.\n"
        "- subtotal = sum of line totals before tax; tax_amount = PPN if shown "
        "(null on receipts); total_amount = grand total.\n"
        "- For each line item: qty is the count, unit_price is the per-unit "
        "price, line_total = qty * unit_price (all integers).\n"
        "- Dates: convert to YYYY-MM-DD. Indonesian/English month names count, "
        "e.g. '24 Feb 2026' -> 2026-02-24, '5 Agustus 2026' -> 2026-08-05.\n"
        "- Currency defaults to IDR.\n"
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


# Month names → number, covering English and Indonesian (incl. common
# abbreviations) so dates like "24 Feb 2026" or "24 Agu 2026" normalize.
_MONTHS = {
    "jan": 1, "januari": 1, "january": 1,
    "feb": 2, "februari": 2, "february": 2,
    "mar": 3, "maret": 3, "march": 3,
    "apr": 4, "april": 4,
    "may": 5, "mei": 5,
    "jun": 6, "juni": 6, "june": 6,
    "jul": 7, "juli": 7, "july": 7,
    "agu": 8, "agt": 8, "agustus": 8, "aug": 8, "august": 8,
    "sep": 9, "sept": 9, "september": 9,
    "okt": 10, "oktober": 10, "oct": 10, "october": 10,
    "nov": 11, "november": 11,
    "des": 12, "desember": 12, "dec": 12, "december": 12,
}

_ISO_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_DMY_NUM_RE = re.compile(r"^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$")
_DMY_TEXT_RE = re.compile(r"^(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})$")


def _normalize_date(value: str | None) -> str | None:
    """Best-effort convert a date string to ISO YYYY-MM-DD.

    Handles values the model sometimes leaves un-normalized: '24 Feb 2026',
    '24 Agu 2026', '24/02/2026', '24-02-2026'. Returns the original string if it
    can't be parsed (so validation still surfaces genuinely bad dates).
    """
    if not value:
        return value
    v = value.strip()
    if _ISO_RE.match(v):
        return v

    m = _DMY_TEXT_RE.match(v)
    if m:
        day, mon, year = m.group(1), m.group(2).lower(), m.group(3)
        month = _MONTHS.get(mon) or _MONTHS.get(mon[:3])
        if month:
            return f"{year}-{month:02d}-{int(day):02d}"

    m = _DMY_NUM_RE.match(v)
    if m:
        day, month, year = int(m.group(1)), int(m.group(2)), m.group(3)
        if 1 <= month <= 12 and 1 <= day <= 31:
            return f"{year}-{month:02d}-{day:02d}"

    return v


def extract_document(image_b64: str, doc_type: DocumentType) -> Document:
    """Run extraction for one document image and return a validated Document.

    Raises ExtractionError on connection failure or unparseable model output.
    """
    payload = {
        "model": MODEL_NAME,
        "temperature": 0,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": _build_prompt(doc_type)},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/png;base64,{image_b64}"},
                    },
                ],
            }
        ],
    }

    try:
        resp = httpx.post(LM_STUDIO_URL, json=payload, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        raise ExtractionError(
            "Could not reach the local vision model. Is LM Studio running with "
            f"'{MODEL_NAME}' loaded and its server started at {LM_STUDIO_URL}? ({exc})"
        ) from exc

    content = resp.json()["choices"][0]["message"]["content"] or ""
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
    # Deterministically normalize the date (model sometimes leaves it as
    # "24 Feb 2026") so it matches the YYYY-MM-DD contract used for export/eval.
    document.doc_date = _normalize_date(document.doc_date)
    return document

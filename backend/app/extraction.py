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
import os
import re
from dataclasses import dataclass

import httpx  # bundled via the openai dependency

from .schemas import Document, DocumentType

# --- model profiles ----------------------------------------------------------
# A profile is one servable vision model: where it lives, what the server calls
# it, and how it has to be driven. Both LM Studio and Ollama speak the same
# OpenAI-compatible chat-completions API, so nothing below the transport differs
# — which is why one client covers both.


@dataclass(frozen=True)
class ModelProfile:
    """One vision model that /extract can be pointed at."""

    key: str            # stable id used by the API (?model=)
    label: str          # human-readable, for the UI picker
    url: str            # OpenAI-compatible chat-completions endpoint
    model: str          # model id as that server knows it
    reasoning_effort: str | None = None  # omitted from the payload when None
    # Name of the env var holding this endpoint's bearer token. Local servers
    # need none; hosted ones do. The key is read at request time and never
    # stored on the profile, so it can't leak into logs or /models responses.
    api_key_env: str | None = None
    remote: bool = False  # True => documents leave this machine (see BUSINESS_CASE.md)

    def auth_headers(self) -> dict[str, str]:
        """Bearer header for this endpoint, or {} when it needs no auth."""
        if not self.api_key_env:
            return {}
        secret = os.getenv(self.api_key_env)
        return {"Authorization": f"Bearer {secret}"} if secret else {}

    @property
    def configured(self) -> bool:
        """False when this profile needs an API key that isn't set."""
        return not self.api_key_env or bool(os.getenv(self.api_key_env))


LM_STUDIO_URL = os.getenv("LM_STUDIO_URL", "http://192.168.1.10:1234/v1/chat/completions")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/v1/chat/completions")
MODEL_NAME = os.getenv("MODEL_NAME", "qwen/qwen3-vl-4b")
REASONING_EFFORT = os.getenv("REASONING_EFFORT")

MODEL_PROFILES: dict[str, ModelProfile] = {
    "qwen": ModelProfile(
        key="qwen",
        label="Qwen3-VL-4B · LM Studio",
        url=LM_STUDIO_URL,
        model=MODEL_NAME,
        # Instruct variant — no thinking tokens to suppress. Left overridable
        # anyway so a Thinking build can be driven without a code change.
        reasoning_effort=REASONING_EFFORT,
    ),
    "minicpm": ModelProfile(
        key="minicpm",
        label="MiniCPM-V 4.6 · Ollama",
        url=OLLAMA_URL,
        model=os.getenv("MINICPM_MODEL", "minicpm-v4.6:q8_0"),
        # Thinking is ON by default here and dominates latency: measured ~2,100
        # reasoning tokens / 48s per document, vs ~180 tokens / 9s with it off.
        # Ollama honours this only via reasoning_effort — `think: false` and
        # chat_template_kwargs are silently ignored on its OpenAI endpoint.
        reasoning_effort="none",
    ),
    "gemini": ModelProfile(
        key="gemini",
        label="Gemini · Google API",
        # Google exposes an OpenAI-compatible surface, so the same client works.
        url=os.getenv(
            "GEMINI_URL",
            "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        ),
        # 3.1 Flash-Lite: the GA vision model of the 3.1 line (3.1 Pro is still
        # preview-only) and free-tier eligible. Images bill as a flat ~258 tokens
        # regardless of resolution, so PDF_ZOOM does not affect cost here.
        model=os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite"),
        api_key_env="GEMINI_API_KEY",
        # Hosted: documents are sent to Google. This breaks two claims in
        # BUSINESS_CASE.md — "compute cost ~0" (billed per token) and "data never
        # leaves the machine" — so it is deliberately not the default.
        remote=True,
    ),
}
DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "qwen")

REQUEST_TIMEOUT = 300.0  # seconds; inference on the 4B VL model can be slow on 16GB


def get_profile(key: str | None) -> ModelProfile:
    """Resolve a profile key to a profile. Falls back to the default."""
    return MODEL_PROFILES.get(key or DEFAULT_MODEL) or MODEL_PROFILES[DEFAULT_MODEL]


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


# Fields that identify a filled-in document (none of which exist on a JSON Schema).
_DOC_MARKERS = ("doc_number", "vendor", "total_amount", "line_items")


def _unwrap_schema_echo(text: str) -> str:
    """Recover values from a model that echoed the schema instead of filling it.

    We hand the model `Document.model_json_schema()` and ask for an instance.
    Smaller models (minicpm-v4.6 does this consistently) instead mirror the
    schema's own shape back — `{"$defs": …, "properties": {…values…},
    "required": […], "title": "Invoice"}` — with the *correct* values nested one
    level down under "properties".

    Document has no "properties" field, so a top-level "properties" holding
    document-looking keys is unambiguously this mistake, not real data. If the
    model returned a genuine schema (values are type-dicts, not scalars), the
    unwrap yields something that fails validation exactly as it would have.
    """
    try:
        obj = json.loads(text)
    except ValueError:
        return text
    if not isinstance(obj, dict):
        return text
    inner = obj.get("properties")
    if isinstance(inner, dict) and any(k in inner for k in _DOC_MARKERS):
        return json.dumps(inner)
    return text


def _ensure_doc_type(text: str, doc_type: DocumentType) -> str:
    """Supply doc_type when the model omits it from the object.

    The caller's selection is authoritative — we overwrite the model's guess
    regardless — so a missing doc_type should not fail validation. minicpm-v4.6
    stashes it under "$defs" instead of the object, which would otherwise cost us
    an entire extraction whose other fields parsed fine.
    """
    try:
        obj = json.loads(text)
    except ValueError:
        return text
    if not isinstance(obj, dict):
        return text
    obj["doc_type"] = doc_type.value
    return json.dumps(obj)


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


def extract_document(
    image_b64: str, doc_type: DocumentType, model: str | None = None
) -> Document:
    """Run extraction for one document image and return a validated Document.

    Args:
        image_b64: the document rendered to a base64 PNG (see loaders.py).
        doc_type: the caller's document-type selection; trusted over the model's.
        model: a MODEL_PROFILES key (e.g. "qwen", "minicpm"). Defaults to
            DEFAULT_MODEL, so existing callers are unaffected.

    Raises ExtractionError on connection failure or unparseable model output.
    """
    profile = get_profile(model)
    if not profile.configured:
        raise ExtractionError(
            f"{profile.label} needs an API key. Set {profile.api_key_env} in "
            "backend/.env and restart the backend."
        )
    payload = {
        "model": profile.model,
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
    if profile.reasoning_effort:
        payload["reasoning_effort"] = profile.reasoning_effort

    try:
        resp = httpx.post(
            profile.url, json=payload, headers=profile.auth_headers(), timeout=REQUEST_TIMEOUT
        )
        resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        # Surface the server's own complaint (bad key, bad model name, quota),
        # which is far more actionable than a bare status code.
        raise ExtractionError(
            f"{profile.label} rejected the request ({exc.response.status_code}): "
            f"{exc.response.text[:300]}"
        ) from exc
    except httpx.HTTPError as exc:
        raise ExtractionError(
            f"Could not reach the vision model '{profile.model}'. Is its server "
            f"running at {profile.url}? ({exc})"
        ) from exc

    content = resp.json()["choices"][0]["message"]["content"] or ""
    cleaned = _unwrap_schema_echo(_extract_json_object(_strip_fences(content)))
    cleaned = _ensure_doc_type(cleaned, doc_type)

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

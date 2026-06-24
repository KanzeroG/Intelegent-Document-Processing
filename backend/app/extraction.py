"""Extraction: send a document image to the local vision model, get structured JSON.

Flow (per CLAUDE.md):
  base64 image  ->  prompt that embeds the pydantic JSON schema  ->  LM Studio
  ->  strip markdown fences  ->  model_validate_json()

The model is served locally by LM Studio (OpenAI-compatible API). We point the
`openai` SDK at it. `temperature=0` for deterministic extraction.

Indonesian number gotcha: amounts print as `12.450.000` (dots = thousands
separators). The model can misread this as `12.45`, so we (1) instruct it
explicitly in the prompt and (2) re-clean any numeric strings defensively before
validation.
"""

from __future__ import annotations

import json
import re

from openai import APIConnectionError, OpenAI

from .schemas import SCHEMA_BY_TYPE, DocumentType, _DocumentBase

# --- LM Studio connection (local, OpenAI-compatible) -------------------------
LM_STUDIO_BASE_URL = "http://localhost:1234/v1"
LM_STUDIO_API_KEY = "lm-studio"  # any non-empty string; LM Studio ignores the value
MODEL_NAME = "qwen/qwen3-vl-4b"

_client = OpenAI(base_url=LM_STUDIO_BASE_URL, api_key=LM_STUDIO_API_KEY)


class ExtractionError(RuntimeError):
    """Raised when extraction fails (model unreachable, or unparseable output)."""


def _build_prompt(model_cls: type[_DocumentBase]) -> str:
    """Compose the instruction text, embedding the target JSON schema."""
    schema = json.dumps(model_cls.model_json_schema(), indent=2)
    return (
        "You are a precise document-extraction engine. Read the attached document "
        "image and extract its fields.\n\n"
        "Return ONLY a single JSON object that conforms exactly to this JSON schema "
        "(no markdown, no commentary, no code fences):\n\n"
        f"{schema}\n\n"
        "Rules:\n"
        "- Numbers: output plain numbers with NO thousands separators. Indonesian "
        "documents use a dot as the thousands separator, so `12.450.000` means "
        "twelve million four hundred fifty thousand and MUST be returned as "
        "12450000 — never 12.45.\n"
        "- Dates: normalize to YYYY-MM-DD.\n"
        "- Currency: use the ISO code shown; default to IDR if unspecified.\n"
        "- If a field is not present in the document, use null (or an empty list "
        "for line_items).\n"
    )


# Matches an opening ```json / ``` fence and a trailing ``` fence.
_FENCE_RE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.IGNORECASE)


def _strip_fences(text: str) -> str:
    """Remove surrounding markdown code fences local models often add."""
    return _FENCE_RE.sub("", text).strip()


# A number that looks like Indonesian thousands grouping, e.g. 12.450.000 or
# 1.200.000,50 — i.e. dots separating 3-digit groups, optional comma decimals.
_ID_THOUSANDS_RE = re.compile(r'"(-?\d{1,3}(?:\.\d{3})+(?:,\d+)?)"')


def _clean_id_numbers(raw_json: str) -> str:
    """Defensively convert Indonesian-formatted numeric *strings* to plain numbers.

    The prompt already asks for plain numbers, but local models slip up. We only
    touch quoted values that unambiguously match dot-grouped thousands so we
    don't corrupt real strings. `"12.450.000"` -> `12450000`,
    `"1.200.000,50"` -> `1200000.50`.
    """

    def repl(m: re.Match[str]) -> str:
        val = m.group(1).replace(".", "")  # drop thousands separators
        val = val.replace(",", ".")  # comma decimal -> dot decimal
        return val  # unquoted -> becomes a JSON number

    return _ID_THOUSANDS_RE.sub(repl, raw_json)


def extract_document(image_b64: str, doc_type: DocumentType) -> _DocumentBase:
    """Run extraction for one document image and return a validated pydantic model.

    Raises ExtractionError on connection failure or unparseable model output.
    """
    model_cls = SCHEMA_BY_TYPE[doc_type]
    prompt = _build_prompt(model_cls)

    try:
        response = _client.chat.completions.create(
            model=MODEL_NAME,
            temperature=0,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/png;base64,{image_b64}"},
                        },
                    ],
                }
            ],
        )
    except APIConnectionError as exc:
        raise ExtractionError(
            "Could not reach the local vision model. Is LM Studio running with "
            f"'{MODEL_NAME}' loaded at {LM_STUDIO_BASE_URL}?"
        ) from exc

    content = response.choices[0].message.content or ""
    cleaned = _clean_id_numbers(_strip_fences(content))

    try:
        return model_cls.model_validate_json(cleaned)
    except ValueError as exc:
        raise ExtractionError(
            f"Model returned output that did not match the {model_cls.__name__} "
            f"schema. Raw output:\n{content}"
        ) from exc

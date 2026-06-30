"""Extraction: send a document image to the local vision model, get structured JSON.

Flow (per CLAUDE.md):
  base64 image  ->  prompt that embeds the pydantic JSON schema  ->  LM Studio
  ->  strip markdown fences / fallback regex  ->  model_validate_json()

The model is served locally by LM Studio (OpenAI-compatible API). We point the
`openai` SDK at it. `temperature=0` for deterministic extraction.

Indonesian number gotcha: amounts print as `12.450.000` (dots = thousands
separators). The model can misread this as `12.45`, so we (1) instruct it
explicitly in the prompt and (2) re-clean any numeric strings defensively before
validation.
"""

from __future__ import annotations

import json
def _get_system_prompt() -> str:
    """Return the strict system instructions to prevent hallucinations."""
    return (
        "You are a precise, deterministic document-extraction engine. "
        "Your ONLY purpose is to read the attached document image and extract its fields into a valid JSON object.\n\n"
        "CRITICAL RULES - YOU MUST OBEY:\n"
        "1. DO NOT output any conversational text, explanations, or apologies. Never say 'Sorry'.\n"
        "2. DO NOT output preambles like 'Invoice number:'.\n"
        "3. YOUR OUTPUT MUST START WITH '{' AND END WITH '}'.\n"
        "4. Output STRICTLY VALID JSON. No markdown code fences (```json).\n"
        "5. Numbers: output plain numbers with NO thousands separators. Indonesian "
        "documents use a dot as the thousands separator, so `12.450.000` means "
        "twelve million four hundred fifty thousand and MUST be returned as "
        "12450000 — never 12.45.\n"
        "6. Dates: normalize to YYYY-MM-DD.\n"
        "7. Currency: use the ISO code shown; default to IDR if unspecified.\n"
        "8. If a field is not present in the document, use null (or an empty list for line_items)."
    )


def _build_user_prompt(model_cls: type[UnifiedDocument]) -> str:
    """Compose the user prompt, embedding the target JSON schema and a skeleton."""
    schema = json.dumps(model_cls.model_json_schema(), indent=2)
    
    # A skeleton helps smaller models generate the exact structure
    skeleton = (
        "{\n"
        '  "doc_type": "invoice",\n'
        '  "vendor": null,\n'
        '  "invoice_date": null,\n'
        '  "due_date": null,\n'
        '  "currency": "IDR",\n'
        '  "tax_amount": null,\n'
        '  "total_amount": null,\n'
        '  "line_items": [\n'
        '    {"description": "Item name", "quantity": 1, "unit_price": 0.0, "line_total": 0.0}\n'
        "  ]\n"
        "}"
    )

    return (
        "Extract the fields from the image based on this JSON schema:\n\n"
        f"{schema}\n\n"
        "Fill out this JSON template with the extracted data. DO NOT ADD extra keys outside the schema.\n\n"
        f"TEMPLATE:\n{skeleton}\n\n"
        "Remember: output strictly valid JSON starting with '{'. DO NOT output any other text."
    )


# Matches an opening ```json / ``` fence and a trailing ``` fence.
_FENCE_RE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.IGNORECASE)

# Matches a JSON object block from { to }
_JSON_BLOCK_RE = re.compile(r"(\{.*\})", re.DOTALL)


def _extract_json_block(text: str) -> str:
    """Remove surrounding markdown code fences local models often add, and defensively extract the JSON block."""
    text = _FENCE_RE.sub("", text).strip()
    
    # If the model hallucinated preambles (e.g. "Invoice number: {"), try to just grab the {...} block.
    if not text.startswith("{"):
        match = _JSON_BLOCK_RE.search(text)
        if match:
            text = match.group(1)
            
    return text.strip()


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


def extract_document(image_b64: str) -> UnifiedDocument:
    """Run extraction for one document image and return a validated UnifiedDocument.

    Raises ExtractionError on connection failure or unparseable model output.
    """
    model_cls = UnifiedDocument
    system_prompt = _get_system_prompt()
    user_prompt = _build_user_prompt(model_cls)

    try:
        response = _client.chat.completions.create(
            model=MODEL_NAME,
            temperature=0.0,
            max_tokens=1500,  # Prevent endless loops/hallucinations from taking too long
            messages=[
                {
                    "role": "system",
                    "content": system_prompt,
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user_prompt},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/png;base64,{image_b64}"},
                        },
                    ],
                }
            ],
            response_format={"type": "json_object"},
        )
    except APIConnectionError as exc:
        raise ExtractionError(
            "Could not reach the local vision model. Is LM Studio running with "
            f"'{MODEL_NAME}' loaded at {LM_STUDIO_BASE_URL}?"
        ) from exc

    content = response.choices[0].message.content or ""
    cleaned = _clean_id_numbers(_extract_json_block(content))

    try:
        return model_cls.model_validate_json(cleaned)
    except ValueError as exc:
        raise ExtractionError(
            f"Model returned output that did not match the {model_cls.__name__} "
            f"schema. Raw output:\n{content}\nCleaned output:\n{cleaned}"
        ) from exc

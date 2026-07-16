"""RAG chat over extracted documents (bonus feature — see docs/TODO.md).

Two answering modes:
  - Per-document: the caller names a doc_id. Its extracted JSON is small, so it
    goes straight into the prompt — no retrieval needed.
  - Cross-document: at the current ~60-doc scale the whole visible corpus fits
    in the model's 16k window, so every record's one-line summary goes into the
    prompt and answers cover ALL documents (counts, sums, "which are flagged").
    Above _MAX_CONTEXT_DOCS it falls back to embedding + cosine retrieval of the
    top matches via LM Studio's embeddings endpoint.

Everything runs on the same local LM Studio server as extraction (the chat call
reuses the vision model in text-only mode). A module-level lock serializes
model calls — the 16GB fanless M4 host cannot run two inferences at once, and
LM Studio would otherwise queue them anyway.

Grounding: the prompt instructs the model to answer ONLY from the supplied
document data and to cite document numbers, so answers stay traceable to the
records shown as citations in the UI.
"""

from __future__ import annotations

import hashlib
import json
import math
import threading
from typing import Any

import os

import httpx

from .extraction import LM_STUDIO_URL, ModelProfile, get_profile

# Default profile for chat, by MODEL_PROFILES key. Callers may override per
# request. Defaults to qwen: the Assistant is a local, on-premise feature, and an
# extraction-time choice should not silently become a chat-time one.
CHAT_PROFILE = os.getenv("CHAT_MODEL", "qwen")

# Embeddings are pinned to LM Studio regardless of the chat profile: the model
# below is loaded there specifically, and a hosted chat profile has no endpoint
# serving it. (Only used above _MAX_CONTEXT_DOCS — see below.)
_EMBED_URL = LM_STUDIO_URL.rsplit("/chat/completions", 1)[0] + "/embeddings"
_EMBED_MODEL = "text-embedding-nomic-embed-text-v1.5"
_TIMEOUT = 120.0
# Cross-document answering: when the visible corpus is at or below this size it
# all fits in the model's 16k window, so every document goes into the prompt and
# corpus-wide questions ("how many are flagged?", "total across all vendors") are
# answered over ALL records. Above it, fall back to embedding retrieval of the
# top-K most relevant documents. (~150 tokens/summary; 60 docs ≈ 9k tokens.)
_MAX_CONTEXT_DOCS = 60
_TOP_K = 12

_lock = threading.Lock()

# doc_id -> (summary sha1, embedding). Reviewer edits change a record's summary,
# so the hash decides which docs need re-embedding on the next question.
_embed_cache: dict[str, tuple[str, list[float]]] = {}


class ChatError(RuntimeError):
    """Raised when the chat/embeddings call fails (LM Studio down, model missing)."""


def summarize_record(rec: dict[str, Any]) -> str:
    """Deterministic one-line summary of a record — the embedded/retrieved text.

    ~100-200 tokens per doc, so the top-k context stays far inside the model's
    16k window even with a long question.
    """
    data = rec.get("data") or {}
    items = "; ".join(
        f"{li.get('qty')} x {li.get('description')} @ {li.get('unit_price')} = {li.get('line_total')}"
        for li in data.get("line_items") or []
    )
    return " | ".join(
        [
            f"{data.get('doc_type')} {data.get('doc_number') or rec.get('id', '')[:8]}",
            f"vendor: {data.get('vendor')}",
            f"buyer: {data.get('buyer')}",
            f"date: {data.get('doc_date')}",
            f"status: {rec.get('status')}",
            (
                f"subtotal: {data.get('subtotal')} tax: {data.get('tax_amount')} "
                f"total: {data.get('total_amount')} {data.get('currency')}"
            ),
            f"items: {items or 'none'}",
        ]
    )


def _embed(texts: list[str]) -> list[list[float]]:
    """Embed texts via LM Studio; raises ChatError with an actionable message."""
    try:
        resp = httpx.post(
            _EMBED_URL, json={"model": _EMBED_MODEL, "input": texts}, timeout=_TIMEOUT
        )
        resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            raise ChatError(
                f"Embeddings model '{_EMBED_MODEL}' is not loaded in LM Studio — "
                "load it (or start the server) and try again."
            ) from exc
        raise ChatError(f"Embeddings request failed: {exc}") from exc
    except httpx.HTTPError as exc:
        raise ChatError(
            f"Could not reach LM Studio at {_EMBED_URL} — is the server running? ({exc})"
        ) from exc
    rows = sorted(resp.json()["data"], key=lambda d: d["index"])
    return [row["embedding"] for row in rows]


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    return dot / (norm_a * norm_b) if norm_a and norm_b else 0.0


def _top_documents(question: str, records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Cosine-rank records against the question; return the top matches.

    Pure-Python math is plenty at this scale (~60 docs, one vector each); a
    vector database would be dead weight.
    """
    summaries = {rec["id"]: summarize_record(rec) for rec in records}
    stale = [
        (doc_id, summary)
        for doc_id, summary in summaries.items()
        if _embed_cache.get(doc_id, ("", []))[0]
        != hashlib.sha1(summary.encode()).hexdigest()
    ]
    if stale:
        vectors = _embed([summary for _, summary in stale])
        for (doc_id, summary), vec in zip(stale, vectors):
            _embed_cache[doc_id] = (hashlib.sha1(summary.encode()).hexdigest(), vec)

    [question_vec] = _embed([question])
    ranked = sorted(
        records,
        key=lambda rec: _cosine(question_vec, _embed_cache[rec["id"]][1]),
        reverse=True,
    )
    return ranked[:_TOP_K]


def _chat(system: str, user_msg: str, profile: ModelProfile, history: list[dict[str, str]] | None = None) -> str:
    if not profile.configured:
        raise ChatError(
            f"{profile.label} needs an API key. Set {profile.api_key_env} in "
            "backend/.env and restart the backend."
        )
    messages = [{"role": "system", "content": system}]
    if history:
        messages.extend(history)
    messages.append({"role": "user", "content": user_msg})

    payload: dict[str, Any] = {
        "model": profile.model,
        "temperature": 0.1,
        "max_tokens": 500,
        "messages": messages,
    }
    if profile.reasoning_effort:
        payload["reasoning_effort"] = profile.reasoning_effort
    try:
        resp = httpx.post(
            profile.url, json=payload, headers=profile.auth_headers(), timeout=_TIMEOUT
        )
        resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise ChatError(
            f"{profile.label} rejected the request ({exc.response.status_code}): "
            f"{exc.response.text[:200]}"
        ) from exc
    except httpx.HTTPError as exc:
        raise ChatError(
            f"Could not reach the chat model — is {profile.label} available with "
            f"'{profile.model}' loaded? ({exc})"
        ) from exc
    return resp.json()["choices"][0]["message"]["content"] or ""


_SYSTEM_PROMPT = (
    "You are DocExtract's assistant. You answer questions about the user's "
    "extracted financial documents (Indonesian invoices, purchase orders, and "
    "receipts; all amounts are whole Indonesian Rupiah integers). Answer ONLY "
    "from the document data provided below — never invent documents or figures. "
    "Cite document numbers when you refer to specific documents. If the answer "
    "is not in the provided data, output exactly: 'Saya tidak menemukan informasi tersebut dalam dokumen'. "
    "DO NOT start your response with 'Based on the context' or 'Here is the answer'. "
    "Be concise: give the final answer directly — do not narrate step-by-step reasoning or self-corrections. "
    "Treat repeated document numbers as the same document (count each once)."
)


def _citations(answer: str, context_docs: list[dict[str, Any]]) -> list[dict[str, str | None]]:
    """Which documents to cite under the answer.

    Prefer the documents whose number the answer actually names — precise, and
    avoids dumping all 60 docs as "sources" on an aggregate answer. If none are
    named but only a retrieved handful was in context, cite those (they were the
    retrieved sources); for a whole-corpus aggregate that names no document, cite
    nothing.
    """
    named = [
        {"doc_id": rec["id"], "doc_number": rec.get("doc_number")}
        for rec in context_docs
        if rec.get("doc_number") and str(rec["doc_number"]) in answer
    ]
    if named:
        return named
    if len(context_docs) <= _TOP_K:
        return [
            {"doc_id": rec["id"], "doc_number": rec.get("doc_number")}
            for rec in context_docs
        ]
    return []


def answer_question(
    question: str,
    records: list[dict[str, Any]],
    target: dict[str, Any] | None = None,
    model: str | None = None,
    history: list[dict[str, str]] | None = None,
) -> tuple[str, list[dict[str, str | None]]]:
    """Answer a question over extracted documents.

    `records` is the caller-visible corpus (already role-filtered by the
    route). When `target` is set the question is about that one document and
    its full JSON goes into the prompt; otherwise the top retrieved summaries
    do. `model` is a MODEL_PROFILES key; None uses CHAT_PROFILE. Returns
    (answer, citations).
    """
    profile = get_profile(model or CHAT_PROFILE)
    with _lock:
        if target is not None:
            context_docs = [target]
            context = json.dumps(
                {
                    "status": target.get("status"),
                    "confidence": target.get("confidence"),
                    "data": target.get("data"),
                    "validation_issues": target.get("issues"),
                },
                indent=2,
            )
        elif not records:
            return (
                "There are no extracted documents to search yet — upload one on the Upload page first.",
                [],
            )
        elif len(records) <= _MAX_CONTEXT_DOCS:
            # Small corpus: hand the model every visible document so it answers
            # over the whole set (counts, sums, "which are flagged") rather than
            # a retrieved handful. No embeddings needed at this scale.
            context_docs = records
            context = "\n".join(f"- {summarize_record(rec)}" for rec in records)
        else:
            # Large corpus: retrieve the most relevant documents.
            context_docs = _top_documents(question, records)
            context = "\n".join(f"- {summarize_record(rec)}" for rec in context_docs)

        answer = _chat(
            _SYSTEM_PROMPT, f"Document data:\n{context}\n\nQuestion: {question}", profile, history
        )
        return answer, _citations(answer, context_docs)

def generate_chat_title(question: str, model: str | None = None) -> str:
    """Generate a short 3-5 word title for a chat session based on the first question."""
    profile = get_profile(model or CHAT_PROFILE)
    prompt = (
        "Generate a concise, 3 to 5 word descriptive title for this conversation based on the user's first question. "
        "Do not use quotes or any other formatting. Only output the title string itself."
    )
    with _lock:
        try:
            return _chat(prompt, question, profile).strip(' ".\'\n')
        except ChatError:
            return question[:30] + "..."


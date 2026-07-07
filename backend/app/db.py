"""SQLite persistence for extracted documents.

Caches each extraction (structured data + validation issues + the original file)
so re-opening the app doesn't re-run the vision model. Deliberately uses the
stdlib `sqlite3` — no extra dependency, and plenty for a local single-user tool.

`data` and `issues` are stored as JSON text; the uploaded file is stored as a
BLOB so document previews survive reloads.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

# DB lives under /data (git-ignored). Resolve relative to the repo root so it's
# stable regardless of the process working directory.
_DB_PATH = Path(__file__).resolve().parents[2] / "data" / "docextract.db"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
    id           TEXT PRIMARY KEY,
    doc_number   TEXT,
    doc_type     TEXT NOT NULL,
    filename     TEXT,
    mime         TEXT,
    uploaded_at  TEXT,
    status       TEXT,
    confidence   INTEGER,
    data         TEXT,   -- JSON of the extracted Document
    issues       TEXT,   -- JSON list of ValidationIssue
    uploaded_by  TEXT,   -- email of the signed-in uploader; NULL for tokenless calls
    processing_time REAL, -- model processing speed in seconds
    file         BLOB
);
"""

# Append-only trail of who did what (logins, uploads, corrections, approvals,
# eval runs). `actor` is NULL for tokenless (X-Role fallback) callers.
_AUDIT_SCHEMA = """
CREATE TABLE IF NOT EXISTS audit_log (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    ts      TEXT NOT NULL,   -- local time, YYYY-MM-DD HH:MM:SS
    actor   TEXT,            -- email of the signed-in user, or NULL
    role    TEXT,            -- actor's role at the time of the action
    action  TEXT NOT NULL,   -- login | login_failed | upload | update | approve | reject | status_change | eval_run
    doc_id  TEXT,            -- affected document, if any
    detail  TEXT             -- human-readable summary
);
"""

# Columns returned to the frontend (everything except the file blob).
_META_COLS = (
    "id, doc_number, doc_type, filename, mime, uploaded_at, status, confidence, "
    "data, issues, uploaded_by, processing_time"
)


def _connect() -> sqlite3.Connection:
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.execute(_SCHEMA)
        conn.execute(_AUDIT_SCHEMA)
        # Additive migration: databases created before the auth feature lack the
        # uploaded_by column. Idempotent — safe to run on every startup.
        cols = {row["name"] for row in conn.execute("PRAGMA table_info(documents)")}
        if "uploaded_by" not in cols:
            conn.execute("ALTER TABLE documents ADD COLUMN uploaded_by TEXT")
        if "processing_time" not in cols:
            conn.execute("ALTER TABLE documents ADD COLUMN processing_time REAL")


def _row_to_record(row: sqlite3.Row) -> dict[str, Any]:
    """Convert a DB row (excluding the blob) to a JSON-ready record."""
    return {
        "id": row["id"],
        "doc_number": row["doc_number"],
        "doc_type": row["doc_type"],
        "filename": row["filename"],
        "mime": row["mime"],
        "uploaded_at": row["uploaded_at"],
        "status": row["status"],
        "confidence": row["confidence"],
        "data": json.loads(row["data"]) if row["data"] else None,
        "issues": json.loads(row["issues"]) if row["issues"] else [],
        "uploaded_by": row["uploaded_by"],
        "processing_time": row["processing_time"],
    }


def insert_document(rec: dict[str, Any], file_bytes: bytes) -> None:
    """Persist a new document record + its original file."""
    with _connect() as conn:
        conn.execute(
            f"INSERT INTO documents ({_META_COLS}, file) "
            "VALUES (:id, :doc_number, :doc_type, :filename, :mime, :uploaded_at, "
            ":status, :confidence, :data, :issues, :uploaded_by, :processing_time, :file)",
            {
                "id": rec["id"],
                "doc_number": rec.get("doc_number"),
                "doc_type": rec["doc_type"],
                "filename": rec.get("filename"),
                "mime": rec.get("mime"),
                "uploaded_at": rec.get("uploaded_at"),
                "status": rec.get("status"),
                "confidence": rec.get("confidence"),
                "data": json.dumps(rec.get("data")),
                "issues": json.dumps(rec.get("issues", [])),
                "uploaded_by": rec.get("uploaded_by"),
                "processing_time": rec.get("processing_time"),
                "file": file_bytes,
            },
        )


def list_documents(uploaded_by: str | None = None) -> list[dict[str, Any]]:
    """Records newest first (no file blobs); optionally only one uploader's."""
    query = f"SELECT {_META_COLS} FROM documents"
    params: tuple[str, ...] = ()
    if uploaded_by is not None:
        query += " WHERE uploaded_by = ?"
        params = (uploaded_by,)
    query += " ORDER BY uploaded_at DESC, rowid DESC"
    with _connect() as conn:
        rows = conn.execute(query, params).fetchall()
    return [_row_to_record(r) for r in rows]


def get_document(doc_id: str) -> dict[str, Any] | None:
    with _connect() as conn:
        row = conn.execute(
            f"SELECT {_META_COLS} FROM documents WHERE id = ?", (doc_id,)
        ).fetchone()
    return _row_to_record(row) if row else None


def get_file(doc_id: str) -> tuple[bytes, str, str] | None:
    """Return (bytes, mime, filename) for a stored document, or None."""
    with _connect() as conn:
        row = conn.execute(
            "SELECT file, mime, filename FROM documents WHERE id = ?", (doc_id,)
        ).fetchone()
    if not row or row["file"] is None:
        return None
    return row["file"], row["mime"] or "application/octet-stream", row["filename"] or "document"


def add_audit(
    *,
    actor: str | None,
    role: str | None,
    action: str,
    doc_id: str | None = None,
    detail: str = "",
) -> None:
    """Append one audit-trail entry (timestamped now, local time)."""
    from datetime import datetime

    with _connect() as conn:
        conn.execute(
            "INSERT INTO audit_log (ts, actor, role, action, doc_id, detail) "
            "VALUES (:ts, :actor, :role, :action, :doc_id, :detail)",
            {
                "ts": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "actor": actor,
                "role": role,
                "action": action,
                "doc_id": doc_id,
                "detail": detail,
            },
        )


def list_audit(limit: int = 200) -> list[dict[str, Any]]:
    """Newest audit entries first."""
    with _connect() as conn:
        rows = conn.execute(
            "SELECT id, ts, actor, role, action, doc_id, detail FROM audit_log "
            "ORDER BY id DESC LIMIT ?",
            (max(1, min(limit, 1000)),),
        ).fetchall()
    return [dict(r) for r in rows]


def update_document(
    doc_id: str,
    *,
    data: dict[str, Any] | None = None,
    issues: list[dict[str, Any]] | None = None,
    status: str | None = None,
    confidence: int | None = None,
) -> bool:
    """Patch mutable fields of a record. Returns False if the id is unknown."""
    sets: list[str] = []
    params: dict[str, Any] = {"id": doc_id}
    if data is not None:
        sets.append("data = :data")
        params["data"] = json.dumps(data)
    if issues is not None:
        sets.append("issues = :issues")
        params["issues"] = json.dumps(issues)
    if status is not None:
        sets.append("status = :status")
        params["status"] = status
    if confidence is not None:
        sets.append("confidence = :confidence")
        params["confidence"] = confidence
    if not sets:
        return True
    with _connect() as conn:
        cur = conn.execute(f"UPDATE documents SET {', '.join(sets)} WHERE id = :id", params)
        return cur.rowcount > 0

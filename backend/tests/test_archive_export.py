"""Tests for the Archive range export (GET /exports/archive.{fmt}).

The Archive files documents by approval date, so the whole contract of this
endpoint is: an inclusive [start, end] window over `approved_at`, rendered in
one of the registered formats. These tests pin the window arithmetic (the part
an off-by-one would silently corrupt) and check every format actually produces
a well-formed file of its own type.

Run from the backend/ directory:
    ./.venv/bin/python -m pytest tests/test_archive_export.py -q
"""

from __future__ import annotations

import csv
import io
import json
import zipfile

import pytest
from fastapi.testclient import TestClient

from app import db, export
from app.main import app

ADMIN = {"X-Role": "admin"}
STAFF = {"X-Role": "staff"}


@pytest.fixture()
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "_DB_PATH", tmp_path / "test.db")
    db.init_db()
    return db


@pytest.fixture()
def client(fresh_db):
    return TestClient(app)


def _seed(doc_id: str, approved_at: str | None, *, status: str = "approved",
          doc_type: str = "invoice", total: int | None = 1_000_000) -> None:
    """Insert an approved-looking record with a chosen approval timestamp."""
    db.insert_document(
        {
            "id": doc_id,
            "doc_number": doc_id.upper(),
            "doc_type": doc_type,
            "filename": f"{doc_id}.pdf",
            "mime": "application/pdf",
            "uploaded_at": "2026-01-01",
            "status": status,
            "confidence": 90,
            "data": {
                "doc_type": doc_type,
                "doc_number": doc_id.upper(),
                "vendor": "PT Sumber Makmur",
                "doc_date": "2026-01-01",
                "currency": "IDR",
                "subtotal": total,
                "tax_amount": None,
                "total_amount": total,
                "line_items": [
                    {"description": "Kertas A4", "qty": 2, "unit_price": 500_000,
                     "line_total": 1_000_000},
                ],
            },
            "issues": [],
            "uploaded_by": "user@demo",
            "approved_at": approved_at,
        },
        b"%PDF-",
    )


def _seed_july_window(fresh_db) -> None:
    """Three approvals straddling July's boundaries, plus two non-qualifying docs."""
    _seed("in-first", "2026-07-01T08:00:00")   # exactly the start bound
    _seed("in-mid", "2026-07-15T08:00:00", doc_type="receipt")
    _seed("in-last", "2026-07-31T23:59:00")    # exactly the end bound
    _seed("out-june", "2026-06-30T23:59:00")
    _seed("out-august", "2026-08-01T00:01:00")
    _seed("not-approved", None, status="flagged")


# --- range arithmetic --------------------------------------------------------


def test_range_bounds_are_inclusive_and_exclude_neighbours(client, fresh_db):
    _seed_july_window(fresh_db)
    r = client.get("/exports/archive.csv?start=2026-07-01&end=2026-07-31", headers=ADMIN)
    assert r.status_code == 200
    rows = list(csv.DictReader(io.StringIO(r.text.lstrip("﻿"))))
    # Both edge days are in; the day either side of the window is not, and a
    # document that was never approved never reaches the Archive at all.
    assert [row["doc_id"] for row in rows] == ["in-first", "in-mid", "in-last"]


def test_rows_are_chronological_not_newest_first(client, fresh_db):
    _seed_july_window(fresh_db)
    r = client.get("/exports/archive.json?start=2026-01-01&end=2026-12-31", headers=ADMIN)
    approved = [rec["approved_at"] for rec in r.json()]
    assert approved == sorted(approved), "a report should read forwards in time"


def test_doc_type_filter(client, fresh_db):
    _seed_july_window(fresh_db)
    r = client.get(
        "/exports/archive.json?start=2026-07-01&end=2026-07-31&doc_type=receipt",
        headers=ADMIN,
    )
    assert [rec["doc_id"] for rec in r.json()] == ["in-mid"]


def test_single_day_range(client, fresh_db):
    _seed_july_window(fresh_db)
    r = client.get("/exports/archive.json?start=2026-07-15&end=2026-07-15", headers=ADMIN)
    assert [rec["doc_id"] for rec in r.json()] == ["in-mid"]


def test_empty_range_is_404(client, fresh_db):
    _seed_july_window(fresh_db)
    r = client.get("/exports/archive.pdf?start=2026-09-01&end=2026-09-30", headers=ADMIN)
    assert r.status_code == 404


# --- guards ------------------------------------------------------------------


def test_unknown_format_is_400(client, fresh_db):
    _seed_july_window(fresh_db)
    r = client.get("/exports/archive.txt?start=2026-07-01&end=2026-07-31", headers=ADMIN)
    assert r.status_code == 400
    assert "Unsupported format" in r.json()["detail"]


def test_malformed_date_is_400(client, fresh_db):
    r = client.get("/exports/archive.csv?start=07-2026&end=2026-07-31", headers=ADMIN)
    assert r.status_code == 400
    assert "start" in r.json()["detail"]


def test_reversed_range_is_400(client, fresh_db):
    r = client.get("/exports/archive.csv?start=2026-07-31&end=2026-07-01", headers=ADMIN)
    assert r.status_code == 400


def test_scoped_user_is_forbidden(client, fresh_db):
    """A token-borne `user` can't reach the Archive UI, so it can't export it."""
    from app.auth import AuthUser, Role, create_token

    _seed_july_window(fresh_db)
    token = create_token(AuthUser(email="user@demo", name="Demo User", role=Role.USER))
    r = client.get(
        "/exports/archive.csv?start=2026-07-01&end=2026-07-31",
        headers={"Authorization": f"Bearer {token}", "X-Role": "user"},
    )
    assert r.status_code == 403


def test_export_is_audited(client, fresh_db):
    _seed_july_window(fresh_db)
    client.get("/exports/archive.xlsx?start=2026-07-01&end=2026-07-31", headers=STAFF)
    entry = db.list_audit(limit=1)[0]
    assert entry["action"] == "export"
    assert "XLSX" in entry["detail"] and "3 docs" in entry["detail"]


# --- file formats ------------------------------------------------------------


@pytest.mark.parametrize("fmt", sorted(export.REPORT_FORMATS))
def test_every_format_downloads_as_an_attachment(client, fresh_db, fmt):
    _seed_july_window(fresh_db)
    r = client.get(f"/exports/archive.{fmt}?start=2026-07-01&end=2026-07-31", headers=ADMIN)
    assert r.status_code == 200
    assert r.headers["content-disposition"] == (
        f'attachment; filename="archive_2026-07-01_2026-07-31.{fmt}"'
    )
    assert r.content


def test_pdf_is_a_pdf(client, fresh_db):
    _seed_july_window(fresh_db)
    r = client.get("/exports/archive.pdf?start=2026-07-01&end=2026-07-31", headers=ADMIN)
    assert r.content.startswith(b"%PDF")


@pytest.mark.parametrize("fmt", ["docx", "xlsx"])
def test_office_formats_are_valid_zip_packages(client, fresh_db, fmt):
    _seed_july_window(fresh_db)
    r = client.get(f"/exports/archive.{fmt}?start=2026-07-01&end=2026-07-31", headers=ADMIN)
    with zipfile.ZipFile(io.BytesIO(r.content)) as zf:
        assert zf.testzip() is None
        assert "[Content_Types].xml" in zf.namelist()


def test_json_export_carries_the_structured_data(client, fresh_db):
    _seed_july_window(fresh_db)
    r = client.get("/exports/archive.json?start=2026-07-01&end=2026-07-31", headers=ADMIN)
    first = r.json()[0]
    assert first["doc_number"] == "IN-FIRST"
    assert first["total_amount"] == 1_000_000
    assert first["line_items"][0]["description"] == "Kertas A4"


# --- report rendering (unit level) -------------------------------------------


def test_report_totals_ignore_missing_amounts():
    """A document whose total the model never found must not poison the sum."""
    rows = [
        export._report_row({"id": "a", "doc_type": "invoice", "approved_at": "2026-07-01",
                            "data": {"total_amount": 1_000, "subtotal": None, "tax_amount": None}}),
        export._report_row({"id": "b", "doc_type": "invoice", "approved_at": "2026-07-02",
                            "data": {"total_amount": None}}),
    ]
    assert export._money_totals(rows)["total_amount"] == 1_000


def test_amount_formatting_uses_dot_thousands():
    # The Indonesian convention the whole pipeline is built around.
    assert export._fmt_amount(12_450_000) == "12.450.000"
    assert export._fmt_amount(-240_000) == "-240.000"
    assert export._fmt_amount(None) == "-"


def test_report_row_falls_back_to_the_internal_id():
    row = export._report_row({"id": "abc-123", "doc_type": "receipt",
                              "approved_at": "2026-07-01", "data": {"doc_number": None}})
    assert row["doc_number"] == "abc-123"
    assert row["doc_type"] == "Receipt"


def test_pdf_escapes_html_in_extracted_text():
    """Vendor names come from a model reading a scan - they are not trusted HTML."""
    pdf = export.to_pdf(
        [{"id": "x", "doc_type": "invoice", "approved_at": "2026-07-01",
          "data": {"vendor": "PT <b>Bold</b> & Co", "total_amount": 1}}],
        "Title",
    )
    import fitz

    # Normalized: Story wraps the cell, so the tags survive across a line break.
    text = " ".join(fitz.open(stream=pdf, filetype="pdf")[0].get_text().split())
    assert "PT <b>Bold</b> & Co" in text


def test_json_many_is_valid_json_for_an_empty_selection():
    assert json.loads(export.to_json_many([])) == []

"""Tests for the admin surface: password hashing, settings, and user management.

DB-touching tests run against an isolated temp database (monkeypatched
`db._DB_PATH`) so they never touch the real data/docextract.db. Admin auth uses
the X-Role header stub — get_current_user falls back to it when there's no token
— except the self-delete guard, which needs a token-borne identity (email).

Run from the backend/ directory:
    ./.venv/bin/python -m pytest tests/test_admin.py -q
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import db
from app.auth import AuthUser, Role, create_token
from app.main import app

ADMIN = {"X-Role": "admin"}
USER = {"X-Role": "user"}


@pytest.fixture()
def fresh_db(tmp_path, monkeypatch):
    """Point the persistence layer at a throwaway DB and seed defaults."""
    monkeypatch.setattr(db, "_DB_PATH", tmp_path / "test.db")
    db.init_db()
    return db


@pytest.fixture()
def client(fresh_db):
    return TestClient(app)


# --- DB helpers: hashing + CRUD ----------------------------------------------


def test_password_hashing_roundtrip(fresh_db):
    fresh_db.insert_user("a@demo", "A", "user", "secret")
    u = fresh_db.get_user("a@demo")
    assert u is not None
    # Stored value is hashed (salt$digest), never the plaintext.
    assert u["password"] != "secret"
    assert "$" in u["password"]
    assert fresh_db.verify_password("secret", u["password"]) is True
    assert fresh_db.verify_password("wrong", u["password"]) is False


def test_verify_password_legacy_plaintext(fresh_db):
    # A stored value without the '$' delimiter is treated as legacy plaintext.
    assert fresh_db.verify_password("plain", "plain") is True
    assert fresh_db.verify_password("nope", "plain") is False


def test_get_user_normalizes_email(fresh_db):
    fresh_db.insert_user("Mixed@Demo", "M", "staff", "pw")
    assert fresh_db.get_user("mixed@demo") is not None


def test_list_users_omits_password(fresh_db):
    users = fresh_db.list_users()
    assert users, "default users should be seeded"
    assert all("password" not in u for u in users)
    assert {"email", "name", "role"} <= set(users[0])


def test_delete_user_helper(fresh_db):
    fresh_db.insert_user("gone@demo", "G", "user", "pw")
    assert fresh_db.delete_user("gone@demo") is True
    assert fresh_db.delete_user("gone@demo") is False
    assert fresh_db.get_user("gone@demo") is None


def test_settings_roundtrip_and_types(fresh_db):
    s = fresh_db.get_settings()
    assert s["ppn_rate"] == 0.11
    assert isinstance(s["reconcile_tolerance"], int)
    fresh_db.update_settings({"ppn_rate": 0.10, "reconcile_tolerance": 5})
    s2 = fresh_db.get_settings()
    assert s2["ppn_rate"] == 0.10
    assert s2["reconcile_tolerance"] == 5


# --- Endpoints ---------------------------------------------------------------


def test_get_settings_admin_ok_user_forbidden(client):
    assert client.get("/admin/settings", headers=ADMIN).status_code == 200
    assert client.get("/admin/settings", headers=USER).status_code == 403


def test_patch_settings_persists_and_audits(client):
    r = client.patch("/admin/settings", headers=ADMIN, json={"ppn_rate": 0.10})
    assert r.status_code == 200
    assert r.json()["ppn_rate"] == 0.10
    # A settings_update row landed in the audit trail.
    audit = client.get("/audit", headers=ADMIN).json()
    assert any(e["action"] == "settings_update" for e in audit)


def test_patch_settings_empty_body_is_400(client):
    assert client.patch("/admin/settings", headers=ADMIN, json={}).status_code == 400


def test_users_endpoint_requires_admin(client):
    assert client.get("/admin/users", headers=USER).status_code == 403


def test_create_user_then_login(client):
    r = client.post(
        "/admin/users",
        headers=ADMIN,
        json={"email": "New@Demo", "name": "New", "role": "staff", "password": "pw12345"},
    )
    assert r.status_code == 200
    assert r.json()["email"] == "new@demo"  # normalized
    # New credentials work end-to-end through the real login endpoint — proves the
    # password was hashed on write and verified on read.
    login = client.post("/auth/login", json={"email": "new@demo", "password": "pw12345"})
    assert login.status_code == 200
    assert login.json()["role"] == "staff"


def test_create_duplicate_user_is_409(client):
    body = {"email": "dup@demo", "name": "D", "role": "user", "password": "pw"}
    assert client.post("/admin/users", headers=ADMIN, json=body).status_code == 200
    assert client.post("/admin/users", headers=ADMIN, json=body).status_code == 409


def test_create_user_bad_role_is_422(client):
    r = client.post(
        "/admin/users",
        headers=ADMIN,
        json={"email": "x@demo", "name": "X", "role": "superadmin", "password": "pw"},
    )
    assert r.status_code == 422


def test_delete_user_endpoint(client):
    client.post(
        "/admin/users",
        headers=ADMIN,
        json={"email": "temp@demo", "name": "T", "role": "user", "password": "pw"},
    )
    assert client.delete("/admin/users/temp@demo", headers=ADMIN).status_code == 200
    assert client.delete("/admin/users/temp@demo", headers=ADMIN).status_code == 404


def test_delete_missing_user_is_404(client):
    assert client.delete("/admin/users/nobody@demo", headers=ADMIN).status_code == 404


def test_cannot_delete_own_account(client):
    # The self-delete guard needs an identity, so authenticate with a real token.
    token = create_token(AuthUser(email="admin@demo", name="Demo Admin", role=Role.ADMIN))
    r = client.delete("/admin/users/admin@demo", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 400
    assert db.get_user("admin@demo") is not None  # still there

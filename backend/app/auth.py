"""Authentication: demo users + signed session tokens, with a header fallback.

POST /auth/login (see main.py) checks the demo user table below and returns an
HMAC-signed token; the SPA sends it on every request as
`Authorization: Bearer <token>`. Requests WITHOUT a token keep the original
stubbed behavior — role read from the `X-Role` header, defaulting to the
least-privileged role — so curl scripts and plain <a href> downloads (which
cannot carry headers) keep working unchanged.

Role responsibilities (see CLAUDE.md):
  - user  : upload documents, view their own results (read-only review)
  - staff : review flagged extractions, correct + approve/reject
  - admin : run evaluations, bulk exports, dashboards / ROI
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from enum import Enum

from fastapi import Depends, Header, HTTPException
from pydantic import BaseModel

from . import db


class Role(str, Enum):
    USER = "user"
    STAFF = "staff"
    ADMIN = "admin"


class AuthUser(BaseModel):
    """The resolved caller. `email` is None for tokenless X-Role fallback calls,
    which have a role but no identity (so no document ownership)."""

    email: str | None
    name: str
    role: Role


# Signing secret — override via env for anything beyond local demo use.
_SECRET = os.getenv("AUTH_SECRET", "docextract-dev-secret").encode()


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _sign(payload: bytes) -> str:
    return _b64url(hmac.new(_SECRET, payload, hashlib.sha256).digest())


def authenticate(email: str, password: str) -> AuthUser | None:
    """Check user credentials; None when they don't match."""
    u = db.get_user(email)
    if not u or not db.verify_password(password, u["password"]):
        return None
    return AuthUser(email=u["email"], name=u["name"], role=Role(u["role"]))


def create_token(user: AuthUser) -> str:
    """Token format: b64url(claims JSON) + '.' + b64url(HMAC-SHA256 signature)."""
    payload = json.dumps(
        {"sub": user.email, "name": user.name, "role": user.role.value, "iat": int(time.time())},
        separators=(",", ":"),
    ).encode()
    return f"{_b64url(payload)}.{_sign(payload)}"


def verify_token(token: str) -> AuthUser:
    """Decode + signature-check a token. Raises ValueError when invalid."""
    try:
        payload_b64, sig = token.split(".", 1)
        payload = _b64url_decode(payload_b64)
    except Exception as exc:
        raise ValueError("Malformed token.") from exc
    if not hmac.compare_digest(_sign(payload), sig):
        raise ValueError("Bad token signature.")
    try:
        claims = json.loads(payload)
        return AuthUser(email=claims["sub"], name=claims.get("name", ""), role=Role(claims["role"]))
    except Exception as exc:
        raise ValueError("Bad token payload.") from exc


def get_current_user(
    authorization: str | None = Header(default=None),
    x_role: str | None = Header(default=None),
) -> AuthUser:
    """FastAPI dependency: resolve the caller.

    A Bearer token wins and must be valid — an invalid/expired token is a 401
    rather than a silent downgrade to `user`, which would otherwise surface as
    a confusing 403 on admin routes. Without a token we keep the original
    stubbed X-Role behavior (unknown/missing -> least-privileged role).
    """
    if authorization:
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() == "bearer" and token.strip():
            try:
                return verify_token(token.strip())
            except ValueError as exc:
                raise HTTPException(status_code=401, detail="Invalid or expired session.") from exc
    try:
        role = Role(x_role) if x_role else Role.USER
    except ValueError:
        role = Role.USER
    return AuthUser(email=None, name=role.value.capitalize(), role=role)


def get_current_role(user: AuthUser = Depends(get_current_user)) -> Role:
    """FastAPI dependency: just the caller's role (see get_current_user)."""
    return user.role

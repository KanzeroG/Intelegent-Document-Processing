"""Role scaffold (user / staff / admin) — STUBBED.

No real authentication yet. We read a role from the `X-Role` header and default
to `user`. This is enough to exercise the role-based UI now and to hang real
auth off later without changing call sites.

Role responsibilities (see CLAUDE.md):
  - user  : upload documents, view their own results
  - staff : review flagged extractions, correct + approve/reject
  - admin : manage users, dashboards, configure rules/schemas, view logs
"""

from __future__ import annotations

from enum import Enum

from fastapi import Header


class Role(str, Enum):
    USER = "user"
    STAFF = "staff"
    ADMIN = "admin"


def get_current_role(x_role: str | None = Header(default=None)) -> Role:
    """FastAPI dependency: resolve the caller's role from the X-Role header.

    Unknown or missing values fall back to the least-privileged role.
    """
    try:
        return Role(x_role) if x_role else Role.USER
    except ValueError:
        return Role.USER

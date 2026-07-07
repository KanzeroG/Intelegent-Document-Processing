"""Intelligent Document Processing — FastAPI backend package."""

from __future__ import annotations

import os
from pathlib import Path


def _load_dotenv() -> None:
    """Load `backend/.env` into the environment (stdlib only, no dependency).

    Lets each developer point LM_STUDIO_URL at their own machine (e.g.
    http://127.0.0.1:1234/... when the model runs locally) without editing
    shared code. `.env` is git-ignored, so it never conflicts across machines.
    Real exported environment variables still win (`setdefault`).
    """
    env_path = Path(__file__).resolve().parents[1] / ".env"
    if not env_path.exists():
        return
    for raw in env_path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


# Runs before extraction.py reads LM_STUDIO_URL at import time.
_load_dotenv()

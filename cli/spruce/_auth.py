"""
Single source of truth for resolving the CLI's API token.

Resolution order (first hit wins):
  1. Explicit ``--token`` flag passed to a command.
  2. ``SPRUCELAB_ADMIN_TOKEN`` environment variable (CI/scripts path).
  3. ``keyring`` (set by ``spruce auth register --token ...``).

This unifies the previously fragmented behavior where command modules
(``models``, ``verify``, ``types``, …) read only the env var while the
``auth``/``capabilities`` modules read only the keyring. After this
helper, every command honors all three paths.
"""
from __future__ import annotations

import os
from typing import Optional


def resolve_token(override: Optional[str] = None) -> Optional[str]:
    """Return the API token to use, or None if nothing is configured."""
    if override:
        return override
    env_token = os.environ.get('SPRUCELAB_ADMIN_TOKEN')
    if env_token:
        return env_token
    try:
        from .config import get_api_key
        kr_token = get_api_key()
        if kr_token:
            return kr_token
    except Exception:
        # Keyring backend missing or locked — fall through to None.
        pass
    return None


def auth_headers(override: Optional[str] = None) -> dict:
    """Standard JSON request headers including Authorization if we have a token."""
    headers = {'Content-Type': 'application/json', 'Accept': 'application/json'}
    token = resolve_token(override)
    if token:
        headers['Authorization'] = f'Bearer {token}'
    return headers

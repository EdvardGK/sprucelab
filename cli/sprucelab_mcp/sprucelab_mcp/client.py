"""Minimal HTTP client for the Sprucelab REST surface.

Intentionally tiny — the MCP server just forwards JSON. If you want a
richer client, use the ``spruce`` CLI's ``SprucelabClient`` directly.
"""
from __future__ import annotations

import os
from typing import Any, Mapping

import httpx


def _default_api_url() -> str:
    return os.environ.get("SPRUCELAB_API_URL", "https://api.sprucelab.io").rstrip("/")


def _default_token() -> str | None:
    return os.environ.get("SPRUCELAB_API_TOKEN") or None


class SprucelabHTTP:
    """Tiny HTTP shim. One ``httpx.Client`` per server process."""

    def __init__(self, api_url: str | None = None, token: str | None = None):
        self.api_url = (api_url or _default_api_url()).rstrip("/")
        self.token = token or _default_token()
        self._client = httpx.Client(timeout=30.0)

    def close(self) -> None:
        self._client.close()

    def _headers(self, *, auth: bool) -> dict[str, str]:
        headers = {"Accept": "application/json"}
        if auth and self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    def get(self, path: str, *, params: Mapping[str, Any] | None = None, auth: bool = True) -> Any:
        url = f"{self.api_url}{path}"
        r = self._client.get(url, headers=self._headers(auth=auth), params=params)
        r.raise_for_status()
        return r.json()

    def post(self, path: str, *, params: Mapping[str, Any] | None = None, json: Any = None, auth: bool = True) -> Any:
        url = f"{self.api_url}{path}"
        r = self._client.post(url, headers=self._headers(auth=auth), params=params, json=json)
        r.raise_for_status()
        return r.json()

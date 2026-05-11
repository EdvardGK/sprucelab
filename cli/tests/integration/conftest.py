"""Conftest for the live-API smoke harness.

This intentionally OVERRIDES the autouse ``_pin_api_url`` fixture from the
parent ``tests/conftest.py`` so that live tests reach the URL provided via
``$SPRUCE_LIVE_API_URL`` instead of the mocked-suite test sentinel.

It also overrides ``_clear_admin_token`` so that ``$SPRUCELAB_ADMIN_TOKEN``
(if the user opts to pass one through) survives into the test process.
"""
from __future__ import annotations

import os

import pytest


@pytest.fixture(autouse=True)
def _pin_api_url(monkeypatch: pytest.MonkeyPatch) -> None:
    """Override the parent autouse pin: point ``get_api_url`` at the live URL.

    The parent conftest pins to ``http://test-api.local`` for the mocked
    suite. Here we want the real network call, so we read
    ``$SPRUCE_LIVE_API_URL`` and patch the same symbols.
    Tests are skipped at module level when the env var is missing, so by
    the time this fixture runs the var is guaranteed to be set.
    """
    live_url = os.environ.get('SPRUCE_LIVE_API_URL')
    if not live_url:
        # Defensive: tests should already be skipped, but if some runner
        # invokes this conftest standalone, surface the misconfiguration.
        pytest.skip('SPRUCE_LIVE_API_URL not set; live smoke tests skipped')
    monkeypatch.setattr('spruce.config.get_api_url', lambda: live_url)
    monkeypatch.setattr('spruce.types.get_api_url', lambda: live_url)
    monkeypatch.setattr('spruce.verify.get_api_url', lambda: live_url)
    monkeypatch.setattr('spruce.scripts.get_api_url', lambda: live_url)


@pytest.fixture(autouse=True)
def _clear_admin_token(monkeypatch: pytest.MonkeyPatch) -> None:
    """Override the parent autouse delenv: keep the live admin token in scope.

    If ``$SPRUCELAB_ADMIN_TOKEN`` is set in the user's shell, the parent
    conftest would scrub it before each test. For the live harness we want
    that token to flow through to the real API.
    """
    # No-op: do NOT delete the env var. The parent fixture's effect is shadowed
    # because pytest resolves fixtures by name in the closest conftest.
    return

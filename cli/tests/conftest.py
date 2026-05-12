"""Shared fixtures for spruce CLI tests."""
from __future__ import annotations

import pytest
from typer.testing import CliRunner

TEST_API_URL = "http://test-api.local"
TEST_TOKEN = "test-admin-token-12345"


@pytest.fixture
def runner() -> CliRunner:
    return CliRunner()


@pytest.fixture(autouse=True)
def _wide_console(monkeypatch: pytest.MonkeyPatch) -> None:
    """Force a wide terminal so Rich tables don't truncate column values
    we're asserting on in stdout-substring checks."""
    monkeypatch.setenv("COLUMNS", "200")


@pytest.fixture(autouse=True)
def _pin_api_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("spruce.config.get_api_url", lambda: TEST_API_URL)
    monkeypatch.setattr("spruce.files.get_api_url", lambda: TEST_API_URL)
    monkeypatch.setattr("spruce.models.get_api_url", lambda: TEST_API_URL)
    monkeypatch.setattr("spruce.types.get_api_url", lambda: TEST_API_URL)
    monkeypatch.setattr("spruce.verify.get_api_url", lambda: TEST_API_URL)
    monkeypatch.setattr("spruce.scripts.get_api_url", lambda: TEST_API_URL)
    monkeypatch.setattr("spruce.webhooks.get_api_url", lambda: TEST_API_URL)
    monkeypatch.setattr("spruce.claims.get_api_url", lambda: TEST_API_URL)


@pytest.fixture
def admin_token_env(monkeypatch: pytest.MonkeyPatch) -> str:
    monkeypatch.setenv("SPRUCELAB_ADMIN_TOKEN", TEST_TOKEN)
    return TEST_TOKEN


@pytest.fixture(autouse=True)
def _clear_admin_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SPRUCELAB_ADMIN_TOKEN", raising=False)


@pytest.fixture(autouse=True)
def _clear_keyring_token(monkeypatch: pytest.MonkeyPatch) -> None:
    """
    Tests must behave identically whether or not the developer running them
    has a real token in their OS keyring. Pin `spruce.config.get_api_key`
    to None so the auth resolver's keyring fallback never picks one up.
    """
    monkeypatch.setattr("spruce.config.get_api_key", lambda: None)

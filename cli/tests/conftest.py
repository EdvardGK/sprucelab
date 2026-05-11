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
def _pin_api_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("spruce.config.get_api_url", lambda: TEST_API_URL)
    monkeypatch.setattr("spruce.types.get_api_url", lambda: TEST_API_URL)
    monkeypatch.setattr("spruce.verify.get_api_url", lambda: TEST_API_URL)
    monkeypatch.setattr("spruce.scripts.get_api_url", lambda: TEST_API_URL)


@pytest.fixture
def admin_token_env(monkeypatch: pytest.MonkeyPatch) -> str:
    monkeypatch.setenv("SPRUCELAB_ADMIN_TOKEN", TEST_TOKEN)
    return TEST_TOKEN


@pytest.fixture(autouse=True)
def _clear_admin_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SPRUCELAB_ADMIN_TOKEN", raising=False)

"""Tests for ``spruce verify``."""
from __future__ import annotations

import json

import httpx
import respx

from spruce.cli import app
from tests.conftest import TEST_API_URL, TEST_TOKEN

MODEL_ID = "11111111-2222-3333-4444-555555555555"
PROJECT_ID = "66666666-7777-8888-9999-000000000000"


@respx.mock
def test_verify_posts_to_verify_endpoint(runner, admin_token_env):
    route = respx.post(f"{TEST_API_URL}/api/types/types/verify/").mock(
        return_value=httpx.Response(
            200,
            json={
                "model_id": MODEL_ID,
                "project_id": PROJECT_ID,
                "health_score": 0.83,
                "passed": 10,
                "warnings": 2,
                "failed": 1,
                "skipped": 0,
                "rules_applied": 5,
                "total_types": 13,
                "types": [
                    {
                        "type_id": "abc",
                        "type_name": "Wall-200",
                        "status": "passed",
                        "issues": [],
                    }
                ],
            },
        )
    )

    result = runner.invoke(
        app,
        ["verify", "--model", MODEL_ID, "--json"],
    )

    assert result.exit_code == 0, result.stdout
    assert route.called
    request = route.calls.last.request
    assert request.method == "POST"
    assert request.url.params["model"] == MODEL_ID
    assert "project_id" not in request.url.params
    assert request.headers["Authorization"] == f"Bearer {TEST_TOKEN}"
    body = json.loads(request.content.decode())
    assert body == {}
    payload = json.loads(result.stdout)
    assert payload["health_score"] == 0.83
    assert payload["total_types"] == 13


@respx.mock
def test_verify_passes_project_id_when_provided(runner, admin_token_env):
    route = respx.post(f"{TEST_API_URL}/api/types/types/verify/").mock(
        return_value=httpx.Response(200, json={"model_id": MODEL_ID, "types": []})
    )

    result = runner.invoke(
        app,
        [
            "verify",
            "--model", MODEL_ID,
            "--project-id", PROJECT_ID,
            "--json",
        ],
    )

    assert result.exit_code == 0, result.stdout
    request = route.calls.last.request
    assert request.url.params["project_id"] == PROJECT_ID


@respx.mock
def test_verify_http_error_emits_json_error(runner, admin_token_env):
    respx.post(f"{TEST_API_URL}/api/types/types/verify/").mock(
        return_value=httpx.Response(500, json={"detail": "boom"})
    )

    result = runner.invoke(
        app,
        ["verify", "--model", MODEL_ID, "--json"],
    )

    assert result.exit_code == 1
    payload = json.loads(result.stdout)
    assert payload["error"] == "HTTP 500"


# ---------------------------------------------------------------------------
# spruce verify --dry-run
# ---------------------------------------------------------------------------


@respx.mock
def test_verify_dry_run_sets_query_param(runner, admin_token_env):
    """``--dry-run`` appends ``?dry_run=true`` and surfaces the preview flag."""
    route = respx.post(f"{TEST_API_URL}/api/types/types/verify/").mock(
        return_value=httpx.Response(
            200,
            json={
                "model_id": MODEL_ID,
                "dry_run": True,
                "checked": 5,
                "passed": 3,
                "warnings": 1,
                "failed": 1,
                "skipped": 0,
                "health_score": 60.0,
                "rules_applied": ["has_ns3451"],
                "total_types": 5,
                "type_results": [],
            },
        )
    )

    result = runner.invoke(
        app,
        ["verify", "--model", MODEL_ID, "--dry-run", "--json"],
    )

    assert result.exit_code == 0, result.stdout
    assert route.called
    request = route.calls.last.request
    assert request.url.params["dry_run"] == "true"
    assert request.url.params["model"] == MODEL_ID
    payload = json.loads(result.stdout)
    assert payload["dry_run"] is True
    assert payload["health_score"] == 60.0


@respx.mock
def test_verify_dry_run_short_flag(runner, admin_token_env):
    """``-n`` is the short alias for ``--dry-run``."""
    route = respx.post(f"{TEST_API_URL}/api/types/types/verify/").mock(
        return_value=httpx.Response(200, json={"model_id": MODEL_ID, "dry_run": True})
    )

    result = runner.invoke(app, ["verify", "--model", MODEL_ID, "-n", "--json"])

    assert result.exit_code == 0, result.stdout
    assert route.calls.last.request.url.params["dry_run"] == "true"


@respx.mock
def test_verify_dry_run_human_output_banner(runner, admin_token_env):
    """Human-mode output surfaces an explicit '(dry run — no changes persisted)' banner."""
    respx.post(f"{TEST_API_URL}/api/types/types/verify/").mock(
        return_value=httpx.Response(
            200,
            json={
                "model_id": MODEL_ID,
                "dry_run": True,
                "checked": 1,
                "passed": 1,
                "warnings": 0,
                "failed": 0,
                "skipped": 0,
                "health_score": 100.0,
                "rules_applied": [],
                "total_types": 1,
            },
        )
    )

    result = runner.invoke(app, ["verify", "--model", MODEL_ID, "--dry-run"])

    assert result.exit_code == 0, result.stdout
    assert "dry run" in result.stdout.lower()
    assert "no changes persisted" in result.stdout.lower()


@respx.mock
def test_verify_without_dry_run_omits_query_param(runner, admin_token_env):
    """Default behavior unchanged — ``dry_run`` not in query when flag absent."""
    route = respx.post(f"{TEST_API_URL}/api/types/types/verify/").mock(
        return_value=httpx.Response(200, json={"model_id": MODEL_ID, "dry_run": False})
    )

    result = runner.invoke(app, ["verify", "--model", MODEL_ID, "--json"])

    assert result.exit_code == 0, result.stdout
    assert "dry_run" not in route.calls.last.request.url.params

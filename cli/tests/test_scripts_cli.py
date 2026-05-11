"""Tests for ``spruce scripts {list,run}``."""
from __future__ import annotations

import json

import httpx
import respx

from spruce.cli import app
from tests.conftest import TEST_API_URL, TEST_TOKEN

MODEL_ID = "11111111-2222-3333-4444-555555555555"
SCRIPT_ID = "99999999-aaaa-bbbb-cccc-dddddddddddd"


@respx.mock
def test_scripts_list_json_happy_path(runner, admin_token_env):
    route = respx.get(f"{TEST_API_URL}/api/scripts/").mock(
        return_value=httpx.Response(
            200,
            json={
                "count": 1,
                "results": [
                    {
                        "id": SCRIPT_ID,
                        "name": "Classify walls",
                        "category": "classification",
                        "script_type": "python",
                        "execution_count": 4,
                    }
                ],
            },
        )
    )

    result = runner.invoke(
        app,
        ["scripts", "list", "--json"],
    )

    assert result.exit_code == 0, result.stdout
    assert route.called
    request = route.calls.last.request
    assert request.method == "GET"
    assert request.url.params["page_size"] == "100"
    assert request.headers["Authorization"] == f"Bearer {TEST_TOKEN}"
    payload = json.loads(result.stdout)
    assert payload["results"][0]["id"] == SCRIPT_ID


@respx.mock
def test_scripts_list_category_filter(runner, admin_token_env):
    route = respx.get(f"{TEST_API_URL}/api/scripts/").mock(
        return_value=httpx.Response(200, json={"count": 0, "results": []})
    )

    result = runner.invoke(
        app,
        ["scripts", "list", "--category", "classification", "--json"],
    )

    assert result.exit_code == 0, result.stdout
    assert route.calls.last.request.url.params["category"] == "classification"


@respx.mock
def test_scripts_run_posts_to_execute_endpoint(runner, admin_token_env):
    route = respx.post(f"{TEST_API_URL}/api/scripts/{SCRIPT_ID}/execute/").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": "exec-1",
                "status": "success",
                "script_name": "Classify walls",
                "model_name": "Building A",
                "duration_ms": 1234,
                "output_log": "ok",
            },
        )
    )

    result = runner.invoke(
        app,
        [
            "scripts", "run",
            "--script", SCRIPT_ID,
            "--model", MODEL_ID,
            "--json",
        ],
    )

    assert result.exit_code == 0, result.stdout
    assert route.called
    request = route.calls.last.request
    body = json.loads(request.content.decode())
    assert body == {"model_id": MODEL_ID}
    assert request.headers["Authorization"] == f"Bearer {TEST_TOKEN}"
    payload = json.loads(result.stdout)
    assert payload["status"] == "success"


@respx.mock
def test_scripts_run_passes_parameters(runner, admin_token_env):
    route = respx.post(f"{TEST_API_URL}/api/scripts/{SCRIPT_ID}/execute/").mock(
        return_value=httpx.Response(200, json={"status": "success"})
    )

    result = runner.invoke(
        app,
        [
            "scripts", "run",
            "--script", SCRIPT_ID,
            "--model", MODEL_ID,
            "--parameters", '{"threshold": 0.5, "name": "foo"}',
            "--json",
        ],
    )

    assert result.exit_code == 0, result.stdout
    body = json.loads(route.calls.last.request.content.decode())
    assert body == {
        "model_id": MODEL_ID,
        "parameters": {"threshold": 0.5, "name": "foo"},
    }


def test_scripts_run_rejects_invalid_parameters_json(runner, admin_token_env):
    result = runner.invoke(
        app,
        [
            "scripts", "run",
            "--script", SCRIPT_ID,
            "--model", MODEL_ID,
            "--parameters", "not-json",
            "--json",
        ],
    )

    assert result.exit_code == 2
    payload = json.loads(result.stdout)
    assert payload["error"] == "invalid_args"


@respx.mock
def test_scripts_run_http_error(runner, admin_token_env):
    respx.post(f"{TEST_API_URL}/api/scripts/{SCRIPT_ID}/execute/").mock(
        return_value=httpx.Response(400, json={"detail": "bad model"})
    )

    result = runner.invoke(
        app,
        [
            "scripts", "run",
            "--script", SCRIPT_ID,
            "--model", MODEL_ID,
            "--json",
        ],
    )

    assert result.exit_code == 1
    payload = json.loads(result.stdout)
    assert payload["error"] == "HTTP 400"

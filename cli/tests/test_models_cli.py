"""Tests for ``spruce models list``."""
from __future__ import annotations

import json

import httpx
import respx

from spruce.cli import app
from tests.conftest import TEST_API_URL, TEST_TOKEN

PROJECT_ID = "11111111-2222-3333-4444-555555555555"
MODEL_ID_1 = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
MODEL_ID_2 = "11112222-3333-4444-5555-666677778888"


def _sample_payload() -> dict:
    return {
        "count": 2,
        "next": None,
        "previous": None,
        "results": [
            {
                "id": MODEL_ID_1,
                "name": "Arkitekt",
                "project": PROJECT_ID,
                "project_name": "Test Project",
                "ifc_schema": "IFC4",
                "status": "completed",
            },
            {
                "id": MODEL_ID_2,
                "name": "Konstruksjon",
                "project": PROJECT_ID,
                "project_name": "Test Project",
                "ifc_schema": "IFC2X3",
                "status": "processing",
            },
        ],
    }


# ---------------------------------------------------------------------------
# spruce models list (table mode)
# ---------------------------------------------------------------------------


@respx.mock
def test_models_list_table_mode(runner, admin_token_env):
    route = respx.get(f"{TEST_API_URL}/api/models/").mock(
        return_value=httpx.Response(200, json=_sample_payload())
    )

    result = runner.invoke(app, ["models", "list"])

    assert result.exit_code == 0, result.stdout
    assert route.called
    request = route.calls.last.request
    assert request.url.params["page_size"] == "100"
    assert "project" not in request.url.params
    assert request.headers["Authorization"] == f"Bearer {TEST_TOKEN}"
    # Human-mode output should contain both model names
    assert "Arkitekt" in result.stdout
    assert "Konstruksjon" in result.stdout
    # Schema column populated
    assert "IFC4" in result.stdout


# ---------------------------------------------------------------------------
# spruce models list --json
# ---------------------------------------------------------------------------


@respx.mock
def test_models_list_json_emits_raw_payload(runner, admin_token_env):
    payload = _sample_payload()
    route = respx.get(f"{TEST_API_URL}/api/models/").mock(
        return_value=httpx.Response(200, json=payload)
    )

    result = runner.invoke(app, ["models", "list", "--json"])

    assert result.exit_code == 0, result.stdout
    assert route.called
    body = json.loads(result.stdout)
    assert body["count"] == 2
    assert len(body["results"]) == 2
    assert body["results"][0]["id"] == MODEL_ID_1
    assert body["results"][1]["id"] == MODEL_ID_2


# ---------------------------------------------------------------------------
# spruce models list --project-id <uuid>
# ---------------------------------------------------------------------------


@respx.mock
def test_models_list_project_filter(runner, admin_token_env):
    route = respx.get(f"{TEST_API_URL}/api/models/").mock(
        return_value=httpx.Response(200, json={"count": 0, "results": []})
    )

    result = runner.invoke(
        app,
        ["models", "list", "--project-id", PROJECT_ID, "--json"],
    )

    assert result.exit_code == 0, result.stdout
    assert route.called
    request = route.calls.last.request
    assert request.url.params["project"] == PROJECT_ID


# ---------------------------------------------------------------------------
# Empty + error paths
# ---------------------------------------------------------------------------


@respx.mock
def test_models_list_empty_table_mode(runner, admin_token_env):
    respx.get(f"{TEST_API_URL}/api/models/").mock(
        return_value=httpx.Response(200, json={"count": 0, "results": []})
    )

    result = runner.invoke(app, ["models", "list"])

    assert result.exit_code == 0, result.stdout
    assert "no models" in result.stdout.lower()


@respx.mock
def test_models_list_without_token_omits_auth_header(runner):
    route = respx.get(f"{TEST_API_URL}/api/models/").mock(
        return_value=httpx.Response(200, json={"count": 0, "results": []})
    )

    result = runner.invoke(app, ["models", "list", "--json"])

    assert result.exit_code == 0, result.stdout
    assert "Authorization" not in route.calls.last.request.headers


@respx.mock
def test_models_list_http_error_json_output(runner, admin_token_env):
    respx.get(f"{TEST_API_URL}/api/models/").mock(
        return_value=httpx.Response(500, json={"detail": "boom"})
    )

    result = runner.invoke(app, ["models", "list", "--json"])

    assert result.exit_code == 1
    payload = json.loads(result.stdout)
    assert payload["error"] == "HTTP 500"

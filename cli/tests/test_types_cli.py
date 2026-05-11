"""Tests for ``spruce types {list,classify,export}``."""
from __future__ import annotations

import json

import httpx
import pytest
import respx

from spruce.cli import app
from tests.conftest import TEST_API_URL, TEST_TOKEN

MODEL_ID = "11111111-2222-3333-4444-555555555555"
TYPE_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"


# ---------------------------------------------------------------------------
# spruce types list
# ---------------------------------------------------------------------------


@respx.mock
def test_types_list_json_happy_path(runner, admin_token_env):
    route = respx.get(f"{TEST_API_URL}/api/types/types/").mock(
        return_value=httpx.Response(
            200,
            json={
                "count": 1,
                "next": None,
                "previous": None,
                "results": [
                    {
                        "id": TYPE_ID,
                        "ifc_type": "IfcWall",
                        "type_name": "Wall-200mm",
                        "properties": {"instance_count": 12},
                    }
                ],
            },
        )
    )

    result = runner.invoke(
        app,
        ["types", "list", "--model", MODEL_ID, "--json"],
    )

    assert result.exit_code == 0, result.stdout
    assert route.called
    request = route.calls.last.request
    assert request.url.params["model"] == MODEL_ID
    assert request.url.params["page_size"] == "100"
    assert request.headers["Authorization"] == f"Bearer {TEST_TOKEN}"
    payload = json.loads(result.stdout)
    assert payload["count"] == 1
    assert payload["results"][0]["id"] == TYPE_ID


@respx.mock
def test_types_list_include_unused_flag(runner, admin_token_env):
    route = respx.get(f"{TEST_API_URL}/api/types/types/").mock(
        return_value=httpx.Response(200, json={"count": 0, "results": []})
    )

    result = runner.invoke(
        app,
        ["types", "list", "--model", MODEL_ID, "--include-unused", "--json"],
    )

    assert result.exit_code == 0, result.stdout
    assert route.calls.last.request.url.params["include_unused"] == "true"


@respx.mock
def test_types_list_without_token_omits_auth_header(runner):
    route = respx.get(f"{TEST_API_URL}/api/types/types/").mock(
        return_value=httpx.Response(200, json={"count": 0, "results": []})
    )

    result = runner.invoke(
        app,
        ["types", "list", "--model", MODEL_ID, "--json"],
    )

    assert result.exit_code == 0, result.stdout
    assert "Authorization" not in route.calls.last.request.headers


# ---------------------------------------------------------------------------
# spruce types classify
# ---------------------------------------------------------------------------


@respx.mock
def test_types_classify_posts_bulk_update_payload(runner, admin_token_env):
    route = respx.post(f"{TEST_API_URL}/api/types/type-mappings/bulk-update/").mock(
        return_value=httpx.Response(
            200,
            json={"updated": 1, "created": 0, "errors": []},
        )
    )

    result = runner.invoke(
        app,
        [
            "types", "classify",
            "--model", MODEL_ID,
            "--type", TYPE_ID,
            "--ns3451", "222",
            "--unit", "m2",
            "--json",
        ],
    )

    assert result.exit_code == 0, result.stdout
    assert route.called
    request = route.calls.last.request
    body = json.loads(request.content.decode())
    assert body == {
        "mappings": [
            {
                "ifc_type_id": TYPE_ID,
                "ns3451_code": "222",
                "representative_unit": "m2",
            }
        ]
    }
    assert "dry_run" not in request.url.params
    assert request.headers["Authorization"] == f"Bearer {TEST_TOKEN}"


@respx.mock
def test_types_classify_dry_run_sets_query_param(runner, admin_token_env):
    route = respx.post(f"{TEST_API_URL}/api/types/type-mappings/bulk-update/").mock(
        return_value=httpx.Response(200, json={"dry_run": True})
    )

    result = runner.invoke(
        app,
        [
            "types", "classify",
            "--model", MODEL_ID,
            "--type", TYPE_ID,
            "--ns3451", "222",
            "--dry-run",
            "--json",
        ],
    )

    assert result.exit_code == 0, result.stdout
    assert route.calls.last.request.url.params["dry_run"] == "true"


def test_types_classify_requires_at_least_one_field(runner, admin_token_env):
    result = runner.invoke(
        app,
        [
            "types", "classify",
            "--model", MODEL_ID,
            "--type", TYPE_ID,
            "--json",
        ],
    )

    assert result.exit_code == 2
    payload = json.loads(result.stdout)
    assert payload["error"] == "invalid_args"


# ---------------------------------------------------------------------------
# spruce types export
# ---------------------------------------------------------------------------


@respx.mock
def test_types_export_excel_json_metadata_mode(runner, admin_token_env):
    binary_body = b"PK\x03\x04fake-xlsx-bytes"
    route = respx.get(f"{TEST_API_URL}/api/types/types/export-excel/").mock(
        return_value=httpx.Response(
            200,
            content=binary_body,
            headers={
                "content-type": (
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                ),
                "content-disposition": 'attachment; filename="types.xlsx"',
            },
        )
    )

    result = runner.invoke(
        app,
        [
            "types", "export",
            "--model", MODEL_ID,
            "--format", "excel",
            "--json",
        ],
    )

    assert result.exit_code == 0, result.stdout
    assert route.called
    request = route.calls.last.request
    assert request.url.params["model"] == MODEL_ID
    assert request.headers["Authorization"] == f"Bearer {TEST_TOKEN}"
    payload = json.loads(result.stdout)
    assert payload["status"] == "ok"
    assert payload["bytes"] == len(binary_body)
    assert payload["filename"] == "types.xlsx"


@respx.mock
def test_types_export_reduzer_include_unmapped(runner, admin_token_env):
    route = respx.get(f"{TEST_API_URL}/api/types/types/export-reduzer/").mock(
        return_value=httpx.Response(
            200,
            content=b"csv,bytes",
            headers={"content-type": "text/csv"},
        )
    )

    result = runner.invoke(
        app,
        [
            "types", "export",
            "--model", MODEL_ID,
            "--format", "reduzer",
            "--include-unmapped",
            "--json",
        ],
    )

    assert result.exit_code == 0, result.stdout
    assert route.calls.last.request.url.params["include_unmapped"] == "true"


def test_types_export_invalid_format(runner, admin_token_env):
    result = runner.invoke(
        app,
        [
            "types", "export",
            "--model", MODEL_ID,
            "--format", "pdf",
            "--json",
        ],
    )
    assert result.exit_code == 2
    payload = json.loads(result.stdout)
    assert payload["error"] == "invalid_args"


@respx.mock
def test_types_list_http_error_json_output(runner, admin_token_env):
    respx.get(f"{TEST_API_URL}/api/types/types/").mock(
        return_value=httpx.Response(404, json={"detail": "model not found"})
    )

    result = runner.invoke(
        app,
        ["types", "list", "--model", MODEL_ID, "--json"],
    )

    assert result.exit_code == 1
    payload = json.loads(result.stdout)
    assert payload["error"] == "HTTP 404"
    assert payload["body"] == {"detail": "model not found"}
    # Agent-first PR A.2: 404 should suggest a discovery command verbatim
    assert payload["hint"] is not None
    assert "spruce types list" in payload["hint"]

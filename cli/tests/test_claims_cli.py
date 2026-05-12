"""Tests for ``spruce claims``."""
from __future__ import annotations

import json

import httpx
import respx

from spruce.cli import app
from tests.conftest import TEST_API_URL, TEST_TOKEN


CLAIM_ID_1 = "aaaaaaaa-1111-2222-3333-444444444444"
CLAIM_ID_2 = "bbbbbbbb-2222-3333-4444-555555555555"
PROJECT_ID = "99999999-8888-7777-6666-555555555555"
MODEL_ID = "11111111-2222-3333-4444-555555555555"

CLAIMS_URL = f"{TEST_API_URL}/api/types/claims/"


def _sample_claims() -> dict:
    return {
        "count": 2,
        "next": None,
        "previous": None,
        "results": [
            {
                "id": CLAIM_ID_1,
                "claim_type": "rule",
                "status": "unresolved",
                "confidence": 0.92,
                "statement": "All fire walls shall be REI60 minimum.",
                "source_file": MODEL_ID,
                "source_file_name": "spec-document.pdf",
                "source_location": {"page": 3, "paragraph": 2},
                "normalized": {"predicate": "fire_resistance", "subject": "fire_walls", "value": "REI60"},
                "extracted_at": "2026-05-10T12:00:00Z",
                "decided_at": None,
                "rejected_reason": "",
            },
            {
                "id": CLAIM_ID_2,
                "claim_type": "spec",
                "status": "promoted",
                "confidence": 0.75,
                "statement": "Minimum ventilation 7 L/s per person.",
                "source_file": MODEL_ID,
                "source_file_name": "spec-document.pdf",
                "source_location": {"page": 7, "paragraph": 1},
                "normalized": {"predicate": "ventilation", "subject": "per_person", "value": "7 L/s"},
                "extracted_at": "2026-05-10T12:05:00Z",
                "decided_at": "2026-05-10T14:00:00Z",
                "rejected_reason": "",
            },
        ],
    }


def _sample_claim_detail() -> dict:
    return {
        "id": CLAIM_ID_1,
        "claim_type": "rule",
        "status": "unresolved",
        "confidence": 0.92,
        "statement": "All fire walls shall be REI60 minimum.",
        "source_file": MODEL_ID,
        "source_file_name": "spec-document.pdf",
        "source_location": {"page": 3, "paragraph": 2},
        "normalized": {"predicate": "fire_resistance", "subject": "fire_walls", "value": "REI60"},
        "extracted_at": "2026-05-10T12:00:00Z",
        "decided_at": None,
        "rejected_reason": "",
        "config_section": None,
        "config_payload": {},
    }


# ---------------------------------------------------------------------------
# claims list — table + json + filters
# ---------------------------------------------------------------------------


@respx.mock
def test_claims_list_table_mode(runner, admin_token_env):
    route = respx.get(CLAIMS_URL).mock(
        return_value=httpx.Response(200, json=_sample_claims())
    )

    result = runner.invoke(app, ["claims", "list"])

    assert result.exit_code == 0, result.stdout
    assert route.called
    request = route.calls.last.request
    assert request.headers["Authorization"] == f"Bearer {TEST_TOKEN}"
    assert "rule" in result.stdout
    assert "spec" in result.stdout
    assert "unresolved" in result.stdout
    assert "promoted" in result.stdout
    assert "0.92" in result.stdout
    assert "REI60" in result.stdout


@respx.mock
def test_claims_list_json_emits_raw_payload(runner, admin_token_env):
    payload = _sample_claims()
    respx.get(CLAIMS_URL).mock(return_value=httpx.Response(200, json=payload))

    result = runner.invoke(app, ["claims", "list", "--json"])

    assert result.exit_code == 0, result.stdout
    body = json.loads(result.stdout)
    assert body["count"] == 2
    assert body["results"][0]["id"] == CLAIM_ID_1


@respx.mock
def test_claims_list_project_filter(runner, admin_token_env):
    route = respx.get(CLAIMS_URL).mock(
        return_value=httpx.Response(200, json={"count": 0, "results": []})
    )

    result = runner.invoke(app, ["claims", "list", "--project", PROJECT_ID, "--json"])

    assert result.exit_code == 0, result.stdout
    assert route.calls.last.request.url.params["project"] == PROJECT_ID


@respx.mock
def test_claims_list_model_filter_maps_to_source_file(runner, admin_token_env):
    route = respx.get(CLAIMS_URL).mock(
        return_value=httpx.Response(200, json={"count": 0, "results": []})
    )

    result = runner.invoke(app, ["claims", "list", "--model", MODEL_ID, "--json"])

    assert result.exit_code == 0, result.stdout
    assert route.calls.last.request.url.params["source_file"] == MODEL_ID


@respx.mock
def test_claims_list_status_filter(runner, admin_token_env):
    route = respx.get(CLAIMS_URL).mock(
        return_value=httpx.Response(200, json={"count": 0, "results": []})
    )

    result = runner.invoke(app, ["claims", "list", "--status", "unresolved", "--json"])

    assert result.exit_code == 0, result.stdout
    assert route.calls.last.request.url.params["status"] == "unresolved"


@respx.mock
def test_claims_list_claim_type_filter(runner, admin_token_env):
    route = respx.get(CLAIMS_URL).mock(
        return_value=httpx.Response(200, json={"count": 0, "results": []})
    )

    result = runner.invoke(app, ["claims", "list", "--claim-type", "rule", "--json"])

    assert result.exit_code == 0, result.stdout
    assert route.calls.last.request.url.params["claim_type"] == "rule"


@respx.mock
def test_claims_list_min_confidence_filter(runner, admin_token_env):
    route = respx.get(CLAIMS_URL).mock(
        return_value=httpx.Response(200, json={"count": 0, "results": []})
    )

    result = runner.invoke(app, ["claims", "list", "--min-confidence", "0.7", "--json"])

    assert result.exit_code == 0, result.stdout
    assert route.calls.last.request.url.params["min_confidence"] == "0.7"


@respx.mock
def test_claims_list_empty_shows_no_claims(runner, admin_token_env):
    respx.get(CLAIMS_URL).mock(
        return_value=httpx.Response(200, json={"count": 0, "results": []})
    )

    result = runner.invoke(app, ["claims", "list"])

    assert result.exit_code == 0, result.stdout
    assert "no claims" in result.stdout


@respx.mock
def test_claims_list_without_token_omits_auth_header(runner):
    route = respx.get(CLAIMS_URL).mock(
        return_value=httpx.Response(200, json={"count": 0, "results": []})
    )

    result = runner.invoke(app, ["claims", "list", "--json"])

    assert result.exit_code == 0, result.stdout
    assert "Authorization" not in route.calls.last.request.headers


@respx.mock
def test_claims_list_http_500_surfaces_error_json(runner, admin_token_env):
    respx.get(CLAIMS_URL).mock(
        return_value=httpx.Response(500, json={"detail": "server error"})
    )

    result = runner.invoke(app, ["claims", "list", "--json"])

    assert result.exit_code == 1
    payload = json.loads(result.stdout)
    assert payload["error"] == "HTTP 500"


# ---------------------------------------------------------------------------
# claims show
# ---------------------------------------------------------------------------


@respx.mock
def test_claims_show_table_mode(runner, admin_token_env):
    detail_url = f"{CLAIMS_URL}{CLAIM_ID_1}/"
    respx.get(detail_url).mock(
        return_value=httpx.Response(200, json=_sample_claim_detail())
    )

    result = runner.invoke(app, ["claims", "show", CLAIM_ID_1])

    assert result.exit_code == 0, result.stdout
    assert "unresolved" in result.stdout
    assert "REI60" in result.stdout
    assert "0.920" in result.stdout


@respx.mock
def test_claims_show_json_mode(runner, admin_token_env):
    detail_url = f"{CLAIMS_URL}{CLAIM_ID_1}/"
    respx.get(detail_url).mock(
        return_value=httpx.Response(200, json=_sample_claim_detail())
    )

    result = runner.invoke(app, ["claims", "show", CLAIM_ID_1, "--json"])

    assert result.exit_code == 0, result.stdout
    body = json.loads(result.stdout)
    assert body["id"] == CLAIM_ID_1
    assert body["claim_type"] == "rule"


@respx.mock
def test_claims_show_404_surfaces_error(runner, admin_token_env):
    detail_url = f"{CLAIMS_URL}nonexistent-id/"
    respx.get(detail_url).mock(
        return_value=httpx.Response(404, json={"detail": "Not found."})
    )

    result = runner.invoke(app, ["claims", "show", "nonexistent-id", "--json"])

    assert result.exit_code == 1
    payload = json.loads(result.stdout)
    assert payload["error"] == "HTTP 404"


# ---------------------------------------------------------------------------
# claims promote
# ---------------------------------------------------------------------------


@respx.mock
def test_claims_promote_success(runner, admin_token_env):
    promote_url = f"{CLAIMS_URL}{CLAIM_ID_1}/promote/"
    route = respx.post(promote_url).mock(
        return_value=httpx.Response(
            200,
            json={
                "status": "promoted",
                "claim_id": CLAIM_ID_1,
                "config_section": "claim_derived_rules",
            },
        )
    )

    result = runner.invoke(app, ["claims", "promote", CLAIM_ID_1])

    assert result.exit_code == 0, result.stdout
    assert route.called
    request = route.calls.last.request
    assert request.method == "POST"
    # No dry_run param on real promote
    assert "dry_run" not in request.url.params
    assert "Promoted" in result.stdout
    assert "promoted" in result.stdout


@respx.mock
def test_claims_promote_json_mode(runner, admin_token_env):
    promote_url = f"{CLAIMS_URL}{CLAIM_ID_1}/promote/"
    respx.post(promote_url).mock(
        return_value=httpx.Response(
            200,
            json={"status": "promoted", "claim_id": CLAIM_ID_1},
        )
    )

    result = runner.invoke(app, ["claims", "promote", CLAIM_ID_1, "--json"])

    assert result.exit_code == 0, result.stdout
    body = json.loads(result.stdout)
    assert body["status"] == "promoted"


@respx.mock
def test_claims_promote_dry_run_appends_query_param(runner, admin_token_env):
    promote_url = f"{CLAIMS_URL}{CLAIM_ID_1}/promote/"
    route = respx.post(promote_url).mock(
        return_value=httpx.Response(
            200,
            json={"dry_run": True, "status": "unresolved", "would_promote": True},
        )
    )

    result = runner.invoke(app, ["claims", "promote", CLAIM_ID_1, "--dry-run"])

    assert result.exit_code == 0, result.stdout
    assert route.calls.last.request.url.params["dry_run"] == "true"
    assert "dry run" in result.stdout.lower()


@respx.mock
def test_claims_promote_409_conflict(runner, admin_token_env):
    promote_url = f"{CLAIMS_URL}{CLAIM_ID_1}/promote/"
    respx.post(promote_url).mock(
        return_value=httpx.Response(409, json={"error": "Claim already promoted"})
    )

    result = runner.invoke(app, ["claims", "promote", CLAIM_ID_1, "--json"])

    assert result.exit_code == 1
    payload = json.loads(result.stdout)
    assert payload["error"] == "HTTP 409"


# ---------------------------------------------------------------------------
# claims reject
# ---------------------------------------------------------------------------


@respx.mock
def test_claims_reject_success(runner, admin_token_env):
    reject_url = f"{CLAIMS_URL}{CLAIM_ID_1}/reject/"
    route = respx.post(reject_url).mock(
        return_value=httpx.Response(
            200,
            json={"status": "rejected", "claim_id": CLAIM_ID_1, "rejected_reason": "out of scope"},
        )
    )

    result = runner.invoke(
        app, ["claims", "reject", CLAIM_ID_1, "--reason", "out of scope"]
    )

    assert result.exit_code == 0, result.stdout
    assert route.called
    request = route.calls.last.request
    assert request.method == "POST"
    body = json.loads(request.content.decode())
    assert body["reason"] == "out of scope"
    # No dry_run param on real reject
    assert "dry_run" not in request.url.params
    assert "Rejected" in result.stdout


@respx.mock
def test_claims_reject_json_mode(runner, admin_token_env):
    reject_url = f"{CLAIMS_URL}{CLAIM_ID_1}/reject/"
    respx.post(reject_url).mock(
        return_value=httpx.Response(
            200,
            json={"status": "rejected", "claim_id": CLAIM_ID_1},
        )
    )

    result = runner.invoke(
        app,
        ["claims", "reject", CLAIM_ID_1, "--reason", "superseded by EIR update", "--json"],
    )

    assert result.exit_code == 0, result.stdout
    body = json.loads(result.stdout)
    assert body["status"] == "rejected"


@respx.mock
def test_claims_reject_dry_run_appends_query_param(runner, admin_token_env):
    reject_url = f"{CLAIMS_URL}{CLAIM_ID_1}/reject/"
    route = respx.post(reject_url).mock(
        return_value=httpx.Response(
            200,
            json={"dry_run": True, "status": "unresolved", "would_reject": True},
        )
    )

    result = runner.invoke(
        app,
        ["claims", "reject", CLAIM_ID_1, "--reason", "test reason", "--dry-run"],
    )

    assert result.exit_code == 0, result.stdout
    assert route.calls.last.request.url.params["dry_run"] == "true"
    assert "dry run" in result.stdout.lower()


@respx.mock
def test_claims_reject_requires_reason(runner, admin_token_env):
    """--reason is required; omitting it should exit non-zero before any HTTP call."""
    route = respx.post(f"{CLAIMS_URL}{CLAIM_ID_1}/reject/").mock(
        return_value=httpx.Response(200, json={})
    )

    result = runner.invoke(app, ["claims", "reject", CLAIM_ID_1])

    # Typer exits 2 when required option is missing
    assert result.exit_code != 0
    assert route.call_count == 0

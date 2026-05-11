"""Tests for ``spruce webhooks``."""
from __future__ import annotations

import json
import os
import stat
from pathlib import Path

import httpx
import respx

from spruce.cli import app
from tests.conftest import TEST_API_URL, TEST_TOKEN


SUB_ID_1 = "11111111-2222-3333-4444-555555555555"
SUB_ID_2 = "22222222-3333-4444-5555-666666666666"
DEL_ID_1 = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
PROJECT_ID = "99999999-8888-7777-6666-555555555555"

SUBSCRIPTIONS_URL = f"{TEST_API_URL}/api/automation/webhook-subscriptions/"
DELIVERIES_URL = f"{TEST_API_URL}/api/automation/webhook-deliveries/"


def _sample_subscriptions() -> dict:
    return {
        "count": 2,
        "next": None,
        "previous": None,
        "results": [
            {
                "id": SUB_ID_1,
                "project": PROJECT_ID,
                "project_name": "Proj A",
                "event_type": "model.processed",
                "target_url": "https://hooks.example.com/sprucelab",
                "description": "",
                "is_active": True,
                "consecutive_failures": 0,
                "last_fired_at": "2026-05-10T14:00:00Z",
                "created_at": "2026-05-01T08:00:00Z",
                "updated_at": "2026-05-10T14:00:00Z",
            },
            {
                "id": SUB_ID_2,
                "project": None,
                "project_name": None,
                "event_type": "claim.extracted",
                "target_url": "https://very-long.example.com/some/path/that/keeps/going",
                "description": "",
                "is_active": False,
                "consecutive_failures": 5,
                "last_fired_at": None,
                "created_at": "2026-05-02T08:00:00Z",
                "updated_at": "2026-05-09T10:00:00Z",
            },
        ],
    }


# ---------------------------------------------------------------------------
# list — table + json + project filter
# ---------------------------------------------------------------------------


@respx.mock
def test_webhooks_list_table_mode(runner, admin_token_env):
    route = respx.get(SUBSCRIPTIONS_URL).mock(
        return_value=httpx.Response(200, json=_sample_subscriptions())
    )

    result = runner.invoke(app, ["webhooks", "list"])

    assert result.exit_code == 0, result.stdout
    assert route.called
    request = route.calls.last.request
    assert request.url.params["page_size"] == "100"
    assert "project" not in request.url.params
    assert request.headers["Authorization"] == f"Bearer {TEST_TOKEN}"
    assert "model.processed" in result.stdout
    assert "claim.extracted" in result.stdout
    # Enabled/disabled rendering
    assert "yes" in result.stdout
    assert "no" in result.stdout


@respx.mock
def test_webhooks_list_json_emits_raw_payload(runner, admin_token_env):
    payload = _sample_subscriptions()
    respx.get(SUBSCRIPTIONS_URL).mock(
        return_value=httpx.Response(200, json=payload)
    )

    result = runner.invoke(app, ["webhooks", "list", "--json"])

    assert result.exit_code == 0, result.stdout
    body = json.loads(result.stdout)
    assert body["count"] == 2
    assert body["results"][0]["id"] == SUB_ID_1


@respx.mock
def test_webhooks_list_project_filter(runner, admin_token_env):
    route = respx.get(SUBSCRIPTIONS_URL).mock(
        return_value=httpx.Response(200, json={"count": 0, "results": []})
    )

    result = runner.invoke(
        app, ["webhooks", "list", "--project", PROJECT_ID, "--json"]
    )

    assert result.exit_code == 0, result.stdout
    request = route.calls.last.request
    assert request.url.params["project"] == PROJECT_ID


@respx.mock
def test_webhooks_list_without_token_omits_auth_header(runner):
    route = respx.get(SUBSCRIPTIONS_URL).mock(
        return_value=httpx.Response(200, json={"count": 0, "results": []})
    )

    result = runner.invoke(app, ["webhooks", "list", "--json"])

    assert result.exit_code == 0, result.stdout
    assert "Authorization" not in route.calls.last.request.headers


@respx.mock
def test_webhooks_list_http_500_json_surfacing(runner, admin_token_env):
    respx.get(SUBSCRIPTIONS_URL).mock(
        return_value=httpx.Response(500, json={"detail": "boom"})
    )

    result = runner.invoke(app, ["webhooks", "list", "--json"])

    assert result.exit_code == 1
    payload = json.loads(result.stdout)
    assert payload["error"] == "HTTP 500"


# ---------------------------------------------------------------------------
# create — success, dry-run, secret-out
# ---------------------------------------------------------------------------


@respx.mock
def test_webhooks_create_success_prints_secret(runner, admin_token_env):
    route = respx.post(SUBSCRIPTIONS_URL).mock(
        return_value=httpx.Response(
            201,
            json={
                "id": SUB_ID_1,
                "project": None,
                "event_type": "model.processed",
                "target_url": "https://hooks.example.com/x",
                "is_active": True,
                "secret": "supersecrettoken-XYZ123",
            },
        )
    )

    result = runner.invoke(
        app,
        [
            "webhooks", "create",
            "--url", "https://hooks.example.com/x",
            "--events", "model.processed",
        ],
    )

    assert result.exit_code == 0, result.stdout
    assert route.called
    request = route.calls.last.request
    assert request.method == "POST"
    assert "dry_run" not in request.url.params
    body = json.loads(request.content.decode())
    assert body["event_type"] == "model.processed"
    assert body["target_url"] == "https://hooks.example.com/x"
    # Secret echoed once
    assert "supersecrettoken-XYZ123" in result.stdout


@respx.mock
def test_webhooks_create_dry_run_appends_query_param(runner, admin_token_env):
    route = respx.post(SUBSCRIPTIONS_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "dry_run": True,
                "would_create": {
                    "event_type": "model.processed",
                    "target_url": "https://hooks.example.com/x",
                    "project": None,
                },
                "note": (
                    "HMAC secret is generated only on real create — "
                    "callers must perform a non-dry-run POST to obtain it."
                ),
            },
        )
    )

    result = runner.invoke(
        app,
        [
            "webhooks", "create",
            "--url", "https://hooks.example.com/x",
            "--events", "model.processed",
            "--dry-run",
        ],
    )

    assert result.exit_code == 0, result.stdout
    request = route.calls.last.request
    assert request.url.params["dry_run"] == "true"
    # Banner is visible, secret is not (would_create has no secret)
    assert "dry run" in result.stdout.lower()
    assert "supersecret" not in result.stdout.lower()


@respx.mock
def test_webhooks_create_secret_out_writes_file_0600(runner, admin_token_env, tmp_path: Path):
    respx.post(SUBSCRIPTIONS_URL).mock(
        return_value=httpx.Response(
            201,
            json={
                "id": SUB_ID_1,
                "event_type": "model.processed",
                "target_url": "https://hooks.example.com/x",
                "is_active": True,
                "secret": "secret-from-file-test-456",
            },
        )
    )

    secret_path = tmp_path / "webhook.secret"
    result = runner.invoke(
        app,
        [
            "webhooks", "create",
            "--url", "https://hooks.example.com/x",
            "--events", "model.processed",
            "--secret-out", str(secret_path),
        ],
    )

    assert result.exit_code == 0, result.stdout
    # File exists with correct content
    assert secret_path.exists()
    assert secret_path.read_text().strip() == "secret-from-file-test-456"
    # 0600 perms
    file_mode = stat.S_IMODE(os.stat(secret_path).st_mode)
    assert file_mode == 0o600
    # Stdout MUST NOT echo the secret
    assert "secret-from-file-test-456" not in result.stdout


@respx.mock
def test_webhooks_create_multi_event_creates_each(runner, admin_token_env):
    """``--events a,b`` creates one subscription per event type."""
    route = respx.post(SUBSCRIPTIONS_URL).mock(
        return_value=httpx.Response(
            201,
            json={
                "id": SUB_ID_1,
                "event_type": "x",
                "target_url": "https://hooks.example.com/x",
                "is_active": True,
                "secret": "s",
            },
        )
    )

    result = runner.invoke(
        app,
        [
            "webhooks", "create",
            "--url", "https://hooks.example.com/x",
            "--events", "model.processed,claim.extracted",
            "--json",
        ],
    )

    assert result.exit_code == 0, result.stdout
    assert route.call_count == 2
    posted_events = [
        json.loads(c.request.content.decode())["event_type"] for c in route.calls
    ]
    assert posted_events == ["model.processed", "claim.extracted"]


# ---------------------------------------------------------------------------
# disable / enable
# ---------------------------------------------------------------------------


@respx.mock
def test_webhooks_disable_patches_is_active_false(runner, admin_token_env):
    detail_url = f"{SUBSCRIPTIONS_URL}{SUB_ID_1}/"
    route = respx.patch(detail_url).mock(
        return_value=httpx.Response(
            200,
            json={"id": SUB_ID_1, "is_active": False},
        )
    )

    result = runner.invoke(app, ["webhooks", "disable", SUB_ID_1, "--json"])

    assert result.exit_code == 0, result.stdout
    request = route.calls.last.request
    assert request.method == "PATCH"
    body = json.loads(request.content.decode())
    assert body == {"is_active": False}


@respx.mock
def test_webhooks_disable_enable_flag_patches_is_active_true(runner, admin_token_env):
    detail_url = f"{SUBSCRIPTIONS_URL}{SUB_ID_1}/"
    route = respx.patch(detail_url).mock(
        return_value=httpx.Response(
            200,
            json={"id": SUB_ID_1, "is_active": True},
        )
    )

    result = runner.invoke(app, ["webhooks", "disable", SUB_ID_1, "--enable", "--json"])

    assert result.exit_code == 0, result.stdout
    body = json.loads(route.calls.last.request.content.decode())
    assert body == {"is_active": True}


# ---------------------------------------------------------------------------
# delete — confirm unless --yes
# ---------------------------------------------------------------------------


@respx.mock
def test_webhooks_delete_requires_confirm_when_not_yes(runner, admin_token_env):
    """Without --yes and with 'n' on stdin, no DELETE is sent."""
    route = respx.delete(f"{SUBSCRIPTIONS_URL}{SUB_ID_1}/").mock(
        return_value=httpx.Response(204)
    )

    # Decline the interactive prompt
    result = runner.invoke(app, ["webhooks", "delete", SUB_ID_1], input="n\n")

    assert result.exit_code != 0
    assert route.call_count == 0


@respx.mock
def test_webhooks_delete_yes_skips_confirm(runner, admin_token_env):
    route = respx.delete(f"{SUBSCRIPTIONS_URL}{SUB_ID_1}/").mock(
        return_value=httpx.Response(204)
    )

    result = runner.invoke(app, ["webhooks", "delete", SUB_ID_1, "--yes", "--json"])

    assert result.exit_code == 0, result.stdout
    assert route.call_count == 1


# ---------------------------------------------------------------------------
# deliveries — table + json + status filter
# ---------------------------------------------------------------------------


def _sample_deliveries() -> dict:
    return {
        "count": 2,
        "next": None,
        "previous": None,
        "results": [
            {
                "id": DEL_ID_1,
                "subscription": SUB_ID_1,
                "subscription_event_type": "model.processed",
                "event_type": "model.processed",
                "target_url": "https://hooks.example.com/x",
                "status": "success",
                "attempt_count": 1,
                "response_status_code": 200,
                "response_body": "",
                "error": "",
                "created_at": "2026-05-10T14:00:00Z",
                "last_attempt_at": "2026-05-10T14:00:01Z",
                "completed_at": "2026-05-10T14:00:02Z",
                "payload": {"event": "model.processed"},
            },
            {
                "id": "bbbbbbbb-cccc-dddd-eeee-ffffffffffff",
                "subscription": SUB_ID_2,
                "subscription_event_type": "claim.extracted",
                "event_type": "claim.extracted",
                "target_url": "https://example.com/bad",
                "status": "failed",
                "attempt_count": 3,
                "response_status_code": 502,
                "response_body": "Bad gateway",
                "error": "upstream returned 502",
                "created_at": "2026-05-10T15:00:00Z",
                "last_attempt_at": "2026-05-10T15:00:30Z",
                "completed_at": None,
                "payload": {},
            },
        ],
    }


@respx.mock
def test_webhooks_deliveries_table_mode(runner, admin_token_env):
    respx.get(DELIVERIES_URL).mock(
        return_value=httpx.Response(200, json=_sample_deliveries())
    )

    result = runner.invoke(app, ["webhooks", "deliveries"])

    assert result.exit_code == 0, result.stdout
    assert "success" in result.stdout
    assert "failed" in result.stdout
    assert "200" in result.stdout
    assert "502" in result.stdout


@respx.mock
def test_webhooks_deliveries_json_and_status_filter(runner, admin_token_env):
    route = respx.get(DELIVERIES_URL).mock(
        return_value=httpx.Response(200, json={"count": 0, "results": []})
    )

    result = runner.invoke(
        app,
        ["webhooks", "deliveries", "--status", "failed", "--json"],
    )

    assert result.exit_code == 0, result.stdout
    request = route.calls.last.request
    assert request.url.params["status"] == "failed"
    body = json.loads(result.stdout)
    assert body["count"] == 0


@respx.mock
def test_webhooks_deliveries_subscription_filter(runner, admin_token_env):
    route = respx.get(DELIVERIES_URL).mock(
        return_value=httpx.Response(200, json={"count": 0, "results": []})
    )

    result = runner.invoke(
        app,
        ["webhooks", "deliveries", "--subscription", SUB_ID_1, "--json"],
    )

    assert result.exit_code == 0, result.stdout
    assert route.calls.last.request.url.params["subscription"] == SUB_ID_1


# ---------------------------------------------------------------------------
# redeliver — success + missing-endpoint
# ---------------------------------------------------------------------------


@respx.mock
def test_webhooks_redeliver_success(runner, admin_token_env):
    url = f"{DELIVERIES_URL}{DEL_ID_1}/redeliver/"
    route = respx.post(url).mock(
        return_value=httpx.Response(
            202,
            json={"id": "new-delivery-id", "status": "pending"},
        )
    )

    result = runner.invoke(app, ["webhooks", "redeliver", DEL_ID_1, "--json"])

    assert result.exit_code == 0, result.stdout
    assert route.called
    body = json.loads(result.stdout)
    assert body["status"] == "pending"


@respx.mock
def test_webhooks_redeliver_handles_missing_endpoint(runner, admin_token_env):
    """If the redeliver action doesn't exist (404/405), exit cleanly with code 2."""
    url = f"{DELIVERIES_URL}{DEL_ID_1}/redeliver/"
    respx.post(url).mock(return_value=httpx.Response(405, json={"detail": "method not allowed"}))

    result = runner.invoke(app, ["webhooks", "redeliver", DEL_ID_1, "--json"])

    assert result.exit_code == 2
    payload = json.loads(result.stdout)
    assert "not implemented" in payload["error"].lower()


# ---------------------------------------------------------------------------
# test — success + missing-endpoint
# ---------------------------------------------------------------------------


@respx.mock
def test_webhooks_test_success(runner, admin_token_env):
    url = f"{SUBSCRIPTIONS_URL}{SUB_ID_1}/test/"
    route = respx.post(url).mock(
        return_value=httpx.Response(
            202,
            json={"delivery_id": DEL_ID_1, "status": "queued"},
        )
    )

    result = runner.invoke(app, ["webhooks", "test", SUB_ID_1, "--json"])

    assert result.exit_code == 0, result.stdout
    assert route.called
    body = json.loads(result.stdout)
    assert body["status"] == "queued"


@respx.mock
def test_webhooks_test_handles_missing_endpoint(runner, admin_token_env):
    url = f"{SUBSCRIPTIONS_URL}{SUB_ID_1}/test/"
    respx.post(url).mock(return_value=httpx.Response(404, json={"detail": "no such route"}))

    result = runner.invoke(app, ["webhooks", "test", SUB_ID_1, "--json"])

    assert result.exit_code == 2
    payload = json.loads(result.stdout)
    assert "not implemented" in payload["error"].lower() or "missing" in payload["error"].lower()

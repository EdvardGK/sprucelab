"""
Unit tests for ``cli/spruce/_errors.py`` — the verbatim "Try: ..." hints
that every command's HTTP error path runs through.

Design rule (`feedback-agent-first-or-die`): every error message should
suggest the next command verbatim. These tests pin the contract so a
future refactor can't silently drop a hint.
"""
from __future__ import annotations

import json
from unittest.mock import MagicMock

import httpx
import pytest
import typer
from rich.console import Console

from spruce._errors import (
    format_http_error_hint,
    format_request_error_hint,
    print_http_error,
    print_request_error,
)


# ---------------------------------------------------------------------------
# format_http_error_hint — the pure function. No I/O, no Console.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize('status', [401, 403])
def test_auth_status_suggests_register(status):
    hint = format_http_error_hint(status, 'models list')
    assert hint is not None
    assert 'spruce auth register' in hint
    assert '--token' in hint


def test_404_for_models_suggests_models_list():
    hint = format_http_error_hint(404, 'models list')
    assert hint is not None
    assert 'spruce models list' in hint


def test_404_for_types_suggests_types_list():
    hint = format_http_error_hint(404, 'types list')
    assert hint is not None
    assert 'spruce types list' in hint


def test_404_for_verify_suggests_models_list():
    hint = format_http_error_hint(404, 'verify')
    assert hint is not None
    # verify takes a --model UUID, so listing models is the recovery path
    assert 'spruce models list' in hint


def test_404_for_scripts_run_suggests_scripts_list():
    hint = format_http_error_hint(404, 'scripts run')
    assert hint is not None
    assert 'spruce scripts list' in hint


def test_404_for_webhooks_deliveries_suggests_deliveries():
    hint = format_http_error_hint(404, 'webhooks deliveries')
    assert hint is not None
    assert 'spruce webhooks deliveries' in hint


def test_404_for_webhooks_redeliver_suggests_deliveries():
    hint = format_http_error_hint(404, 'webhooks redeliver')
    assert hint is not None
    assert 'spruce webhooks deliveries' in hint


def test_404_for_webhooks_test_suggests_webhooks_list():
    hint = format_http_error_hint(404, 'webhooks test')
    assert hint is not None
    assert 'spruce webhooks list' in hint


def test_404_for_embed_pass_revoke_suggests_pass_list():
    hint = format_http_error_hint(404, 'embed pass revoke')
    assert hint is not None
    assert 'spruce embed pass list' in hint


def test_404_for_log_suggests_log_list():
    hint = format_http_error_hint(404, 'log list')
    assert hint is not None
    assert 'spruce log list' in hint


def test_404_for_unknown_context_falls_back_to_capabilities():
    hint = format_http_error_hint(404, 'frobnicate')
    assert hint is not None
    assert 'spruce capabilities' in hint


def test_400_validation_error_suggests_help():
    hint = format_http_error_hint(400, 'types classify')
    assert hint is not None
    assert 'spruce types classify --help' in hint


def test_422_validation_error_suggests_help():
    hint = format_http_error_hint(422, 'webhooks create')
    assert hint is not None
    assert 'spruce webhooks create --help' in hint


@pytest.mark.parametrize('status', [500, 502, 503, 504])
def test_5xx_suggests_jq_inspection(status):
    hint = format_http_error_hint(status, 'verify')
    assert hint is not None
    assert 'spruce verify --json' in hint
    assert 'jq' in hint


def test_405_suggests_capabilities_check():
    hint = format_http_error_hint(405, 'webhooks redeliver')
    assert hint is not None
    assert 'spruce capabilities' in hint


def test_unknown_status_returns_none():
    """A status with no matching rule returns None so callers can skip the hint line."""
    assert format_http_error_hint(418, 'models list') is None


# ---------------------------------------------------------------------------
# format_request_error_hint — connection / DNS / timeout
# ---------------------------------------------------------------------------


def test_request_error_hint_mentions_config_and_url_override():
    hint = format_request_error_hint()
    assert 'spruce config show' in hint
    assert 'SPRUCE_API_URL' in hint or 'spruce auth register --url' in hint


# ---------------------------------------------------------------------------
# print_http_error — JSON shape contract
# ---------------------------------------------------------------------------


def _http_status_error(status: int, body: object) -> httpx.HTTPStatusError:
    """Build a real httpx.HTTPStatusError around a fake response."""
    request = httpx.Request('GET', 'http://test.local/api/whatever/')
    if isinstance(body, (dict, list)):
        response = httpx.Response(status, json=body, request=request)
    else:
        response = httpx.Response(status, text=str(body), request=request)
    return httpx.HTTPStatusError(f'HTTP {status}', request=request, response=response)


def test_print_http_error_json_shape_has_error_status_body_hint(capsys):
    err = _http_status_error(401, {'detail': 'bad token'})
    console = Console()
    with pytest.raises(typer.Exit):
        print_http_error(console, err, json_out=True, command_context='models list')
    captured = capsys.readouterr()
    payload = json.loads(captured.out)
    assert payload['error'] == 'HTTP 401'
    assert payload['status'] == 401
    assert payload['body'] == {'detail': 'bad token'}
    assert payload['hint'] is not None
    assert 'spruce auth register' in payload['hint']


def test_print_http_error_json_5xx_includes_jq_hint(capsys):
    err = _http_status_error(500, {'detail': 'boom'})
    console = Console()
    with pytest.raises(typer.Exit):
        print_http_error(console, err, json_out=True, command_context='verify')
    payload = json.loads(capsys.readouterr().out)
    assert payload['status'] == 500
    assert 'jq' in payload['hint']


def test_print_http_error_json_unknown_status_emits_null_hint(capsys):
    err = _http_status_error(418, 'teapot')
    console = Console()
    with pytest.raises(typer.Exit):
        print_http_error(console, err, json_out=True, command_context='models list')
    payload = json.loads(capsys.readouterr().out)
    assert payload['hint'] is None
    # body falls back to text when not JSON
    assert payload['body'] == 'teapot'


def test_print_http_error_human_mode_emits_try_hint():
    """In human mode the hint should be rendered as a Try: line."""
    err = _http_status_error(401, {'detail': 'bad token'})
    console = Console(record=True, width=200)
    with pytest.raises(typer.Exit):
        print_http_error(console, err, json_out=False, command_context='models list')
    text = console.export_text()
    assert 'HTTP 401' in text
    assert 'Try:' in text
    assert 'spruce auth register' in text


# ---------------------------------------------------------------------------
# print_request_error — connection-failed path
# ---------------------------------------------------------------------------


def test_print_request_error_json_shape_includes_hint(capsys):
    err = httpx.ConnectError('dns failure')
    console = Console()
    with pytest.raises(typer.Exit):
        print_request_error(console, err, json_out=True, command_context='models list')
    payload = json.loads(capsys.readouterr().out)
    assert payload['error'] == 'request_failed'
    assert 'dns failure' in payload['detail']
    assert payload['hint'] is not None
    assert 'spruce config show' in payload['hint']


def test_print_request_error_human_mode_emits_try_hint():
    err = httpx.ConnectError('refused')
    console = Console(record=True, width=200)
    with pytest.raises(typer.Exit):
        print_request_error(console, err, json_out=False, command_context='models list')
    text = console.export_text()
    assert 'Request failed' in text
    assert 'Try:' in text
    assert 'spruce config show' in text

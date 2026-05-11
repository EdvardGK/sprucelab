"""
`spruce capabilities` CLI tests.

The command hits a public, unauthenticated endpoint, so no token plumbing
is required — just mock httpx and assert output shape.
"""
from __future__ import annotations

import json
from unittest.mock import patch, MagicMock

import httpx
import pytest
from typer.testing import CliRunner

from spruce.capabilities import app


runner = CliRunner()


def _ok_response(payload: dict) -> MagicMock:
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = 200
    resp.json.return_value = payload
    resp.raise_for_status.return_value = None
    return resp


SAMPLE_MANIFEST = {
    'service': 'sprucelab-django',
    'api_version': '2.4',
    'file_formats': ['ifc', 'pdf', 'dxf', 'docx'],
    'mutations_supporting_dry_run': [
        'POST /api/types/types/verify/',
        'PATCH /api/projects/scopes/{id}/',
    ],
    'events': {
        'wired': ['model.processed', 'verification.complete'],
        'subscription_endpoint': '/api/automation/webhook-subscriptions/',
    },
    'verification': {
        'engine_endpoint': 'POST /api/types/types/verify/',
        'rule_sources': ['DEFAULT_RULES', 'ProjectConfig.config'],
    },
    'embed': {
        'capabilities_endpoint': '/api/embed/capabilities/',
        'instances_endpoint': '/api/embed/instances/',
    },
}


def test_capabilities_human_mode_shows_pitch():
    with patch('spruce.capabilities.httpx.get', return_value=_ok_response(SAMPLE_MANIFEST)):
        result = runner.invoke(app, ['--url', 'https://test.example'])
    assert result.exit_code == 0, result.output
    # Headline shows service + version + URL
    assert 'sprucelab-django' in result.output
    assert '2.4' in result.output
    assert 'https://test.example' in result.output
    # Sections rendered
    assert 'File formats' in result.output
    assert 'ifc' in result.output
    assert 'dry_run=true' in result.output
    # Worked examples included
    assert 'Worked examples' in result.output
    assert 'spruce auth register' in result.output
    assert 'spruce files upload' in result.output
    assert 'spruce log list' in result.output


def test_capabilities_json_mode_is_pure_json():
    with patch('spruce.capabilities.httpx.get', return_value=_ok_response(SAMPLE_MANIFEST)):
        result = runner.invoke(app, ['--url', 'https://test.example', '--json'])
    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload == SAMPLE_MANIFEST


def test_capabilities_connection_error_surfaces_actionable_hint():
    err = httpx.ConnectError("nope")
    with patch('spruce.capabilities.httpx.get', side_effect=err):
        result = runner.invoke(app, ['--url', 'https://nowhere.invalid'])
    assert result.exit_code == 1
    assert 'Connection failed' in result.output
    # The error hint should point at how to fix it.
    assert 'spruce auth register --url' in result.output


def test_capabilities_http_5xx_surfaces_status_and_body():
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = 500
    resp.text = 'oops'
    err = httpx.HTTPStatusError("server error", request=MagicMock(), response=resp)
    bad = MagicMock(spec=httpx.Response)
    bad.raise_for_status.side_effect = err
    with patch('spruce.capabilities.httpx.get', return_value=bad):
        result = runner.invoke(app, ['--url', 'https://test.example'])
    assert result.exit_code == 1
    assert '500' in result.output

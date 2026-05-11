"""
Tests for the agent site-scan discovery surfaces.

These two endpoints exist so agents crawling sprucelab.no can find us
without a human pointing them at docs first:

  GET /.well-known/agent-tools.json — JSON manifest (verbs, endpoints, auth)
  GET /llms.txt                     — plaintext LLM-targeted README

Both must stay public, unthrottled, and additive — pin the contract here.
"""
from __future__ import annotations

import json

import pytest


pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# /.well-known/agent-tools.json
# ---------------------------------------------------------------------------


def test_agent_tools_manifest_is_public(client):
    """Anonymous access — no auth header, no session, no rate-limit error."""
    resp = client.get('/.well-known/agent-tools.json')
    assert resp.status_code == 200


def test_agent_tools_manifest_is_json(client):
    resp = client.get('/.well-known/agent-tools.json')
    # DRF serves application/json by default for @api_view; some test setups
    # see vendor-typed variants — assert the body is parseable JSON either way.
    body = resp.json()
    assert isinstance(body, dict)


def test_agent_tools_manifest_envelope_shape(client):
    body = client.get('/.well-known/agent-tools.json').json()
    # Top-level keys are stable contract — additive changes only.
    assert {'schema_version', 'name', 'tagline', 'homepage',
            'endpoints', 'cli', 'verbs',
            'what_we_extract', 'good_use_cases'} <= set(body.keys())
    assert body['name'] == 'Sprucelab'
    assert body['schema_version']  # non-empty


def test_agent_tools_manifest_endpoints_block(client):
    body = client.get('/.well-known/agent-tools.json').json()
    endpoints = body['endpoints']
    # api_base must be derived from the request, not hardcoded.
    assert endpoints['api_base'].startswith('http')
    assert endpoints['capabilities'] == '/api/capabilities/'
    assert endpoints['embed_capabilities'] == '/api/embed/capabilities/'

    auth = endpoints['auth']
    # Bearer + Authorization header is what AgentTokenAuthentication accepts.
    assert auth['scheme'] == 'Bearer'
    assert auth['header'] == 'Authorization'
    # Registration endpoint must point at the actual mint URL.
    assert auth['register_endpoint'] == '/api/automation/agent/register/'


def test_agent_tools_manifest_advertises_cli_verbs(client):
    body = client.get('/.well-known/agent-tools.json').json()
    verbs = {v['command']: v for v in body['verbs']}

    # Capabilities is the elevator pitch — must be unauth-listed.
    assert 'spruce capabilities' in verbs
    assert verbs['spruce capabilities']['auth'] is False

    # Read verbs that already exist in cli/spruce/.
    assert any(c.startswith('spruce models list') for c in verbs)
    assert any(c.startswith('spruce log list') for c in verbs)
    assert any(c.startswith('spruce verify') for c in verbs)


def test_agent_tools_manifest_lists_extraction_surface(client):
    body = client.get('/.well-known/agent-tools.json').json()
    extraction = body['what_we_extract']
    assert isinstance(extraction, list) and extraction
    joined = '\n'.join(extraction).lower()
    # Sanity: the manifest mentions the file families we actually extract from.
    for token in ('ifc', 'dxf', 'pdf', 'docx'):
        assert token in joined


def test_agent_tools_manifest_uses_request_host_for_api_base(client, settings):
    """api_base reflects the Host the request came in on — Railway-friendly."""
    settings.ALLOWED_HOSTS = list(settings.ALLOWED_HOSTS) + ['sprucelab.example.com']
    resp = client.get(
        '/.well-known/agent-tools.json',
        HTTP_HOST='sprucelab.example.com',
    )
    body = resp.json()
    assert body['endpoints']['api_base'] == 'http://sprucelab.example.com'


# ---------------------------------------------------------------------------
# /llms.txt
# ---------------------------------------------------------------------------


def test_llms_txt_is_public(client):
    resp = client.get('/llms.txt')
    assert resp.status_code == 200


def test_llms_txt_served_as_plain_text(client):
    resp = client.get('/llms.txt')
    # Naive crawlers must not be told to HTML-render this.
    assert resp['Content-Type'].startswith('text/plain')


def test_llms_txt_advertises_discovery_links(client):
    body = client.get('/llms.txt').content.decode('utf-8')
    # Must point agents at the machine-readable discovery surfaces.
    assert '/api/capabilities/' in body
    assert '/.well-known/agent-tools.json' in body
    # And at the CLI catalog command.
    assert 'spruce capabilities' in body
    # Heading present so humans can read it too.
    assert body.startswith('# Sprucelab')


# ---------------------------------------------------------------------------
# Capabilities mirror — discovery block must point at both surfaces.
# ---------------------------------------------------------------------------


def test_capabilities_advertises_discovery_surfaces(client):
    body = client.get('/api/capabilities/').json()
    discovery = body['discovery']
    assert discovery['agent_tools_manifest'] == '/.well-known/agent-tools.json'
    assert discovery['llms_txt'] == '/llms.txt'

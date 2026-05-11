"""
Tests for the public capability manifest endpoint.

The manifest is the discovery surface for agents — they hit it once on
startup to learn supported file formats, dry-run-capable mutations, and
verification rule conventions. This test pins the contract.
"""
from __future__ import annotations

import pytest


pytestmark = pytest.mark.django_db


def test_capabilities_envelope_shape(client):
    resp = client.get('/api/capabilities/')
    assert resp.status_code == 200
    body = resp.json()

    # Top-level keys are stable contract — additive changes only.
    assert set(body.keys()) >= {
        'api_version',
        'service',
        'file_formats',
        'mutations_supporting_dry_run',
        'extraction_pipelines',
        'verification',
    }
    assert body['service'] == 'sprucelab-django'
    assert body['api_version']  # non-empty


def test_capabilities_lists_known_file_formats(client):
    body = client.get('/api/capabilities/').json()
    formats = body['file_formats']
    # Sanity-check a handful of formats Sprucelab definitely supports today.
    assert 'ifc' in formats
    assert 'pdf' in formats
    assert 'xlsx' in formats


def test_capabilities_lists_dry_run_endpoints(client):
    body = client.get('/api/capabilities/').json()
    mutations = body['mutations_supporting_dry_run']
    # Both bulk-update endpoints just gained dry_run support.
    assert any('type-mappings/bulk-update' in m for m in mutations)
    assert any('type-definition-layers/bulk-update' in m for m in mutations)
    # Claim API has had dry_run since Sprint 6.2.
    assert any('claims' in m and 'promote' in m for m in mutations)


def test_capabilities_dry_run_list_is_non_empty_and_includes_known_entries(client):
    """
    Discovery contract: the manifest must list every dry-run-capable mutation
    so agents can plan-then-execute without scraping docs. The list grows
    additively (Track S, etc.) — assert a non-empty floor that includes the
    pre-existing surface, not a hardcoded length.
    """
    body = client.get('/api/capabilities/').json()
    mutations = body['mutations_supporting_dry_run']
    assert isinstance(mutations, list)
    assert len(mutations) >= 3
    assert any('type-mappings/bulk-update' in m for m in mutations)
    assert any('type-definition-layers/bulk-update' in m for m in mutations)
    assert any('claims' in m and 'promote' in m for m in mutations)
    # Newly-added entries from this commit.
    assert any('projects/scopes/' in m for m in mutations)
    assert any('webhook-subscriptions/' in m for m in mutations)


def test_capabilities_lists_saved_filter_dry_run_endpoints(client):
    """
    Round 6 Track CC: SavedFilter create + update gained ?dry_run=true. Pin
    both entries so the manifest stays in sync with the implementation.
    """
    body = client.get('/api/capabilities/').json()
    mutations = body['mutations_supporting_dry_run']
    assert 'POST /api/filters/saved/' in mutations
    assert 'PATCH /api/filters/saved/{id}/' in mutations


def test_capabilities_documents_claim_rule_id_prefix(client):
    body = client.get('/api/capabilities/').json()
    prefixes = body['verification']['rule_id_prefixes']
    assert 'claim:' in prefixes


def test_capabilities_is_public(client):
    # No auth required — capability discovery is itself a feature.
    resp = client.get('/api/capabilities/')
    assert resp.status_code == 200


def test_capabilities_advertises_webhook_events(client):
    body = client.get('/api/capabilities/').json()
    events = body['events']
    assert {'wired', 'planned', 'signing'} <= set(events.keys())
    assert 'model.processed' in events['wired']
    assert 'document.processed' in events['wired']
    assert 'claim.extracted' in events['wired']
    assert 'verification.complete' in events['wired']
    # Planned events advertised so subscribers can opt-in early.
    assert 'types.classified' in events['planned']
    assert 'quantities.extracted' in events['planned']
    assert events['signing'] == 'hmac-sha256'
    assert events['signature_header'] == 'X-Webhook-Signature'
    assert events['subscription_endpoint'] == '/api/automation/webhook-subscriptions/'

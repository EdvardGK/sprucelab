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


def test_capabilities_documents_claim_rule_id_prefix(client):
    body = client.get('/api/capabilities/').json()
    prefixes = body['verification']['rule_id_prefixes']
    assert 'claim:' in prefixes


def test_capabilities_is_public(client):
    # No auth required — capability discovery is itself a feature.
    resp = client.get('/api/capabilities/')
    assert resp.status_code == 200

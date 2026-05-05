"""
Tests for the embed-scoped DRF authentication class + capability gate.

Hits the real `/api/embed/instances/` route via the DRF test client so the
auth class, permission, and throttle wiring are exercised end-to-end. The
default _open_permissions fixture in conftest disables global auth, so we
explicitly re-enable EmbedTokenAuthentication on a per-test basis.
"""
from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.embed.models import EmbedToken
from apps.projects.models import Project


pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def project(db):
    return Project.objects.create(name='embed-auth-test')


@pytest.fixture
def issued(project):
    token, raw = EmbedToken.generate(
        name='t1',
        project=project,
        allowed_origins=['https://x.example'],
        capabilities=['read:instances', 'read:capabilities'],
        ttl_seconds=3600,
    )
    return token, raw


@pytest.fixture
def embed_auth_settings(settings):
    """Re-enable embed auth (the open-permissions fixture nukes it globally)."""
    settings.REST_FRAMEWORK = {
        **settings.REST_FRAMEWORK,
        'DEFAULT_AUTHENTICATION_CLASSES': [
            'apps.embed.authentication.EmbedTokenAuthentication',
        ],
        'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.AllowAny'],
    }
    return settings


@pytest.fixture
def client():
    return APIClient()


# ---------------------------------------------------------------------------
# Auth: header parsing, query-param fallback, missing token
# ---------------------------------------------------------------------------

def test_authorization_embed_header_authenticates(client, embed_auth_settings, issued):
    _, raw = issued
    res = client.get('/api/embed/instances/', HTTP_AUTHORIZATION=f'Embed {raw}')
    assert res.status_code == 200, res.content


def test_query_param_authenticates_when_header_missing(client, embed_auth_settings, issued):
    _, raw = issued
    res = client.get(f'/api/embed/instances/?token={raw}')
    assert res.status_code == 200, res.content


def test_missing_token_returns_401(client, embed_auth_settings):
    res = client.get('/api/embed/instances/')
    # No auth class accepts the request → DRF returns 401 because the view
    # has no auth credentials AND HasEmbedCapability rejects.
    assert res.status_code in (401, 403), res.content


def test_unknown_token_rejected(client, embed_auth_settings):
    res = client.get('/api/embed/instances/', HTTP_AUTHORIZATION='Embed not-a-real-token')
    assert res.status_code == 401, res.content


# ---------------------------------------------------------------------------
# Lifecycle: revoked, expired, capability gate
# ---------------------------------------------------------------------------

def test_revoked_token_rejected(client, embed_auth_settings, issued):
    token, raw = issued
    token.revoke(reason='test')
    res = client.get('/api/embed/instances/', HTTP_AUTHORIZATION=f'Embed {raw}')
    assert res.status_code == 401, res.content


def test_expired_token_rejected(client, embed_auth_settings, issued):
    token, raw = issued
    token.expires_at = timezone.now() - timedelta(seconds=1)
    token.save(update_fields=['expires_at'])
    res = client.get('/api/embed/instances/', HTTP_AUTHORIZATION=f'Embed {raw}')
    assert res.status_code == 401, res.content


def test_missing_capability_returns_403(client, embed_auth_settings, project):
    _, raw = EmbedToken.generate(
        name='no-instances-cap',
        project=project,
        allowed_origins=['x'],
        capabilities=['read:dashboards'],  # not read:instances
    )
    res = client.get('/api/embed/instances/', HTTP_AUTHORIZATION=f'Embed {raw}')
    assert res.status_code == 403, res.content


# ---------------------------------------------------------------------------
# Project scoping: token's project wins; mismatched query param 403s
# ---------------------------------------------------------------------------

def test_project_scope_derived_from_token(client, embed_auth_settings, issued, project):
    _, raw = issued
    res = client.get('/api/embed/instances/', HTTP_AUTHORIZATION=f'Embed {raw}')
    assert res.status_code == 200
    assert res.json()['applied_filters']['project_id'] == str(project.id)


def test_mismatched_project_id_query_param_403s(client, embed_auth_settings, issued):
    _, raw = issued
    res = client.get(
        '/api/embed/instances/?project_id=00000000-0000-0000-0000-000000000000',
        HTTP_AUTHORIZATION=f'Embed {raw}',
    )
    assert res.status_code == 403, res.content


def test_matching_project_id_query_param_passes(client, embed_auth_settings, issued, project):
    _, raw = issued
    res = client.get(
        f'/api/embed/instances/?project_id={project.id}',
        HTTP_AUTHORIZATION=f'Embed {raw}',
    )
    assert res.status_code == 200, res.content


# ---------------------------------------------------------------------------
# last_used_at is updated on success
# ---------------------------------------------------------------------------

def test_last_used_at_updated_on_successful_request(client, embed_auth_settings, issued):
    token, raw = issued
    assert token.last_used_at is None
    res = client.get('/api/embed/instances/', HTTP_AUTHORIZATION=f'Embed {raw}')
    assert res.status_code == 200
    token.refresh_from_db()
    assert token.last_used_at is not None

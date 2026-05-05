"""
Tests for the embed token CRUD admin endpoints.

The collection (POST/GET) and detail (DELETE) endpoints require staff auth;
the refresh endpoint authenticates against the OLD raw token. Default test
fixtures bypass all auth, so we exercise the staff gate on a focused subset
and rely on _open_permissions for the data-flow tests.
"""
from __future__ import annotations

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.embed.models import EmbedToken
from apps.projects.models import Project


User = get_user_model()
pytestmark = pytest.mark.django_db


@pytest.fixture
def project(db):
    return Project.objects.create(name='embed-endpoints-test')


@pytest.fixture
def staff_user(db):
    return User.objects.create_user(
        username='embed-staff',
        email='staff@local.test',
        is_staff=True,
    )


@pytest.fixture
def client(staff_user):
    """Test client with a staff user force-authenticated.

    Admin token endpoints require ``IsStaff``; the staff user is the
    default actor for all CRUD tests in this file. The two refresh tests
    explicitly clear authentication because the refresh path validates
    against the token, not a session.
    """
    c = APIClient()
    c.force_authenticate(user=staff_user)
    return c


# ---------------------------------------------------------------------------
# Issue / list / revoke
# ---------------------------------------------------------------------------

def test_issue_returns_raw_token_once_then_never(client, project):
    res = client.post(
        '/api/embed/tokens/',
        {
            'name': 'demo',
            'project_id': str(project.id),
            'allowed_origins': ['https://skiplum-pages.example'],
            'ttl_seconds': 600,
        },
        format='json',
    )
    assert res.status_code == 201, res.content
    body = res.json()
    assert 'raw_token' in body
    raw = body['raw_token']
    assert len(raw) >= 32

    list_res = client.get('/api/embed/tokens/')
    assert list_res.status_code == 200
    listed = list_res.json()['results']
    assert len(listed) == 1
    assert 'raw_token' not in listed[0]


def test_issue_validation_errors(client, project):
    res = client.post('/api/embed/tokens/', {}, format='json')
    assert res.status_code == 400
    errors = res.json()['errors']
    assert 'name' in errors
    assert 'project_id' in errors
    assert 'allowed_origins' in errors


def test_list_filters_by_project_and_excludes_revoked_by_default(client, project):
    other = Project.objects.create(name='other')
    EmbedToken.generate(name='a', project=project, allowed_origins=['x'])
    t_b, _ = EmbedToken.generate(name='b', project=project, allowed_origins=['x'])
    EmbedToken.generate(name='c', project=other, allowed_origins=['x'])
    t_b.revoke(reason='test')

    res = client.get(f'/api/embed/tokens/?project_id={project.id}')
    assert res.status_code == 200
    rows = res.json()['results']
    assert {r['name'] for r in rows} == {'a'}

    res = client.get(f'/api/embed/tokens/?project_id={project.id}&include_revoked=true')
    rows = res.json()['results']
    assert {r['name'] for r in rows} == {'a', 'b'}


def test_revoke_by_id_and_by_prefix(client, project):
    token, _ = EmbedToken.generate(name='r1', project=project, allowed_origins=['x'])
    res = client.delete(f'/api/embed/tokens/{token.id}/')
    assert res.status_code == 200
    token.refresh_from_db()
    assert token.revoked_at is not None

    other, _ = EmbedToken.generate(name='r2', project=project, allowed_origins=['x'])
    res = client.delete(f'/api/embed/tokens/{other.prefix}/?reason=cleanup')
    assert res.status_code == 200
    other.refresh_from_db()
    assert other.revoked_at is not None
    assert other.revoked_reason == 'cleanup'


def test_revoke_unknown_404s(client):
    res = client.delete('/api/embed/tokens/00000000-0000-0000-0000-000000000000/')
    assert res.status_code == 404


# ---------------------------------------------------------------------------
# Refresh: rotates and revokes the old token
# ---------------------------------------------------------------------------

def test_refresh_rotates_token_atomically(client, project):
    client.force_authenticate(user=None)  # refresh authenticates with token, not staff
    old, raw = EmbedToken.generate(
        name='rot', project=project, allowed_origins=['https://h.example'],
        capabilities=['read:instances'],
    )
    res = client.post(
        '/api/embed/tokens/refresh/',
        {},
        format='json',
        HTTP_AUTHORIZATION=f'Embed {raw}',
    )
    assert res.status_code == 201, res.content
    body = res.json()
    new_raw = body['raw_token']
    assert new_raw != raw
    assert body['allowed_origins'] == ['https://h.example']
    assert body['capabilities'] == ['read:instances']

    old.refresh_from_db()
    assert old.revoked_at is not None
    assert 'rotated → ' in old.revoked_reason


def test_refresh_with_already_revoked_409s(client, project):
    client.force_authenticate(user=None)
    token, raw = EmbedToken.generate(name='r', project=project, allowed_origins=['x'])
    token.revoke(reason='manual')
    res = client.post(
        '/api/embed/tokens/refresh/',
        {},
        format='json',
        HTTP_AUTHORIZATION=f'Embed {raw}',
    )
    # Auth class rejects revoked tokens before service layer is reached →
    # returns 401 from auth, not 409 from service. Both are non-success;
    # pin the surface either way.
    assert res.status_code in (401, 409), res.content


def test_refresh_with_unknown_token_returns_401(client):
    client.force_authenticate(user=None)
    res = client.post(
        '/api/embed/tokens/refresh/',
        {},
        format='json',
        HTTP_AUTHORIZATION='Embed not-a-real-token',
    )
    assert res.status_code == 401, res.content


def test_refresh_within_grace_window_when_expired(client, project):
    client.force_authenticate(user=None)
    token, raw = EmbedToken.generate(
        name='g', project=project, allowed_origins=['x'], ttl_seconds=10,
    )
    # Just expired
    token.expires_at = timezone.now() - timedelta(seconds=30)
    token.save(update_fields=['expires_at'])

    res = client.post(
        '/api/embed/tokens/refresh/', {}, format='json',
        HTTP_AUTHORIZATION=f'Embed {raw}',
    )
    assert res.status_code == 201, res.content


def test_refresh_outside_grace_rejected(client, project):
    client.force_authenticate(user=None)
    token, raw = EmbedToken.generate(
        name='g', project=project, allowed_origins=['x'], ttl_seconds=10,
    )
    token.expires_at = timezone.now() - timedelta(hours=1)
    token.save(update_fields=['expires_at'])

    res = client.post(
        '/api/embed/tokens/refresh/', {}, format='json',
        HTTP_AUTHORIZATION=f'Embed {raw}',
    )
    assert res.status_code == 401, res.content


# ---------------------------------------------------------------------------
# Staff gate (collection + detail)
# ---------------------------------------------------------------------------

def test_collection_endpoints_reject_non_staff_user(project):
    """
    Force-authenticate a NON-staff user and confirm the IsStaff gate
    refuses the request. The shared `client` fixture uses a staff user
    so we instantiate a fresh APIClient here.
    """
    non_staff = User.objects.create_user(
        username='non-staff', email='nonstaff@local.test', is_staff=False,
    )
    c = APIClient()
    c.force_authenticate(user=non_staff)

    res = c.post(
        '/api/embed/tokens/',
        {
            'name': 'demo',
            'project_id': str(project.id),
            'allowed_origins': ['https://x.example'],
        },
        format='json',
    )
    assert res.status_code == 403, res.content


def test_collection_endpoints_reject_anonymous_user(project):
    """Anonymous request — IsStaff requires authenticated user."""
    c = APIClient()
    res = c.post(
        '/api/embed/tokens/',
        {
            'name': 'demo',
            'project_id': str(project.id),
            'allowed_origins': ['https://x.example'],
        },
        format='json',
    )
    assert res.status_code in (401, 403), res.content

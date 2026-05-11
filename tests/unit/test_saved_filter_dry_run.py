"""
Tests for ``?dry_run=true`` on the SavedFilter API surface.

SavedFilter is part of the agent-first mutation surface (advertised via the
capabilities manifest), so dry-run lets agents validate scope + payload +
permission gating without leaving phantom filters behind.

Mirrors the pattern in ``test_project_scope_dry_run.py`` and
``test_webhook_subscription_dry_run.py``.
"""
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.filters.models import SavedFilter


User = get_user_model()
pytestmark = pytest.mark.django_db


@pytest.fixture
def alice(db):
    return User.objects.create_user(username='alice-df', email='alice-df@local.test')


def _client(user) -> APIClient:
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def _personal_payload(user, **overrides):
    body = {
        'scope': 'personal',
        'owner_user': user.id,
        'name': 'Plan-then-execute filter',
        'description': 'preview test',
        'payload': {'classes': ['IfcWall']},
    }
    body.update(overrides)
    return body


# ---------------------------------------------------------------------------
# POST /api/filters/saved/?dry_run=true
# ---------------------------------------------------------------------------

def test_create_dry_run_does_not_persist(alice):
    c = _client(alice)
    res = c.post(
        '/api/filters/saved/?dry_run=true',
        _personal_payload(alice),
        format='json',
    )
    assert res.status_code == 200, res.json()
    body = res.json()
    assert body['dry_run'] is True
    assert body['would_create']['scope'] == 'personal'
    assert body['would_create']['name'] == 'Plan-then-execute filter'
    # owner_user is normalized to the request user (serialized as pk).
    assert body['would_create']['owner_user'] == str(alice.id)
    # JSONField round-trips as-is.
    assert body['would_create']['payload'] == {'classes': ['IfcWall']}

    assert SavedFilter.objects.count() == 0


def test_create_default_persists(alice):
    c = _client(alice)
    res = c.post(
        '/api/filters/saved/',
        _personal_payload(alice),
        format='json',
    )
    assert res.status_code == 201, res.json()
    body = res.json()
    # Default path returns the standard create envelope, not the dry-run shape.
    assert 'dry_run' not in body
    assert body['name'] == 'Plan-then-execute filter'
    assert SavedFilter.objects.count() == 1


def test_create_dry_run_invalid_input_returns_400(alice):
    """
    Per feedback-bad-models-are-the-product, dry-run with invalid input
    surfaces validation errors as data (400 + standard field-error shape),
    not a crash.
    """
    c = _client(alice)
    res = c.post(
        '/api/filters/saved/?dry_run=true',
        _personal_payload(alice, scope='nonsense'),
        format='json',
    )
    assert res.status_code == 400
    assert 'scope' in res.json()
    assert SavedFilter.objects.count() == 0


def test_create_dry_run_false_string_persists(alice):
    """Explicit ``dry_run=false`` should behave like the absent param."""
    c = _client(alice)
    res = c.post(
        '/api/filters/saved/?dry_run=false',
        _personal_payload(alice, name='real-write'),
        format='json',
    )
    assert res.status_code == 201, res.json()
    assert 'dry_run' not in res.json()
    assert SavedFilter.objects.filter(name='real-write').exists()


# ---------------------------------------------------------------------------
# PATCH /api/filters/saved/{id}/?dry_run=true
# ---------------------------------------------------------------------------

def test_partial_update_dry_run_does_not_persist(alice):
    f = SavedFilter.objects.create(
        scope='personal',
        owner_user=alice,
        name='original-name',
        payload={'q': 1},
        created_by=alice,
    )
    c = _client(alice)
    res = c.patch(
        f'/api/filters/saved/{f.id}/?dry_run=true',
        {'name': 'previewed-name', 'description': 'preview only'},
        format='json',
    )
    assert res.status_code == 200, res.json()
    body = res.json()
    assert body['dry_run'] is True
    assert body['id'] == str(f.id)
    assert body['would_update']['name'] == 'previewed-name'
    assert body['would_update']['description'] == 'preview only'

    f.refresh_from_db()
    assert f.name == 'original-name'
    assert f.description == ''


def test_partial_update_default_persists(alice):
    f = SavedFilter.objects.create(
        scope='personal',
        owner_user=alice,
        name='original-name',
        payload={'q': 1},
        created_by=alice,
    )
    c = _client(alice)
    res = c.patch(
        f'/api/filters/saved/{f.id}/',
        {'name': 'committed-name'},
        format='json',
    )
    assert res.status_code == 200, res.json()
    body = res.json()
    assert 'dry_run' not in body
    assert body['name'] == 'committed-name'

    f.refresh_from_db()
    assert f.name == 'committed-name'


def test_partial_update_dry_run_invalid_input_returns_400(alice):
    f = SavedFilter.objects.create(
        scope='personal',
        owner_user=alice,
        name='original-name',
        payload={'q': 1},
        created_by=alice,
    )
    c = _client(alice)
    # `name` is required to be <= 120 chars; send a too-long one.
    res = c.patch(
        f'/api/filters/saved/{f.id}/?dry_run=true',
        {'name': 'x' * 200},
        format='json',
    )
    assert res.status_code == 400
    assert 'name' in res.json()
    f.refresh_from_db()
    assert f.name == 'original-name'

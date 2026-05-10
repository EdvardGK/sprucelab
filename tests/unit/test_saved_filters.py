"""
Unit tests for the SavedFilter primitive (apps/filters).

Covers:
  - SavedFilter CRUD per scope (personal / company / project)
  - Permission gates (cross-user isolation, staff-only writes for
    company / project scopes)
  - DB-level CheckConstraint enforcement (scope vs owner mismatch)
  - PinnedFilter create / list / unique
  - FilterAnnouncement acknowledgement idempotence
  - FilterLibrary + Subscription mark-seen flow

Auth model: the `_open_permissions` autouse fixture in tests/conftest.py
sets DEFAULT_PERMISSION_CLASSES=AllowAny, which only matters for views
that *don't* declare their own permission_classes. Our viewsets pin
``permission_classes = [IsAuthenticated]`` directly, so auth still gates
this app even with the open-permissions override in place.
"""
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from rest_framework.test import APIClient

from apps.filters.models import (
    FilterAnnouncement,
    FilterLibrary,
    FilterLibrarySubscription,
    PinnedFilter,
    SavedFilter,
)
from apps.projects.models import Project


User = get_user_model()
pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def alice(db):
    return User.objects.create_user(username='alice', email='alice@local.test')


@pytest.fixture
def bob(db):
    return User.objects.create_user(username='bob', email='bob@local.test')


@pytest.fixture
def staff(db):
    return User.objects.create_user(
        username='admin', email='admin@local.test', is_staff=True,
    )


@pytest.fixture
def project(db):
    return Project.objects.create(name='filters-test', description='pytest')


def _client(user) -> APIClient:
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def _personal_payload(user, name='My filter'):
    return {
        'scope': 'personal',
        'owner_user': user.id,
        'name': name,
        'payload': {'classes': ['IfcWall']},
    }


def _company_payload(name='Co filter'):
    return {
        'scope': 'company',
        'owner_company': 'acme-corp',
        'name': name,
        'payload': {'classes': ['IfcSlab']},
    }


def _project_payload(project, name='Proj filter'):
    return {
        'scope': 'project',
        'owner_project': str(project.id),
        'name': name,
        'payload': {'classes': ['IfcBeam']},
    }


# ---------------------------------------------------------------------------
# Personal-scope CRUD + cross-user isolation
# ---------------------------------------------------------------------------

def test_personal_filter_create_and_list(alice):
    c = _client(alice)
    res = c.post('/api/filters/saved/', _personal_payload(alice), format='json')
    assert res.status_code == 201, res.json()
    assert res.json()['scope'] == 'personal'
    assert res.json()['owner_user'] == alice.id

    listing = c.get('/api/filters/saved/').json()
    assert listing['count'] == 1
    assert listing['results'][0]['name'] == 'My filter'


def test_personal_filter_isolated_from_other_users(alice, bob):
    SavedFilter.objects.create(
        scope='personal', owner_user=alice, name='alice-only',
        payload={'q': 1}, created_by=alice,
    )
    SavedFilter.objects.create(
        scope='personal', owner_user=bob, name='bob-only',
        payload={'q': 2}, created_by=bob,
    )

    body = _client(alice).get('/api/filters/saved/').json()
    names = [r['name'] for r in body['results']]
    assert names == ['alice-only']


def test_user_cannot_modify_other_users_personal_filter(alice, bob):
    f = SavedFilter.objects.create(
        scope='personal', owner_user=alice, name='alice-private',
        payload={'q': 1}, created_by=alice,
    )

    res = _client(bob).patch(
        f'/api/filters/saved/{f.id}/',
        {'name': 'pwned'},
        format='json',
    )
    # Bob can't see it (queryset filtered) → 404. Either 403 or 404 is
    # acceptable; we just want "not modified".
    assert res.status_code in (403, 404)
    f.refresh_from_db()
    assert f.name == 'alice-private'


def test_user_cannot_delete_other_users_personal_filter(alice, bob):
    f = SavedFilter.objects.create(
        scope='personal', owner_user=alice, name='alice-private',
        payload={'q': 1}, created_by=alice,
    )
    res = _client(bob).delete(f'/api/filters/saved/{f.id}/')
    assert res.status_code in (403, 404)
    assert SavedFilter.objects.filter(pk=f.id).exists()


# ---------------------------------------------------------------------------
# Company-scope permission gate
# ---------------------------------------------------------------------------

def test_non_admin_cannot_create_company_filter(alice):
    res = _client(alice).post('/api/filters/saved/', _company_payload(), format='json')
    assert res.status_code == 403


def test_admin_can_create_company_filter(staff):
    res = _client(staff).post('/api/filters/saved/', _company_payload(), format='json')
    assert res.status_code == 201, res.json()
    assert res.json()['scope'] == 'company'
    assert res.json()['owner_company'] == 'acme-corp'


def test_company_filter_visible_to_all_authenticated(alice, staff):
    SavedFilter.objects.create(
        scope='company', owner_company='acme-corp', name='shared-co',
        payload={}, created_by=staff,
    )
    body = _client(alice).get('/api/filters/saved/').json()
    names = [r['name'] for r in body['results']]
    assert 'shared-co' in names


# ---------------------------------------------------------------------------
# Project-scope permission gate
# ---------------------------------------------------------------------------

def test_non_staff_cannot_create_project_filter(alice, project):
    res = _client(alice).post(
        '/api/filters/saved/', _project_payload(project), format='json',
    )
    assert res.status_code == 403


def test_staff_can_create_project_filter(staff, project):
    res = _client(staff).post(
        '/api/filters/saved/', _project_payload(project), format='json',
    )
    assert res.status_code == 201, res.json()
    body = res.json()
    assert body['scope'] == 'project'
    assert body['owner_project'] == str(project.id)


# ---------------------------------------------------------------------------
# DB-level CheckConstraint
# ---------------------------------------------------------------------------

def test_db_constraint_rejects_personal_with_company_owner(alice):
    """A personal-scope filter must not also carry owner_company."""
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            SavedFilter.objects.create(
                scope='personal',
                owner_user=alice,
                owner_company='should-not-be-set',
                name='bad',
                payload={},
            )


def test_db_constraint_rejects_company_without_owner_company(alice):
    """A company-scope filter must have non-empty owner_company."""
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            SavedFilter.objects.create(
                scope='company',
                owner_company='',
                name='bad',
                payload={},
            )


def test_db_constraint_rejects_project_with_owner_user(alice, project):
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            SavedFilter.objects.create(
                scope='project',
                owner_project=project,
                owner_user=alice,
                name='bad',
                payload={},
            )


# ---------------------------------------------------------------------------
# PinnedFilter
# ---------------------------------------------------------------------------

def test_pin_create_list_reorder(alice):
    f1 = SavedFilter.objects.create(
        scope='personal', owner_user=alice, name='f1',
        payload={}, created_by=alice,
    )
    f2 = SavedFilter.objects.create(
        scope='personal', owner_user=alice, name='f2',
        payload={}, created_by=alice,
    )
    c = _client(alice)
    r1 = c.post('/api/filters/pinned/',
                {'saved_filter': str(f1.id), 'position': 0}, format='json')
    r2 = c.post('/api/filters/pinned/',
                {'saved_filter': str(f2.id), 'position': 1}, format='json')
    assert r1.status_code == 201
    assert r2.status_code == 201

    listing = c.get('/api/filters/pinned/').json()
    assert listing['count'] == 2

    # Reorder: bump f2 to position 0.
    pin2_id = r2.json()['id']
    res = c.patch(f'/api/filters/pinned/{pin2_id}/',
                  {'position': 0}, format='json')
    assert res.status_code == 200
    assert res.json()['position'] == 0


def test_pin_unique_constraint(alice):
    f = SavedFilter.objects.create(
        scope='personal', owner_user=alice, name='f',
        payload={}, created_by=alice,
    )
    PinnedFilter.objects.create(user=alice, saved_filter=f, position=0)
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            PinnedFilter.objects.create(user=alice, saved_filter=f, position=1)


def test_pin_isolated_per_user(alice, bob):
    f = SavedFilter.objects.create(
        scope='personal', owner_user=alice, name='f',
        payload={}, created_by=alice,
    )
    PinnedFilter.objects.create(user=alice, saved_filter=f, position=0)

    body = _client(bob).get('/api/filters/pinned/').json()
    assert body['count'] == 0


# ---------------------------------------------------------------------------
# Announcement acknowledgement idempotence
# ---------------------------------------------------------------------------

def test_announcement_acknowledge_idempotent(alice, staff):
    # Staff creates a company-scope filter and an announcement on it.
    f = SavedFilter.objects.create(
        scope='company', owner_company='acme', name='shared',
        payload={}, created_by=staff,
    )
    ann = FilterAnnouncement.objects.create(
        saved_filter=f, title='Heads up', body='Use this.',
        created_by=staff,
    )

    c = _client(alice)
    r1 = c.post(f'/api/filters/announcements/{ann.id}/acknowledge/')
    r2 = c.post(f'/api/filters/announcements/{ann.id}/acknowledge/')

    assert r1.status_code == 201
    assert r2.status_code == 200  # idempotent: second call returns existing
    # Same acknowledgement row in both responses.
    assert r1.json()['id'] == r2.json()['id']


# ---------------------------------------------------------------------------
# FilterLibrary + Subscription
# ---------------------------------------------------------------------------

def test_library_mark_seen_flow(alice, staff):
    lib = FilterLibrary.objects.create(
        scope='company', owner_company='acme', name='Corp library',
        version=3, created_by=staff,
    )

    res = _client(alice).post(f'/api/filters/libraries/{lib.id}/mark-seen/')
    assert res.status_code == 200
    body = res.json()
    assert body['last_seen_version'] == 3
    assert body['library'] == str(lib.id)

    # Subscription persisted with alice as subscriber_user.
    sub = FilterLibrarySubscription.objects.get(library=lib, subscriber_user=alice)
    assert sub.last_seen_version == 3

    # Bumping the library version + re-marking updates last_seen_version.
    lib.version = 5
    lib.save(update_fields=['version'])
    res2 = _client(alice).post(f'/api/filters/libraries/{lib.id}/mark-seen/')
    assert res2.status_code == 200
    sub.refresh_from_db()
    assert sub.last_seen_version == 5


def test_unauthenticated_request_denied():
    """Sanity: viewset rejects anon even with the open-permissions override."""
    c = APIClient()  # no force_authenticate
    res = c.get('/api/filters/saved/')
    # IsAuthenticated returns 403 for unauthenticated by default in DRF.
    assert res.status_code in (401, 403)

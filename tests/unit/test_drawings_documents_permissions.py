"""
PR 2.3 — Permissions gating on Drawing / Document / TitleBlock ViewSets.

The autouse `_open_permissions` fixture in tests/conftest.py overrides DRF's
default permission classes to AllowAny so the data-pipeline tests don't have
to wire auth. These tests *opt out* by re-pinning the real defaults so we can
verify the explicit ``permission_classes = [IsApprovedUser]`` we added to
DrawingSheetViewSet, TitleBlockTemplateViewSet, and DocumentContentViewSet.

What we assert:
  - approved user can list / retrieve / mutate
  - unauthenticated requests get 403 (DRF default with no auth)
  - authenticated user without an approved UserProfile gets 403
  - cross-project mutations are NOT blocked by these gates today (no
    ProjectMember model exists yet — see apps.filters.views for the same
    caveat). We assert the current behaviour explicitly so a future PR that
    adds per-project membership has a failing test to flip.
"""
from __future__ import annotations

import uuid

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.accounts.models import UserProfile
from apps.entities.models import DocumentContent, DrawingSheet, TitleBlockTemplate
from apps.models.models import ExtractionRun, SourceFile
from apps.projects.models import Project


User = get_user_model()
pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Re-enable real permissions for this module only.
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _real_permissions(settings, monkeypatch):
    """
    Override the project-wide `_open_permissions` fixture so DRF actually
    enforces our ViewSets' ``permission_classes`` declarations.

    The conftest fixture monkey-patches the three ViewSets' permission_classes
    to AllowAny so the data-pipeline tests don't have to wire auth. We undo
    that here by re-pinning ``IsApprovedUser`` directly on each ViewSet.

    We don't reinstate authentication classes (Supabase JWT requires a live
    Supabase, which isn't available in CI). Tests use APIClient.force_authenticate
    instead of issuing real tokens.
    """
    from apps.accounts.permissions import IsApprovedUser
    from apps.entities.views.documents import DocumentContentViewSet
    from apps.entities.views.drawings import (
        DrawingSheetViewSet,
        TitleBlockTemplateViewSet,
    )

    settings.REST_FRAMEWORK = {
        **getattr(settings, 'REST_FRAMEWORK', {}),
        'DEFAULT_PERMISSION_CLASSES': [
            'apps.accounts.permissions.IsApprovedUser',
        ],
        'DEFAULT_AUTHENTICATION_CLASSES': [],
        'DEFAULT_THROTTLE_CLASSES': [],
        'DEFAULT_THROTTLE_RATES': {},
    }
    for vs in (DrawingSheetViewSet, TitleBlockTemplateViewSet, DocumentContentViewSet):
        monkeypatch.setattr(vs, 'permission_classes', [IsApprovedUser])


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _approved(user) -> UserProfile:
    return UserProfile.objects.create(
        user=user,
        supabase_id=uuid.uuid4(),
        approval_status=UserProfile.APPROVAL_APPROVED,
    )


def _pending(user) -> UserProfile:
    return UserProfile.objects.create(
        user=user,
        supabase_id=uuid.uuid4(),
        approval_status=UserProfile.APPROVAL_PENDING,
    )


@pytest.fixture
def approved_user(db):
    user = User.objects.create_user(username='approved', email='approved@local.test')
    _approved(user)
    return user


@pytest.fixture
def pending_user(db):
    user = User.objects.create_user(username='pending', email='pending@local.test')
    _pending(user)
    return user


@pytest.fixture
def project(db):
    return Project.objects.create(name='perm-test-project')


@pytest.fixture
def other_project(db):
    return Project.objects.create(name='perm-test-other-project')


@pytest.fixture
def source_file(project):
    return SourceFile.objects.create(
        project=project, original_filename='A101.pdf', format='pdf', file_size=1,
    )


@pytest.fixture
def extraction_run(source_file):
    return ExtractionRun.objects.create(source_file=source_file, status='completed')


@pytest.fixture
def sheet(source_file, extraction_run):
    return DrawingSheet.objects.create(
        source_file=source_file,
        extraction_run=extraction_run,
        page_index=0,
        sheet_number='A101',
        raw_metadata={'is_drawing': True},
    )


@pytest.fixture
def document(source_file, extraction_run):
    return DocumentContent.objects.create(
        source_file=source_file,
        extraction_run=extraction_run,
        page_index=0,
        markdown_content='# spec',
        extraction_method='text_layer',
    )


@pytest.fixture
def title_block(project):
    return TitleBlockTemplate.objects.create(
        project=project, name='A1 default', fields=[],
    )


def _client(user=None) -> APIClient:
    c = APIClient()
    if user is not None:
        c.force_authenticate(user=user)
    return c


# ---------------------------------------------------------------------------
# DrawingSheet — read-only ViewSet
# ---------------------------------------------------------------------------

def test_drawings_list_requires_authentication(sheet):
    res = _client().get('/api/types/drawings/')
    assert res.status_code == 403


def test_drawings_list_blocks_unapproved(pending_user, sheet):
    res = _client(pending_user).get('/api/types/drawings/')
    assert res.status_code == 403


def test_drawings_list_allows_approved(approved_user, sheet):
    res = _client(approved_user).get('/api/types/drawings/')
    assert res.status_code == 200
    rows = res.json()
    rows = rows['results'] if isinstance(rows, dict) and 'results' in rows else rows
    assert any(r['id'] == str(sheet.id) for r in rows)


def test_drawings_register_blocks_unapproved(pending_user, sheet):
    res = _client(pending_user).post(
        f'/api/types/drawings/{sheet.id}/register/',
        data={}, format='json',
    )
    assert res.status_code == 403


def test_drawings_register_blocks_anonymous(sheet):
    res = _client().post(
        f'/api/types/drawings/{sheet.id}/register/',
        data={}, format='json',
    )
    assert res.status_code == 403


# ---------------------------------------------------------------------------
# DocumentContent — read-only ViewSet
# ---------------------------------------------------------------------------

def test_documents_list_requires_authentication(document):
    res = _client().get('/api/types/documents/')
    assert res.status_code == 403


def test_documents_list_blocks_unapproved(pending_user, document):
    res = _client(pending_user).get('/api/types/documents/')
    assert res.status_code == 403


def test_documents_list_allows_approved(approved_user, document):
    res = _client(approved_user).get('/api/types/documents/')
    assert res.status_code == 200
    rows = res.json()
    rows = rows['results'] if isinstance(rows, dict) and 'results' in rows else rows
    assert any(r['id'] == str(document.id) for r in rows)


def test_documents_content_action_blocks_unapproved(pending_user, document):
    res = _client(pending_user).get(f'/api/types/documents/{document.id}/content/')
    assert res.status_code == 403


# ---------------------------------------------------------------------------
# TitleBlockTemplate — full CRUD
# ---------------------------------------------------------------------------

def test_title_block_list_requires_authentication(title_block):
    res = _client().get('/api/types/title-block-templates/')
    assert res.status_code == 403


def test_title_block_list_blocks_unapproved(pending_user, title_block):
    res = _client(pending_user).get('/api/types/title-block-templates/')
    assert res.status_code == 403


def test_title_block_list_allows_approved(approved_user, title_block):
    res = _client(approved_user).get('/api/types/title-block-templates/')
    assert res.status_code == 200
    rows = res.json()
    rows = rows['results'] if isinstance(rows, dict) and 'results' in rows else rows
    assert any(r['id'] == str(title_block.id) for r in rows)


def test_title_block_create_blocks_anonymous(project):
    res = _client().post(
        '/api/types/title-block-templates/',
        data={'project': str(project.id), 'name': 'anon', 'fields': []},
        format='json',
    )
    assert res.status_code == 403
    assert not TitleBlockTemplate.objects.filter(name='anon').exists()


def test_title_block_create_blocks_unapproved(pending_user, project):
    res = _client(pending_user).post(
        '/api/types/title-block-templates/',
        data={'project': str(project.id), 'name': 'pending', 'fields': []},
        format='json',
    )
    assert res.status_code == 403
    assert not TitleBlockTemplate.objects.filter(name='pending').exists()


def test_title_block_create_allows_approved(approved_user, project):
    res = _client(approved_user).post(
        '/api/types/title-block-templates/',
        data={'project': str(project.id), 'name': 'approved', 'fields': []},
        format='json',
    )
    assert res.status_code == 201, res.content
    assert TitleBlockTemplate.objects.filter(name='approved').exists()


def test_title_block_delete_blocks_unapproved(pending_user, title_block):
    res = _client(pending_user).delete(
        f'/api/types/title-block-templates/{title_block.id}/',
    )
    assert res.status_code == 403
    assert TitleBlockTemplate.objects.filter(pk=title_block.pk).exists()


# ---------------------------------------------------------------------------
# Cross-project mutation: NOT yet gated (no ProjectMember model).
#
# This test pins current behaviour so the future PR that introduces
# per-project membership will fail it intentionally and have to flip the
# expectation.
# ---------------------------------------------------------------------------

def test_title_block_cross_project_create_currently_allowed(approved_user, other_project):
    """
    Today an approved user can create a TitleBlockTemplate in any project
    they aren't a member of, because there's no ProjectMember model yet.
    Filters/views.py documents the same caveat.
    """
    res = _client(approved_user).post(
        '/api/types/title-block-templates/',
        data={'project': str(other_project.id), 'name': 'cross-project', 'fields': []},
        format='json',
    )
    assert res.status_code == 201

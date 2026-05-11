"""
Duplicate-upload UX on POST /api/files/.

Covers `?on_duplicate=` query param:
  - error_409 (default) — 409 + existing_file payload, no storage write, no re-extract
  - use_existing — 200 with existing payload, no re-extract
  - replace — bumps version, runs extraction
  - invalid value — 400
"""
from __future__ import annotations

import io
from unittest.mock import patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.models.models import SourceFile
from apps.projects.models import Project


@pytest.fixture
def project(db):
    return Project.objects.create(name="dup-upload")


@pytest.fixture
def api_client():
    return APIClient()


def _upload(api_client, project, content: bytes, filename: str, on_duplicate: str | None = None):
    """POST /api/files/ multipart. _dispatch_extraction is patched to a no-op."""
    upload = SimpleUploadedFile(filename, content, content_type='application/pdf')
    params = f'?on_duplicate={on_duplicate}' if on_duplicate else ''
    url = f'/api/files/{params}'
    with patch('apps.models.files_views.SourceFileViewSet._dispatch_extraction', return_value=None):
        return api_client.post(
            url,
            {'file': upload, 'project_id': str(project.id)},
            format='multipart',
        )


def test_first_upload_creates_201(api_client, project):
    resp = _upload(api_client, project, b'\x25PDF-1.4 content', 'sheet.pdf')
    assert resp.status_code == 201, resp.content
    assert SourceFile.objects.filter(project=project).count() == 1


def test_duplicate_returns_200_with_duplicate_flag(api_client, project):
    _upload(api_client, project, b'\x25PDF-1.4 same', 'sheet.pdf')
    resp = _upload(api_client, project, b'\x25PDF-1.4 same', 'sheet.pdf')
    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert body['duplicate'] is True
    assert body['existing_file']['original_filename'] == 'sheet.pdf'
    assert 'detail' in body
    assert SourceFile.objects.filter(project=project).count() == 1


def test_use_existing_returns_200_no_new_row(api_client, project):
    first = _upload(api_client, project, b'\x25PDF-1.4 same', 'sheet.pdf')
    assert first.status_code == 201
    resp = _upload(
        api_client, project, b'\x25PDF-1.4 same', 'sheet.pdf',
        on_duplicate='use_existing',
    )
    assert resp.status_code == 200, resp.content
    assert resp.json()['id'] == first.json()['id']
    assert SourceFile.objects.filter(project=project).count() == 1


def test_replace_bumps_version(api_client, project):
    first = _upload(api_client, project, b'\x25PDF-1.4 same', 'sheet.pdf')
    assert first.status_code == 201
    resp = _upload(
        api_client, project, b'\x25PDF-1.4 same', 'sheet.pdf',
        on_duplicate='replace',
    )
    assert resp.status_code == 201, resp.content
    assert SourceFile.objects.filter(project=project).count() == 2
    versions = list(
        SourceFile.objects.filter(project=project, original_filename='sheet.pdf')
        .order_by('version_number')
        .values_list('version_number', flat=True)
    )
    assert versions == [1, 2]


def test_invalid_on_duplicate_returns_400(api_client, project):
    resp = _upload(api_client, project, b'\x25PDF', 'sheet.pdf', on_duplicate='nope')
    assert resp.status_code == 400, resp.content
    body = resp.json()
    assert body['error'] == 'invalid_on_duplicate'
    assert 'ask' in body['allowed']


def test_different_bytes_same_name_creates_new_version_default(api_client, project):
    """Different bytes with the same filename should bump version (existing behavior)."""
    first = _upload(api_client, project, b'\x25PDF version one', 'sheet.pdf')
    assert first.status_code == 201
    resp = _upload(api_client, project, b'\x25PDF version two', 'sheet.pdf')
    assert resp.status_code == 201, resp.content
    assert SourceFile.objects.filter(project=project).count() == 2

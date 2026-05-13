"""Tests for the ``backfill_thumbnails`` Django management command.

Mocks the ifc-service HTTP call so we can run end-to-end without spinning
up FastAPI. Asserts:

  - eligible models get their ``thumbnail_url`` written
  - models that already have a thumbnail are skipped (without --force)
  - --force re-generates even when a thumbnail exists
  - --dry-run reports without writing
  - --limit caps the batch
  - per-model failures don't stop the batch — others continue
"""
from __future__ import annotations

import uuid
from io import StringIO
from unittest.mock import patch, MagicMock

import pytest
from django.core.management import call_command

from apps.models.models import Model
from apps.projects.models import Project


pytestmark = pytest.mark.django_db


def _make_model(*, project, name: str, thumbnail_url=None, status='ready', file_url='https://example.com/m.ifc'):
    return Model.objects.create(
        id=uuid.uuid4(),
        project=project,
        name=name,
        original_filename=f'{name}.ifc',
        file_url=file_url,
        file_size=1000,
        status=status,
        thumbnail_url=thumbnail_url or '',
    )


@pytest.fixture
def project(db):
    return Project.objects.create(name='Backfill Test')


@pytest.fixture
def mock_httpx_success():
    """Mock httpx.Client to return a fake thumbnail URL for every POST."""
    with patch('apps.models.management.commands.backfill_thumbnails.httpx.Client') as mock_client:
        # Configure the mock so `with httpx.Client(...) as client: client.post(...)` works
        ctx_manager = MagicMock()
        mock_client.return_value.__enter__ = MagicMock(return_value=ctx_manager)
        mock_client.return_value.__exit__ = MagicMock(return_value=False)

        def _post(url, json, headers=None):
            response = MagicMock()
            response.raise_for_status = MagicMock()
            response.json = MagicMock(return_value={
                'model_id': json['model_id'],
                'thumbnail_url': f'https://example.com/thumb-{json["model_id"]}.png',
                'error': None,
            })
            return response

        ctx_manager.post = MagicMock(side_effect=_post)
        yield mock_client


def test_backfills_eligible_models(project, mock_httpx_success):
    m1 = _make_model(project=project, name='m1')
    m2 = _make_model(project=project, name='m2')

    out = StringIO()
    call_command('backfill_thumbnails', '--throttle-seconds', '0', stdout=out)

    m1.refresh_from_db()
    m2.refresh_from_db()
    assert m1.thumbnail_url.startswith('https://example.com/thumb-')
    assert m2.thumbnail_url.startswith('https://example.com/thumb-')
    assert '2/2 succeeded' in out.getvalue()


def test_skips_models_with_existing_thumbnail(project, mock_httpx_success):
    have = _make_model(project=project, name='have', thumbnail_url='https://example.com/existing.png')
    missing = _make_model(project=project, name='missing')

    out = StringIO()
    call_command('backfill_thumbnails', '--throttle-seconds', '0', stdout=out)

    have.refresh_from_db()
    missing.refresh_from_db()
    assert have.thumbnail_url == 'https://example.com/existing.png'  # untouched
    assert missing.thumbnail_url.startswith('https://example.com/thumb-')
    assert '1/1 succeeded' in out.getvalue()


def test_force_regenerates_existing(project, mock_httpx_success):
    have = _make_model(project=project, name='have', thumbnail_url='https://example.com/old.png')

    out = StringIO()
    call_command('backfill_thumbnails', '--throttle-seconds', '0', '--force', stdout=out)

    have.refresh_from_db()
    assert have.thumbnail_url.startswith('https://example.com/thumb-')
    assert have.thumbnail_url != 'https://example.com/old.png'


def test_dry_run_does_not_write(project, mock_httpx_success):
    m = _make_model(project=project, name='m')

    out = StringIO()
    call_command('backfill_thumbnails', '--dry-run', '--throttle-seconds', '0', stdout=out)

    m.refresh_from_db()
    assert m.thumbnail_url == ''
    assert 'DRY RUN' in out.getvalue()
    assert 'DRY: would call ifc-service' in out.getvalue()


def test_limit_caps_batch(project, mock_httpx_success):
    for i in range(5):
        _make_model(project=project, name=f'm{i}')

    out = StringIO()
    call_command('backfill_thumbnails', '--limit', '2', '--throttle-seconds', '0', stdout=out)

    assert '2 model(s)' in out.getvalue()
    assert '2/2 succeeded' in out.getvalue()
    assert Model.objects.exclude(thumbnail_url='').count() == 2


def test_per_model_failure_does_not_stop_batch(project):
    """If one model's ifc-service call fails, the others still succeed."""
    m1 = _make_model(project=project, name='m1')
    m2 = _make_model(project=project, name='m2')

    with patch('apps.models.management.commands.backfill_thumbnails.httpx.Client') as mock_client:
        ctx_manager = MagicMock()
        mock_client.return_value.__enter__ = MagicMock(return_value=ctx_manager)
        mock_client.return_value.__exit__ = MagicMock(return_value=False)

        call_count = {'n': 0}

        def _post(url, json, headers=None):
            call_count['n'] += 1
            response = MagicMock()
            response.raise_for_status = MagicMock()
            if call_count['n'] == 1:
                response.json = MagicMock(return_value={
                    'model_id': json['model_id'],
                    'thumbnail_url': None,
                    'error': 'simulated render failure',
                })
            else:
                response.json = MagicMock(return_value={
                    'model_id': json['model_id'],
                    'thumbnail_url': f'https://example.com/thumb-{json["model_id"]}.png',
                    'error': None,
                })
            return response

        ctx_manager.post = MagicMock(side_effect=_post)

        out = StringIO()
        call_command('backfill_thumbnails', '--throttle-seconds', '0', stdout=out)

    # Exactly one of the two models should have been backfilled.
    backfilled = Model.objects.exclude(thumbnail_url='').count()
    assert backfilled == 1
    assert '1/2 succeeded, 1 failed' in out.getvalue()


def test_skips_non_ready_models(project, mock_httpx_success):
    ready = _make_model(project=project, name='ready')
    processing = _make_model(project=project, name='processing', status='processing')

    out = StringIO()
    call_command('backfill_thumbnails', '--throttle-seconds', '0', stdout=out)

    ready.refresh_from_db()
    processing.refresh_from_db()
    assert ready.thumbnail_url.startswith('https://example.com/thumb-')
    assert processing.thumbnail_url == ''
    assert '1 model(s)' in out.getvalue()


def test_skips_models_without_file_url(project, mock_httpx_success):
    has_file = _make_model(project=project, name='has_file')
    no_file = _make_model(project=project, name='no_file', file_url='')

    out = StringIO()
    call_command('backfill_thumbnails', '--throttle-seconds', '0', stdout=out)

    has_file.refresh_from_db()
    no_file.refresh_from_db()
    assert has_file.thumbnail_url.startswith('https://example.com/thumb-')
    assert no_file.thumbnail_url == ''


def test_single_model_targeting(project, mock_httpx_success):
    m1 = _make_model(project=project, name='m1')
    m2 = _make_model(project=project, name='m2')

    out = StringIO()
    call_command('backfill_thumbnails', '--model', str(m1.id), '--throttle-seconds', '0', stdout=out)

    m1.refresh_from_db()
    m2.refresh_from_db()
    assert m1.thumbnail_url.startswith('https://example.com/thumb-')
    assert m2.thumbnail_url == ''  # not targeted

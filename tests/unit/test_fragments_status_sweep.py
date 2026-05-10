"""
Sweep-on-read timeout recovery for stuck fragments_status.

Background:
- Generation runs in the FastAPI ifc-service. Django flips the model to
  ``fragments_status='generating'`` and waits for the FastAPI callback
  (``/api/models/<id>/fragments-complete/``).
- On Railway, the FastAPI process can die mid-conversion (pod restart,
  OOM, web-ifc WASM segfault). When that happens the callback never
  fires and the model is pinned at ``'generating'`` forever — the UI
  spins on a 202 indefinitely.

The sweep on the ``GET /api/models/<id>/fragments/`` action flips a
stuck row to ``'failed'`` with a synthesized reason whenever a client
reads it after ``settings.FRAGMENTS_GENERATION_TIMEOUT``.

These tests pin both halves of that contract: stuck → swept, fresh →
left alone.
"""
from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone


pytestmark = pytest.mark.django_db


@pytest.fixture
def project(db):
    from apps.projects.models import Project
    return Project.objects.create(name='fragments-sweep', description='pytest')


def _make_generating_model(project, original_filename='walls.ifc', checksum='c' * 64):
    """Create a Model already in 'generating' state. Caller backdates updated_at."""
    from apps.models.models import Model, SourceFile
    sf = SourceFile.objects.create(
        project=project, original_filename=original_filename, format='ifc',
        file_size=1, checksum_sha256=checksum,
    )
    return Model.objects.create(
        project=project, name=original_filename.replace('.ifc', ''),
        original_filename=original_filename,
        file_url='http://localhost/walls.ifc',
        file_size=1, checksum_sha256=checksum,
        version_number=1,
        source_file=sf,
        status='ready',
        fragments_status='generating',
    )


def _backdate_updated_at(model_id, age):
    """
    Bypass ``auto_now=True`` to set ``updated_at`` to ``now - age``.

    ``Model.save()`` re-stamps updated_at on every write. ``QuerySet.update()``
    issues raw SQL and does NOT trigger field defaults, which is exactly
    what we need to simulate a row that's been pinned for a while.
    """
    from apps.models.models import Model
    Model.objects.filter(pk=model_id).update(updated_at=timezone.now() - age)


def test_stuck_generating_row_is_swept_to_failed(client, project, settings):
    """
    A 'generating' row older than the configured timeout is flipped to
    'failed' on the next GET, with a synthesized reason and updated DB row.
    """
    # Tight window so the test stays deterministic.
    settings.FRAGMENTS_GENERATION_TIMEOUT = timedelta(minutes=10)

    model = _make_generating_model(project)
    _backdate_updated_at(model.id, timedelta(minutes=15))

    resp = client.get(f'/api/models/{model.id}/fragments/')
    # 'failed' falls through the 'generating' branch (which would 202) AND
    # the no-fragments-url branch (which 404s). After the sweep there's
    # still no fragments_url, so we expect 404.
    assert resp.status_code == 404, resp.content
    body = resp.json()
    assert body['fragments_status'] == 'failed'
    assert 'timed out' in body['error']
    assert 'presumed worker crash' in body['error']

    # Persisted, not just in the response.
    model.refresh_from_db()
    assert model.fragments_status == 'failed'
    assert 'timed out' in model.fragments_error


def test_fresh_generating_row_is_not_swept(client, project, settings):
    """
    A 'generating' row whose updated_at is well within the timeout window
    stays 'generating'. The endpoint returns 202 (still working).
    """
    settings.FRAGMENTS_GENERATION_TIMEOUT = timedelta(minutes=10)

    model = _make_generating_model(
        project, original_filename='fresh.ifc', checksum='d' * 64,
    )
    # 30 seconds is well under the 10-minute window.
    _backdate_updated_at(model.id, timedelta(seconds=30))

    resp = client.get(f'/api/models/{model.id}/fragments/')
    assert resp.status_code == 202, resp.content
    body = resp.json()
    assert body['fragments_status'] == 'generating'
    assert body['error'] is None

    model.refresh_from_db()
    assert model.fragments_status == 'generating'
    assert model.fragments_error is None

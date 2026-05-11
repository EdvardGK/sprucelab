"""
Tests for ``POST /api/types/types/verify/?dry_run=true``.

Mirror the shape of ``test_type_mapping_bulk_update`` — same write-vs-preview
contract: ``?dry_run=true`` returns identical-shape payload with ``dry_run: true``
added and no DB writes; absence runs the engine normally and persists.
"""
from __future__ import annotations

import uuid

import pytest

from apps.entities.models import IFCType, TypeMapping
from apps.models.models import Model, SourceFile
from apps.projects.models import Project


pytestmark = pytest.mark.django_db


@pytest.fixture
def project(db):
    return Project.objects.create(name='verify-dry-run-test')


@pytest.fixture
def model(project):
    sf = SourceFile.objects.create(
        project=project,
        original_filename='m.ifc',
        format='ifc',
        file_size=1,
    )
    return Model.objects.create(
        project=project,
        source_file=sf,
        name='M',
        original_filename='m.ifc',
    )


@pytest.fixture
def types_with_mappings(model):
    """Create three types each with a TypeMapping so verification can run."""
    types = []
    for i in range(3):
        t = IFCType.objects.create(
            model=model,
            type_guid=str(uuid.uuid4()),
            type_name=f'Wall {i}',
            ifc_type='IfcWallType',
            instance_count=1,
        )
        # Pre-create a TypeMapping so the engine has something to update.
        # No ns3451_code — defaults will flag has_ns3451 as missing.
        TypeMapping.objects.create(
            ifc_type=t,
            mapping_status='pending',
        )
        types.append(t)
    return types


def test_verify_writes_by_default(client, model, types_with_mappings):
    resp = client.post(
        f'/api/types/types/verify/?model={model.id}',
        content_type='application/json',
    )
    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert body['dry_run'] is False
    assert body['model_id'] == str(model.id)
    assert body['checked'] == 3
    # Engine wrote verification_status onto each mapping.
    statuses = list(
        TypeMapping.objects
        .filter(ifc_type__in=types_with_mappings)
        .values_list('verification_status', flat=True)
    )
    assert statuses, 'expected mappings to exist'
    # Engine sets status to 'flagged' for has_ns3451 errors (severity=error).
    assert all(s in ('flagged', 'auto') for s in statuses), statuses
    # verified_engine_at must be populated.
    assert TypeMapping.objects.filter(
        ifc_type__in=types_with_mappings,
        verified_engine_at__isnull=False,
    ).count() == 3


def test_verify_dry_run_writes_nothing(client, model, types_with_mappings):
    # Capture pre-state (engine has never run on these mappings).
    pre_statuses = list(
        TypeMapping.objects
        .filter(ifc_type__in=types_with_mappings)
        .values_list('verification_status', flat=True)
    )
    pre_engine_at = list(
        TypeMapping.objects
        .filter(ifc_type__in=types_with_mappings)
        .values_list('verified_engine_at', flat=True)
    )
    assert all(t is None for t in pre_engine_at), pre_engine_at

    resp = client.post(
        f'/api/types/types/verify/?model={model.id}&dry_run=true',
        content_type='application/json',
    )
    assert resp.status_code == 200, resp.content
    body = resp.json()

    # Shape is identical to the write path — same scalar fields populated.
    assert body['dry_run'] is True
    assert body['model_id'] == str(model.id)
    assert body['checked'] == 3
    for key in ('passed', 'warnings', 'failed', 'skipped', 'health_score', 'rules_applied'):
        assert key in body, f'expected key {key!r} in dry-run payload'

    # No DB writes — statuses and verified_engine_at unchanged.
    post_statuses = list(
        TypeMapping.objects
        .filter(ifc_type__in=types_with_mappings)
        .values_list('verification_status', flat=True)
    )
    assert post_statuses == pre_statuses
    post_engine_at = list(
        TypeMapping.objects
        .filter(ifc_type__in=types_with_mappings)
        .values_list('verified_engine_at', flat=True)
    )
    assert all(t is None for t in post_engine_at), post_engine_at


def test_verify_dry_run_accepts_truthy_strings(client, model, types_with_mappings):
    """``_bool_param`` accepts 1/true/yes (case-insensitive). Smoke-check 'True'."""
    resp = client.post(
        f'/api/types/types/verify/?model={model.id}&dry_run=True',
        content_type='application/json',
    )
    assert resp.status_code == 200, resp.content
    assert resp.json()['dry_run'] is True
    # No writes.
    assert TypeMapping.objects.filter(
        ifc_type__in=types_with_mappings,
        verified_engine_at__isnull=False,
    ).count() == 0


def test_verify_dry_run_false_persists(client, model, types_with_mappings):
    """``dry_run=false`` is the explicit write path; verify it works."""
    resp = client.post(
        f'/api/types/types/verify/?model={model.id}&dry_run=false',
        content_type='application/json',
    )
    assert resp.status_code == 200, resp.content
    assert resp.json()['dry_run'] is False
    assert TypeMapping.objects.filter(
        ifc_type__in=types_with_mappings,
        verified_engine_at__isnull=False,
    ).count() == 3

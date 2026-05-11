"""
Tests for ``?dry_run=true`` on PATCH /api/projects/scopes/{id}/.

Per the agent-first contract in CLAUDE.md, every mutation should support a
plan-then-execute dry-run mode. These tests pin the contract for the
ProjectScope update path — preview returns the would-be representation with
``dry_run: true`` and zero DB writes; the default path persists normally and
returns the standard serialized response.
"""
from __future__ import annotations

import json

import pytest

from apps.projects.models import Project, ProjectScope


pytestmark = pytest.mark.django_db


@pytest.fixture
def project(db):
    return Project.objects.create(name='scope-dry-run-test')


@pytest.fixture
def scope(project):
    return ProjectScope.objects.create(
        project=project,
        name='Building A',
        scope_type='building',
        storey_merge_tolerance_m=0.2,
    )


def test_partial_update_dry_run_does_not_persist(client, scope):
    original = scope.storey_merge_tolerance_m
    resp = client.patch(
        f'/api/projects/scopes/{scope.id}/?dry_run=true',
        data=json.dumps({'storey_merge_tolerance_m': 0.75}),
        content_type='application/json',
    )
    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert body['dry_run'] is True
    assert body['id'] == str(scope.id)
    assert body['would_update']['storey_merge_tolerance_m'] == 0.75

    scope.refresh_from_db()
    assert scope.storey_merge_tolerance_m == original


def test_partial_update_default_persists(client, scope):
    resp = client.patch(
        f'/api/projects/scopes/{scope.id}/',
        data=json.dumps({'storey_merge_tolerance_m': 0.6}),
        content_type='application/json',
    )
    assert resp.status_code == 200, resp.content
    body = resp.json()
    # Default path returns the standard serialized scope, not the dry-run envelope.
    assert 'dry_run' not in body
    assert body['storey_merge_tolerance_m'] == 0.6

    scope.refresh_from_db()
    assert scope.storey_merge_tolerance_m == 0.6


def test_partial_update_dry_run_invalid_input_returns_400(client, project, scope):
    """
    Per feedback-bad-models-are-the-product, dry-run with invalid input
    returns validation errors as DATA (400 with the standard field-error
    shape), not a crash.
    """
    other = Project.objects.create(name='other-project')
    other_root = ProjectScope.objects.create(
        project=other, name='other-root', scope_type='building',
    )
    resp = client.patch(
        f'/api/projects/scopes/{scope.id}/?dry_run=true',
        data=json.dumps({'parent': str(other_root.id)}),
        content_type='application/json',
    )
    assert resp.status_code == 400
    assert 'parent' in resp.json()


def test_partial_update_dry_run_false_string_persists(client, scope):
    """Explicit ``dry_run=false`` should behave like the absent param."""
    resp = client.patch(
        f'/api/projects/scopes/{scope.id}/?dry_run=false',
        data=json.dumps({'storey_merge_tolerance_m': 0.42}),
        content_type='application/json',
    )
    assert resp.status_code == 200, resp.content
    assert 'dry_run' not in resp.json()
    scope.refresh_from_db()
    assert scope.storey_merge_tolerance_m == 0.42

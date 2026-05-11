"""
Tests for the embed semantic-to-concrete filter resolver.

`/api/embed/instances/` and `/api/embed/capabilities/` are the contract the
embed dashboards build against. These tests pin both the envelope shape
and the resolver semantics for every supported filter.

Both endpoints now require a project-scoped embed token. The ``api_client``
fixture in this module wraps the default DRF client with the
``Authorization: Embed <raw>`` header for the project under test, so each
test reads like the resolver was still public — auth boilerplate stays
out of the way.
"""
from __future__ import annotations

import uuid

import pytest
from rest_framework.test import APIClient

from apps.embed.models import EmbedToken
from apps.entities.models import (
    AnalysisStorey,
    AnalysisType,
    AnalysisTypeStorey,
    IFCType,
    ModelAnalysis,
)
from apps.models.models import Model, SourceFile
from apps.projects.models import Project, ProjectScope


pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def project(db):
    return Project.objects.create(name='embed-resolver-test')


@pytest.fixture
def project_token(project):
    """Issue a token for `project` with the full read capability set."""
    _, raw = EmbedToken.generate(
        name='resolver-test',
        project=project,
        allowed_origins=['http://localhost:5173'],
    )
    return raw


@pytest.fixture
def api_client(project_token, settings):
    """
    DRF test client with embed-token auth wired up.

    Re-enables ``EmbedTokenAuthentication`` on top of the open-permissions
    fixture (which globally clears auth + permissions for unit tests), so
    the resolver auth gate is exercised end-to-end without leaking other
    auth backends into this test module.
    """
    settings.REST_FRAMEWORK = {
        **settings.REST_FRAMEWORK,
        'DEFAULT_AUTHENTICATION_CLASSES': [
            'apps.embed.authentication.EmbedTokenAuthentication',
        ],
        'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.AllowAny'],
    }
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f'Embed {project_token}')
    return c


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
def walls(model):
    """Three IfcWallType instances with varying instance counts."""
    return [
        IFCType.objects.create(
            model=model,
            type_guid=str(uuid.uuid4()),
            type_name=f'Wall {i}',
            ifc_type='IfcWallType',
            instance_count=count,
        )
        for i, count in enumerate([10, 20, 30])
    ]


@pytest.fixture
def doors(model):
    """Two IfcDoorType instances."""
    return [
        IFCType.objects.create(
            model=model,
            type_guid=str(uuid.uuid4()),
            type_name=f'Door {i}',
            ifc_type='IfcDoorType',
            instance_count=5,
        )
        for i in range(2)
    ]


@pytest.fixture
def scope_with_floors(project):
    """A scope advertising one canonical floor at elevation 3.0m."""
    return ProjectScope.objects.create(
        project=project,
        name='root',
        canonical_floors=[
            {
                'code': '02',
                'name': 'Plan 2',
                'elevation_m': 3.0,
                'aliases': ['L02', 'second'],
            },
        ],
        storey_merge_tolerance_m=0.2,
    )


@pytest.fixture
def analysis_with_storey(model, walls):
    """
    Populate the analysis tables so floor_code resolution has data to chew on.

    Wires `walls[0]` to a storey at elevation 3.0m. `walls[1]` and `walls[2]`
    have no storey distribution — they're "unplaced" from the resolver's
    point of view.
    """
    analysis = ModelAnalysis.objects.create(model=model)
    storey = AnalysisStorey.objects.create(
        analysis=analysis,
        name='Plan 2',
        elevation=3.0,
    )
    atype = AnalysisType.objects.create(
        analysis=analysis,
        ifc_type=walls[0],
        type_class='IfcWallType',
        type_name='Wall 0',
        element_class='IfcWall',
        instance_count=10,
    )
    AnalysisTypeStorey.objects.create(
        analysis=analysis,
        type=atype,
        storey=storey,
        instance_count=10,
    )
    return {'analysis': analysis, 'storey': storey, 'placed_type': walls[0]}


# ---------------------------------------------------------------------------
# /api/embed/capabilities/
# ---------------------------------------------------------------------------

def test_capabilities_envelope_shape(api_client):
    resp = api_client.get('/api/embed/capabilities/')
    assert resp.status_code == 200
    body = resp.json()

    assert set(body.keys()) >= {
        'api_version',
        'service',
        'endpoints',
        'supported_filters',
        'response_shape',
        'truncation',
        'notes',
    }
    assert body['service'] == 'sprucelab-embed-resolver'
    assert body['endpoints']['instances'] == '/api/embed/instances/'


def test_capabilities_advertises_token_scope(api_client, project):
    """The token block tells the iframe its project + allowed origins."""
    body = api_client.get('/api/embed/capabilities/').json()
    assert body['token']['project_id'] == str(project.id)
    assert 'http://localhost:5173' in body['token']['allowed_origins']
    assert 'read:instances' in body['token']['capabilities']


def test_capabilities_advertises_all_filters(api_client):
    body = api_client.get('/api/embed/capabilities/').json()
    filters = body['supported_filters']
    # project_id is no longer a request-time filter (token-bound), but the
    # other dimensions still are.
    assert {'ifc_class', 'type_id', 'floor_code'} <= set(filters.keys())
    assert filters['ifc_class']['required'] is False


def test_capabilities_documents_truncation_and_omitted_express_ids(api_client):
    body = api_client.get('/api/embed/capabilities/').json()
    assert body['truncation']['threshold_instances'] == 2500
    assert body['truncation']['fallback_mode'] == 'highlight_by_class'
    # Stable contract: callers should NOT expect instance_express_ids back.
    assert 'instance_express_ids' in body['notes']


def test_embed_capabilities_mirrors_dry_run_manifest(api_client):
    """
    Embed callers can't hit the unauthenticated root /api/capabilities/, so
    /api/embed/capabilities/ must mirror the dry-run mutation list. Grows
    additively — assert membership, not length.
    """
    body = api_client.get('/api/embed/capabilities/').json()
    mutations = body['mutations_supporting_dry_run']
    assert isinstance(mutations, list)
    assert len(mutations) >= 3
    assert any('type-mappings/bulk-update' in m for m in mutations)
    assert any('claims' in m and 'promote' in m for m in mutations)


def test_capabilities_requires_token():
    """Without auth, /capabilities/ now refuses."""
    c = APIClient()
    res = c.get('/api/embed/capabilities/')
    assert res.status_code in (401, 403)


# ---------------------------------------------------------------------------
# /api/embed/instances/ — required params + base shape
# ---------------------------------------------------------------------------

def test_instances_requires_token():
    """No token → no project scope → 401/403."""
    c = APIClient()
    res = c.get('/api/embed/instances/')
    assert res.status_code in (401, 403)


def test_instances_unfiltered_returns_all_project_types(api_client, project, walls, doors):
    resp = api_client.get('/api/embed/instances/')
    assert resp.status_code == 200
    body = resp.json()
    assert body['type_count'] == 5  # 3 walls + 2 doors
    assert body['instance_count'] == 70  # 10+20+30 + 5+5
    assert body['truncated'] is False
    assert body['threshold_instances'] == 2500
    assert body['applied_filters'] == {'project_id': str(project.id)}
    assert body['skipped_filters'] == []
    assert set(body['type_ids']) == {str(t.id) for t in walls + doors}


def test_instances_token_scope_isolates_other_projects(api_client, project, walls, doors):
    """Tokens scoped to project A don't leak data from project B."""
    other = Project.objects.create(name='other')
    sf = SourceFile.objects.create(
        project=other, original_filename='o.ifc', format='ifc', file_size=1,
    )
    other_model = Model.objects.create(
        project=other, source_file=sf, name='O', original_filename='o.ifc',
    )
    IFCType.objects.create(
        model=other_model,
        type_guid=str(uuid.uuid4()),
        type_name='Other',
        ifc_type='IfcWallType',
        instance_count=999,
    )

    body = api_client.get('/api/embed/instances/').json()
    # Only `project`'s 5 types come back; the 'Other' wall is hidden.
    assert body['type_count'] == 5
    assert body['instance_count'] == 70


# ---------------------------------------------------------------------------
# /api/embed/instances/ — semantic filters
# ---------------------------------------------------------------------------

def test_instances_filters_by_ifc_class(api_client, project, walls, doors):
    resp = api_client.get('/api/embed/instances/?ifc_class=IfcWallType')
    body = resp.json()
    assert body['type_count'] == 3
    assert body['instance_count'] == 60
    assert body['applied_filters']['ifc_class'] == 'IfcWallType'
    assert set(body['type_ids']) == {str(w.id) for w in walls}


def test_instances_filters_by_single_type_id(api_client, project, walls):
    target = walls[1]
    resp = api_client.get(f'/api/embed/instances/?type_id={target.id}')
    body = resp.json()
    assert body['type_count'] == 1
    assert body['instance_count'] == 20
    assert body['type_ids'] == [str(target.id)]
    assert body['applied_filters']['type_id'] == [str(target.id)]


def test_instances_filters_by_csv_type_ids(api_client, project, walls):
    csv = ','.join(str(w.id) for w in walls[:2])
    resp = api_client.get(f'/api/embed/instances/?type_id={csv}')
    body = resp.json()
    assert body['type_count'] == 2
    assert body['instance_count'] == 30


# ---------------------------------------------------------------------------
# /api/embed/instances/ — floor_code resolution
# ---------------------------------------------------------------------------

def test_instances_filters_by_floor_code_when_analysis_present(
    api_client, project, walls, scope_with_floors, analysis_with_storey,
):
    placed = analysis_with_storey['placed_type']
    resp = api_client.get('/api/embed/instances/?floor_code=02')
    body = resp.json()
    assert body['applied_filters']['floor_code'] == '02'
    assert body['skipped_filters'] == []
    # Only the wall wired into the analysis storey survives the filter.
    assert body['type_ids'] == [str(placed.id)]


def test_instances_floor_code_matches_alias(
    api_client, project, walls, scope_with_floors, analysis_with_storey,
):
    placed = analysis_with_storey['placed_type']
    resp = api_client.get('/api/embed/instances/?floor_code=L02')
    body = resp.json()
    assert body['applied_filters']['floor_code'] == 'L02'
    assert body['type_ids'] == [str(placed.id)]


def test_instances_skips_floor_filter_for_unknown_code(
    api_client, project, walls, scope_with_floors, analysis_with_storey,
):
    resp = api_client.get('/api/embed/instances/?floor_code=99')
    body = resp.json()
    assert 'floor_code' in body['skipped_filters']
    assert 'floor_code' not in body['applied_filters']
    # Unfiltered by floor — all project types come back.
    assert body['type_count'] == 3


def test_instances_skips_floor_filter_when_no_analysis(
    api_client, project, walls, scope_with_floors,
):
    # Canonical floor exists but no AnalysisStorey rows are populated.
    resp = api_client.get('/api/embed/instances/?floor_code=02')
    body = resp.json()
    assert 'floor_code' in body['skipped_filters']


# ---------------------------------------------------------------------------
# /api/embed/instances/ — truncation
# ---------------------------------------------------------------------------

def test_instances_truncates_above_threshold(api_client, project, model):
    # 3000 instances total > 2500 threshold.
    IFCType.objects.create(
        model=model,
        type_guid=str(uuid.uuid4()),
        type_name='Big',
        ifc_type='IfcWallType',
        instance_count=3000,
    )
    resp = api_client.get('/api/embed/instances/')
    body = resp.json()
    assert body['truncated'] is True
    assert body['instance_count'] == 3000
    # type_ids still returned in full — viewer needs them to drive the
    # highlight-by-class fallback.
    assert body['type_count'] == 1


def test_instances_at_threshold_is_not_truncated(api_client, project, model):
    IFCType.objects.create(
        model=model,
        type_guid=str(uuid.uuid4()),
        type_name='Edge',
        ifc_type='IfcWallType',
        instance_count=2500,
    )
    body = api_client.get('/api/embed/instances/').json()
    assert body['truncated'] is False

"""
Regression tests pinning query counts for N+1-prone hot-path endpoints.

We don't assert an exact query count — DRF middleware queries shift between
versions. Instead we assert the count is *the same* for a small scenario and
a larger one. If query count grows with N, an N+1 has reappeared.
"""
from __future__ import annotations

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.entities.models import (
    Claim,
    IFCEntity,
    IFCType,
    Material,
    MaterialAssignment,
    TypeAssignment,
)
from apps.models.models import ExtractionRun, Model, SourceFile
from apps.projects.models import Project, ProjectScope


pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# /api/projects/scopes/{id}/floors/ — fixed in B3
# ---------------------------------------------------------------------------

def _build_floors_scenario(n_models: int):
    project = Project.objects.create(name=f"qcount-floors-{n_models}")
    scope = ProjectScope.objects.create(
        project=project, name="B", scope_type="building",
        storey_merge_tolerance_m=0.2,
        canonical_floors=[
            {"name": "01", "elevation_m": 0.0, "aliases": []},
            {"name": "02", "elevation_m": 3.5, "aliases": []},
        ],
    )
    for i in range(n_models):
        sf = SourceFile.objects.create(
            project=project, scope=scope,
            original_filename=f"m{i}.ifc", format="ifc",
            file_size=1234, checksum_sha256=f"{i:064d}",
        )
        run = ExtractionRun.objects.create(source_file=sf, status="completed")
        Claim.objects.create(
            source_file=sf, extraction_run=run, scope=scope,
            statement="Discovered storeys",
            normalized={"predicate": "has_storeys", "floors": [
                {"name": "01", "elevation_m": 0.0, "guid": f"g{i}-1"},
                {"name": "02", "elevation_m": 3.5, "guid": f"g{i}-2"},
            ]},
            claim_type="storey_list", confidence=0.95, status="unresolved",
        )
        Model.objects.create(
            project=project, scope=scope, source_file=sf,
            name=f"m{i}", original_filename=f"m{i}.ifc", file_size=1234,
        )
    return scope


def test_floors_endpoint_query_count_does_not_scale_with_models(client):
    small_scope = _build_floors_scenario(n_models=1)
    big_scope = _build_floors_scenario(n_models=10)

    # Warm-up to skip one-shot connection setup costs
    client.get(f"/api/projects/scopes/{small_scope.id}/floors/")

    with CaptureQueriesContext(connection) as ctx_small:
        resp = client.get(f"/api/projects/scopes/{small_scope.id}/floors/")
    assert resp.status_code == 200

    with CaptureQueriesContext(connection) as ctx_big:
        resp = client.get(f"/api/projects/scopes/{big_scope.id}/floors/")
    assert resp.status_code == 200
    assert len(resp.json()['models']) == 10

    n_small = len(ctx_small.captured_queries)
    n_big = len(ctx_big.captured_queries)
    assert n_big == n_small, (
        f"N+1 regression in /api/projects/scopes/{{id}}/floors/: "
        f"1 model -> {n_small} queries; 10 models -> {n_big} queries"
    )


# ---------------------------------------------------------------------------
# /api/projects/{id}/statistics/ — fixed in B1
# ---------------------------------------------------------------------------

def _build_stats_scenario(n_types: int, n_materials: int):
    project = Project.objects.create(name=f"qcount-stats-{n_types}-{n_materials}")
    sf = SourceFile.objects.create(
        project=project, original_filename="m.ifc", format="ifc",
        file_size=1234, checksum_sha256="0" * 64,
    )
    model = Model.objects.create(
        project=project, source_file=sf,
        name="m", original_filename="m.ifc", file_size=1234,
    )

    # Create entities + types + materials. Each type gets one entity; each
    # material gets one entity. Volume/area/length populated so the aggregates
    # do real work and the JOIN-multiplication risk is exercised.
    for i in range(n_types):
        ent = IFCEntity.objects.create(
            model=model, ifc_type="IfcWall",
            ifc_guid=f"t{i:021d}"[:22],
            volume=1.0 + i, area=2.0 + i, length=3.0 + i,
        )
        t = IFCType.objects.create(
            model=model, ifc_type="IfcWallType",
            type_guid=f"tg{i:020d}",
            type_name=f"Wall-{i}",
        )
        TypeAssignment.objects.create(entity=ent, type=t)

    for i in range(n_materials):
        ent = IFCEntity.objects.create(
            model=model, ifc_type="IfcWall",
            ifc_guid=f"m{i:021d}"[:22],
            volume=10.0 + i,
        )
        mat = Material.objects.create(
            model=model, name=f"Mat-{i}", material_guid=f"mg{i}",
        )
        MaterialAssignment.objects.create(entity=ent, material=mat, layer_order=1)

    return project


def test_statistics_endpoint_query_count_does_not_scale_with_types(client):
    small_project = _build_stats_scenario(n_types=1, n_materials=1)
    big_project = _build_stats_scenario(n_types=20, n_materials=20)

    # Warm-up
    client.get(f"/api/projects/{small_project.id}/statistics/")

    with CaptureQueriesContext(connection) as ctx_small:
        resp = client.get(f"/api/projects/{small_project.id}/statistics/")
    assert resp.status_code == 200

    with CaptureQueriesContext(connection) as ctx_big:
        resp = client.get(f"/api/projects/{big_project.id}/statistics/")
    assert resp.status_code == 200

    n_small = len(ctx_small.captured_queries)
    n_big = len(ctx_big.captured_queries)
    assert n_big == n_small, (
        f"N+1 regression in /api/projects/{{id}}/statistics/: "
        f"1 type+1 mat -> {n_small} queries; 20 types+20 mats -> {n_big} queries"
    )

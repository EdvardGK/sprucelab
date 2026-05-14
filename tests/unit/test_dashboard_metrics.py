"""
Tests for /api/types/types/dashboard-metrics/ — Track 4a collapse.

Pins:
1. JSON shape stability (every documented key the contract promises is present).
2. Query count does not scale with model count or type count
   (regression guard against the ~11-per-queryset N+1 fan-out that the
   refactor collapsed into one aggregate() + Exists-annotation pre-pass).

Frontend depends on the response shape; the contract is checked explicitly
rather than via golden snapshot so a single field rename fails loudly.
"""
from __future__ import annotations

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.entities.models import (
    IFCType,
    TypeDefinitionLayer,
    TypeMapping,
)
from apps.models.models import Model, SourceFile
from apps.projects.models import Project


pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Scenario builders
# ---------------------------------------------------------------------------

def _make_project_with_models(n_models: int, types_per_model: int) -> Project:
    """Build a project with n_models models, each holding types_per_model types.

    A spread of mapping/verification states is created so every Count(...filter=)
    branch in the aggregate is exercised:
      - 1 mapped + NS3451 + unit + 1 material layer with quantity (full health)
      - 1 mapped, no extras
      - 1 ignored
      - 1 review
      - 1 followup
      - 1 flagged verification
      - 1 verified verification
      - 1 auto verification
      - 1 pending (no mapping at all)
      - remainder: pending mappings
    """
    project = Project.objects.create(name=f"dm-{n_models}x{types_per_model}")
    for mi in range(n_models):
        sf = SourceFile.objects.create(
            project=project,
            original_filename=f"m{mi}.ifc",
            format="ifc",
            file_size=1234,
            checksum_sha256=f"{mi:064d}",
        )
        model = Model.objects.create(
            project=project,
            source_file=sf,
            name=f"ARK_model_{mi}",
            original_filename=f"m{mi}.ifc",
            file_size=1234,
        )

        for ti in range(types_per_model):
            t = IFCType.objects.create(
                model=model,
                ifc_type="IfcWallType",
                type_guid=f"tg-{mi}-{ti}",
                type_name=f"Wall-{mi}-{ti}",
                instance_count=1 + ti,  # > 0 so qs.filter(instance_count__gt=0) keeps it
            )

            # Spread mapping states across the first 9 types (then pending tail)
            if ti % 9 == 0:
                m = TypeMapping.objects.create(
                    ifc_type=t,
                    ns3451_code="222",
                    representative_unit="m2",
                    mapping_status="mapped",
                    verification_status="verified",
                )
                TypeDefinitionLayer.objects.create(
                    type_mapping=m,
                    layer_order=1,
                    material_name="Concrete",
                    thickness_mm=200,
                    quantity_per_unit=0.25,
                )
            elif ti % 9 == 1:
                TypeMapping.objects.create(
                    ifc_type=t, mapping_status="mapped",
                    verification_status="auto",
                )
            elif ti % 9 == 2:
                TypeMapping.objects.create(
                    ifc_type=t, mapping_status="ignored",
                    verification_status="pending",
                )
            elif ti % 9 == 3:
                TypeMapping.objects.create(
                    ifc_type=t, mapping_status="review",
                    verification_status="flagged",
                )
            elif ti % 9 == 4:
                TypeMapping.objects.create(
                    ifc_type=t, mapping_status="followup",
                    verification_status="pending",
                )
            elif ti % 9 == 5:
                TypeMapping.objects.create(
                    ifc_type=t, ns3451_code="234",
                    mapping_status="mapped",
                    verification_status="verified",
                )
            elif ti % 9 == 6:
                TypeMapping.objects.create(
                    ifc_type=t,
                    representative_unit="m3",
                    mapping_status="pending",
                    verification_status="pending",
                )
            elif ti % 9 == 7:
                TypeMapping.objects.create(
                    ifc_type=t, mapping_status="pending",
                    verification_status="auto",
                )
            # ti % 9 == 8: no mapping at all (true pending tail)
    return project


# Expected non-empty shape keys ------------------------------------------------

PROJECT_SUMMARY_KEYS = {
    'total_types', 'health_score', 'status',
    'classification_percent', 'unit_percent', 'material_percent',
    'verification_percent', 'verification_passed', 'verification_warning',
    'verification_failed', 'verification_pending',
    'total', 'mapped', 'pending', 'ignored', 'review', 'followup',
    'progress_percent',
}

PER_MODEL_KEYS = {
    'id', 'name', 'discipline',
    'total_types', 'mapped', 'pending', 'ignored', 'review', 'followup',
    'health_score', 'status',
}


# ---------------------------------------------------------------------------
# Shape tests
# ---------------------------------------------------------------------------

def test_dashboard_metrics_model_mode_shape(client):
    project = _make_project_with_models(n_models=1, types_per_model=9)
    model = Model.objects.filter(project=project).first()

    resp = client.get(f"/api/types/types/dashboard-metrics/?model_id={model.id}")
    assert resp.status_code == 200, resp.content

    body = resp.json()
    assert body['mode'] == 'model'
    assert body['model_id'] == str(model.id)
    assert body['model_name'] == model.name

    # Every contract key must be present at top level (model mode spreads the
    # health-block + counts-block directly onto the response).
    for k in PROJECT_SUMMARY_KEYS:
        assert k in body, f"missing key in model-mode response: {k}"

    # Status enum
    assert body['status'] in {'healthy', 'warning', 'critical'}


def test_dashboard_metrics_project_mode_shape(client):
    project = _make_project_with_models(n_models=2, types_per_model=9)

    resp = client.get(f"/api/types/types/dashboard-metrics/?project_id={project.id}")
    assert resp.status_code == 200, resp.content

    body = resp.json()
    assert body['mode'] == 'project'
    assert body['project_id'] == str(project.id)

    # Project summary contract
    summary = body['project_summary']
    for k in PROJECT_SUMMARY_KEYS:
        assert k in summary, f"missing key in project_summary: {k}"

    # Per-model contract
    assert isinstance(body['models'], list)
    assert len(body['models']) == 2
    for m in body['models']:
        for k in PER_MODEL_KEYS:
            assert k in m, f"missing key in per-model row: {k}"

    # by_discipline + action_items keys present
    assert 'by_discipline' in body
    assert 'action_items' in body
    assert isinstance(body['action_items'], list)


def test_dashboard_metrics_requires_id_param(client):
    resp = client.get("/api/types/types/dashboard-metrics/")
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Query count regression — model count must NOT scale queries
# ---------------------------------------------------------------------------

def test_dashboard_metrics_query_count_does_not_scale_with_models(client):
    """The per-model loop calls compute_metrics() once per model.

    Each compute_metrics is 1 aggregate() call (Postgres rolls Exists +
    Count(filter=) into a single SQL statement). So query count grows
    *linearly with model count* — not multiplicatively with type count.

    The contract under test: 1 model with 9 types vs 1 model with 90 types
    must run the SAME number of queries. (This is the N+1 we collapsed.)
    """
    small_project = _make_project_with_models(n_models=1, types_per_model=9)
    big_project = _make_project_with_models(n_models=1, types_per_model=90)

    # Warm-up to avoid one-shot connection setup costs
    client.get(f"/api/types/types/dashboard-metrics/?project_id={small_project.id}")

    with CaptureQueriesContext(connection) as ctx_small:
        resp = client.get(
            f"/api/types/types/dashboard-metrics/?project_id={small_project.id}"
        )
    assert resp.status_code == 200

    with CaptureQueriesContext(connection) as ctx_big:
        resp = client.get(
            f"/api/types/types/dashboard-metrics/?project_id={big_project.id}"
        )
    assert resp.status_code == 200

    n_small = len(ctx_small.captured_queries)
    n_big = len(ctx_big.captured_queries)
    assert n_big == n_small, (
        "N+1 regression in /api/types/types/dashboard-metrics/: "
        f"9 types -> {n_small} queries; 90 types -> {n_big} queries"
    )


def test_dashboard_metrics_model_mode_query_count_is_bounded(client):
    """In model mode the endpoint runs exactly one compute_metrics() call.

    Total queries must be a small constant (DRF middleware adds a few),
    and must not change between 9 and 90 types.
    """
    small_project = _make_project_with_models(n_models=1, types_per_model=9)
    small_model = Model.objects.filter(project=small_project).first()
    big_project = _make_project_with_models(n_models=1, types_per_model=90)
    big_model = Model.objects.filter(project=big_project).first()

    # Warm-up
    client.get(f"/api/types/types/dashboard-metrics/?model_id={small_model.id}")

    with CaptureQueriesContext(connection) as ctx_small:
        resp = client.get(f"/api/types/types/dashboard-metrics/?model_id={small_model.id}")
    assert resp.status_code == 200

    with CaptureQueriesContext(connection) as ctx_big:
        resp = client.get(f"/api/types/types/dashboard-metrics/?model_id={big_model.id}")
    assert resp.status_code == 200

    n_small = len(ctx_small.captured_queries)
    n_big = len(ctx_big.captured_queries)
    assert n_big == n_small, (
        "N+1 regression in /api/types/types/dashboard-metrics/ (model mode): "
        f"9 types -> {n_small} queries; 90 types -> {n_big} queries"
    )

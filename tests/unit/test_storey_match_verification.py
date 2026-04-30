"""
Unit tests for ``check_storey_deviation`` and the publish gate (Phase F-2).

Covers the new ``check_storey_deviation`` helper in
``apps.entities.services.verification_engine`` plus the
``ProjectConfig.block_on_storey_deviation`` publish gate in
``apps.models.views.ModelViewSet.publish``.
"""
from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.entities.models import Claim
from apps.entities.services.verification_engine import (
    STOREY_MATCH_RULE_ID,
    check_storey_deviation,
)
from apps.models.models import ExtractionRun, Model, SourceFile
from apps.projects.models import Project, ProjectConfig, ProjectScope


pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def project(db):
    return Project.objects.create(name="storey-match-test", description="pytest")


@pytest.fixture
def scope(project):
    return ProjectScope.objects.create(
        project=project,
        name="Building A",
        scope_type="building",
        storey_merge_tolerance_m=0.2,
    )


@pytest.fixture
def source_file(project, scope):
    return SourceFile.objects.create(
        project=project,
        scope=scope,
        original_filename="model.ifc",
        format="ifc",
        file_size=1234,
        checksum_sha256="0" * 64,
    )


@pytest.fixture
def extraction_run(source_file):
    return ExtractionRun.objects.create(source_file=source_file, status="completed")


@pytest.fixture
def model(project, scope, source_file):
    return Model.objects.create(
        project=project,
        scope=scope,
        source_file=source_file,
        name="Architecture",
        original_filename="model.ifc",
        status="ready",
    )


def _make_claim(sf, run, scope, floors):
    return Claim.objects.create(
        source_file=sf,
        extraction_run=run,
        scope=scope,
        statement=f"Discovered {len(floors)} storeys",
        normalized={"predicate": "has_storeys", "floors": floors},
        claim_type="storey_list",
        confidence=0.95,
        status="unresolved",
    )


def _set_canonical(scope, floors):
    """Helper: write canonical_floors directly (bypassing promotion)."""
    scope.canonical_floors = [
        {
            "code": (f.get("code") or f["name"]),
            "name": f["name"],
            "elevation_m": f.get("elevation_m"),
            "aliases": f.get("aliases", []),
        }
        for f in floors
    ]
    scope.save(update_fields=["canonical_floors"])


# ---------------------------------------------------------------------------
# check_storey_deviation — pure function
# ---------------------------------------------------------------------------

def test_no_scope_returns_empty(project, source_file):
    m = Model.objects.create(
        project=project, source_file=source_file,
        name="No-scope", original_filename="x.ifc", status="ready",
    )
    assert check_storey_deviation(m) == []


def test_empty_canonical_returns_empty(model):
    # Scope exists but canonical_floors is the default empty list.
    assert check_storey_deviation(model) == []


def test_no_storey_claim_returns_empty(model, scope):
    _set_canonical(scope, [{"name": "01", "elevation_m": 0.0}])
    # No Claim emitted yet.
    assert check_storey_deviation(model) == []


def test_exact_name_match_passes(model, scope, source_file, extraction_run):
    _set_canonical(scope, [
        {"name": "01", "elevation_m": 0.0},
        {"name": "02", "elevation_m": 3.5},
    ])
    _make_claim(source_file, extraction_run, scope, [
        {"name": "01", "elevation_m": 0.0, "guid": "g1"},
        {"name": "02", "elevation_m": 3.5, "guid": "g2"},
    ])
    assert check_storey_deviation(model) == []


def test_alias_match_passes(model, scope, source_file, extraction_run):
    _set_canonical(scope, [{"name": "01", "elevation_m": 0.0, "aliases": ["L01"]}])
    _make_claim(source_file, extraction_run, scope, [
        {"name": "L01", "elevation_m": 0.0, "guid": "g1"},
    ])
    assert check_storey_deviation(model) == []


def test_name_differs_within_tolerance_warns(model, scope, source_file, extraction_run):
    _set_canonical(scope, [{"name": "01", "elevation_m": 0.0}])
    _make_claim(source_file, extraction_run, scope, [
        {"name": "First Floor", "elevation_m": 0.05, "guid": "g1"},
    ])

    issues = check_storey_deviation(model)
    warnings = [i for i in issues if i.severity == "warning"]
    errors = [i for i in issues if i.severity == "error"]

    # 1 rename warning. No errors. No "missing canonical" warning either —
    # the canonical floor was matched via the elevation rule.
    assert len(warnings) == 1
    assert len(errors) == 0
    assert warnings[0].rule_id == STOREY_MATCH_RULE_ID
    assert "First Floor" in warnings[0].message
    assert "name differs" in warnings[0].message


def test_elevation_outside_tolerance_errors(model, scope, source_file, extraction_run):
    _set_canonical(scope, [{"name": "01", "elevation_m": 0.0}])
    _make_claim(source_file, extraction_run, scope, [
        {"name": "Mezz", "elevation_m": 2.5, "guid": "g1"},
    ])

    issues = check_storey_deviation(model)
    errors = [i for i in issues if i.severity == "error"]
    warnings = [i for i in issues if i.severity == "warning"]

    # 1 error for the deviating floor + 1 warning for the canonical that's
    # missing in the model.
    assert len(errors) == 1
    assert len(warnings) == 1
    assert "Mezz" in errors[0].message
    assert "no match in canonical" in errors[0].message
    assert "01" in warnings[0].message
    assert "not present in this model" in warnings[0].message


def test_missing_canonical_floor_warns(model, scope, source_file, extraction_run):
    _set_canonical(scope, [
        {"name": "01", "elevation_m": 0.0},
        {"name": "02", "elevation_m": 3.5},
        {"name": "03", "elevation_m": 7.0},
    ])
    # Only 2 of 3 canonical floors proposed.
    _make_claim(source_file, extraction_run, scope, [
        {"name": "01", "elevation_m": 0.0, "guid": "g1"},
        {"name": "02", "elevation_m": 3.5, "guid": "g2"},
    ])

    issues = check_storey_deviation(model)
    assert len(issues) == 1
    assert issues[0].severity == "warning"
    assert "03" in issues[0].message
    assert "not present in this model" in issues[0].message


def test_case_insensitive_name_match(model, scope, source_file, extraction_run):
    _set_canonical(scope, [{"name": "L01", "elevation_m": 0.0}])
    _make_claim(source_file, extraction_run, scope, [
        {"name": "l01", "elevation_m": 0.0, "guid": "g1"},
    ])
    assert check_storey_deviation(model) == []


# ---------------------------------------------------------------------------
# Publish gate
# ---------------------------------------------------------------------------

def _publish(client, model_id):
    return client.post(f"/api/models/{model_id}/publish/")


def test_publish_gate_blocks_when_flag_on_and_errors(
    project, model, scope, source_file, extraction_run,
):
    _set_canonical(scope, [{"name": "01", "elevation_m": 0.0}])
    _make_claim(source_file, extraction_run, scope, [
        {"name": "Mezz", "elevation_m": 5.0, "guid": "g1"},  # outside tolerance → error
    ])
    ProjectConfig.objects.create(
        project=project, version=1, is_active=True,
        block_on_storey_deviation=True,
    )

    response = _publish(APIClient(), model.id)

    assert response.status_code == 402
    body = response.json()
    assert body["gate"] == "storey_deviation"
    assert any(i["severity"] == "error" for i in body["issues"])
    model.refresh_from_db()
    assert model.is_published is False


def test_publish_gate_passes_when_flag_off(
    project, model, scope, source_file, extraction_run,
):
    _set_canonical(scope, [{"name": "01", "elevation_m": 0.0}])
    _make_claim(source_file, extraction_run, scope, [
        {"name": "Mezz", "elevation_m": 5.0, "guid": "g1"},  # would be an error
    ])
    ProjectConfig.objects.create(
        project=project, version=1, is_active=True,
        block_on_storey_deviation=False,
    )

    response = _publish(APIClient(), model.id)

    assert response.status_code == 200
    model.refresh_from_db()
    assert model.is_published is True


def test_publish_gate_passes_when_only_warnings(
    project, model, scope, source_file, extraction_run,
):
    _set_canonical(scope, [{"name": "01", "elevation_m": 0.0}])
    # Within tolerance, name differs → produces a warning, no error.
    _make_claim(source_file, extraction_run, scope, [
        {"name": "First", "elevation_m": 0.05, "guid": "g1"},
    ])
    ProjectConfig.objects.create(
        project=project, version=1, is_active=True,
        block_on_storey_deviation=True,
    )

    response = _publish(APIClient(), model.id)

    assert response.status_code == 200
    model.refresh_from_db()
    assert model.is_published is True


# ---------------------------------------------------------------------------
# Dashboard metrics surfacing
# ---------------------------------------------------------------------------

def test_dashboard_metrics_surfaces_synthetic_action_item(
    project, model, scope, source_file, extraction_run,
):
    _set_canonical(scope, [{"name": "01", "elevation_m": 0.0}])
    _make_claim(source_file, extraction_run, scope, [
        {"name": "Mezz", "elevation_m": 5.0, "guid": "g1"},
    ])

    client = APIClient()
    response = client.get(f"/api/types/types/dashboard-metrics/?project_id={project.id}")
    assert response.status_code == 200

    items = response.json()["action_items"]
    synthetic = [i for i in items if i["type_id"] == f"model:{model.id}"]
    assert len(synthetic) == 1
    item = synthetic[0]
    assert item["type_name"] == "Storey deviation"
    assert item["model_id"] == str(model.id)
    assert item["verification_status"] == "flagged"
    assert any(iss["rule_id"] == STOREY_MATCH_RULE_ID for iss in item["issues"])

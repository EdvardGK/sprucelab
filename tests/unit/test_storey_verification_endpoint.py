"""
Unit tests for ``compute_storey_verification`` + the
``GET /api/models/{id}/storey-verification/`` endpoint.

These cover the per-storey status payload used by the Model page's Storeys
card to annotate IFC-products-per-storey bars with canonical-floor
verification (matched / rename / deviating) plus ghost rows for canonical
floors missing from this model.
"""
from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.entities.models.reporting import AnalysisStorey, ModelAnalysis
from apps.entities.services.verification_engine import compute_storey_verification
from apps.models.models import ExtractionRun, Model, SourceFile
from apps.projects.models import Project, ProjectScope


pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def project(db):
    return Project.objects.create(name="storey-verification-test", description="pytest")


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


def _set_canonical(scope, floors):
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


def _seed_analysis(model, storeys, total_products=None):
    """storeys = [{name, elevation, element_count}, ...]"""
    sum_in_storeys = sum(s.get("element_count", 0) for s in storeys)
    analysis = ModelAnalysis.objects.create(
        model=model,
        ifc_schema="IFC4",
        total_storeys=len(storeys),
        total_products=total_products if total_products is not None else sum_in_storeys,
    )
    for s in storeys:
        AnalysisStorey.objects.create(
            analysis=analysis,
            name=s["name"],
            elevation=s.get("elevation"),
            element_count=s.get("element_count", 0),
        )
    return analysis


# ---------------------------------------------------------------------------
# compute_storey_verification — service
# ---------------------------------------------------------------------------

def test_no_scope_returns_has_canonical_false(project, source_file):
    m = Model.objects.create(
        project=project, source_file=source_file,
        name="No-scope", original_filename="x.ifc", status="ready",
    )
    _seed_analysis(m, [{"name": "01", "elevation": 0.0, "element_count": 10}])

    payload = compute_storey_verification(m)

    assert payload["has_canonical"] is False
    assert payload["canonical_count"] == 0
    assert payload["matched_count"] == 0
    assert len(payload["model_storeys"]) == 1
    # Storey rows still populated; status is None when canonical missing.
    assert payload["model_storeys"][0]["status"] is None
    assert payload["missing_canonical"] == []


def test_empty_canonical_floors_returns_has_canonical_false(model):
    _seed_analysis(model, [{"name": "01", "elevation": 0.0, "element_count": 5}])
    payload = compute_storey_verification(model)
    assert payload["has_canonical"] is False
    assert payload["model_storeys"][0]["status"] is None


def test_no_analysis_returns_empty_storey_list(model, scope):
    _set_canonical(scope, [{"name": "01", "elevation_m": 0.0}])
    payload = compute_storey_verification(model)
    assert payload["has_canonical"] is True
    assert payload["canonical_count"] == 1
    assert payload["matched_count"] == 0
    assert payload["model_storeys"] == []
    # Reverse pass: the canonical floor is missing.
    assert len(payload["missing_canonical"]) == 1
    assert payload["missing_canonical"][0]["name"] == "01"


def test_exact_name_match_marks_matched(model, scope):
    _set_canonical(scope, [
        {"name": "01", "elevation_m": 0.0},
        {"name": "02", "elevation_m": 3.5},
    ])
    _seed_analysis(model, [
        {"name": "01", "elevation": 0.0, "element_count": 100},
        {"name": "02", "elevation": 3.5, "element_count": 80},
    ])

    payload = compute_storey_verification(model)

    assert payload["has_canonical"] is True
    assert payload["matched_count"] == 2
    assert payload["canonical_count"] == 2
    assert payload["missing_canonical"] == []
    assert {s["status"] for s in payload["model_storeys"]} == {"matched"}
    by_name = {s["name"]: s for s in payload["model_storeys"]}
    assert by_name["01"]["canonical_code"] == "01"
    assert by_name["01"]["elevation_delta_m"] == pytest.approx(0.0)


def test_alias_match_marks_matched(model, scope):
    _set_canonical(scope, [
        {"name": "01", "elevation_m": 0.0, "aliases": ["L01"]},
    ])
    _seed_analysis(model, [
        {"name": "L01", "elevation": 0.0, "element_count": 50},
    ])

    payload = compute_storey_verification(model)
    assert payload["matched_count"] == 1
    assert payload["model_storeys"][0]["status"] == "matched"


def test_name_differs_within_tolerance_marks_rename(model, scope):
    _set_canonical(scope, [{"name": "01", "elevation_m": 0.0}])
    _seed_analysis(model, [
        {"name": "First Floor", "elevation": 0.05, "element_count": 60},
    ])

    payload = compute_storey_verification(model)
    assert payload["matched_count"] == 1
    row = payload["model_storeys"][0]
    assert row["status"] == "rename"
    assert row["canonical_name"] == "01"
    assert row["elevation_delta_m"] == pytest.approx(0.05)
    assert payload["missing_canonical"] == []


def test_no_match_marks_deviating(model, scope):
    _set_canonical(scope, [{"name": "01", "elevation_m": 0.0}])
    _seed_analysis(model, [
        {"name": "Mezz", "elevation": 2.5, "element_count": 12},
    ])

    payload = compute_storey_verification(model)
    assert payload["matched_count"] == 0
    row = payload["model_storeys"][0]
    assert row["status"] == "deviating"
    assert row["canonical_code"] is None
    # Canonical 01 was never matched → surfaced as missing.
    assert len(payload["missing_canonical"]) == 1
    assert payload["missing_canonical"][0]["name"] == "01"


def test_missing_canonical_floor_surfaced(model, scope):
    _set_canonical(scope, [
        {"name": "01", "elevation_m": 0.0},
        {"name": "02", "elevation_m": 3.5},
        {"name": "03", "elevation_m": 7.0},
    ])
    _seed_analysis(model, [
        {"name": "01", "elevation": 0.0, "element_count": 100},
        {"name": "02", "elevation": 3.5, "element_count": 80},
    ])

    payload = compute_storey_verification(model)
    assert payload["matched_count"] == 2
    assert payload["canonical_count"] == 3
    assert len(payload["missing_canonical"]) == 1
    assert payload["missing_canonical"][0]["name"] == "03"
    assert payload["missing_canonical"][0]["elevation_m"] == pytest.approx(7.0)


def test_case_insensitive_name_match(model, scope):
    _set_canonical(scope, [{"name": "L01", "elevation_m": 0.0}])
    _seed_analysis(model, [
        {"name": "l01", "elevation": 0.0, "element_count": 30},
    ])

    payload = compute_storey_verification(model)
    assert payload["model_storeys"][0]["status"] == "matched"


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

def test_endpoint_returns_structured_payload(model, scope):
    _set_canonical(scope, [
        {"name": "01", "elevation_m": 0.0},
        {"name": "02", "elevation_m": 3.5},
    ])
    _seed_analysis(model, [
        {"name": "01", "elevation": 0.0, "element_count": 100},
        {"name": "Mezz", "elevation": 2.5, "element_count": 5},
    ])

    response = APIClient().get(f"/api/models/{model.id}/storey-verification/")
    assert response.status_code == 200
    body = response.json()

    assert body["has_canonical"] is True
    assert body["canonical_count"] == 2
    assert body["matched_count"] == 1
    assert body["tolerance_m"] == pytest.approx(0.2)
    # Two model storeys + 1 missing canonical (02).
    assert len(body["model_storeys"]) == 2
    statuses = {s["status"] for s in body["model_storeys"]}
    assert statuses == {"matched", "deviating"}
    assert len(body["missing_canonical"]) == 1
    assert body["missing_canonical"][0]["name"] == "02"


def test_endpoint_404_for_unknown_model():
    import uuid
    response = APIClient().get(f"/api/models/{uuid.uuid4()}/storey-verification/")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Orphan count — elements outside the spatial hierarchy
# ---------------------------------------------------------------------------

def test_orphan_count_zero_when_all_products_in_storeys(model, scope):
    _set_canonical(scope, [{"name": "01", "elevation_m": 0.0}])
    _seed_analysis(model, [
        {"name": "01", "elevation": 0.0, "element_count": 100},
    ], total_products=100)

    payload = compute_storey_verification(model)
    assert payload["orphan_count"] == 0
    assert payload["total_products"] == 100


def test_orphan_count_surfaces_unassigned_products(model, scope):
    _set_canonical(scope, [{"name": "01", "elevation_m": 0.0}])
    _seed_analysis(model, [
        {"name": "01", "elevation": 0.0, "element_count": 90},
    ], total_products=100)  # 10 products outside spatial hierarchy

    payload = compute_storey_verification(model)
    assert payload["orphan_count"] == 10
    assert payload["total_products"] == 100


def test_orphan_count_clamps_non_negative_when_no_canonical(model):
    _seed_analysis(model, [
        {"name": "01", "elevation": 0.0, "element_count": 50},
    ], total_products=60)

    payload = compute_storey_verification(model)
    assert payload["has_canonical"] is False
    assert payload["orphan_count"] == 10


def test_orphan_excludes_non_physical_classes(model, scope):
    """Openings / annotations / grids never live in storey containment —
    they shouldn't inflate the orphan metric. Physical_total should
    subtract those from total_products before computing orphan."""
    from apps.entities.models.reporting import AnalysisType

    _set_canonical(scope, [{"name": "01", "elevation_m": 0.0}])
    analysis = _seed_analysis(model, [
        {"name": "01", "elevation": 0.0, "element_count": 100},
    ], total_products=180)

    # Seed 80 non-physical instances split across the excluded classes.
    AnalysisType.objects.create(
        analysis=analysis,
        type_class="IfcOpeningElementType",
        element_class="IfcOpeningElement",
        type_name="Wall opening",
        instance_count=60,
    )
    AnalysisType.objects.create(
        analysis=analysis,
        type_class="IfcAnnotationType",
        element_class="IfcAnnotation",
        type_name="Dim",
        instance_count=15,
    )
    AnalysisType.objects.create(
        analysis=analysis,
        type_class="IfcGridType",
        element_class="IfcGrid",
        type_name="Grid",
        instance_count=5,
    )

    payload = compute_storey_verification(model)
    assert payload["total_products"] == 180
    assert payload["non_physical_count"] == 80
    assert payload["physical_total"] == 100
    # 100 physical products, all 100 in storeys → 0 orphans (not 80 like the
    # naive total_products − sum_storey calc would have given).
    assert payload["orphan_count"] == 0

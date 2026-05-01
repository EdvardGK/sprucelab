"""F-3 — ``GET /api/projects/scopes/{id}/floors/``."""
from __future__ import annotations

import pytest

from apps.entities.models import Claim
from apps.models.models import ExtractionRun, Model, SourceFile
from apps.projects.models import Project, ProjectScope


pytestmark = pytest.mark.django_db


@pytest.fixture
def project(db):
    return Project.objects.create(name="floors-endpoint-test")


@pytest.fixture
def scope(project):
    return ProjectScope.objects.create(
        project=project,
        name="Building A",
        scope_type="building",
        storey_merge_tolerance_m=0.2,
    )


def _make_model(project, scope, *, name="ARK", filename="ark.ifc"):
    sf = SourceFile.objects.create(
        project=project,
        scope=scope,
        original_filename=filename,
        format="ifc",
        file_size=1,
        checksum_sha256="0" * 64,
    )
    run = ExtractionRun.objects.create(source_file=sf, status="completed")
    model = Model.objects.create(
        project=project,
        scope=scope,
        source_file=sf,
        name=name,
        original_filename=filename,
        status="ready",
    )
    return model, sf, run


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


def test_empty_scope_returns_empty_payload(client, scope):
    resp = client.get(f"/api/projects/scopes/{scope.id}/floors/")
    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert body["scope_id"] == str(scope.id)
    assert body["scope_name"] == "Building A"
    assert body["storey_merge_tolerance_m"] == pytest.approx(0.2)
    assert body["canonical_floors"] == []
    assert body["models"] == []


def test_canonical_floors_round_trip(client, scope):
    _set_canonical(scope, [
        {"name": "Ground", "elevation_m": 0.0, "aliases": ["GF"]},
        {"name": "L1", "elevation_m": 3.5},
    ])
    body = client.get(f"/api/projects/scopes/{scope.id}/floors/").json()
    names = [f["name"] for f in body["canonical_floors"]]
    assert names == ["Ground", "L1"]
    assert body["canonical_floors"][0]["aliases"] == ["GF"]


def test_model_with_no_claim_has_no_issues(client, project, scope):
    _set_canonical(scope, [{"name": "Ground", "elevation_m": 0.0}])
    model, _, _ = _make_model(project, scope)

    body = client.get(f"/api/projects/scopes/{scope.id}/floors/").json()
    assert len(body["models"]) == 1
    m = body["models"][0]
    assert m["model_id"] == str(model.id)
    assert m["proposed_floors"] == []
    assert m["issues"] == []


def test_matching_claim_yields_clean_diff(client, project, scope):
    _set_canonical(scope, [{"name": "Ground", "elevation_m": 0.0, "aliases": ["GF"]}])
    model, sf, run = _make_model(project, scope)
    _make_claim(sf, run, scope, [{"name": "GF", "elevation_m": 0.0}])

    body = client.get(f"/api/projects/scopes/{scope.id}/floors/").json()
    m = body["models"][0]
    assert m["proposed_floors"] == [
        {"name": "GF", "elevation_m": 0.0, "source_guid": None},
    ]
    assert m["issues"] == []


def test_deviating_claim_surfaces_error_and_missing_warning(client, project, scope):
    _set_canonical(scope, [{"name": "Ground", "elevation_m": 0.0}])
    model, sf, run = _make_model(project, scope)
    _make_claim(sf, run, scope, [{"name": "Mezz", "elevation_m": 5.0}])

    body = client.get(f"/api/projects/scopes/{scope.id}/floors/").json()
    m = body["models"][0]
    severities = sorted(i["severity"] for i in m["issues"])
    assert severities == ["error", "warning"]
    assert any("Mezz" in i["message"] for i in m["issues"] if i["severity"] == "error")
    assert any("Ground" in i["message"] for i in m["issues"] if i["severity"] == "warning")


def test_multi_model_mix(client, project, scope):
    _set_canonical(scope, [{"name": "Ground", "elevation_m": 0.0}])
    m1, sf1, run1 = _make_model(project, scope, name="ARK", filename="ark.ifc")
    m2, sf2, run2 = _make_model(project, scope, name="RIB", filename="rib.ifc")
    _make_claim(sf1, run1, scope, [{"name": "Ground", "elevation_m": 0.0}])
    _make_claim(sf2, run2, scope, [{"name": "Mezz", "elevation_m": 5.0}])

    body = client.get(f"/api/projects/scopes/{scope.id}/floors/").json()
    by_name = {m["model_name"]: m for m in body["models"]}
    assert by_name["ARK"]["issues"] == []
    assert any(i["severity"] == "error" for i in by_name["RIB"]["issues"])

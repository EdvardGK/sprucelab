"""
Unit tests for storey_list claim promotion (Phase F-1).

Covers the new ``_promote_storey_list_into_scope`` branch in
``apps.entities.services.claim_promotion``. Verifies:

  - Empty canonical list is populated by first promotion.
  - Subsequent promotion within tolerance merges as alias.
  - Subsequent promotion outside tolerance creates a new floor.
  - Existing name/alias matches are no-ops.
  - dry_run does not persist.
  - Capability manifest exposes ``floor.canonical.changed``.
"""
from __future__ import annotations

import pytest

from apps.entities.models import Claim
from apps.entities.services.claim_promotion import (
    SCOPE_CANONICAL_FLOORS_SECTION,
    promote_claim,
)
from apps.entities.services.storey_claim_emitter import emit_storey_list_claim
from apps.models.models import ExtractionRun, SourceFile
from apps.projects.models import Project, ProjectScope


pytestmark = pytest.mark.django_db


@pytest.fixture
def project_with_scope(db):
    project = Project.objects.create(name="floor-test", description="pytest")
    scope = ProjectScope.objects.create(
        project=project, name="Building A", scope_type="building",
        storey_merge_tolerance_m=0.2,
    )
    sf = SourceFile.objects.create(
        project=project,
        scope=scope,
        original_filename="model.ifc",
        format="ifc",
        file_size=1234,
        checksum_sha256="0" * 64,
    )
    run = ExtractionRun.objects.create(source_file=sf, status="completed")
    return project, scope, sf, run


def _make_storey_claim(sf, run, scope, floors):
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


def test_first_promotion_populates_empty_canonical_list(project_with_scope):
    _, scope, sf, run = project_with_scope
    claim = _make_storey_claim(sf, run, scope, [
        {"name": "01", "elevation_m": 0.0, "guid": "g1"},
        {"name": "02", "elevation_m": 3.5, "guid": "g2"},
    ])

    result = promote_claim(claim)

    assert result["dry_run"] is False
    assert result["status"] == "promoted"
    assert result["config_section"] == SCOPE_CANONICAL_FLOORS_SECTION
    assert len(result["diff"]["added"]) == 2
    assert result["diff"]["alias_merges"] == []

    scope.refresh_from_db()
    assert len(scope.canonical_floors) == 2
    by_name = {f["name"]: f for f in scope.canonical_floors}
    assert by_name["01"]["elevation_m"] == 0.0
    assert by_name["02"]["elevation_m"] == 3.5
    assert by_name["01"]["_promoted_from_claim"] == str(claim.id)

    claim.refresh_from_db()
    assert claim.status == "promoted"
    assert claim.promoted_to_scope_id == scope.id
    assert claim.config_section == SCOPE_CANONICAL_FLOORS_SECTION


def test_alias_merge_within_tolerance(project_with_scope):
    _, scope, sf, run = project_with_scope
    first = _make_storey_claim(sf, run, scope, [
        {"name": "01", "elevation_m": 0.0, "guid": "g1"},
    ])
    promote_claim(first)

    # Second claim: same elevation (well within 0.2m tolerance), different name.
    second = _make_storey_claim(sf, run, scope, [
        {"name": "L01", "elevation_m": 0.05, "guid": "g2"},
    ])
    result = promote_claim(second)

    assert len(result["diff"]["added"]) == 0
    assert len(result["diff"]["alias_merges"]) == 1
    assert result["diff"]["alias_merges"][0]["added_alias"] == "L01"

    scope.refresh_from_db()
    assert len(scope.canonical_floors) == 1
    floor = scope.canonical_floors[0]
    assert floor["name"] == "01"
    assert "L01" in floor["aliases"]


def test_outside_tolerance_creates_new_floor(project_with_scope):
    _, scope, sf, run = project_with_scope
    first = _make_storey_claim(sf, run, scope, [
        {"name": "01", "elevation_m": 0.0, "guid": "g1"},
    ])
    promote_claim(first)

    # Different elevation (outside 0.2m tolerance) → new canonical floor.
    second = _make_storey_claim(sf, run, scope, [
        {"name": "01-mezz", "elevation_m": 1.8, "guid": "g2"},
    ])
    result = promote_claim(second)

    assert len(result["diff"]["added"]) == 1
    assert result["diff"]["alias_merges"] == []

    scope.refresh_from_db()
    assert len(scope.canonical_floors) == 2


def test_existing_name_match_is_noop(project_with_scope):
    _, scope, sf, run = project_with_scope
    first = _make_storey_claim(sf, run, scope, [
        {"name": "01", "elevation_m": 0.0, "guid": "g1"},
    ])
    promote_claim(first)

    # Same name on a different elevation — name match wins (rule 1) so it's a no-op.
    second = _make_storey_claim(sf, run, scope, [
        {"name": "01", "elevation_m": 5.0, "guid": "g2"},
    ])
    result = promote_claim(second)

    assert result["diff"]["added"] == []
    assert result["diff"]["alias_merges"] == []

    scope.refresh_from_db()
    assert len(scope.canonical_floors) == 1
    assert scope.canonical_floors[0]["elevation_m"] == 0.0  # original kept


def test_dry_run_does_not_persist(project_with_scope):
    _, scope, sf, run = project_with_scope
    claim = _make_storey_claim(sf, run, scope, [
        {"name": "01", "elevation_m": 0.0, "guid": "g1"},
    ])

    result = promote_claim(claim, dry_run=True)

    assert result["dry_run"] is True
    assert result["would_set_status"] == "promoted"
    assert len(result["next_canonical_floors"]) == 1

    scope.refresh_from_db()
    assert scope.canonical_floors == []  # unchanged
    claim.refresh_from_db()
    assert claim.status == "unresolved"
    assert claim.promoted_to_scope_id is None


def test_emit_storey_list_claim_creates_unresolved_claim(project_with_scope):
    _, scope, sf, run = project_with_scope
    storeys = [
        {"name": "01", "elevation_m": 0.0, "guid": "g1"},
        {"name": "02", "elevation_m": 3.5, "guid": "g2"},
    ]

    claim_id = emit_storey_list_claim(
        source_file=sf, extraction_run=run, storeys=storeys,
    )

    assert claim_id is not None
    claim = Claim.objects.get(id=claim_id)
    assert claim.claim_type == "storey_list"
    assert claim.status == "unresolved"
    assert claim.scope_id == scope.id
    assert len(claim.normalized["floors"]) == 2


def test_emit_storey_list_claim_skips_empty_input(project_with_scope):
    _, _, sf, run = project_with_scope
    assert emit_storey_list_claim(source_file=sf, extraction_run=run, storeys=[]) is None
    assert emit_storey_list_claim(source_file=sf, extraction_run=run, storeys=None) is None


def test_capability_manifest_exposes_floor_event(client, db):
    response = client.get("/api/capabilities/")
    assert response.status_code == 200
    body = response.json()
    assert "floor.canonical.changed" in body["events"]["wired"]

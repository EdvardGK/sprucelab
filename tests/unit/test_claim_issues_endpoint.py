"""
Tests for the /api/types/types/claim-issues/ endpoint and the underlying
``claim_issue_resolver`` service.

The endpoint is the warehouse-side read of what the verification engine
writes into ``TypeMapping.verification_issues``: it joins the issue's
``rule_id`` (``claim:<uuid>`` for claim-derived rules) back to the
originating ``Claim`` so the UI can render full provenance.

These tests inject the issues directly rather than running the engine, so
they exercise the read path in isolation.
"""
from __future__ import annotations

import uuid

import pytest

from apps.entities.models import Claim, DocumentContent, IFCType, TypeMapping
from apps.models.models import ExtractionRun, Model, SourceFile
from apps.projects.models import Project


pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def project(db):
    return Project.objects.create(name="claim-issues-test", description="pytest")


@pytest.fixture
def source_file(project):
    return SourceFile.objects.create(
        project=project,
        original_filename="spec.pdf",
        format="pdf",
        file_size=1234,
        checksum_sha256="0" * 64,
    )


@pytest.fixture
def extraction_run(source_file):
    return ExtractionRun.objects.create(source_file=source_file, status="completed")


@pytest.fixture
def document(source_file, extraction_run):
    return DocumentContent.objects.create(
        source_file=source_file,
        extraction_run=extraction_run,
        markdown_content="Fire walls shall be REI60.",
        extraction_method="text_layer",
    )


@pytest.fixture
def model_a(project, source_file):
    return Model.objects.create(
        project=project,
        source_file=source_file,
        name="Architecture",
        original_filename="arch.ifc",
    )


@pytest.fixture
def model_b(project, source_file):
    return Model.objects.create(
        project=project,
        source_file=source_file,
        name="Structure",
        original_filename="struct.ifc",
    )


def _make_type_with_mapping(model, type_name, issues):
    ifc_type = IFCType.objects.create(
        model=model,
        type_guid=str(uuid.uuid4()),
        type_name=type_name,
        ifc_type="IfcWallType",
        instance_count=5,
    )
    TypeMapping.objects.create(ifc_type=ifc_type, verification_issues=issues)
    return ifc_type


def _make_claim(sf, run, doc, *, statement, predicate, subject, value, units):
    return Claim.objects.create(
        source_file=sf,
        document=doc,
        extraction_run=run,
        statement=statement,
        normalized={
            "predicate": predicate,
            "subject": subject,
            "value": value,
            "units": units,
            "lang": "en",
        },
        claim_type="rule",
        confidence=0.9,
        status="promoted",
    )


def _claim_issue(claim_id, value):
    return {
        "rule_id": f"claim:{claim_id}",
        "rule_name": f"Fire resistance: {value}",
        "severity": "info",
        "message": f"Claim says: Fire walls shall be {value}.",
    }


# ---------------------------------------------------------------------------
# Service: resolve_type_claim_issues
# ---------------------------------------------------------------------------


def test_resolver_attaches_claim_metadata(source_file, extraction_run, document, model_a):
    from apps.entities.services.claim_issue_resolver import resolve_type_claim_issues

    claim = _make_claim(
        source_file, extraction_run, document,
        statement="Fire walls shall be REI60.",
        predicate="fire_resistance_class",
        subject="Fire walls",
        value="REI60",
        units="class",
    )
    _make_type_with_mapping(model_a, "Concrete fire walls 200mm", [
        _claim_issue(claim.id, "REI60"),
    ])

    rows = resolve_type_claim_issues(
        project_id=str(model_a.project_id),
        type_name="Concrete fire walls 200mm",
    )
    assert len(rows) == 1
    row = rows[0]
    assert row["rule_id"] == f"claim:{claim.id}"
    assert row["severity"] == "info"
    assert row["model_name"] == "Architecture"
    assert row["claim"] is not None
    assert row["claim"]["id"] == str(claim.id)
    assert row["claim"]["statement"] == "Fire walls shall be REI60."
    assert row["claim"]["predicate"] == "fire_resistance_class"
    assert row["claim"]["value"] == "REI60"
    assert row["claim"]["document_filename"] == "spec.pdf"


def test_resolver_returns_empty_when_no_mappings(project):
    from apps.entities.services.claim_issue_resolver import resolve_type_claim_issues

    rows = resolve_type_claim_issues(
        project_id=str(project.id), type_name="Nonexistent",
    )
    assert rows == []


def test_resolver_non_claim_rule_returns_null_claim(model_a):
    from apps.entities.services.claim_issue_resolver import resolve_type_claim_issues

    _make_type_with_mapping(model_a, "Wall A", [
        {
            "rule_id": "has_ns3451",
            "rule_name": "NS3451 classification required",
            "severity": "error",
            "message": "Type missing NS3451 code",
        },
    ])

    rows = resolve_type_claim_issues(
        project_id=str(model_a.project_id), type_name="Wall A",
    )
    assert len(rows) == 1
    assert rows[0]["claim"] is None
    assert rows[0]["rule_id"] == "has_ns3451"
    assert rows[0]["severity"] == "error"


def test_resolver_aggregates_across_models_and_sorts_by_severity(
    source_file, extraction_run, document, model_a, model_b,
):
    from apps.entities.services.claim_issue_resolver import resolve_type_claim_issues

    claim = _make_claim(
        source_file, extraction_run, document,
        statement="Fire walls shall be REI60.",
        predicate="fire_resistance_class",
        subject="Fire walls",
        value="REI60",
        units="class",
    )
    _make_type_with_mapping(model_a, "Fire wall T1", [
        _claim_issue(claim.id, "REI60"),  # info
    ])
    _make_type_with_mapping(model_b, "Fire wall T1", [
        {
            "rule_id": "has_ns3451",
            "rule_name": "NS3451 classification required",
            "severity": "error",
            "message": "Type missing NS3451 code",
        },
    ])

    rows = resolve_type_claim_issues(
        project_id=str(model_a.project_id), type_name="Fire wall T1",
    )
    assert len(rows) == 2
    # error sorts before info
    assert rows[0]["severity"] == "error"
    assert rows[1]["severity"] == "info"


def test_resolver_severity_filter(model_a):
    from apps.entities.services.claim_issue_resolver import resolve_type_claim_issues

    _make_type_with_mapping(model_a, "Wall A", [
        {"rule_id": "r1", "rule_name": "R1", "severity": "error", "message": "x"},
        {"rule_id": "r2", "rule_name": "R2", "severity": "info", "message": "y"},
    ])

    rows = resolve_type_claim_issues(
        project_id=str(model_a.project_id),
        type_name="Wall A",
        severities=["info"],
    )
    assert len(rows) == 1
    assert rows[0]["severity"] == "info"


def test_resolver_model_id_narrows_scope(
    source_file, extraction_run, document, model_a, model_b,
):
    from apps.entities.services.claim_issue_resolver import resolve_type_claim_issues

    claim = _make_claim(
        source_file, extraction_run, document,
        statement="Fire walls shall be REI60.",
        predicate="fire_resistance_class",
        subject="Fire walls",
        value="REI60",
        units="class",
    )
    _make_type_with_mapping(model_a, "Fire wall T1", [_claim_issue(claim.id, "REI60")])
    _make_type_with_mapping(model_b, "Fire wall T1", [_claim_issue(claim.id, "REI60")])

    rows = resolve_type_claim_issues(
        project_id=str(model_a.project_id),
        type_name="Fire wall T1",
        model_id=str(model_a.id),
    )
    assert len(rows) == 1
    assert rows[0]["model_id"] == str(model_a.id)


def test_resolver_orphan_claim_id_falls_back_to_null(model_a):
    """If the rule_id references a deleted claim, the row still surfaces
    with claim=None — the engine output is the source of truth even if
    the originating Claim row is gone."""
    from apps.entities.services.claim_issue_resolver import resolve_type_claim_issues

    _make_type_with_mapping(model_a, "Wall A", [
        _claim_issue(uuid.uuid4(), "REI60"),  # claim doesn't exist
    ])

    rows = resolve_type_claim_issues(
        project_id=str(model_a.project_id), type_name="Wall A",
    )
    assert len(rows) == 1
    assert rows[0]["claim"] is None
    assert rows[0]["rule_id"].startswith("claim:")


# ---------------------------------------------------------------------------
# Endpoint: GET /api/types/types/claim-issues/
# ---------------------------------------------------------------------------


def test_endpoint_returns_results_envelope(
    client, source_file, extraction_run, document, model_a,
):
    claim = _make_claim(
        source_file, extraction_run, document,
        statement="Fire walls shall be REI60.",
        predicate="fire_resistance_class",
        subject="Fire walls",
        value="REI60",
        units="class",
    )
    _make_type_with_mapping(model_a, "Fire wall A", [_claim_issue(claim.id, "REI60")])

    resp = client.get(
        f"/api/types/types/claim-issues/?project={model_a.project_id}&type_name=Fire wall A"
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 1
    assert len(data["results"]) == 1
    assert data["results"][0]["claim"]["id"] == str(claim.id)


def test_endpoint_400_when_project_missing(client):
    resp = client.get("/api/types/types/claim-issues/?type_name=Wall A")
    assert resp.status_code == 400


def test_endpoint_400_when_type_name_missing(client, project):
    resp = client.get(f"/api/types/types/claim-issues/?project={project.id}")
    assert resp.status_code == 400


def test_endpoint_empty_when_no_issues(client, project):
    resp = client.get(
        f"/api/types/types/claim-issues/?project={project.id}&type_name=Anything"
    )
    assert resp.status_code == 200
    assert resp.json() == {"count": 0, "results": []}

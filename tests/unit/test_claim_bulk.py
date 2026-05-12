"""
Unit tests for entity_ifc_type on IFCType, ClaimSerializer assignee fields,
and the bulk-assign / bulk-resolve / bulk-dismiss endpoints.

Coverage:
- IFCType.entity_ifc_type field exists, defaults to empty string, queryable.
- ClaimSerializer surfaces assignee + assignee_username.
- bulk_assign with dry_run=true returns count but doesn't write.
- bulk_assign without dry_run writes assignee + assigned_at.
- bulk_resolve skips already-promoted claims.
- bulk_dismiss requires reason (400 if missing).
"""
from __future__ import annotations

import uuid

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.entities.models import Claim, IFCType
from apps.entities.serializers import ClaimListSerializer, ClaimSerializer
from apps.models.models import ExtractionRun, Model, SourceFile
from apps.projects.models import Project

User = get_user_model()

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def project(db):
    return Project.objects.create(name="bulk-test-project")


@pytest.fixture
def model_obj(project):
    sf = SourceFile.objects.create(
        project=project,
        original_filename="test.ifc",
        format="ifc",
        file_size=1,
    )
    return Model.objects.create(
        project=project,
        source_file=sf,
        name="TestModel",
        original_filename="test.ifc",
    )


@pytest.fixture
def source_file_and_run(project):
    sf = SourceFile.objects.create(
        project=project,
        original_filename="spec.pdf",
        format="pdf",
        file_size=1234,
        checksum_sha256="a" * 64,
    )
    run = ExtractionRun.objects.create(source_file=sf, status="completed")
    return sf, run


@pytest.fixture
def user(db):
    return User.objects.create_user(username="tester", password="pass")


@pytest.fixture
def api_client():
    return APIClient()


def _make_claim(sf, run, *, status="unresolved", statement="test claim"):
    return Claim.objects.create(
        source_file=sf,
        extraction_run=run,
        statement=statement,
        normalized={"predicate": "fire_resistance_class", "subject": "Walls", "value": "REI60"},
        claim_type="rule",
        confidence=0.9,
        status=status,
    )


# ---------------------------------------------------------------------------
# IFCType.entity_ifc_type field
# ---------------------------------------------------------------------------


def test_entity_ifc_type_field_defaults_to_empty_string(model_obj):
    """entity_ifc_type defaults to empty string when not provided."""
    t = IFCType.objects.create(
        model=model_obj,
        type_guid=str(uuid.uuid4()),
        type_name="BasicWall",
        ifc_type="IfcWallType",
        instance_count=5,
    )
    assert t.entity_ifc_type == ""


def test_entity_ifc_type_can_be_stored_and_queried(model_obj):
    """entity_ifc_type can be written, read back, and filtered on."""
    guid = str(uuid.uuid4())
    IFCType.objects.create(
        model=model_obj,
        type_guid=guid,
        type_name="SomeWall",
        ifc_type="IfcWallType",
        entity_ifc_type="IfcWall",
        instance_count=3,
    )
    fetched = IFCType.objects.get(type_guid=guid)
    assert fetched.entity_ifc_type == "IfcWall"

    # Should be filterable
    qs = IFCType.objects.filter(entity_ifc_type="IfcWall")
    assert qs.filter(type_guid=guid).exists()


def test_entity_ifc_type_is_empty_for_type_without_instances(model_obj):
    """Types with zero instances should have empty entity_ifc_type."""
    t = IFCType.objects.create(
        model=model_obj,
        type_guid=str(uuid.uuid4()),
        type_name="UnusedDoor",
        ifc_type="IfcDoorType",
        entity_ifc_type="",
        instance_count=0,
    )
    assert t.entity_ifc_type == ""


# ---------------------------------------------------------------------------
# ClaimSerializer surfaces assignee + assignee_username
# ---------------------------------------------------------------------------


def test_claim_serializer_has_assignee_fields(source_file_and_run, user):
    """ClaimSerializer includes assignee, assignee_username, assigned_at, due_date."""
    sf, run = source_file_and_run
    claim = _make_claim(sf, run)
    claim.assignee = user
    from django.utils import timezone
    claim.assigned_at = timezone.now()
    claim.save()

    data = ClaimSerializer(claim).data
    assert "assignee" in data
    assert "assignee_username" in data
    assert "assigned_at" in data
    assert "due_date" in data
    assert data["assignee"] == user.pk
    assert data["assignee_username"] == user.username


def test_claim_list_serializer_has_assignee_fields(source_file_and_run, user):
    """ClaimListSerializer also surfaces assignee and assignee_username."""
    sf, run = source_file_and_run
    claim = _make_claim(sf, run)
    claim.assignee = user
    claim.save()

    data = ClaimListSerializer(claim).data
    assert "assignee" in data
    assert "assignee_username" in data
    assert data["assignee"] == user.pk
    assert data["assignee_username"] == user.username


def test_claim_serializer_assignee_username_is_none_when_unassigned(source_file_and_run):
    """assignee_username is None when no assignee is set."""
    sf, run = source_file_and_run
    claim = _make_claim(sf, run)
    data = ClaimSerializer(claim).data
    assert data["assignee"] is None
    assert data["assignee_username"] is None


# ---------------------------------------------------------------------------
# bulk_assign endpoint
# ---------------------------------------------------------------------------


def test_bulk_assign_dry_run_returns_count_without_writing(source_file_and_run, user, api_client):
    """dry_run=true returns updated count but does not persist the assignment."""
    sf, run = source_file_and_run
    c1 = _make_claim(sf, run)
    c2 = _make_claim(sf, run)

    response = api_client.post(
        "/api/types/claims/bulk-assign/?dry_run=true",
        data={"claim_ids": [str(c1.id), str(c2.id)], "assignee_id": user.pk},
        format="json",
    )
    assert response.status_code == 200, response.data
    assert response.data["dry_run"] is True
    assert response.data["updated"] == 2
    assert response.data["skipped"] == []

    # DB must not have changed
    c1.refresh_from_db()
    c2.refresh_from_db()
    assert c1.assignee is None
    assert c2.assignee is None


def test_bulk_assign_writes_assignee_and_stamps_assigned_at(source_file_and_run, user, api_client):
    """Non-dry-run bulk_assign writes assignee + assigned_at."""
    sf, run = source_file_and_run
    c1 = _make_claim(sf, run)
    c2 = _make_claim(sf, run)

    response = api_client.post(
        "/api/types/claims/bulk-assign/",
        data={"claim_ids": [str(c1.id), str(c2.id)], "assignee_id": user.pk},
        format="json",
    )
    assert response.status_code == 200, response.data
    assert response.data["dry_run"] is False
    assert response.data["updated"] == 2
    assert response.data["skipped"] == []

    c1.refresh_from_db()
    c2.refresh_from_db()
    assert c1.assignee == user
    assert c2.assignee == user
    assert c1.assigned_at is not None
    assert c2.assigned_at is not None


def test_bulk_assign_unassign_sets_assignee_to_null(source_file_and_run, user, api_client):
    """Passing assignee_id=null unassigns the claim."""
    sf, run = source_file_and_run
    from django.utils import timezone
    c1 = _make_claim(sf, run)
    c1.assignee = user
    c1.assigned_at = timezone.now()
    c1.save()

    response = api_client.post(
        "/api/types/claims/bulk-assign/",
        data={"claim_ids": [str(c1.id)], "assignee_id": None},
        format="json",
    )
    assert response.status_code == 200, response.data
    c1.refresh_from_db()
    assert c1.assignee is None
    assert c1.assigned_at is None


def test_bulk_assign_skips_not_found_ids(source_file_and_run, user, api_client):
    """Non-existent claim IDs are reported in skipped list."""
    sf, run = source_file_and_run
    c1 = _make_claim(sf, run)
    fake_id = str(uuid.uuid4())

    response = api_client.post(
        "/api/types/claims/bulk-assign/",
        data={"claim_ids": [str(c1.id), fake_id], "assignee_id": user.pk},
        format="json",
    )
    assert response.status_code == 200, response.data
    assert response.data["updated"] == 1
    skipped = response.data["skipped"]
    assert len(skipped) == 1
    assert skipped[0]["id"] == fake_id
    assert skipped[0]["reason"] == "not_found"


# ---------------------------------------------------------------------------
# bulk_resolve endpoint
# ---------------------------------------------------------------------------


def test_bulk_resolve_skips_already_promoted_claims(source_file_and_run, api_client):
    """bulk_resolve skips claims not in 'unresolved' status."""
    sf, run = source_file_and_run
    c_unresolved = _make_claim(sf, run, status="unresolved")
    c_promoted = _make_claim(sf, run, status="promoted")

    response = api_client.post(
        "/api/types/claims/bulk-resolve/",
        data={"claim_ids": [str(c_unresolved.id), str(c_promoted.id)]},
        format="json",
    )
    assert response.status_code == 200, response.data
    assert response.data["updated"] == 1
    skipped = response.data["skipped"]
    skipped_ids = [s["id"] for s in skipped]
    assert str(c_promoted.id) in skipped_ids
    # reason should indicate already-promoted
    for s in skipped:
        if s["id"] == str(c_promoted.id):
            assert "already_promoted" in s["reason"]


def test_bulk_resolve_dry_run_does_not_write(source_file_and_run, api_client):
    """dry_run=true on bulk_resolve counts but doesn't promote."""
    sf, run = source_file_and_run
    c1 = _make_claim(sf, run)
    c2 = _make_claim(sf, run)

    response = api_client.post(
        "/api/types/claims/bulk-resolve/?dry_run=true",
        data={"claim_ids": [str(c1.id), str(c2.id)]},
        format="json",
    )
    assert response.status_code == 200, response.data
    assert response.data["dry_run"] is True
    assert response.data["updated"] == 2

    c1.refresh_from_db()
    assert c1.status == "unresolved"


# ---------------------------------------------------------------------------
# bulk_dismiss endpoint
# ---------------------------------------------------------------------------


def test_bulk_dismiss_requires_reason(source_file_and_run, api_client):
    """bulk_dismiss returns 400 when reason is missing or empty."""
    sf, run = source_file_and_run
    c1 = _make_claim(sf, run)

    response = api_client.post(
        "/api/types/claims/bulk-dismiss/",
        data={"claim_ids": [str(c1.id)]},
        format="json",
    )
    assert response.status_code == 400
    assert "reason" in str(response.data).lower()


def test_bulk_dismiss_empty_reason_returns_400(source_file_and_run, api_client):
    """blank reason string is also rejected."""
    sf, run = source_file_and_run
    c1 = _make_claim(sf, run)

    response = api_client.post(
        "/api/types/claims/bulk-dismiss/",
        data={"claim_ids": [str(c1.id)], "reason": "   "},
        format="json",
    )
    assert response.status_code == 400


def test_bulk_dismiss_rejects_claims_with_reason(source_file_and_run, api_client):
    """bulk_dismiss calls reject_claim for each unresolved claim."""
    sf, run = source_file_and_run
    c1 = _make_claim(sf, run)
    c2 = _make_claim(sf, run)

    response = api_client.post(
        "/api/types/claims/bulk-dismiss/",
        data={"claim_ids": [str(c1.id), str(c2.id)], "reason": "Out of scope"},
        format="json",
    )
    assert response.status_code == 200, response.data
    assert response.data["updated"] == 2
    assert response.data["skipped"] == []

    c1.refresh_from_db()
    c2.refresh_from_db()
    assert c1.status == "rejected"
    assert c2.status == "rejected"
    assert c1.rejected_reason == "Out of scope"


def test_bulk_dismiss_skips_non_unresolved_claims(source_file_and_run, api_client):
    """Claims not in unresolved status are skipped."""
    sf, run = source_file_and_run
    c_ok = _make_claim(sf, run, status="unresolved")
    c_already = _make_claim(sf, run, status="rejected")

    response = api_client.post(
        "/api/types/claims/bulk-dismiss/",
        data={"claim_ids": [str(c_ok.id), str(c_already.id)], "reason": "duplicate"},
        format="json",
    )
    assert response.status_code == 200, response.data
    assert response.data["updated"] == 1
    skipped = response.data["skipped"]
    assert any(s["id"] == str(c_already.id) for s in skipped)


def test_bulk_dismiss_dry_run_does_not_write(source_file_and_run, api_client):
    """dry_run=true on bulk_dismiss counts but doesn't reject."""
    sf, run = source_file_and_run
    c1 = _make_claim(sf, run)

    response = api_client.post(
        "/api/types/claims/bulk-dismiss/?dry_run=true",
        data={"claim_ids": [str(c1.id)], "reason": "irrelevant"},
        format="json",
    )
    assert response.status_code == 200, response.data
    assert response.data["dry_run"] is True
    assert response.data["updated"] == 1

    c1.refresh_from_db()
    assert c1.status == "unresolved"

"""
Tests for /api/types/types/{id}/instances/ defensive 0-count handling.

Background: the viewer cross-filter (`useTypesInstancesByClass`) fans out
one request per matching type when a class filter is active. Until
2026-05-18, types with `instance_count = 0` (extractor edge cases — e.g.
annotation types whose count never got back-filled) 404'd because the
viewset's `get_queryset()` applied a blanket `instance_count__gt=0`
filter before `get_object()` ran. That 404 broke cross-filter for any
class whose fan-out included a 0-count type. The endpoint already
self-handled the no-type-guid case with a structured 200; this just
extends the same pattern to 0-count.
"""
from __future__ import annotations

import pytest

from apps.entities.models import IFCType
from apps.models.models import Model, SourceFile
from apps.projects.models import Project


pytestmark = pytest.mark.django_db


def _make_model() -> Model:
    project = Project.objects.create(name="zero-count-test")
    sf = SourceFile.objects.create(
        project=project,
        original_filename="m.ifc",
        format="ifc",
        file_size=1,
        checksum_sha256="0" * 64,
    )
    return Model.objects.create(
        project=project,
        source_file=sf,
        name="ARK",
        original_filename="m.ifc",
        file_size=1,
    )


def test_instances_returns_structured_200_for_zero_count_type(client):
    """0-instance type must return 200 with empty instances + error code,
    not 404 from the queryset filter."""
    model = _make_model()
    t = IFCType.objects.create(
        model=model,
        ifc_type="IfcAnnotationType",
        type_guid="zero-count-guid",
        type_name="Survey marker",
        instance_count=0,
    )

    resp = client.get(f"/api/types/types/{t.id}/instances/")
    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert body["type_id"] == str(t.id)
    assert body["total_count"] == 0
    assert body["instances"] == []
    assert body["error"] == "no_instances"
    assert "0 instances" in body["error_message"].lower()


def test_instances_still_404s_for_truly_missing_id(client):
    """The relaxation must NOT mask actually-missing PKs."""
    resp = client.get(
        "/api/types/types/00000000-0000-0000-0000-000000000000/instances/"
    )
    assert resp.status_code == 404


def test_list_still_filters_zero_count_types(client):
    """The relaxation is scoped to the `instances` action only — the list
    endpoint must keep filtering out 0-count types so they don't pollute
    the warehouse / treemap / table surfaces."""
    model = _make_model()
    IFCType.objects.create(
        model=model,
        ifc_type="IfcWallType",
        type_guid="has-instances",
        instance_count=5,
    )
    IFCType.objects.create(
        model=model,
        ifc_type="IfcAnnotationType",
        type_guid="zero-instances",
        instance_count=0,
    )

    resp = client.get(f"/api/types/types/?model={model.id}")
    assert resp.status_code == 200
    body = resp.json()
    results = body.get("results", body)
    type_guids = [t["type_guid"] for t in results]
    assert "has-instances" in type_guids
    assert "zero-instances" not in type_guids

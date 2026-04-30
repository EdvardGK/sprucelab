"""
Tests for the TypeMapping + TypeDefinitionLayer bulk-update endpoints.

Covers both write mode (default) and ``?dry_run=true`` preview mode. Dry-run
returns the same response shape but performs no writes — agents can use it
to plan a batch classification before committing.
"""
from __future__ import annotations

import uuid

import pytest

from apps.entities.models import IFCType, TypeDefinitionLayer, TypeMapping
from apps.models.models import Model, SourceFile
from apps.projects.models import Project


pytestmark = pytest.mark.django_db


@pytest.fixture
def project(db):
    return Project.objects.create(name="bulk-update-test")


@pytest.fixture
def model(project):
    sf = SourceFile.objects.create(
        project=project,
        original_filename="m.ifc",
        format="ifc",
        file_size=1,
    )
    return Model.objects.create(
        project=project,
        source_file=sf,
        name="M",
        original_filename="m.ifc",
    )


@pytest.fixture
def types(model):
    return [
        IFCType.objects.create(
            model=model,
            type_guid=str(uuid.uuid4()),
            type_name=f"Wall {i}",
            ifc_type="IfcWallType",
            instance_count=1,
        )
        for i in range(3)
    ]


def _payload(types_):
    # Avoid ns3451_code here — it's an FK to a lookup table that the test DB
    # doesn't seed. The bulk-update flow handles other fields independently.
    return {
        "mappings": [
            {
                "ifc_type_id": str(t.id),
                "representative_unit": "m2",
                "discipline": "ARK",
                "mapping_status": "mapped",
            }
            for t in types_
        ],
    }


def test_bulk_update_writes_by_default(client, types):
    resp = client.post(
        "/api/types/type-mappings/bulk-update/",
        data=_payload(types),
        content_type="application/json",
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["dry_run"] is False
    assert body["created"] == 3
    assert body["updated"] == 0
    assert body["error_count"] == 0
    assert TypeMapping.objects.filter(ifc_type__in=types).count() == 3


def test_bulk_update_dry_run_writes_nothing(client, types):
    resp = client.post(
        "/api/types/type-mappings/bulk-update/?dry_run=true",
        data=_payload(types),
        content_type="application/json",
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["dry_run"] is True
    assert body["created"] == 3
    assert body["updated"] == 0
    # No actual mappings written
    assert TypeMapping.objects.filter(ifc_type__in=types).count() == 0


def test_bulk_update_dry_run_distinguishes_create_from_update(client, types):
    # Pre-create a mapping for one of the types
    TypeMapping.objects.create(ifc_type=types[0])
    assert TypeMapping.objects.filter(ifc_type__in=types).count() == 1

    resp = client.post(
        "/api/types/type-mappings/bulk-update/?dry_run=true",
        data=_payload(types),
        content_type="application/json",
    )
    body = resp.json()
    assert body["dry_run"] is True
    assert body["created"] == 2  # the two without mappings
    assert body["updated"] == 1  # the one that already had a mapping
    # State unchanged
    assert TypeMapping.objects.filter(ifc_type__in=types).count() == 1


def test_bulk_update_400_when_mappings_missing(client):
    resp = client.post(
        "/api/types/type-mappings/bulk-update/",
        data={},
        content_type="application/json",
    )
    assert resp.status_code == 400


def test_bulk_update_dry_run_reports_missing_ifc_type_id(client, types):
    payload = {
        "mappings": [
            {"discipline": "ARK"},  # missing ifc_type_id
            {"ifc_type_id": str(types[0].id), "discipline": "ARK"},
        ],
    }
    resp = client.post(
        "/api/types/type-mappings/bulk-update/?dry_run=true",
        data=payload,
        content_type="application/json",
    )
    body = resp.json()
    assert body["dry_run"] is True
    assert body["error_count"] == 1
    assert body["errors"][0]["ifc_type_id"] is None
    assert body["created"] == 1  # the well-formed one


# ---------------------------------------------------------------------------
# TypeDefinitionLayer bulk-update (destructive: replaces all layers)
# ---------------------------------------------------------------------------


@pytest.fixture
def mapping_with_layers(types):
    mapping = TypeMapping.objects.create(ifc_type=types[0])
    for i in range(2):
        TypeDefinitionLayer.objects.create(
            type_mapping=mapping,
            layer_order=i + 1,
            material_name=f"Old layer {i}",
            thickness_mm=50.0,
        )
    return mapping


def _layers_payload(mapping):
    return {
        "type_mapping_id": str(mapping.id),
        "layers": [
            {"layer_order": 1, "material_name": "Gypsum", "thickness_mm": 12.5},
            {"layer_order": 2, "material_name": "Mineral wool", "thickness_mm": 150.0},
            {"layer_order": 3, "material_name": "Brick", "thickness_mm": 108.0},
        ],
    }


def test_layers_bulk_update_writes_by_default(client, mapping_with_layers):
    resp = client.post(
        "/api/types/type-definition-layers/bulk-update/",
        data=_layers_payload(mapping_with_layers),
        content_type="application/json",
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["dry_run"] is False
    assert body["count"] == 3
    layers = TypeDefinitionLayer.objects.filter(type_mapping=mapping_with_layers).order_by("layer_order")
    assert layers.count() == 3
    assert [l.material_name for l in layers] == ["Gypsum", "Mineral wool", "Brick"]


def test_layers_bulk_update_dry_run_preserves_state(client, mapping_with_layers):
    before_names = list(
        TypeDefinitionLayer.objects
            .filter(type_mapping=mapping_with_layers)
            .order_by("layer_order")
            .values_list("material_name", flat=True)
    )
    assert before_names == ["Old layer 0", "Old layer 1"]

    resp = client.post(
        "/api/types/type-definition-layers/bulk-update/?dry_run=true",
        data=_layers_payload(mapping_with_layers),
        content_type="application/json",
    )
    body = resp.json()
    assert body["dry_run"] is True
    assert body["would_delete"] == 2
    assert body["would_create"] == 3
    assert len(body["layers"]) == 3
    assert body["layers"][0]["material_name"] == "Gypsum"

    # Original layers untouched
    after_names = list(
        TypeDefinitionLayer.objects
            .filter(type_mapping=mapping_with_layers)
            .order_by("layer_order")
            .values_list("material_name", flat=True)
    )
    assert after_names == before_names


def test_layers_bulk_update_404_when_mapping_missing(client):
    resp = client.post(
        "/api/types/type-definition-layers/bulk-update/?dry_run=true",
        data={"type_mapping_id": str(uuid.uuid4()), "layers": []},
        content_type="application/json",
    )
    assert resp.status_code == 404

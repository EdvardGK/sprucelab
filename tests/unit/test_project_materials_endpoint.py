"""
Tests for /api/types/types/project-materials/ — Materials fan-out collapse.

Pins:
1. JSON shape stability (the slim payload the Materials aggregator consumes).
2. Query count does not scale with model count — the whole point of the
   endpoint is to replace the N-per-model fan-out of the Materials Library
   mount with a single grouped queryset.

Frontend (`useProjectMaterials` → `aggregateProjectMaterials`) consumes
the response directly, so the contract is asserted explicitly instead of
via a golden snapshot.
"""
from __future__ import annotations

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.entities.models import IFCType, TypeDefinitionLayer, TypeMapping
from apps.models.models import Model, SourceFile
from apps.projects.models import Project


pytestmark = pytest.mark.django_db


def _make_project_with_layers(n_models: int, types_per_model: int) -> Project:
    """Build a project whose every type carries 2 material layers.

    A type with no layers MUST be omitted by the endpoint; that case is
    covered by the dedicated test below.
    """
    project = Project.objects.create(name=f"pm-{n_models}x{types_per_model}")
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
                instance_count=1 + ti,
            )
            mapping = TypeMapping.objects.create(
                ifc_type=t,
                ns3451_code="222",
                representative_unit="m2",
                mapping_status="mapped",
                verification_status="verified",
            )
            TypeDefinitionLayer.objects.create(
                type_mapping=mapping,
                layer_order=1,
                material_name="Concrete",
                thickness_mm=200,
                quantity_per_unit=0.25,
                material_unit="m3",
            )
            TypeDefinitionLayer.objects.create(
                type_mapping=mapping,
                layer_order=2,
                material_name="Insulation",
                thickness_mm=100,
                quantity_per_unit=1.0,
                material_unit="m2",
                epd_id="EPD-INSUL-001",
            )
    return project


LAYER_KEYS = {
    "layer_order",
    "material_name",
    "ns3457_code",
    "quantity_per_unit",
    "material_unit",
    "thickness_mm",
    "epd_id",
}


def test_project_materials_shape(client):
    project = _make_project_with_layers(n_models=2, types_per_model=3)

    resp = client.get(
        f"/api/types/types/project-materials/?project_id={project.id}"
    )
    assert resp.status_code == 200, resp.content
    body = resp.json()

    assert body["project_id"] == str(project.id)
    assert isinstance(body["models"], list)
    assert len(body["models"]) == 2

    for m in body["models"]:
        assert set(m.keys()) == {"model_id", "model_name", "types"}
        assert isinstance(m["types"], list)
        assert len(m["types"]) == 3

        for t in m["types"]:
            assert set(t.keys()) == {
                "id",
                "type_name",
                "ifc_type",
                "instance_count",
                "mapping",
            }
            assert t["mapping"] is not None
            layers = t["mapping"]["definition_layers"]
            assert len(layers) == 2
            for layer in layers:
                assert set(layer.keys()) == LAYER_KEYS


def test_project_materials_omits_types_without_layers(client):
    """Aggregator skips layer-less types anyway; the endpoint matches."""
    project = Project.objects.create(name="pm-no-layers")
    sf = SourceFile.objects.create(
        project=project,
        original_filename="m.ifc",
        format="ifc",
        file_size=1,
        checksum_sha256="a" * 64,
    )
    model = Model.objects.create(
        project=project,
        source_file=sf,
        name="ARK",
        original_filename="m.ifc",
        file_size=1,
    )
    # Type with layers — present
    t_with = IFCType.objects.create(
        model=model,
        ifc_type="IfcWallType",
        type_guid="with-layers",
        instance_count=5,
    )
    m_with = TypeMapping.objects.create(ifc_type=t_with)
    TypeDefinitionLayer.objects.create(
        type_mapping=m_with,
        layer_order=1,
        material_name="Concrete",
        quantity_per_unit=0.25,
        material_unit="m3",
    )
    # Type without any layers — should NOT appear
    IFCType.objects.create(
        model=model,
        ifc_type="IfcSlabType",
        type_guid="no-layers",
        instance_count=3,
    )
    # Type with instance_count = 0 — should NOT appear
    t_empty = IFCType.objects.create(
        model=model,
        ifc_type="IfcBeamType",
        type_guid="zero-instance",
        instance_count=0,
    )
    m_empty = TypeMapping.objects.create(ifc_type=t_empty)
    TypeDefinitionLayer.objects.create(
        type_mapping=m_empty,
        layer_order=1,
        material_name="Steel",
        quantity_per_unit=1,
        material_unit="kg",
    )

    resp = client.get(
        f"/api/types/types/project-materials/?project_id={project.id}"
    )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["models"]) == 1
    type_ids = [t["id"] for t in body["models"][0]["types"]]
    assert type_ids == [str(t_with.id)]


def test_project_materials_requires_project_id(client):
    resp = client.get("/api/types/types/project-materials/")
    assert resp.status_code == 400


def test_project_materials_query_count_does_not_scale_with_models(client):
    """The fan-out collapse contract: 1 model vs 5 models must run the
    same number of queries (the whole point of the endpoint).
    """
    small_project = _make_project_with_layers(n_models=1, types_per_model=5)
    big_project = _make_project_with_layers(n_models=5, types_per_model=5)

    # Warm up to settle connection / migration introspection costs.
    client.get(
        f"/api/types/types/project-materials/?project_id={small_project.id}"
    )

    with CaptureQueriesContext(connection) as ctx_small:
        resp = client.get(
            f"/api/types/types/project-materials/?project_id={small_project.id}"
        )
    assert resp.status_code == 200

    with CaptureQueriesContext(connection) as ctx_big:
        resp = client.get(
            f"/api/types/types/project-materials/?project_id={big_project.id}"
        )
    assert resp.status_code == 200

    n_small = len(ctx_small.captured_queries)
    n_big = len(ctx_big.captured_queries)
    assert n_big == n_small, (
        "N+1 regression in /api/types/types/project-materials/: "
        f"1 model -> {n_small} queries; 5 models -> {n_big} queries"
    )

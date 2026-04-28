"""
Programmatic IFC fixtures.

We don't commit IFC binaries — they bloat the repo and drift away from current
ifcopenshell. Instead each test session builds a tiny IFC4 file in tmp.
"""
from __future__ import annotations

from pathlib import Path


def build_minimal_ifc(out: Path) -> Path:
    """
    Build a tiny IFC4 with project → site → building → storey → one wall.

    Two type entities (an IfcWallType and an IfcSlabType) so types-only
    extraction has something non-trivial to find. ~5 KB.
    """
    import ifcopenshell
    import ifcopenshell.api

    f = ifcopenshell.api.run("project.create_file", version="IFC4")

    project = ifcopenshell.api.run(
        "root.create_entity", f, ifc_class="IfcProject", name="E2E Test Project"
    )
    ifcopenshell.api.run("unit.assign_unit", f, length={"is_metric": True, "raw": "METERS"})
    ctx = ifcopenshell.api.run("context.add_context", f, context_type="Model")
    body = ifcopenshell.api.run(
        "context.add_context", f,
        context_type="Model", context_identifier="Body",
        target_view="MODEL_VIEW", parent=ctx,
    )

    site = ifcopenshell.api.run("root.create_entity", f, ifc_class="IfcSite", name="Site")
    building = ifcopenshell.api.run("root.create_entity", f, ifc_class="IfcBuilding", name="Building")
    storey = ifcopenshell.api.run("root.create_entity", f, ifc_class="IfcBuildingStorey", name="GroundFloor")
    ifcopenshell.api.run("aggregate.assign_object", f, products=[site], relating_object=project)
    ifcopenshell.api.run("aggregate.assign_object", f, products=[building], relating_object=site)
    ifcopenshell.api.run("aggregate.assign_object", f, products=[storey], relating_object=building)

    # Type
    wall_type = ifcopenshell.api.run(
        "root.create_entity", f, ifc_class="IfcWallType", name="WT_STD_200"
    )
    slab_type = ifcopenshell.api.run(
        "root.create_entity", f, ifc_class="IfcSlabType", name="ST_DECK_300"
    )

    # An instance of the wall type, contained in the storey
    wall = ifcopenshell.api.run("root.create_entity", f, ifc_class="IfcWall", name="W-001")
    ifcopenshell.api.run("type.assign_type", f, related_objects=[wall], relating_type=wall_type)
    ifcopenshell.api.run(
        "spatial.assign_container", f, products=[wall], relating_structure=storey
    )

    # An untyped element so quality_report.untyped > 0
    proxy = ifcopenshell.api.run(
        "root.create_entity", f, ifc_class="IfcBuildingElementProxy", name="P-001"
    )
    ifcopenshell.api.run(
        "spatial.assign_container", f, products=[proxy], relating_structure=storey
    )

    f.write(str(out))
    return out


def build_ifc_with_grid(out: Path) -> Path:
    """
    Build an IFC4 file with a single IfcGrid (2 U-axes, 3 V-axes).

    Same Site/Building/Storey scaffold as ``build_minimal_ifc`` so the
    parser doesn't choke on a degenerate file. The grid lives in the
    project context — placement is the identity, axis curves are
    ``IfcLine`` entities anchored at meter coordinates:

        U axes (parallel to X, varying Y): A @ y=0, B @ y=5
        V axes (parallel to Y, varying X): 1 @ x=0, 2 @ x=4, 3 @ x=8
    """
    import ifcopenshell
    import ifcopenshell.api

    f = ifcopenshell.api.run("project.create_file", version="IFC4")

    project = ifcopenshell.api.run(
        "root.create_entity", f, ifc_class="IfcProject", name="Grid Test Project"
    )
    ifcopenshell.api.run("unit.assign_unit", f, length={"is_metric": True, "raw": "METERS"})
    ctx = ifcopenshell.api.run("context.add_context", f, context_type="Model")
    ifcopenshell.api.run(
        "context.add_context", f,
        context_type="Model", context_identifier="Body",
        target_view="MODEL_VIEW", parent=ctx,
    )

    site = ifcopenshell.api.run("root.create_entity", f, ifc_class="IfcSite", name="Site")
    building = ifcopenshell.api.run("root.create_entity", f, ifc_class="IfcBuilding", name="Building")
    storey = ifcopenshell.api.run("root.create_entity", f, ifc_class="IfcBuildingStorey", name="GroundFloor")
    ifcopenshell.api.run("aggregate.assign_object", f, products=[site], relating_object=project)
    ifcopenshell.api.run("aggregate.assign_object", f, products=[building], relating_object=site)
    ifcopenshell.api.run("aggregate.assign_object", f, products=[storey], relating_object=building)

    def _line_axis(tag: str, origin, direction):
        pnt = f.create_entity("IfcCartesianPoint", Coordinates=tuple(float(c) for c in origin))
        dir_ratios = f.create_entity("IfcDirection", DirectionRatios=tuple(float(c) for c in direction))
        # IfcVector wraps direction + magnitude; magnitude is in length units.
        vec = f.create_entity("IfcVector", Orientation=dir_ratios, Magnitude=1.0)
        line = f.create_entity("IfcLine", Pnt=pnt, Dir=vec)
        return f.create_entity(
            "IfcGridAxis",
            AxisTag=tag,
            AxisCurve=line,
            SameSense=True,
        )

    u_axes = [
        _line_axis("A", (0.0, 0.0, 0.0), (1.0, 0.0, 0.0)),
        _line_axis("B", (0.0, 5.0, 0.0), (1.0, 0.0, 0.0)),
    ]
    v_axes = [
        _line_axis("1", (0.0, 0.0, 0.0), (0.0, 1.0, 0.0)),
        _line_axis("2", (4.0, 0.0, 0.0), (0.0, 1.0, 0.0)),
        _line_axis("3", (8.0, 0.0, 0.0), (0.0, 1.0, 0.0)),
    ]

    grid = ifcopenshell.api.run(
        "root.create_entity", f, ifc_class="IfcGrid", name="MainGrid"
    )
    grid.UAxes = u_axes
    grid.VAxes = v_axes

    f.write(str(out))
    return out

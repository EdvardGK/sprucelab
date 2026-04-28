"""
Phase 4 — IfcGrid extraction (parser-level).

These tests exercise ``IFCParserService._extract_grids`` and the
``parse_types_only`` call site in isolation, no Django, no DB. The e2e
round-trip lives in ``tests/e2e/test_upload_pipeline.py``.
"""
from __future__ import annotations

from pathlib import Path

import pytest


def _parser():
    from services.ifc_parser import IFCParserService
    return IFCParserService()


def test_no_grid_returns_empty_list(sample_ifc_path: Path):
    """build_minimal_ifc has no IfcGrid → grids: []."""
    result = _parser().parse_types_only(str(sample_ifc_path))

    assert result.success is True, result.error
    assert result.discovered_grid == {'grids': []}


def test_grid_axes_extracted_with_tags_and_positions(sample_ifc_with_grid_path: Path):
    """2 U-axes (A, B) and 3 V-axes (1, 2, 3) all in meters."""
    result = _parser().parse_types_only(str(sample_ifc_with_grid_path))

    assert result.success is True, result.error
    grids = result.discovered_grid['grids']
    assert len(grids) == 1, grids

    grid = grids[0]
    assert grid['name'] == 'MainGrid'
    assert grid['guid']  # IFC GlobalId
    # Identity placement (no rotation/translation authored on the grid).
    assert grid['placement'] is not None
    assert len(grid['placement']) == 4

    u_tags = [a['tag'] for a in grid['u_axes']]
    v_tags = [a['tag'] for a in grid['v_axes']]
    assert u_tags == ['A', 'B']
    assert v_tags == ['1', '2', '3']

    # All axes are IfcLine in the fixture.
    for axis in grid['u_axes'] + grid['v_axes']:
        assert axis['curve_type'] == 'IfcLine'
        assert axis['start'] is not None
        assert axis['direction'] is not None
        assert len(axis['start']) == 3
        assert len(axis['direction']) == 3

    # U axis "B" sits at y=5 m (file is in METERS so unit_scale = 1.0).
    b_axis = next(a for a in grid['u_axes'] if a['tag'] == 'B')
    assert b_axis['start'][1] == pytest.approx(5.0)

    # V axis "3" sits at x=8 m.
    three = next(a for a in grid['v_axes'] if a['tag'] == '3')
    assert three['start'][0] == pytest.approx(8.0)


def test_polyline_axis_start_and_direction(tmp_path: Path):
    """IfcPolyline AxisCurve → start = first point, direction = last - first."""
    import ifcopenshell
    import ifcopenshell.api

    f = ifcopenshell.api.run("project.create_file", version="IFC4")
    ifcopenshell.api.run(
        "root.create_entity", f, ifc_class="IfcProject", name="poly-grid"
    )
    ifcopenshell.api.run("unit.assign_unit", f, length={"is_metric": True, "raw": "METERS"})
    ifcopenshell.api.run("context.add_context", f, context_type="Model")

    p1 = f.create_entity("IfcCartesianPoint", Coordinates=(1.0, 2.0, 0.0))
    p2 = f.create_entity("IfcCartesianPoint", Coordinates=(4.0, 2.0, 0.0))
    p3 = f.create_entity("IfcCartesianPoint", Coordinates=(7.0, 2.0, 0.0))
    polyline = f.create_entity("IfcPolyline", Points=(p1, p2, p3))
    axis = f.create_entity(
        "IfcGridAxis", AxisTag="P", AxisCurve=polyline, SameSense=True
    )
    grid = ifcopenshell.api.run("root.create_entity", f, ifc_class="IfcGrid", name="PolyGrid")
    grid.UAxes = (axis,)
    grid.VAxes = (axis,)  # IFC4 requires non-empty VAxes; reusing is legal.

    out = tmp_path / "poly.ifc"
    f.write(str(out))

    result = _parser().parse_types_only(str(out))
    assert result.success is True, result.error

    grid_data = result.discovered_grid['grids'][0]
    p_axis = grid_data['u_axes'][0]
    assert p_axis['curve_type'] == 'IfcPolyline'
    assert p_axis['start'] == pytest.approx([1.0, 2.0, 0.0])
    # Direction is last - first.
    assert p_axis['direction'] == pytest.approx([6.0, 0.0, 0.0])


def test_unknown_curve_type_records_type_without_geometry(tmp_path: Path):
    """A non-Line/Polyline curve must not crash; tag + curve_type kept, geometry None."""
    import ifcopenshell
    import ifcopenshell.api

    f = ifcopenshell.api.run("project.create_file", version="IFC4")
    ifcopenshell.api.run(
        "root.create_entity", f, ifc_class="IfcProject", name="circ-grid"
    )
    ifcopenshell.api.run("unit.assign_unit", f, length={"is_metric": True, "raw": "METERS"})
    ifcopenshell.api.run("context.add_context", f, context_type="Model")

    centre = f.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0, 0.0))
    z_axis = f.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0))
    x_axis = f.create_entity("IfcDirection", DirectionRatios=(1.0, 0.0, 0.0))
    placement = f.create_entity(
        "IfcAxis2Placement3D", Location=centre, Axis=z_axis, RefDirection=x_axis
    )
    circle = f.create_entity("IfcCircle", Position=placement, Radius=2.5)
    axis = f.create_entity(
        "IfcGridAxis", AxisTag="C", AxisCurve=circle, SameSense=True
    )
    grid = ifcopenshell.api.run("root.create_entity", f, ifc_class="IfcGrid", name="CircleGrid")
    grid.UAxes = (axis,)
    grid.VAxes = (axis,)

    out = tmp_path / "circ.ifc"
    f.write(str(out))

    result = _parser().parse_types_only(str(out))
    assert result.success is True, result.error

    grid_data = result.discovered_grid['grids'][0]
    c_axis = grid_data['u_axes'][0]
    assert c_axis['tag'] == 'C'
    assert c_axis['curve_type'] == 'IfcCircle'
    # Unsupported curve type — geometry None, no crash.
    assert c_axis['start'] is None
    assert c_axis['direction'] is None

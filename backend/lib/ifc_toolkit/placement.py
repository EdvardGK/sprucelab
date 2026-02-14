"""Coordinate system fixes for IFC models.

Solves real problems:
- Y-up vs Z-up misalignment (some models have rotated local coordinate systems)
- World coordinate extraction from placement matrices
- Project origin offset (WCS + site placement for geo-alignment)
- Geometry settings for world-space analysis

Uses ifcopenshell.util.placement internally.
"""

from __future__ import annotations

from typing import Any

import ifcopenshell
import ifcopenshell.util.placement


def detect_orientation(element) -> str:
    """Detect if an element uses Y-up or Z-up coordinate system.

    Some authoring tools export with misaligned local coordinate systems
    where Y points up instead of Z. This checks the rotation matrix
    (row 2) to determine which local axis maps to global Z (up).

    Args:
        element: IFC element with ObjectPlacement.

    Returns:
        'z-up' (normal) or 'y-up' (misaligned).

    Raises:
        ValueError: If element has no placement.
    """
    if not element.ObjectPlacement:
        raise ValueError(f"Element {element.id()} has no ObjectPlacement")

    matrix = ifcopenshell.util.placement.get_local_placement(
        element.ObjectPlacement
    )

    # Row 2 of rotation matrix = global Z direction (up)
    # rotation[2,1] = how much local Y contributes to global Z
    # rotation[2,2] = how much local Z contributes to global Z
    local_y_to_global_z = abs(matrix[2][1])
    local_z_to_global_z = abs(matrix[2][2])

    # Threshold 0.7 (~45 degrees) catches strong vertical alignment
    if local_y_to_global_z > local_z_to_global_z and local_y_to_global_z > 0.7:
        return "y-up"
    return "z-up"


def get_world_position(element) -> tuple[float, float, float] | None:
    """Extract world XYZ coordinates from an element's placement matrix.

    Uses the translation column (column 3) of the 4x4 placement matrix.

    Args:
        element: IFC element with ObjectPlacement.

    Returns:
        Tuple (x, y, z) in model units, or None if no placement.
    """
    if not element.ObjectPlacement:
        return None
    try:
        matrix = ifcopenshell.util.placement.get_local_placement(
            element.ObjectPlacement
        )
        return (matrix[0][3], matrix[1][3], matrix[2][3])
    except Exception:
        return None


def get_world_xy(element) -> tuple[float, float] | None:
    """Extract world XY coordinates from an element's placement.

    Convenience function for 2D spatial queries (building zone tagging,
    plan-view analysis).

    Args:
        element: IFC element with ObjectPlacement.

    Returns:
        Tuple (x, y) in model units, or None if no placement.
    """
    if not element.ObjectPlacement:
        return None
    try:
        matrix = ifcopenshell.util.placement.get_local_placement(
            element.ObjectPlacement
        )
        return (matrix[0][3], matrix[1][3])
    except Exception:
        return None


def offset_model_origin(
    ifc: ifcopenshell.file,
    dx: float,
    dy: float,
    dz: float = 0.0,
) -> dict[str, Any]:
    """Offset a model's coordinate origin for project alignment.

    Modifies BOTH the WorldCoordinateSystem origin (what geometry engines use)
    AND the IfcSite placement (for metadata consistency). Values should be in
    the model's native length units.

    Args:
        ifc: Parsed IFC file (will be modified in place).
        dx: X offset in model units.
        dy: Y offset in model units.
        dz: Z offset in model units (default 0).

    Returns:
        Dict with keys: wcs_modified (int), site_modified (bool).
    """
    result = {"wcs_modified": 0, "site_modified": False}

    # Offset WCS origins in IfcGeometricRepresentationContext
    modified_wcs: set[int] = set()
    for ctx in ifc.by_type("IfcGeometricRepresentationContext"):
        if ctx.ContextType != "Model":
            continue
        if not hasattr(ctx, "WorldCoordinateSystem") or not ctx.WorldCoordinateSystem:
            continue

        wcs = ctx.WorldCoordinateSystem
        wcs_id = wcs.id()
        if wcs_id in modified_wcs:
            continue

        if not hasattr(wcs, "Location") or not wcs.Location:
            continue

        old = list(wcs.Location.Coordinates)
        new_coords = (
            old[0] + dx,
            old[1] + dy,
            (old[2] if len(old) > 2 else 0.0) + dz,
        )
        wcs.Location = ifc.createIfcCartesianPoint(new_coords)
        modified_wcs.add(wcs_id)

    result["wcs_modified"] = len(modified_wcs)

    # Offset IfcSite placement for metadata
    for site in ifc.by_type("IfcSite"):
        if not site.ObjectPlacement:
            continue
        placement = site.ObjectPlacement
        if not hasattr(placement, "RelativePlacement"):
            continue
        rel = placement.RelativePlacement
        if not hasattr(rel, "Location") or not rel.Location:
            continue

        old = list(rel.Location.Coordinates)
        new_coords = (
            old[0] + dx,
            old[1] + dy,
            (old[2] if len(old) > 2 else 0.0) + dz,
        )
        rel.Location = ifc.createIfcCartesianPoint(new_coords)
        result["site_modified"] = True
        break  # Only first site

    return result


def create_world_coord_settings():
    """Create geometry settings with USE_WORLD_COORDS=True.

    World coordinates normalize away rotated/inverted local coordinate
    systems. Use this when analyzing element dimensions or orientation
    where you need consistent global-space results.

    Returns:
        ifcopenshell.geom.settings configured for world coordinates.
    """
    settings = ifcopenshell.geom.settings()
    settings.set(settings.USE_WORLD_COORDS, True)
    return settings

"""Extract and compare IfcBuildingStorey data across IFC models."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import ifcopenshell
import ifcopenshell.util.unit

from .core import open_ifc


def extract_storeys(ifc: ifcopenshell.file | str | Path) -> list[dict[str, Any]]:
    """Extract storey data (name, elevation, height) from an IFC file.

    Handles both IfcBuildingStorey.Elevation and ObjectPlacement Z-coordinate,
    preferring the placement Z when non-zero. Converts to meters using detected
    unit scale.

    Args:
        ifc: Parsed IFC file, or path to an IFC file.

    Returns:
        List of dicts sorted by elevation, each with keys:
        - name (str): Storey name
        - elevation (float): Elevation in meters
        - height (float | None): Height to next storey, None for topmost
    """
    if isinstance(ifc, (str, Path)):
        ifc = open_ifc(ifc)

    scale = ifcopenshell.util.unit.calculate_unit_scale(ifc)
    storeys = []

    for storey in ifc.by_type("IfcBuildingStorey"):
        name = storey.Name or "Unnamed"
        elevation = (storey.Elevation or 0.0) * scale

        # Prefer ObjectPlacement Z-coordinate when available and non-zero
        if storey.ObjectPlacement:
            try:
                rel = storey.ObjectPlacement.RelativePlacement
                if hasattr(rel, "Location") and rel.Location:
                    coords = rel.Location.Coordinates
                    if len(coords) > 2 and coords[2] != 0:
                        elevation = coords[2] * scale
            except Exception:
                pass

        storeys.append({"name": name, "elevation": round(elevation, 3)})

    storeys.sort(key=lambda s: s["elevation"])

    # Calculate inter-storey heights
    for i, s in enumerate(storeys):
        if i < len(storeys) - 1:
            s["height"] = round(storeys[i + 1]["elevation"] - s["elevation"], 3)
        else:
            s["height"] = None

    return storeys


def compare_storeys(
    models: dict[str, list[dict]],
    reference_key: str | None = None,
    tolerance: float = 0.001,
) -> dict[str, Any]:
    """Compare storey data across multiple models.

    Groups storeys by elevation and checks for naming conflicts
    (same name at different elevations) and name differences
    (different names at the same elevation).

    Args:
        models: Mapping of model name to storey list (from extract_storeys).
        reference_key: Key of the reference model (typically ARK).
            If None, the first model with 'ARK' in its name is used.
        tolerance: Elevation matching tolerance in meters.

    Returns:
        Dict with keys:
        - by_elevation: dict mapping elevation to list of (name, model) tuples
        - name_conflicts: dict of storey names used at multiple elevations
        - name_differences: count of elevations with >1 unique name
        - reference: key of the reference model used
    """
    # Auto-detect reference
    if reference_key is None:
        for key in models:
            if "ARK" in key.upper() and "LARK" not in key.upper():
                reference_key = key
                break

    # Group all storeys by elevation
    by_elevation: dict[float, list[tuple[str, str]]] = {}
    name_elevations: dict[str, set[float]] = {}

    for model_name, storeys in models.items():
        for s in storeys:
            elev = round(s["elevation"], 3)

            # Find matching elevation within tolerance
            matched_elev = None
            for existing_elev in by_elevation:
                if abs(existing_elev - elev) <= tolerance:
                    matched_elev = existing_elev
                    break
            if matched_elev is None:
                matched_elev = elev

            by_elevation.setdefault(matched_elev, []).append(
                (s["name"], model_name)
            )
            name_elevations.setdefault(s["name"], set()).add(matched_elev)

    # Detect conflicts
    name_conflicts = {
        name: sorted(elevs)
        for name, elevs in name_elevations.items()
        if len(elevs) > 1
    }

    name_differences = sum(
        1
        for entries in by_elevation.values()
        if len({name for name, _ in entries}) > 1
    )

    return {
        "by_elevation": dict(sorted(by_elevation.items())),
        "name_conflicts": name_conflicts,
        "name_differences": name_differences,
        "reference": reference_key,
    }

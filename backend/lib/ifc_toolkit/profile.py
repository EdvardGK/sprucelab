"""Quick model summary/profiling.

One-call function to get an overview of an IFC model's contents,
authoring application, schema, element distribution, and more.
"""

from __future__ import annotations

from collections import Counter
from typing import Any

import ifcopenshell
import ifcopenshell.util.unit

from .core import open_ifc


def profile_model(ifc: ifcopenshell.file | str) -> dict[str, Any]:
    """Generate a comprehensive model profile in one call.

    Args:
        ifc: Parsed IFC file, or path to an IFC file.

    Returns:
        Dict with keys: schema, unit_scale, authoring_app, element_counts,
        type_count, pset_names, storeys, classification_systems.
    """
    if isinstance(ifc, str):
        ifc = open_ifc(ifc)

    # Schema
    schema = ifc.schema

    # Unit scale
    try:
        unit_scale = ifcopenshell.util.unit.calculate_unit_scale(ifc)
    except Exception:
        unit_scale = None

    # Authoring application
    app = None
    apps = ifc.by_type("IfcApplication")
    if apps:
        app = {
            "name": apps[0].ApplicationFullName,
            "version": apps[0].Version,
            "identifier": apps[0].ApplicationIdentifier,
        }

    # Element counts by IFC class
    element_counts = Counter(e.is_a() for e in ifc.by_type("IfcProduct"))

    # Type object count
    type_count = len(ifc.by_type("IfcTypeObject"))

    # Property set names (unique)
    pset_names = sorted({
        pset.Name
        for pset in ifc.by_type("IfcPropertySet")
        if hasattr(pset, "Name") and pset.Name
    })

    # Storeys
    storeys = []
    for storey in ifc.by_type("IfcBuildingStorey"):
        elev = storey.Elevation or 0.0
        if unit_scale:
            elev *= unit_scale
        storeys.append({"name": storey.Name or "Unnamed", "elevation": round(elev, 3)})
    storeys.sort(key=lambda s: s["elevation"])

    # Classification systems
    classifications = []
    for cls in ifc.by_type("IfcClassification"):
        classifications.append({
            "name": cls.Name,
            "source": getattr(cls, "Source", None),
            "edition": getattr(cls, "Edition", None),
        })

    return {
        "schema": schema,
        "unit_scale": unit_scale,
        "authoring_app": app,
        "element_counts": dict(element_counts.most_common()),
        "total_elements": sum(element_counts.values()),
        "type_count": type_count,
        "pset_names": pset_names,
        "pset_count": len(pset_names),
        "storeys": storeys,
        "storey_count": len(storeys),
        "classification_systems": classifications,
    }

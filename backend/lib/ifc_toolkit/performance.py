"""Fast lookups for large IFC models.

Solves real problems:
- O(n^2) property traversal: pre-build element->property maps in single pass
- Slow pset scanning: hint-based filtering to skip irrelevant property sets
- Quick pset existence checks without full relationship traversal

For standard per-element property access, use ifcopenshell.util.element.get_psets().
Use these functions when processing thousands of elements where per-element
calls become a bottleneck.
"""

from __future__ import annotations

from typing import Any

import ifcopenshell


def build_pset_map(
    ifc: ifcopenshell.file,
) -> dict[int, tuple[dict[str, Any], dict[str, dict[str, Any]]]]:
    """Pre-build property maps for ALL elements in a single pass.

    Instead of calling element.IsDefinedBy per element (O(n) per element),
    iterates IfcRelDefinesByProperties once (O(n) total).

    Args:
        ifc: Parsed IFC file.

    Returns:
        Dict mapping element_id to (flat_props, by_pset):
        - flat_props: {prop_name: value} (all properties flattened)
        - by_pset: {pset_name: {prop_name: value}}
    """
    prop_map: dict[int, tuple[dict, dict]] = {}

    for rel in ifc.by_type("IfcRelDefinesByProperties"):
        pset = rel.RelatingPropertyDefinition
        if not hasattr(pset, "HasProperties"):
            continue

        pset_name = getattr(pset, "Name", "") or ""
        pset_dict: dict[str, Any] = {}
        for prop in pset.HasProperties:
            val = getattr(prop, "NominalValue", None)
            if val:
                val = val.wrappedValue if hasattr(val, "wrappedValue") else str(val)
            pset_dict[prop.Name] = val

        for obj in rel.RelatedObjects:
            eid = obj.id()
            if eid not in prop_map:
                prop_map[eid] = ({}, {})
            flat, by_pset = prop_map[eid]
            flat.update(pset_dict)
            by_pset[pset_name] = pset_dict

    return prop_map


def get_element_props(
    prop_map: dict, element_id: int
) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    """Get pre-computed properties for an element. O(1) lookup.

    Args:
        prop_map: Map from build_pset_map().
        element_id: Element ID (element.id()).

    Returns:
        Tuple of (flat_props, by_pset). Empty dicts if element not found.
    """
    return prop_map.get(element_id, ({}, {}))


def build_type_map(ifc: ifcopenshell.file) -> dict[int, Any]:
    """Pre-build element_id -> IfcTypeObject mapping in single pass.

    Args:
        ifc: Parsed IFC file.

    Returns:
        Dict mapping element_id to its IfcTypeObject (or None if untyped).
    """
    type_map: dict[int, Any] = {}
    for rel in ifc.by_type("IfcRelDefinesByType"):
        if rel.RelatingType:
            for obj in rel.RelatedObjects:
                type_map[obj.id()] = rel.RelatingType
    return type_map


def build_storey_map(ifc: ifcopenshell.file) -> dict[int, str]:
    """Pre-build element_id -> storey name mapping in single pass.

    Args:
        ifc: Parsed IFC file.

    Returns:
        Dict mapping element_id to storey name string.
    """
    storey_map: dict[int, str] = {}
    for rel in ifc.by_type("IfcRelContainedInSpatialStructure"):
        container = rel.RelatingStructure
        if container.is_a("IfcBuildingStorey"):
            name = container.Name or container.LongName or "Unknown"
            for elem in rel.RelatedElements:
                storey_map[elem.id()] = name
    return storey_map


def scan_pset_names(
    ifc: ifcopenshell.file, hints: list[str] | None = None
) -> list[str]:
    """Fast scan of property set names only (no relationship traversal).

    Iterates IfcPropertySet directly, which is much faster than going
    through IfcRelDefinesByProperties. Use this to check what psets
    exist before doing expensive extraction.

    Args:
        ifc: Parsed IFC file.
        hints: Optional list of substrings to filter by. If provided,
            only pset names containing any hint (case-insensitive) are returned.

    Returns:
        Sorted list of unique pset names.
    """
    names: set[str] = set()
    for pset in ifc.by_type("IfcPropertySet"):
        name = getattr(pset, "Name", None)
        if not name:
            continue
        if hints:
            name_upper = name.upper()
            if any(h.upper() in name_upper for h in hints):
                names.add(name)
        else:
            names.add(name)
    return sorted(names)

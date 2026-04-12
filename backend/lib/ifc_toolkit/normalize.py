"""Vendor quirk handling and data normalization.

Solves real problems:
- Material name chaos: Norwegian/English variants mapped to canonical forms
- Revit Direct Shape bloat: 1:1 type-instance ratio, use ObjectType instead
- Type bloat patterns: sequential naming, unused types
- Vendor pset detection: find MagiCAD and other vendor-specific property sets
"""

from __future__ import annotations

import re
from collections import defaultdict
from typing import Any

import ifcopenshell

# Canonical material names with Norwegian/English variants
MATERIAL_MAPPING: dict[str, list[str]] = {
    "steel": [
        "stål", "steel", "staal", "s355", "s235",
        "ståldør", "ståltrapp", "stålprofil", "stålstender",
        "rustfritt", "rustfri", "stainless",
        " ss ", "_ss_", "-ss-",
        " rs ", "_rs_",
        "søm ", "sømløs",
        "sort stål",
        "sirkulær kanal",
        "forsinket",
    ],
    "aluminium": ["alu", "aluminium", "aluminum"],
    "copper": [
        "cu ", "cu_", "cu-", "kobber", "copper", "kopper",
        " cu", "_cu",
        "mm pressfitting",
    ],
    "iron": ["jern", "iron", "cast iron", "støpejern"],
    "concrete": [
        "betong", "concrete", "b30", "b35", "b45", "b25",
        "plasstøpt", "prefab",
    ],
    "concrete_precast": ["prefabrikert", "precast", "prefab betong", "betongelement"],
    "rebar": ["armering", "rebar", "reinforcement", "armeringsstål"],
    "wood": [
        "tre", "wood", "timber", "heltre", "treverk",
        "tredør", "treplat", "høvellast", "konstruksjonsvirke",
    ],
    "gypsum": [
        "gips", "gypsum", "drywall", "plasterboard",
        "habito", "aquapanel", "branngips", "fuktresistent",
    ],
    "glass": ["glass", "glas", "glazing", "isolerglass", "glassfelt", "glassvegg", "glassdør"],
    "mineral_wool": ["mineralull", "mineral wool", "rockwool", "steinull", "glassull", "glass wool"],
    "insulation_eps": ["eps", "styrofoam", "isopor"],
    "insulation_xps": ["xps", "extruded polystyrene"],
    "insulation": ["isolasjon", "insulation", "isolert", "iso "],
    "pvc": ["pvc", "polyvinyl"],
    "pe": ["pe80", "pe100", "pe ", "polyethylene", "polyetylen"],
    "pex": ["pex", "cross-linked"],
    "pp": ["pp ", "pp_", "polypropylene", "polypropylen"],
    "brick": ["tegl", "brick", "murstein", "teglstein"],
    "block": ["leca", "block", "blokk", "lettklinker"],
    "tile": ["flis", "tile", "ceramic", "keramisk", "porcelain", "porselen"],
    "paint": ["maling", "paint", "lakkert", "pulverlakkert"],
    "membrane": ["membran", "membrane", "dampsperre", "vindsperre"],
}

# Build reverse lookup
_VARIANT_TO_CANONICAL: dict[str, str] = {}
for _canonical, _variants in MATERIAL_MAPPING.items():
    for _variant in _variants:
        _VARIANT_TO_CANONICAL[_variant.lower()] = _canonical

# Priority order for determining primary material
_MATERIAL_PRIORITY = [
    "concrete", "concrete_precast", "steel", "wood", "aluminium",
    "gypsum", "glass", "brick", "block",
    "copper", "pvc", "pe", "pex", "pp",
    "mineral_wool", "insulation_eps", "insulation_xps", "insulation",
    "rebar", "tile", "paint", "membrane", "iron",
]


def normalize_material(name: str) -> str | None:
    """Normalize a material name to canonical English form.

    Handles Norwegian/English variants, abbreviations, and technical codes.
    Uses substring matching against known patterns.

    Args:
        name: Raw material name (e.g. "Betong Plasstøpt - B35").

    Returns:
        Canonical name (e.g. "concrete"), or None if no match.
    """
    if not name:
        return None
    name_lower = name.lower()
    for variant, canonical in _VARIANT_TO_CANONICAL.items():
        if variant in name_lower:
            return canonical
    return None


def extract_materials_from_text(text: str) -> set[str]:
    """Extract all material references from a text string.

    Useful for extracting materials from type names, descriptions, etc.

    Args:
        text: String that may contain material references.

    Returns:
        Set of canonical material names found.
    """
    if not text:
        return set()
    text_lower = text.lower()
    return {
        canonical
        for variant, canonical in _VARIANT_TO_CANONICAL.items()
        if variant in text_lower
    }


def get_primary_material(materials: set[str]) -> str | None:
    """From a set of materials, determine the primary/main material.

    Uses construction-oriented priority (structural materials first).

    Args:
        materials: Set of canonical material names.

    Returns:
        Primary material name, or None if empty.
    """
    for mat in _MATERIAL_PRIORITY:
        if mat in materials:
            return mat
    return next(iter(materials), None)


def detect_direct_shape(type_name: str) -> bool:
    """Check if a type name indicates a Revit Direct Shape artifact.

    Revit creates "Direct Shape" types with 1:1 type-instance ratio,
    making the type name useless for grouping. Use ObjectType instead.

    Args:
        type_name: IfcTypeObject.Name value.

    Returns:
        True if this is a Direct Shape artifact.
    """
    return "Direct Shape" in (type_name or "")


def get_effective_type_name(element) -> str:
    """Get the effective type name for grouping, handling Direct Shape.

    For Direct Shape elements, uses ObjectType (the meaningful name)
    instead of the auto-generated IfcTypeObject.Name.

    Args:
        element: IFC element.

    Returns:
        Effective type name for grouping.
    """
    type_name = ""
    if hasattr(element, "IsTypedBy"):
        for rel in element.IsTypedBy:
            if rel.RelatingType:
                type_name = rel.RelatingType.Name or ""
                break
    elif hasattr(element, "IsDefinedBy"):
        for rel in element.IsDefinedBy:
            if rel.is_a("IfcRelDefinesByType") and rel.RelatingType:
                type_name = rel.RelatingType.Name or ""
                break

    if detect_direct_shape(type_name):
        return element.ObjectType or type_name
    return type_name


def detect_type_bloat(ifc: ifcopenshell.file) -> dict[str, Any]:
    """Identify type bloat patterns in an IFC model.

    Detects:
    - Single-use types (1:1 type-instance ratio)
    - Direct Shape artifacts (Revit)
    - Sequential naming patterns (copy-paste indicator)
    - Orphaned types (defined but unused)

    Args:
        ifc: Parsed IFC file.

    Returns:
        Dict with keys: single_use, direct_shape, sequential, orphaned.
    """
    # Count instances per type
    type_instance_counts: dict[int, int] = defaultdict(int)
    type_info: dict[int, dict] = {}
    used_type_ids: set[int] = set()

    for rel in ifc.by_type("IfcRelDefinesByType"):
        if rel.RelatingType:
            tid = rel.RelatingType.id()
            count = len(rel.RelatedObjects)
            type_instance_counts[tid] += count
            used_type_ids.add(tid)
            type_info[tid] = {
                "name": rel.RelatingType.Name or "(unnamed)",
                "class": rel.RelatingType.is_a(),
            }

    # Single-use types
    single_use = [
        {"id": tid, "name": info["name"], "class": info["class"]}
        for tid, info in type_info.items()
        if type_instance_counts[tid] == 1
    ]

    # Direct Shape types
    direct_shape = [
        {"id": tid, "name": info["name"], "instances": type_instance_counts[tid]}
        for tid, info in type_info.items()
        if "Direct Shape" in info["name"]
    ]

    # Sequential naming (e.g., "Pipe 1", "Pipe 2", ...)
    sequential: dict[str, list[str]] = defaultdict(list)
    for info in type_info.values():
        match = re.match(r"^(.+?)[\s_-]*(\d+)$", info["name"])
        if match:
            sequential[match.group(1).strip()].append(info["name"])

    sequential_bloat = sorted(
        [
            {"base_name": base, "variant_count": len(variants), "examples": variants[:10]}
            for base, variants in sequential.items()
            if len(variants) >= 5
        ],
        key=lambda x: -x["variant_count"],
    )

    # Orphaned types (defined but not referenced)
    all_types = list(ifc.by_type("IfcTypeObject"))
    orphaned = [
        {"id": t.id(), "name": t.Name or "(unnamed)", "class": t.is_a()}
        for t in all_types
        if t.id() not in used_type_ids
    ]

    return {
        "single_use": single_use,
        "single_use_count": len(single_use),
        "direct_shape": direct_shape,
        "direct_shape_count": len(direct_shape),
        "sequential": sequential_bloat,
        "orphaned": orphaned,
        "orphaned_count": len(orphaned),
        "total_types": len(all_types),
    }


def find_vendor_psets(
    ifc: ifcopenshell.file, vendor: str = "MagiCAD"
) -> list[dict[str, Any]]:
    """Find vendor-specific property sets in a model.

    Detects psets from specific vendors (MagiCAD, Revit, etc.) that
    inflate file size with calculation data not needed for coordination.

    Args:
        ifc: Parsed IFC file.
        vendor: Vendor name to search for in pset names.

    Returns:
        List of dicts with pset_name, instance_count, property_count.
    """
    pset_stats: dict[str, dict[str, int]] = {}

    for rel in ifc.by_type("IfcRelDefinesByProperties"):
        pset = rel.RelatingPropertyDefinition
        if not hasattr(pset, "Name") or not pset.Name:
            continue

        name = pset.Name
        if vendor not in name:
            continue

        if name not in pset_stats:
            pset_stats[name] = {"instance_count": 0, "property_count": 0}

        pset_stats[name]["instance_count"] += 1
        if hasattr(pset, "HasProperties"):
            pset_stats[name]["property_count"] += len(list(pset.HasProperties))

    return [
        {"pset_name": name, **stats}
        for name, stats in sorted(pset_stats.items())
    ]

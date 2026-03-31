"""Comprehensive first analysis for any IFC file.

Answers: what is this model, what's in it, and what's obviously wrong?
Each sub-analysis is independently callable. The top-level first_analysis()
runs all of them and returns a single JSON-serializable dict.
"""

from __future__ import annotations

import math
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import ifcopenshell
import ifcopenshell.util.element
import ifcopenshell.util.placement
import ifcopenshell.util.unit

from .context import detect_discipline, parse_filename
from .core import open_ifc
from .performance import build_pset_map, build_storey_map, build_type_map
from .placement import detect_orientation, get_world_xy
from .storeys import extract_storeys

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_SPATIAL_CLASSES = {
    "IfcProject", "IfcSite", "IfcBuilding", "IfcBuildingStorey",
    "IfcSpace", "IfcFacility", "IfcFacilityPart",
}

_GEOMETRY_CLASSES = [
    "IfcExtrudedAreaSolid", "IfcFacetedBrep", "IfcTriangulatedFaceSet",
    "IfcPolygonalFaceSet", "IfcMappedItem", "IfcBooleanClippingResult",
    "IfcBooleanResult", "IfcRevolvedAreaSolid", "IfcAdvancedBrep",
    "IfcSweptDiskSolid", "IfcSurfaceCurveSweptAreaSolid",
]

_DISCIPLINE_INDICATORS: dict[str, set[str]] = {
    "ARK": {
        "IfcWall", "IfcWallStandardCase", "IfcSlab", "IfcDoor",
        "IfcWindow", "IfcCurtainWall", "IfcStair", "IfcRoof",
    },
    "RIB": {
        "IfcBeam", "IfcColumn", "IfcFooting", "IfcPile",
        "IfcMember", "IfcReinforcingBar", "IfcReinforcingMesh",
        "IfcTendon", "IfcPlate",
    },
    "RIV": {
        "IfcPipeSegment", "IfcPipeFitting", "IfcFlowTerminal",
        "IfcSanitaryTerminal", "IfcValve", "IfcPump",
    },
    "RIVv": {
        "IfcDuctSegment", "IfcDuctFitting", "IfcAirTerminal",
        "IfcAirTerminalBox", "IfcFan", "IfcDamper",
    },
    "RIE": {
        "IfcCableSegment", "IfcCableFitting", "IfcElectricAppliance",
        "IfcLightFixture", "IfcOutlet", "IfcSwitchingDevice",
    },
}

_QUALITY_CHECKS: dict[str, dict[str, Any]] = {
    "LoadBearing": {
        "classes": [
            "IfcWall", "IfcWallStandardCase", "IfcColumn",
            "IfcBeam", "IfcSlab", "IfcMember",
        ],
        "property": "LoadBearing",
    },
    "IsExternal": {
        "classes": [
            "IfcWall", "IfcWallStandardCase", "IfcSlab", "IfcRoof",
            "IfcDoor", "IfcWindow", "IfcCurtainWall",
        ],
        "property": "IsExternal",
    },
    "FireRating": {
        "classes": [
            "IfcWall", "IfcWallStandardCase", "IfcDoor", "IfcSlab",
        ],
        "property": "FireRating",
    },
}

# Map IFC class to its Pset_*Common name.
# IfcWallStandardCase uses Pset_WallCommon (strip "StandardCase").
_PSET_COMMON_NAMES: dict[str, str] = {}


def _get_pset_common_name(ifc_class: str) -> str:
    """Return the Pset_*Common name for an IFC class."""
    if ifc_class in _PSET_COMMON_NAMES:
        return _PSET_COMMON_NAMES[ifc_class]
    base = ifc_class.replace("Ifc", "").replace("StandardCase", "")
    name = f"Pset_{base}Common"
    _PSET_COMMON_NAMES[ifc_class] = name
    return name


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _dms_to_decimal(dms: tuple) -> float | None:
    """Convert IFC DMS tuple (degrees, minutes, seconds, micro) to decimal."""
    if not dms:
        return None
    degrees = dms[0] if len(dms) > 0 else 0
    minutes = dms[1] if len(dms) > 1 else 0
    seconds = dms[2] if len(dms) > 2 else 0
    micro = dms[3] if len(dms) > 3 else 0
    decimal = abs(degrees) + minutes / 60 + seconds / 3600 + micro / 3_600_000_000
    if degrees < 0:
        decimal = -decimal
    return round(decimal, 6)


def _safe_by_type(ifc: ifcopenshell.file, ifc_type: str) -> list:
    """Call ifc.by_type, returning [] if the type doesn't exist in this schema."""
    try:
        return list(ifc.by_type(ifc_type))
    except RuntimeError:
        return []


# ---------------------------------------------------------------------------
# Sub-analyses
# ---------------------------------------------------------------------------

def analyze_authoring(ifc: ifcopenshell.file) -> dict[str, Any]:
    """Extract authoring software and organization metadata."""
    apps = ifc.by_type("IfcApplication")
    if not apps:
        return {
            "application": None, "version": None,
            "identifier": None, "organization": None,
        }
    app = apps[0]
    org = None
    dev = getattr(app, "ApplicationDeveloper", None)
    if dev:
        org = getattr(dev, "Name", None)
    return {
        "application": getattr(app, "ApplicationFullName", None),
        "version": getattr(app, "Version", None),
        "identifier": getattr(app, "ApplicationIdentifier", None),
        "organization": org,
    }


def analyze_units(ifc: ifcopenshell.file) -> dict[str, Any]:
    """Extract full IfcUnitAssignment breakdown."""
    try:
        scale = ifcopenshell.util.unit.calculate_unit_scale(ifc)
    except Exception:
        scale = None

    projects = ifc.by_type("IfcProject")
    if not projects:
        return {"length_unit": None, "area_unit": None, "volume_unit": None,
                "angle_unit": None, "length_scale": scale, "all_units": []}

    units_ctx = getattr(projects[0], "UnitsInContext", None)
    if not units_ctx:
        return {"length_unit": None, "area_unit": None, "volume_unit": None,
                "angle_unit": None, "length_scale": scale, "all_units": []}

    all_units = []
    key_units: dict[str, dict] = {}
    key_type_map = {
        "LENGTHUNIT": "length_unit",
        "AREAUNIT": "area_unit",
        "VOLUMEUNIT": "volume_unit",
        "PLANEANGLEUNIT": "angle_unit",
    }

    for unit in units_ctx.Units:
        ifc_class = unit.is_a()
        unit_type = getattr(unit, "UnitType", None)
        name = getattr(unit, "Name", None)
        prefix = getattr(unit, "Prefix", None)

        try:
            symbol = ifcopenshell.util.unit.get_unit_symbol(unit)
        except Exception:
            symbol = None

        entry = {
            "unit_type": unit_type,
            "ifc_class": ifc_class,
            "name": name,
            "prefix": prefix,
            "symbol": symbol,
        }
        all_units.append(entry)

        if unit_type in key_type_map:
            key_units[key_type_map[unit_type]] = {
                "name": name, "prefix": prefix, "symbol": symbol,
            }

    return {
        "length_unit": key_units.get("length_unit"),
        "area_unit": key_units.get("area_unit"),
        "volume_unit": key_units.get("volume_unit"),
        "angle_unit": key_units.get("angle_unit"),
        "length_scale": scale,
        "all_units": all_units,
    }


def analyze_types(ifc: ifcopenshell.file) -> dict[str, Any]:
    """Analyze type objects, instance counts, empty types, untyped instances."""
    # Build type_id -> instance count and typed instance IDs
    type_instance_count: dict[int, int] = defaultdict(int)
    typed_instance_ids: set[int] = set()

    for rel in ifc.by_type("IfcRelDefinesByType"):
        type_obj = rel.RelatingType
        if not type_obj:
            continue
        related = getattr(rel, "RelatedObjects", ()) or ()
        type_instance_count[type_obj.id()] += len(related)
        for obj in related:
            typed_instance_ids.add(obj.id())

    # All type objects
    all_types = ifc.by_type("IfcTypeObject")
    type_objects = []
    empty_types = []
    for t in all_types:
        count = type_instance_count.get(t.id(), 0)
        entry = {
            "class": t.is_a(),
            "name": getattr(t, "Name", None) or "(unnamed)",
            "instance_count": count,
        }
        type_objects.append(entry)
        if count == 0:
            empty_types.append({"class": entry["class"], "name": entry["name"]})

    type_objects.sort(key=lambda x: -x["instance_count"])

    # Untyped instances
    products = ifc.by_type("IfcProduct")
    element_counts: dict[str, int] = Counter()
    untyped_by_class: dict[str, int] = Counter()
    for p in products:
        cls = p.is_a()
        element_counts[cls] += 1
        if p.id() not in typed_instance_ids:
            untyped_by_class[cls] += 1

    untyped_total = sum(untyped_by_class.values())

    # Types whose instances are IfcBuildingElementProxy (misclassified exports)
    proxy_types = []
    for rel in ifc.by_type("IfcRelDefinesByType"):
        type_obj = rel.RelatingType
        if not type_obj:
            continue
        related = getattr(rel, "RelatedObjects", ()) or ()
        total = len(related)
        if total == 0:
            continue
        proxy_count = sum(1 for obj in related if obj.is_a("IfcBuildingElementProxy"))
        if proxy_count > 0:
            pct = round(proxy_count / total * 100, 1)
            proxy_types.append({
                "class": type_obj.is_a(),
                "name": getattr(type_obj, "Name", None) or "(unnamed)",
                "instances": total,
                "proxy_pct": pct,
                "mixed": 0 < pct < 100,
            })
    proxy_types.sort(key=lambda x: (-x["mixed"], -x["proxy_pct"]))

    return {
        "total_types": len(all_types),
        "total_products": sum(element_counts.values()),
        "type_objects": type_objects,
        "empty_types": empty_types,
        "empty_type_count": len(empty_types),
        "untyped_instances": {
            "total": untyped_total,
            "by_class": dict(untyped_by_class.most_common()),
        },
        "proxy_typed": proxy_types,
        "element_counts": dict(element_counts.most_common()),
    }


def analyze_geometry(ifc: ifcopenshell.file) -> dict[str, Any]:
    """Analyze geometry representation types. No ifcopenshell.geom calls."""
    # RepresentationType distribution
    rep_types: dict[str, int] = Counter()
    total_reps = 0
    for rep in ifc.by_type("IfcShapeRepresentation"):
        total_reps += 1
        rt = getattr(rep, "RepresentationType", None) or "(none)"
        rep_types[rt] += 1

    # Specific geometry entity counts
    geom_entities: dict[str, int] = {}
    for cls in _GEOMETRY_CLASSES:
        entities = _safe_by_type(ifc, cls)
        if entities:
            geom_entities[cls] = len(entities)

    # MappedItem reuse
    mapped_count = geom_entities.get("IfcMappedItem", 0)
    rep_maps = _safe_by_type(ifc, "IfcRepresentationMap")
    mapped_source_count = len(rep_maps)

    # Per class+type MappedItem reuse
    # Key: (element_class, type_name), value: {source_ids, instance_count}
    _reuse_sources: dict[tuple, set] = defaultdict(set)
    _reuse_counts: dict[tuple, int] = defaultdict(int)

    for mapped_item in _safe_by_type(ifc, "IfcMappedItem"):
        source = getattr(mapped_item, "MappingSource", None)
        if not source:
            continue
        source_id = source.id()
        # Walk up: MappedItem -> IfcShapeRepresentation -> IfcProductDefinitionShape -> IfcProduct
        for inv in ifc.get_inverse(mapped_item):
            if inv.is_a("IfcShapeRepresentation"):
                for inv2 in ifc.get_inverse(inv):
                    if inv2.is_a("IfcProductDefinitionShape"):
                        for inv3 in ifc.get_inverse(inv2):
                            if inv3.is_a("IfcProduct"):
                                cls = inv3.is_a()
                                # Get type name via IsTypedBy (IFC4) or IsDefinedBy (IFC2x3)
                                type_name = None
                                for rel in getattr(inv3, "IsTypedBy", ()) or ():
                                    rt = getattr(rel, "RelatingType", None)
                                    if rt:
                                        type_name = getattr(rt, "Name", None)
                                        break
                                if type_name is None:
                                    for rel in getattr(inv3, "IsDefinedBy", ()) or ():
                                        if rel.is_a("IfcRelDefinesByType"):
                                            rt = getattr(rel, "RelatingType", None)
                                            if rt:
                                                type_name = getattr(rt, "Name", None)
                                                break
                                key = (cls, type_name or "(untyped)")
                                _reuse_sources[key].add(source_id)
                                _reuse_counts[key] += 1

    reuse_by_class = []
    for (cls, type_name), instances in sorted(
        _reuse_counts.items(), key=lambda x: x[1], reverse=True
    ):
        sources = len(_reuse_sources[(cls, type_name)])
        reuse_by_class.append({
            "class": cls,
            "type": type_name,
            "instances": instances,
            "sources": sources,
            "reuse_ratio": round(instances / sources, 1) if sources else 0,
        })

    return {
        "total_representations": total_reps,
        "representation_types": dict(rep_types.most_common()),
        "geometry_entities": geom_entities,
        "mapped_item_count": mapped_count,
        "mapped_source_count": mapped_source_count,
        "reuse_by_class": reuse_by_class,
    }


def analyze_coordinates(ifc: ifcopenshell.file) -> dict[str, Any]:
    """Analyze coordinate systems, CRS, TrueNorth, site reference."""
    result: dict[str, Any] = {
        "wcs_origin": None,
        "crs": None,
        "map_conversion": None,
        "true_north": None,
        "site_reference": None,
        "orientation_sample": {"sampled": 0, "z_up": 0, "y_up": 0, "dominant": None},
    }

    # WCS origin + TrueNorth from IfcGeometricRepresentationContext
    for ctx in ifc.by_type("IfcGeometricRepresentationContext"):
        if ctx.is_a("IfcGeometricRepresentationSubContext"):
            continue
        # WCS
        if result["wcs_origin"] is None:
            wcs = getattr(ctx, "WorldCoordinateSystem", None)
            if wcs:
                loc = getattr(wcs, "Location", None)
                if loc:
                    coords = loc.Coordinates
                    result["wcs_origin"] = {
                        "x": coords[0] if len(coords) > 0 else 0.0,
                        "y": coords[1] if len(coords) > 1 else 0.0,
                        "z": coords[2] if len(coords) > 2 else 0.0,
                    }
        # TrueNorth
        if result["true_north"] is None:
            tn = getattr(ctx, "TrueNorth", None)
            if tn:
                ratios = getattr(tn, "DirectionRatios", None)
                if ratios and len(ratios) >= 2:
                    x, y = float(ratios[0]), float(ratios[1])
                    angle = math.degrees(math.atan2(x, y))
                    if angle < 0:
                        angle += 360
                    result["true_north"] = {
                        "direction": [x, y],
                        "angle_deg": round(angle, 2),
                    }

    # CRS (IFC4+)
    crs_entities = _safe_by_type(ifc, "IfcProjectedCRS")
    if crs_entities:
        crs = crs_entities[0]
        name = getattr(crs, "Name", None) or ""
        epsg = None
        if name:
            digits = re.findall(r"\d+", name)
            if digits:
                epsg = int(digits[0])
        result["crs"] = {
            "name": name or None,
            "epsg_code": epsg,
            "geodetic_datum": getattr(crs, "GeodeticDatum", None),
            "map_projection": getattr(crs, "MapProjection", None),
        }

    # MapConversion (IFC4+)
    mc_entities = _safe_by_type(ifc, "IfcMapConversion")
    if mc_entities:
        mc = mc_entities[0]
        result["map_conversion"] = {
            "eastings": getattr(mc, "Eastings", None),
            "northings": getattr(mc, "Northings", None),
            "orthogonal_height": getattr(mc, "OrthogonalHeight", None),
            "x_axis_abscissa": getattr(mc, "XAxisAbscissa", None),
            "x_axis_ordinate": getattr(mc, "XAxisOrdinate", None),
            "scale": getattr(mc, "Scale", None),
        }

    # Site reference (lat/lon/elevation)
    sites = ifc.by_type("IfcSite")
    if sites:
        site = sites[0]
        lat = _dms_to_decimal(getattr(site, "RefLatitude", None))
        lon = _dms_to_decimal(getattr(site, "RefLongitude", None))
        elev = getattr(site, "RefElevation", None)
        if lat is not None or lon is not None:
            result["site_reference"] = {
                "latitude": lat,
                "longitude": lon,
                "elevation": float(elev) if elev is not None else None,
            }

    # Orientation sampling (up to 5 elements)
    sampled = 0
    z_up = 0
    y_up = 0
    for product in ifc.by_type("IfcProduct"):
        if sampled >= 5:
            break
        if not getattr(product, "ObjectPlacement", None):
            continue
        try:
            orient = detect_orientation(product)
            sampled += 1
            if orient == "z-up":
                z_up += 1
            else:
                y_up += 1
        except Exception:
            continue

    dominant = None
    if sampled > 0:
        dominant = "z-up" if z_up >= y_up else "y-up"
    result["orientation_sample"] = {
        "sampled": sampled, "z_up": z_up, "y_up": y_up, "dominant": dominant,
    }

    return result


def analyze_spatial(ifc: ifcopenshell.file) -> dict[str, Any]:
    """Analyze spatial hierarchy, containment, and orphaned elements."""
    # Hierarchy counts and names
    def _spatial_info(entities):
        return [
            {"name": getattr(e, "Name", None) or "(unnamed)",
             "long_name": getattr(e, "LongName", None) or None,
             "description": getattr(e, "Description", None) or None}
            for e in entities
        ]

    projects = ifc.by_type("IfcProject")
    sites = ifc.by_type("IfcSite")
    buildings = ifc.by_type("IfcBuilding")

    hierarchy = {
        "projects": len(projects),
        "sites": len(sites),
        "buildings": len(buildings),
        "storeys": len(ifc.by_type("IfcBuildingStorey")),
        "project_info": _spatial_info(projects),
        "site_info": _spatial_info(sites),
        "building_info": _spatial_info(buildings),
    }

    # Storeys
    storeys = extract_storeys(ifc)

    # Elements per storey + contained set
    contained_ids: set[int] = set()
    elements_per_storey: dict[str, int] = defaultdict(int)

    for rel in ifc.by_type("IfcRelContainedInSpatialStructure"):
        structure = getattr(rel, "RelatingStructure", None)
        related = getattr(rel, "RelatedElements", ()) or ()
        for elem in related:
            contained_ids.add(elem.id())
        if structure and structure.is_a("IfcBuildingStorey"):
            name = getattr(structure, "Name", None) or "(unnamed)"
            elements_per_storey[name] += len(related)

    # Also count elements aggregated into spatial elements (IfcRelAggregates)
    for rel in ifc.by_type("IfcRelAggregates"):
        relating = getattr(rel, "RelatingObject", None)
        if relating and relating.is_a() in _SPATIAL_CLASSES:
            related = getattr(rel, "RelatedObjects", ()) or ()
            for obj in related:
                contained_ids.add(obj.id())

    # Orphaned elements: IfcProduct not in contained set, not spatial themselves
    orphaned_by_class: dict[str, int] = Counter()
    for product in ifc.by_type("IfcProduct"):
        if product.is_a() in _SPATIAL_CLASSES:
            continue
        if product.id() not in contained_ids:
            orphaned_by_class[product.is_a()] += 1

    orphaned_total = sum(orphaned_by_class.values())

    # Spaces
    spaces = ifc.by_type("IfcSpace")
    named = sum(1 for s in spaces if getattr(s, "Name", None))

    return {
        "hierarchy": hierarchy,
        "storeys": storeys,
        "elements_per_storey": dict(elements_per_storey),
        "orphaned_elements": {
            "total": orphaned_total,
            "by_class": dict(orphaned_by_class.most_common()),
        },
        "spaces": {
            "total": len(spaces),
            "named": named,
            "unnamed": len(spaces) - named,
        },
    }


def analyze_discipline(
    path: str | Path,
    ifc: ifcopenshell.file,
) -> dict[str, Any]:
    """Detect discipline from filename and model content."""
    # Filename-based
    filename_parsed = parse_filename(path)
    filename_disc = detect_discipline(path)

    # Content-based: count products by class
    element_counts = Counter(p.is_a() for p in ifc.by_type("IfcProduct"))
    total = sum(element_counts.values())

    # Score each discipline
    scores: dict[str, int] = {}
    for disc, indicators in _DISCIPLINE_INDICATORS.items():
        score = sum(element_counts.get(cls, 0) for cls in indicators)
        if score > 0:
            scores[disc] = score

    content_suggestion = "undetermined"
    if scores and total > 0:
        best = max(scores, key=scores.get)
        if scores[best] / total >= 0.30:
            content_suggestion = best

    # Top 10 for transparency
    top_10 = dict(element_counts.most_common(10))

    return {
        "filename_parsed": filename_parsed,
        "filename_discipline": filename_disc,
        "content_suggestion": content_suggestion,
        "element_distribution": top_10,
    }


def analyze_quality(ifc: ifcopenshell.file) -> dict[str, Any]:
    """Basic IDS-style quality checks: duplicate GUIDs, missing common properties."""
    result: dict[str, Any] = {}

    # --- Duplicate GUIDs ---
    guid_map: dict[str, list[int]] = defaultdict(list)
    for entity in ifc:
        guid = getattr(entity, "GlobalId", None)
        if guid:
            guid_map[guid].append(entity.id())

    duplicates = []
    for guid, ids in guid_map.items():
        if len(ids) > 1:
            duplicates.append({"guid": guid, "entity_ids": ids})

    result["duplicate_guids"] = {
        "count": len(duplicates),
        "duplicates": duplicates,
    }

    # --- Missing common properties ---
    # Build a fast pset lookup if we have many elements to check
    # Use ifcopenshell.util.element.get_psets per element
    for check_name, check_def in _QUALITY_CHECKS.items():
        checked = 0
        missing = 0
        missing_by_class: dict[str, int] = Counter()

        for ifc_class in check_def["classes"]:
            elements = _safe_by_type(ifc, ifc_class)
            for elem in elements:
                checked += 1
                pset_name = _get_pset_common_name(ifc_class)
                psets = ifcopenshell.util.element.get_psets(elem)
                pset = psets.get(pset_name, {})
                prop_val = pset.get(check_def["property"])
                if prop_val is None:
                    missing += 1
                    missing_by_class[ifc_class] += 1

        key = f"missing_{check_name.lower()}"
        if check_name == "IsExternal":
            key = "missing_is_external"
        elif check_name == "LoadBearing":
            key = "missing_loadbearing"
        elif check_name == "FireRating":
            key = "missing_fire_rating"

        result[key] = {
            "checked": checked,
            "missing": missing,
            "by_class": dict(missing_by_class.most_common()),
        }

    # --- Type-level property consistency ---
    # For each quality-check property, group instances by their defining type.
    # If instances of the same type disagree on a property value, flag it.
    type_instance_map: dict[int, list] = defaultdict(list)
    for rel in ifc.by_type("IfcRelDefinesByType"):
        type_obj = rel.RelatingType
        if not type_obj:
            continue
        related = getattr(rel, "RelatedObjects", ()) or ()
        for obj in related:
            type_instance_map[type_obj.id()].append((type_obj, obj))

    type_conflicts: dict[str, Any] = {"total": 0}
    for check_name, check_def in _QUALITY_CHECKS.items():
        prop_name = check_def["property"]
        relevant_classes = set(check_def["classes"])
        conflicts_list = []

        # Group by type_id → only instances of relevant classes
        for type_id, pairs in type_instance_map.items():
            type_obj = pairs[0][0]
            relevant_instances = [
                inst for _, inst in pairs if inst.is_a() in relevant_classes
            ]
            if len(relevant_instances) < 2:
                continue

            # Collect property values per instance
            value_counts: dict[str, int] = Counter()
            none_count = 0
            for inst in relevant_instances:
                pset_name = _get_pset_common_name(inst.is_a())
                psets = ifcopenshell.util.element.get_psets(inst)
                pset = psets.get(pset_name, {})
                val = pset.get(prop_name)
                if val is None:
                    none_count += 1
                else:
                    value_counts[str(val)] += 1

            # Conflict if multiple distinct values, or mix of values and None
            has_values = len(value_counts) > 0
            has_conflict = (
                len(value_counts) > 1
                or (has_values and none_count > 0)
            )
            if has_conflict:
                values_out = dict(value_counts)
                if none_count > 0:
                    values_out["(unset)"] = none_count
                conflicts_list.append({
                    "type_class": type_obj.is_a(),
                    "type_name": getattr(type_obj, "Name", None) or "(unnamed)",
                    "instance_count": len(relevant_instances),
                    "values": values_out,
                })

        conflicts_list.sort(key=lambda x: -x["instance_count"])
        key = f"type_conflicts_{check_name.lower()}"
        if check_name == "IsExternal":
            key = "type_conflicts_isexternal"
        elif check_name == "LoadBearing":
            key = "type_conflicts_loadbearing"
        elif check_name == "FireRating":
            key = "type_conflicts_firerating"
        type_conflicts[key] = conflicts_list
        type_conflicts["total"] += len(conflicts_list)

    result["type_conflicts"] = type_conflicts

    return result


# ---------------------------------------------------------------------------
# Top-level orchestrator
# ---------------------------------------------------------------------------

def first_analysis(path: str | Path) -> dict[str, Any]:
    """Run comprehensive first analysis on any IFC file.

    Opens the file, runs all sub-analyses, returns a single
    JSON-serializable dict.

    Args:
        path: Path to .ifc or .ifczip file.

    Returns:
        Dict with keys: file_info, authoring, units, types, geometry,
        coordinates, spatial, discipline, quality.
    """
    path = Path(path)
    ifc = open_ifc(path)

    return {
        "file_info": {
            "filename": path.name,
            "schema": ifc.schema,
            "size_mb": round(path.stat().st_size / (1024 * 1024), 1),
        },
        "authoring": analyze_authoring(ifc),
        "units": analyze_units(ifc),
        "types": analyze_types(ifc),
        "geometry": analyze_geometry(ifc),
        "coordinates": analyze_coordinates(ifc),
        "spatial": analyze_spatial(ifc),
        "discipline": analyze_discipline(path, ifc),
        "quality": analyze_quality(ifc),
    }


# ---------------------------------------------------------------------------
# Type-first analysis (for relational DB / cross-filtering)
# ---------------------------------------------------------------------------

def type_analysis(path: str | Path) -> dict[str, Any]:
    """Type-first analysis producing per-type records with cross-dimensions.

    Unlike first_analysis() which returns pre-aggregated counts by class,
    this function groups everything by type — the primary entity for
    classification, quality, and filtering.

    Uses performance maps (single-pass O(n)) for all lookups.

    Args:
        path: Path to .ifc or .ifczip file.

    Returns:
        Dict with keys: model_analysis, storeys, types.
        Each type record includes storey_distribution, quality property
        tallies, geometry stats, and flags (is_empty, is_proxy, is_untyped).
    """
    path = Path(path)
    ifc = open_ifc(path)

    # --- Performance maps (single-pass each) ---
    type_map = build_type_map(ifc)
    storey_map = build_storey_map(ifc)
    pset_map = build_pset_map(ifc)

    # --- Model-level data ---
    authoring = analyze_authoring(ifc)
    units = analyze_units(ifc)
    coords = analyze_coordinates(ifc)
    spatial = analyze_spatial(ifc)
    storeys = spatial["storeys"]  # [{name, elevation, height}]

    hierarchy = spatial["hierarchy"]
    project_name = ""
    site_name = ""
    building_name = ""
    if hierarchy.get("project_info"):
        project_name = hierarchy["project_info"][0].get("name", "")
    if hierarchy.get("site_info"):
        site_name = hierarchy["site_info"][0].get("name", "")
    if hierarchy.get("building_info"):
        building_name = hierarchy["building_info"][0].get("name", "")

    # --- Duplicate GUIDs (model-level) ---
    guid_map: dict[str, list[int]] = defaultdict(list)
    for entity in ifc:
        guid = getattr(entity, "GlobalId", None)
        if guid:
            guid_map[guid].append(entity.id())
    dup_count = sum(1 for ids in guid_map.values() if len(ids) > 1)

    # --- Group products by type ---
    # Key: type_id (int) for typed, or "untyped:{element_class}" for untyped
    # Value: list of IfcProduct instances
    type_groups: dict[Any, list] = defaultdict(list)
    type_objects: dict[int, Any] = {}  # type_id -> IfcTypeObject

    for product in ifc.by_type("IfcProduct"):
        if product.is_a() in _SPATIAL_CLASSES:
            continue
        eid = product.id()
        type_obj = type_map.get(eid)
        if type_obj:
            tid = type_obj.id()
            type_groups[tid].append(product)
            type_objects[tid] = type_obj
        else:
            key = f"untyped:{product.is_a()}"
            type_groups[key].append(product)

    # --- Empty types (defined but 0 instances) ---
    all_type_objs = ifc.by_type("IfcTypeObject")
    type_ids_with_instances = set(type_objects.keys())

    # --- Quality check properties to tally ---
    # Maps (pset_common_base, prop_name) -> field_prefix
    _QUALITY_PROPS = {
        "LoadBearing": {
            "classes": {
                "IfcWall", "IfcWallStandardCase", "IfcColumn",
                "IfcBeam", "IfcSlab", "IfcMember",
            },
            "property": "LoadBearing",
        },
        "IsExternal": {
            "classes": {
                "IfcWall", "IfcWallStandardCase", "IfcSlab", "IfcRoof",
                "IfcDoor", "IfcWindow", "IfcCurtainWall",
            },
            "property": "IsExternal",
        },
        "FireRating": {
            "classes": {
                "IfcWall", "IfcWallStandardCase", "IfcDoor", "IfcSlab",
            },
            "property": "FireRating",
        },
    }

    # --- Build geometry representation map: element_id -> primary rep type ---
    rep_map: dict[int, str] = {}
    # Also track MappedItem usage per element
    mapped_elem_ids: set[int] = set()
    mapped_sources_by_elem: dict[int, set[int]] = defaultdict(set)

    for mapped_item in _safe_by_type(ifc, "IfcMappedItem"):
        source = getattr(mapped_item, "MappingSource", None)
        if not source:
            continue
        source_id = source.id()
        for inv in ifc.get_inverse(mapped_item):
            if inv.is_a("IfcShapeRepresentation"):
                for inv2 in ifc.get_inverse(inv):
                    if inv2.is_a("IfcProductDefinitionShape"):
                        for inv3 in ifc.get_inverse(inv2):
                            if inv3.is_a("IfcProduct"):
                                eid = inv3.id()
                                mapped_elem_ids.add(eid)
                                mapped_sources_by_elem[eid].add(source_id)

    # Primary representation type per product
    for product in ifc.by_type("IfcProduct"):
        if product.is_a() in _SPATIAL_CLASSES:
            continue
        rep = getattr(product, "Representation", None)
        if not rep:
            continue
        for shape_rep in getattr(rep, "Representations", ()) or ():
            rt = getattr(shape_rep, "RepresentationType", None)
            if rt:
                rep_map[product.id()] = rt
                break  # Use first representation

    # --- Build type records ---
    type_records = []

    for group_key, instances in type_groups.items():
        is_untyped = isinstance(group_key, str) and group_key.startswith("untyped:")
        is_typed = not is_untyped

        if is_typed:
            type_obj = type_objects[group_key]
            type_class = type_obj.is_a()
            type_name = getattr(type_obj, "Name", None) or "(unnamed)"
            predefined_type = getattr(type_obj, "PredefinedType", None)
            if predefined_type and str(predefined_type) == "NOTDEFINED":
                predefined_type = None
            elif predefined_type:
                predefined_type = str(predefined_type)
            # Determine element class from first instance
            element_class = instances[0].is_a()
        else:
            element_class = group_key.split(":", 1)[1]
            type_class = ""
            type_name = None
            predefined_type = None

        instance_count = len(instances)

        # Is proxy?
        is_proxy = any(
            inst.is_a("IfcBuildingElementProxy") for inst in instances
        )

        # --- Storey distribution ---
        storey_counts: dict[str, int] = Counter()
        for inst in instances:
            sname = storey_map.get(inst.id())
            if sname:
                storey_counts[sname] += 1

        storey_distribution = [
            {"storey": name, "count": cnt}
            for name, cnt in sorted(storey_counts.items(),
                                     key=lambda x: x[1], reverse=True)
        ]

        # --- Quality property tallies ---
        lb_true = lb_false = lb_unset = 0
        ext_true = ext_false = ext_unset = 0
        fr_set = fr_unset = 0

        for inst in instances:
            eid = inst.id()
            cls = inst.is_a()
            flat_props, by_pset = pset_map.get(eid, ({}, {}))

            # LoadBearing
            if cls in _QUALITY_PROPS["LoadBearing"]["classes"]:
                pset_name = _get_pset_common_name(cls)
                pset = by_pset.get(pset_name, {})
                val = pset.get("LoadBearing")
                if val is None:
                    lb_unset += 1
                elif val is True or val == "True" or val == ".T.":
                    lb_true += 1
                else:
                    lb_false += 1

            # IsExternal
            if cls in _QUALITY_PROPS["IsExternal"]["classes"]:
                pset_name = _get_pset_common_name(cls)
                pset = by_pset.get(pset_name, {})
                val = pset.get("IsExternal")
                if val is None:
                    ext_unset += 1
                elif val is True or val == "True" or val == ".T.":
                    ext_true += 1
                else:
                    ext_false += 1

            # FireRating
            if cls in _QUALITY_PROPS["FireRating"]["classes"]:
                pset_name = _get_pset_common_name(cls)
                pset = by_pset.get(pset_name, {})
                val = pset.get("FireRating")
                if val is None:
                    fr_unset += 1
                else:
                    fr_set += 1

        # --- Geometry ---
        # Primary representation: most common among instances
        rep_counts: dict[str, int] = Counter()
        mi_count = 0
        mi_sources: set[int] = set()
        for inst in instances:
            eid = inst.id()
            rt = rep_map.get(eid)
            if rt:
                rep_counts[rt] += 1
            if eid in mapped_elem_ids:
                mi_count += 1
                mi_sources |= mapped_sources_by_elem[eid]

        primary_rep = rep_counts.most_common(1)[0][0] if rep_counts else ""
        mi_source_count = len(mi_sources)
        reuse_ratio = round(mi_count / mi_source_count, 1) if mi_source_count else None

        record = {
            "type_class": type_class,
            "type_name": type_name,
            "element_class": element_class,
            "predefined_type": predefined_type,
            "instance_count": instance_count,
            "is_empty": False,
            "is_proxy": is_proxy,
            "is_untyped": is_untyped,
            "loadbearing_true": lb_true,
            "loadbearing_false": lb_false,
            "loadbearing_unset": lb_unset,
            "is_external_true": ext_true,
            "is_external_false": ext_false,
            "is_external_unset": ext_unset,
            "fire_rating_set": fr_set,
            "fire_rating_unset": fr_unset,
            "primary_representation": primary_rep,
            "mapped_item_count": mi_count,
            "mapped_source_count": mi_source_count,
            "reuse_ratio": reuse_ratio,
            "storey_distribution": storey_distribution,
        }
        type_records.append(record)

    # --- Add empty types ---
    for t in all_type_objs:
        if t.id() not in type_ids_with_instances:
            type_records.append({
                "type_class": t.is_a(),
                "type_name": getattr(t, "Name", None) or "(unnamed)",
                "element_class": "",
                "predefined_type": str(pt) if (pt := getattr(t, "PredefinedType", None)) and str(pt) != "NOTDEFINED" else None,
                "instance_count": 0,
                "is_empty": True,
                "is_proxy": False,
                "is_untyped": False,
                "loadbearing_true": 0,
                "loadbearing_false": 0,
                "loadbearing_unset": 0,
                "is_external_true": 0,
                "is_external_false": 0,
                "is_external_unset": 0,
                "fire_rating_set": 0,
                "fire_rating_unset": 0,
                "primary_representation": "",
                "mapped_item_count": 0,
                "mapped_source_count": 0,
                "reuse_ratio": None,
                "storey_distribution": [],
            })

    # Sort: by instance count descending, empty types last
    type_records.sort(key=lambda r: (-r["instance_count"], r["is_empty"]))

    # --- Storey records ---
    eps = spatial["elements_per_storey"]
    storey_records = []
    for s in storeys:
        storey_records.append({
            "name": s["name"],
            "elevation": s["elevation"],
            "height": s.get("height"),
            "element_count": eps.get(s["name"], 0),
        })

    return {
        "model_analysis": {
            "ifc_schema": ifc.schema,
            "file_size_mb": round(path.stat().st_size / (1024 * 1024), 1),
            "application": authoring.get("application", ""),
            "total_types": len(all_type_objs),
            "total_products": sum(len(v) for v in type_groups.values()),
            "total_storeys": len(storeys),
            "total_spaces": spatial["spaces"]["total"],
            "duplicate_guid_count": dup_count,
            "units": {
                "length": units.get("length_unit"),
                "area": units.get("area_unit"),
                "volume": units.get("volume_unit"),
                "angle": units.get("angle_unit"),
            },
            "coordinates": coords,
            "project_name": project_name,
            "site_name": site_name,
            "building_name": building_name,
        },
        "storeys": storey_records,
        "types": type_records,
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _cli():
    """Command-line entry point for first_analysis and type_analysis."""
    import argparse
    import json as _json
    import sys
    import time

    parser = argparse.ArgumentParser(
        description="IFC First Analysis — comprehensive model diagnostics",
    )
    parser.add_argument("ifc_path", help="Path to .ifc or .ifczip file")
    parser.add_argument(
        "-o", "--output", type=str, default=None,
        help="Output path for JSON (default: ./{filename}.analysis.json)",
    )
    parser.add_argument(
        "--stdout", action="store_true",
        help="Print to terminal instead of saving to file",
    )
    parser.add_argument(
        "--types", action="store_true",
        help="Run type_analysis() instead of first_analysis() (type-first output)",
    )
    args = parser.parse_args()

    ifc_path = Path(args.ifc_path)
    if not ifc_path.exists():
        print(f"Error: {ifc_path} not found", file=sys.stderr)
        sys.exit(1)

    mode = "type_analysis" if args.types else "first_analysis"
    print(f"Analyzing {ifc_path.name} ({mode})...")
    t0 = time.time()
    result = type_analysis(ifc_path) if args.types else first_analysis(ifc_path)
    elapsed = time.time() - t0
    print(f"Done in {elapsed:.1f}s")

    if args.stdout:
        print(_json.dumps(result, indent=2, default=str))
    else:
        suffix = ".types.json" if args.types else ".analysis.json"
        out_path = Path(args.output) if args.output else Path.cwd() / (ifc_path.stem + suffix)
        with open(out_path, "w") as f:
            _json.dump(result, f, indent=2, default=str)
        print(f"Saved: {out_path}")


if __name__ == "__main__":
    _cli()

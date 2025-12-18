"""
Layer 1 LITE: Fast IFC Stats Extraction

PHILOSOPHY:
- Extract ONLY aggregate stats (counts, schema, type summary)
- NO database writes for individual entities/properties
- Query IFC file directly when element details are needed
- FAST: Should complete in 1-5 seconds for any file size

This replaces the heavy parse_ifc_metadata() that wrote 10k+ rows to Supabase.
Element-level queries go through FastAPI which loads the IFC on-demand.
"""
import ifcopenshell
import time
from typing import Dict, Any, List
from collections import Counter


def parse_ifc_stats(file_path: str) -> Dict[str, Any]:
    """
    Extract aggregate statistics from IFC file.

    NO DATABASE WRITES - just returns stats dict.
    Model.save() is called by the caller with these values.

    Args:
        file_path: Path to the IFC file

    Returns:
        dict with:
        - ifc_schema: str
        - element_count: int
        - storey_count: int
        - type_count: int
        - material_count: int
        - system_count: int
        - type_summary: list of {ifc_type, count}
        - duration_seconds: float
    """
    start_time = time.time()

    # Open file
    ifc_file = ifcopenshell.open(file_path)

    # Schema
    ifc_schema = ifc_file.schema

    # Count elements by type
    elements = list(ifc_file.by_type('IfcElement'))
    element_count = len(elements)

    # Type breakdown
    type_counter = Counter(elem.is_a() for elem in elements)
    type_summary = [
        {"ifc_type": ifc_type, "count": count}
        for ifc_type, count in type_counter.most_common(50)  # Top 50 types
    ]

    # Storeys
    storeys = list(ifc_file.by_type('IfcBuildingStorey'))
    storey_count = len(storeys)
    storey_names = [s.Name for s in storeys if s.Name]

    # Type objects (IfcWallType, etc.)
    type_objects = list(ifc_file.by_type('IfcTypeObject'))
    type_count = len(type_objects)

    # Materials
    materials = list(ifc_file.by_type('IfcMaterial'))
    material_count = len(materials)
    material_names = [m.Name for m in materials if m.Name][:20]  # Top 20

    # Systems
    systems = list(ifc_file.by_type('IfcSystem'))
    system_count = len(systems)

    duration = time.time() - start_time

    return {
        'ifc_schema': ifc_schema,
        'element_count': element_count,
        'storey_count': storey_count,
        'type_count': type_count,
        'material_count': material_count,
        'system_count': system_count,
        'type_summary': type_summary,
        'storey_names': storey_names,
        'material_names': material_names,
        'duration_seconds': round(duration, 2),
    }


def get_types_with_counts(file_path: str) -> List[Dict[str, Any]]:
    """
    Get type definitions with instance counts.

    This is for the Type Library mapping UI.
    Returns types that have instances (things the user can map).

    Args:
        file_path: Path to the IFC file

    Returns:
        list of {
            type_guid: str,
            ifc_type: str (e.g. "IfcWallType"),
            type_name: str,
            instance_count: int,
            instance_ifc_type: str (e.g. "IfcWall")
        }
    """
    ifc_file = ifcopenshell.open(file_path)

    result = []

    # Get all IfcRelDefinesByType relationships
    # These link elements to their type definitions
    for rel in ifc_file.by_type('IfcRelDefinesByType'):
        relating_type = rel.RelatingType
        if not relating_type:
            continue

        related_objects = rel.RelatedObjects or []
        instance_count = len(related_objects)

        if instance_count == 0:
            continue

        # Get the IFC type of instances (e.g., IfcWall for IfcWallType)
        instance_ifc_type = related_objects[0].is_a() if related_objects else None

        result.append({
            'type_guid': relating_type.GlobalId,
            'ifc_type': relating_type.is_a(),
            'type_name': relating_type.Name or 'Unnamed',
            'instance_count': instance_count,
            'instance_ifc_type': instance_ifc_type,
        })

    # Sort by instance count descending
    result.sort(key=lambda x: x['instance_count'], reverse=True)

    return result


def get_materials_with_usage(file_path: str) -> List[Dict[str, Any]]:
    """
    Get materials with usage counts.

    This is for the Material Library mapping UI.

    Args:
        file_path: Path to the IFC file

    Returns:
        list of {
            material_id: int (step ID, not GUID - materials don't have GUIDs),
            name: str,
            category: str or None,
            usage_count: int
        }
    """
    ifc_file = ifcopenshell.open(file_path)

    # Count material usage via IfcRelAssociatesMaterial
    material_usage = Counter()

    for rel in ifc_file.by_type('IfcRelAssociatesMaterial'):
        relating_material = rel.RelatingMaterial
        related_objects = rel.RelatedObjects or []

        if relating_material.is_a('IfcMaterial'):
            material_usage[relating_material.id()] += len(related_objects)
        elif relating_material.is_a('IfcMaterialLayerSetUsage'):
            for layer in relating_material.ForLayerSet.MaterialLayers:
                if layer.Material:
                    material_usage[layer.Material.id()] += len(related_objects)
        elif relating_material.is_a('IfcMaterialLayerSet'):
            for layer in relating_material.MaterialLayers:
                if layer.Material:
                    material_usage[layer.Material.id()] += len(related_objects)

    # Build result with material details
    result = []
    for material in ifc_file.by_type('IfcMaterial'):
        result.append({
            'material_id': material.id(),
            'name': material.Name or 'Unnamed',
            'category': getattr(material, 'Category', None),
            'usage_count': material_usage.get(material.id(), 0),
        })

    # Sort by usage count descending
    result.sort(key=lambda x: x['usage_count'], reverse=True)

    return result

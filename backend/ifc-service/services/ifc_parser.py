"""
IFC Parser Service - Extract metadata from IFC files.

Ported from Django's apps/models/services/parse.py to work with FastAPI.
Uses data classes instead of Django ORM models.

PHILOSOPHY:
- Extract ONLY metadata (GUID, type, name, properties, relationships)
- NO geometry extraction (that's a separate layer)
- ALWAYS succeeds unless file is corrupt
- FAST: Should complete in seconds even for large files
"""

import os
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Dict, Optional, Tuple, Any
from concurrent.futures import ThreadPoolExecutor

import ifcopenshell

from repositories.ifc_repository import (
    EntityData, PropertyData, SpatialData,
    MaterialData, TypeData, SystemData, TypeAssignmentData
)


@dataclass
class StageResult:
    """Result of a processing stage."""
    stage: str
    status: str  # 'success', 'partial', 'failed'
    processed: int = 0
    skipped: int = 0
    failed: int = 0
    errors: List[str] = field(default_factory=list)
    duration_ms: int = 0
    message: str = ""


@dataclass
class ParseError:
    """Error that occurred during parsing."""
    stage: str
    severity: str  # 'warning', 'error', 'critical'
    message: str
    element_guid: Optional[str] = None
    element_type: Optional[str] = None
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class ParseResult:
    """Complete result of parsing an IFC file."""
    success: bool = False
    ifc_schema: str = ""
    file_size_bytes: int = 0

    # Extracted data
    entities: List[EntityData] = field(default_factory=list)
    properties: List[PropertyData] = field(default_factory=list)
    spatial_items: List[SpatialData] = field(default_factory=list)
    materials: List[MaterialData] = field(default_factory=list)
    types: List[TypeData] = field(default_factory=list)
    systems: List[SystemData] = field(default_factory=list)
    type_assignments: List[TypeAssignmentData] = field(default_factory=list)

    # Counts
    element_count: int = 0
    storey_count: int = 0
    property_count: int = 0
    material_count: int = 0
    type_count: int = 0
    system_count: int = 0
    type_assignment_count: int = 0

    # Processing info
    stage_results: List[Dict] = field(default_factory=list)
    errors: List[Dict] = field(default_factory=list)
    duration_seconds: float = 0.0

    # Maps for cross-referencing (guid -> temp_id for linking)
    storey_guid_to_temp_id: Dict[str, str] = field(default_factory=dict)


@dataclass
class QuickStats:
    """Quick stats extracted in <1 second for immediate UI feedback."""
    success: bool = False
    ifc_schema: str = ""
    file_size_bytes: int = 0

    # Core counts (fast to compute)
    total_elements: int = 0
    storey_count: int = 0
    type_count: int = 0
    material_count: int = 0

    # Top entity types by count
    top_entity_types: List[Dict[str, Any]] = field(default_factory=list)

    # Storey names (quick spatial overview)
    storey_names: List[str] = field(default_factory=list)

    # Timing
    duration_ms: int = 0

    # Error if failed
    error: Optional[str] = None


class IFCParserService:
    """
    Parse IFC files and extract metadata.

    This service is stateless - each parse is independent.
    """

    def quick_stats(self, file_path: str) -> QuickStats:
        """
        Extract quick stats from an IFC file in <1 second.

        This provides immediate feedback to the user while full parsing
        continues in the background. Only counts elements, doesn't extract
        full metadata.

        Args:
            file_path: Path to the IFC file

        Returns:
            QuickStats with counts and top entity types
        """
        stats = QuickStats()
        start_time = time.time()

        try:
            # Open the file
            ifc_file = ifcopenshell.open(file_path)
            stats.ifc_schema = ifc_file.schema
            stats.file_size_bytes = os.path.getsize(file_path) if os.path.exists(file_path) else 0

            # Count storeys (fast - usually <20 elements)
            storeys = ifc_file.by_type('IfcBuildingStorey')
            stats.storey_count = len(storeys)
            stats.storey_names = [
                s.Name or s.LongName or f"Storey #{i+1}"
                for i, s in enumerate(storeys)
            ]

            # Count types (fast - scan IfcTypeObject)
            types = ifc_file.by_type('IfcTypeObject')
            stats.type_count = len(types)

            # Count materials (fast)
            materials = ifc_file.by_type('IfcMaterial')
            stats.material_count = len(materials)

            # Count all building elements and group by type
            # This is the slightly slower part but still fast
            type_counts: Dict[str, int] = {}
            total = 0

            # Get all products (elements with geometry potential)
            for product in ifc_file.by_type('IfcProduct'):
                ifc_type = product.is_a()
                # Skip spatial elements from count (they're structure, not content)
                if ifc_type in ('IfcSite', 'IfcBuilding', 'IfcBuildingStorey', 'IfcSpace'):
                    continue
                type_counts[ifc_type] = type_counts.get(ifc_type, 0) + 1
                total += 1

            stats.total_elements = total

            # Top 5 entity types by count
            sorted_types = sorted(type_counts.items(), key=lambda x: x[1], reverse=True)
            stats.top_entity_types = [
                {"type": t, "count": c}
                for t, c in sorted_types[:5]
            ]

            stats.success = True

        except Exception as e:
            stats.success = False
            stats.error = str(e)

        stats.duration_ms = int((time.time() - start_time) * 1000)
        return stats

    def parse_file(self, file_path: str) -> ParseResult:
        """
        Parse an IFC file and extract all metadata.

        This runs synchronously (ifcopenshell is blocking).
        For async usage, run in a thread pool executor.

        Args:
            file_path: Path to the IFC file

        Returns:
            ParseResult with all extracted data
        """
        result = ParseResult()
        start_time = time.time()

        try:
            # ==================== STAGE: File Open ====================
            stage_start = time.time()
            print(f"\n[Parser] Opening IFC file: {file_path}")

            try:
                ifc_file = ifcopenshell.open(file_path)
                result.ifc_schema = ifc_file.schema
                result.file_size_bytes = os.path.getsize(file_path) if os.path.exists(file_path) else 0

                result.stage_results.append({
                    'stage': 'file_open',
                    'status': 'success',
                    'processed': 1,
                    'skipped': 0,
                    'failed': 0,
                    'errors': [],
                    'duration_ms': int((time.time() - stage_start) * 1000),
                    'message': f'Opened IFC file with schema {result.ifc_schema}'
                })
                print(f"[Parser] File opened: {result.ifc_schema}")

            except Exception as e:
                error_msg = f"Failed to open IFC file: {str(e)}"
                result.errors.append({
                    'stage': 'file_open',
                    'severity': 'critical',
                    'message': error_msg,
                    'element_guid': None,
                    'element_type': None,
                    'timestamp': datetime.now().isoformat()
                })
                result.duration_seconds = time.time() - start_time
                return result  # Can't continue without file

            # ==================== STAGE: Spatial Hierarchy ====================
            stage_start = time.time()
            print("[Parser] Extracting spatial hierarchy...")
            spatial_items, storey_count, stage_errors = self._extract_spatial_hierarchy(ifc_file)
            result.spatial_items = spatial_items
            result.storey_count = storey_count

            # Build storey map for element linking
            for item in spatial_items:
                if item.hierarchy_level == 'storey':
                    # Use a placeholder - will be replaced with real DB ID later
                    pass

            result.stage_results.append({
                'stage': 'spatial_hierarchy',
                'status': 'success' if len(stage_errors) == 0 else 'partial',
                'processed': storey_count,
                'skipped': 0,
                'failed': len(stage_errors),
                'errors': [e['message'] for e in stage_errors],
                'duration_ms': int((time.time() - stage_start) * 1000),
                'message': f"Extracted {storey_count} spatial elements"
            })
            result.errors.extend(stage_errors)
            print(f"[Parser] Spatial hierarchy: {storey_count} elements")

            # ==================== STAGE: Materials ====================
            stage_start = time.time()
            print("[Parser] Extracting materials...")
            materials, stage_errors = self._extract_materials(ifc_file)
            result.materials = materials
            result.material_count = len(materials)

            result.stage_results.append({
                'stage': 'materials',
                'status': 'success' if len(stage_errors) == 0 else 'partial',
                'processed': len(materials),
                'skipped': 0,
                'failed': len(stage_errors),
                'errors': [e['message'] for e in stage_errors],
                'duration_ms': int((time.time() - stage_start) * 1000),
                'message': f"Extracted {len(materials)} materials"
            })
            result.errors.extend(stage_errors)
            print(f"[Parser] Materials: {len(materials)}")

            # ==================== STAGE: Types ====================
            stage_start = time.time()
            print("[Parser] Extracting type definitions...")
            types, stage_errors = self._extract_types(ifc_file)
            result.types = types
            result.type_count = len(types)

            result.stage_results.append({
                'stage': 'types',
                'status': 'success' if len(stage_errors) == 0 else 'partial',
                'processed': len(types),
                'skipped': 0,
                'failed': len(stage_errors),
                'errors': [e['message'] for e in stage_errors],
                'duration_ms': int((time.time() - stage_start) * 1000),
                'message': f"Extracted {len(types)} type definitions"
            })
            result.errors.extend(stage_errors)
            print(f"[Parser] Types: {len(types)}")

            # ==================== STAGE: Systems ====================
            stage_start = time.time()
            print("[Parser] Extracting systems...")
            systems, stage_errors = self._extract_systems(ifc_file)
            result.systems = systems
            result.system_count = len(systems)

            result.stage_results.append({
                'stage': 'systems',
                'status': 'success' if len(stage_errors) == 0 else 'partial',
                'processed': len(systems),
                'skipped': 0,
                'failed': len(stage_errors),
                'errors': [e['message'] for e in stage_errors],
                'duration_ms': int((time.time() - stage_start) * 1000),
                'message': f"Extracted {len(systems)} systems"
            })
            result.errors.extend(stage_errors)
            print(f"[Parser] Systems: {len(systems)}")

            # ==================== STAGE: Elements ====================
            stage_start = time.time()
            print("[Parser] Extracting element metadata...")

            # Build storey GUID map for fast lookup
            storey_guids = set()
            for item in spatial_items:
                if item.hierarchy_level == 'storey':
                    # The entity_id at this point is the ifc_guid (we don't have DB IDs yet)
                    storey_guids.add(item.entity_id)

            entities, stage_errors = self._extract_elements_metadata(ifc_file, storey_guids)
            result.entities = entities
            result.element_count = len(entities)

            result.stage_results.append({
                'stage': 'elements_metadata',
                'status': 'success' if len(stage_errors) == 0 else 'partial',
                'processed': len(entities),
                'skipped': 0,
                'failed': len(stage_errors),
                'errors': [e['message'] for e in stage_errors],
                'duration_ms': int((time.time() - stage_start) * 1000),
                'message': f"Extracted {len(entities)} elements (metadata only)"
            })
            result.errors.extend(stage_errors)
            print(f"[Parser] Elements: {len(entities)}")

            # ==================== STAGE: Properties ====================
            stage_start = time.time()
            print("[Parser] Extracting property sets...")

            # Build entity GUID set for fast lookup
            entity_guids = {e.ifc_guid for e in entities}
            # Also include spatial elements
            for item in spatial_items:
                entity_guids.add(item.entity_id)

            properties, stage_errors = self._extract_property_sets(ifc_file, entity_guids)
            result.properties = properties
            result.property_count = len(properties)

            result.stage_results.append({
                'stage': 'properties',
                'status': 'success' if len(stage_errors) == 0 else 'partial',
                'processed': len(properties),
                'skipped': 0,
                'failed': len(stage_errors),
                'errors': [e['message'] for e in stage_errors],
                'duration_ms': int((time.time() - stage_start) * 1000),
                'message': f"Extracted {len(properties)} properties"
            })
            result.errors.extend(stage_errors)
            print(f"[Parser] Properties: {len(properties)}")

            # ==================== STAGE: Type Assignments ====================
            stage_start = time.time()
            print("[Parser] Extracting type assignments...")

            # Build type GUID set for fast lookup
            type_guids = {t.type_guid for t in types}

            type_assignments, stage_errors = self._extract_type_assignments(
                ifc_file, entity_guids, type_guids
            )
            result.type_assignments = type_assignments
            result.type_assignment_count = len(type_assignments)

            result.stage_results.append({
                'stage': 'type_assignments',
                'status': 'success' if len(stage_errors) == 0 else 'partial',
                'processed': len(type_assignments),
                'skipped': 0,
                'failed': len(stage_errors),
                'errors': [e['message'] for e in stage_errors],
                'duration_ms': int((time.time() - stage_start) * 1000),
                'message': f"Extracted {len(type_assignments)} type assignments"
            })
            result.errors.extend(stage_errors)
            print(f"[Parser] Type Assignments: {len(type_assignments)}")

            # ==================== Complete ====================
            result.success = True
            result.duration_seconds = time.time() - start_time

            print(f"\n[Parser] Complete in {result.duration_seconds:.2f}s")
            print(f"  Elements: {result.element_count}")
            print(f"  Properties: {result.property_count}")
            print(f"  Errors: {len(result.errors)}")

            return result

        except Exception as e:
            result.duration_seconds = time.time() - start_time
            result.errors.append({
                'stage': 'unknown',
                'severity': 'critical',
                'message': f"Catastrophic parsing failure: {str(e)}",
                'element_guid': None,
                'element_type': None,
                'timestamp': datetime.now().isoformat()
            })
            return result

    def _extract_spatial_hierarchy(
        self, ifc_file
    ) -> Tuple[List[SpatialData], int, List[Dict]]:
        """Extract project/site/building/storey hierarchy."""
        items = []
        errors = []

        # We'll store entities as SpatialData with entity_id = ifc_guid
        # The orchestrator will create IFCEntity records and update references

        # Project
        try:
            projects = ifc_file.by_type('IfcProject')
            if projects:
                project = projects[0]
                items.append(SpatialData(
                    entity_id=project.GlobalId,  # Temporarily store GUID
                    parent_id=None,
                    hierarchy_level='project',
                    path=[project.GlobalId]
                ))
        except Exception as e:
            errors.append({
                'stage': 'spatial_hierarchy',
                'severity': 'error',
                'message': f"Failed to extract IfcProject: {str(e)}",
                'element_guid': None,
                'element_type': 'IfcProject',
                'timestamp': datetime.now().isoformat()
            })

        # Sites
        for site in ifc_file.by_type('IfcSite'):
            try:
                items.append(SpatialData(
                    entity_id=site.GlobalId,
                    parent_id=None,  # Would need relationship lookup
                    hierarchy_level='site',
                    path=[site.GlobalId]
                ))
            except Exception as e:
                errors.append({
                    'stage': 'spatial_hierarchy',
                    'severity': 'error',
                    'message': f"Failed to extract IfcSite: {str(e)}",
                    'element_guid': getattr(site, 'GlobalId', None),
                    'element_type': 'IfcSite',
                    'timestamp': datetime.now().isoformat()
                })

        # Buildings
        for building in ifc_file.by_type('IfcBuilding'):
            try:
                items.append(SpatialData(
                    entity_id=building.GlobalId,
                    parent_id=None,
                    hierarchy_level='building',
                    path=[building.GlobalId]
                ))
            except Exception as e:
                errors.append({
                    'stage': 'spatial_hierarchy',
                    'severity': 'error',
                    'message': f"Failed to extract IfcBuilding: {str(e)}",
                    'element_guid': getattr(building, 'GlobalId', None),
                    'element_type': 'IfcBuilding',
                    'timestamp': datetime.now().isoformat()
                })

        # Storeys
        for storey in ifc_file.by_type('IfcBuildingStorey'):
            try:
                items.append(SpatialData(
                    entity_id=storey.GlobalId,
                    parent_id=None,
                    hierarchy_level='storey',
                    path=[storey.GlobalId]
                ))
            except Exception as e:
                errors.append({
                    'stage': 'spatial_hierarchy',
                    'severity': 'error',
                    'message': f"Failed to extract IfcBuildingStorey: {str(e)}",
                    'element_guid': getattr(storey, 'GlobalId', None),
                    'element_type': 'IfcBuildingStorey',
                    'timestamp': datetime.now().isoformat()
                })

        return items, len(items), errors

    def _extract_materials(self, ifc_file) -> Tuple[List[MaterialData], List[Dict]]:
        """Extract materials."""
        materials = []
        errors = []

        for material in ifc_file.by_type('IfcMaterial'):
            try:
                step_id = str(material.id())
                materials.append(MaterialData(
                    material_guid=step_id,
                    name=material.Name or 'Unnamed Material',
                    category=getattr(material, 'Category', None),
                ))
            except Exception as e:
                errors.append({
                    'stage': 'materials',
                    'severity': 'warning',
                    'message': f"Failed to extract material: {str(e)}",
                    'element_guid': None,
                    'element_type': 'IfcMaterial',
                    'timestamp': datetime.now().isoformat()
                })

        return materials, errors

    def _extract_types(self, ifc_file) -> Tuple[List[TypeData], List[Dict]]:
        """Extract type objects."""
        types = []
        errors = []

        for type_element in ifc_file.by_type('IfcTypeObject'):
            try:
                types.append(TypeData(
                    type_guid=type_element.GlobalId,
                    type_name=type_element.Name or 'Unnamed Type',
                    ifc_type=type_element.is_a(),
                ))
            except Exception as e:
                errors.append({
                    'stage': 'types',
                    'severity': 'warning',
                    'message': f"Failed to extract type: {str(e)}",
                    'element_guid': getattr(type_element, 'GlobalId', None),
                    'element_type': getattr(type_element, 'is_a', lambda: 'IfcTypeObject')(),
                    'timestamp': datetime.now().isoformat()
                })

        return types, errors

    def _extract_systems(self, ifc_file) -> Tuple[List[SystemData], List[Dict]]:
        """Extract systems."""
        systems = []
        errors = []

        for system in ifc_file.by_type('IfcSystem'):
            try:
                systems.append(SystemData(
                    system_guid=system.GlobalId,
                    system_name=system.Name or 'Unnamed System',
                    system_type=system.is_a(),
                    description=getattr(system, 'Description', None),
                ))
            except Exception as e:
                errors.append({
                    'stage': 'systems',
                    'severity': 'warning',
                    'message': f"Failed to extract system: {str(e)}",
                    'element_guid': getattr(system, 'GlobalId', None),
                    'element_type': getattr(system, 'is_a', lambda: 'IfcSystem')(),
                    'timestamp': datetime.now().isoformat()
                })

        return systems, errors

    def _extract_quantities(self, element) -> Dict[str, Optional[float]]:
        """
        Extract quantities from element (area, volume, length, height, perimeter).

        Reads from Qto_*BaseQuantities property sets.
        """
        quantities = {
            'area': None,
            'volume': None,
            'length': None,
            'height': None,
            'perimeter': None,
        }

        try:
            if not hasattr(element, 'IsDefinedBy') or not element.IsDefinedBy:
                return quantities

            for definition in element.IsDefinedBy:
                if definition.is_a('IfcRelDefinesByProperties'):
                    prop_set = definition.RelatingPropertyDefinition

                    if prop_set.is_a('IfcElementQuantity'):
                        for quantity in prop_set.Quantities:
                            quantity_name = (quantity.Name or '').lower()

                            if 'netfloorarea' in quantity_name or 'area' in quantity_name:
                                if quantity.is_a('IfcQuantityArea'):
                                    quantities['area'] = float(quantity.AreaValue)

                            elif 'netvolume' in quantity_name or 'volume' in quantity_name:
                                if quantity.is_a('IfcQuantityVolume'):
                                    quantities['volume'] = float(quantity.VolumeValue)

                            elif 'length' in quantity_name:
                                if quantity.is_a('IfcQuantityLength'):
                                    quantities['length'] = float(quantity.LengthValue)

                            elif 'height' in quantity_name:
                                if quantity.is_a('IfcQuantityLength'):
                                    quantities['height'] = float(quantity.LengthValue)

                            elif 'perimeter' in quantity_name:
                                if quantity.is_a('IfcQuantityLength'):
                                    quantities['perimeter'] = float(quantity.LengthValue)

        except Exception:
            pass  # If quantity extraction fails, return nulls

        return quantities

    def _extract_elements_metadata(
        self, ifc_file, storey_guids: set
    ) -> Tuple[List[EntityData], List[Dict]]:
        """
        Extract element metadata (no geometry).

        Args:
            ifc_file: Open IFC file
            storey_guids: Set of storey GUIDs for fast lookup
        """
        entities = []
        errors = []

        elements = ifc_file.by_type('IfcElement')
        print(f"  Found {len(elements)} elements in IFC file")

        for element in elements:
            try:
                quantities = self._extract_quantities(element)

                # Get storey GUID if assigned
                storey_guid = None
                if hasattr(element, 'ContainedInStructure') and element.ContainedInStructure:
                    for rel in element.ContainedInStructure:
                        if rel.RelatingStructure.is_a('IfcBuildingStorey'):
                            storey_guid = rel.RelatingStructure.GlobalId
                            break

                entities.append(EntityData(
                    ifc_guid=element.GlobalId,
                    ifc_type=element.is_a(),
                    name=element.Name or '',
                    description=getattr(element, 'Description', None),
                    storey_id=storey_guid,  # Store GUID, will be converted to UUID by orchestrator
                    area=quantities['area'],
                    volume=quantities['volume'],
                    length=quantities['length'],
                    height=quantities['height'],
                    perimeter=quantities['perimeter'],
                ))

            except Exception as e:
                errors.append({
                    'stage': 'elements_metadata',
                    'severity': 'error',
                    'message': f"Failed to process element: {str(e)}",
                    'element_guid': getattr(element, 'GlobalId', None),
                    'element_type': getattr(element, 'is_a', lambda: 'IfcElement')(),
                    'timestamp': datetime.now().isoformat()
                })

        return entities, errors

    def _extract_property_sets(
        self, ifc_file, entity_guids: set
    ) -> Tuple[List[PropertyData], List[Dict]]:
        """
        Extract property sets.

        Args:
            ifc_file: Open IFC file
            entity_guids: Set of entity GUIDs that we have in our database
        """
        properties = []
        errors = []

        elements = ifc_file.by_type('IfcElement')

        for element in elements:
            if element.GlobalId not in entity_guids:
                continue

            if not hasattr(element, 'IsDefinedBy'):
                continue

            for definition in element.IsDefinedBy:
                try:
                    if definition.is_a('IfcRelDefinesByProperties'):
                        property_set = definition.RelatingPropertyDefinition

                        if property_set.is_a('IfcPropertySet'):
                            pset_name = property_set.Name

                            for prop in property_set.HasProperties:
                                try:
                                    if prop.is_a('IfcPropertySingleValue'):
                                        prop_value = None
                                        prop_type = 'string'

                                        if prop.NominalValue:
                                            prop_value = str(prop.NominalValue.wrappedValue)
                                            prop_type = type(prop.NominalValue.wrappedValue).__name__

                                        properties.append(PropertyData(
                                            entity_id=element.GlobalId,  # Store GUID, convert later
                                            pset_name=pset_name,
                                            property_name=prop.Name,
                                            property_value=prop_value,
                                            property_type=prop_type,
                                        ))

                                except Exception as e:
                                    errors.append({
                                        'stage': 'properties',
                                        'severity': 'warning',
                                        'message': f"Failed to extract property: {str(e)}",
                                        'element_guid': element.GlobalId,
                                        'element_type': element.is_a(),
                                        'timestamp': datetime.now().isoformat()
                                    })

                except Exception as e:
                    errors.append({
                        'stage': 'properties',
                        'severity': 'warning',
                        'message': f"Failed to process property definition: {str(e)}",
                        'element_guid': getattr(element, 'GlobalId', None),
                        'element_type': getattr(element, 'is_a', lambda: 'IfcElement')(),
                        'timestamp': datetime.now().isoformat()
                    })

        return properties, errors

    def _extract_type_assignments(
        self, ifc_file, entity_guids: set, type_guids: set
    ) -> Tuple[List[TypeAssignmentData], List[Dict]]:
        """
        Extract type→entity assignments from IfcRelDefinesByType relationships.

        Args:
            ifc_file: Open IFC file
            entity_guids: Set of entity GUIDs we've extracted
            type_guids: Set of type GUIDs we've extracted
        """
        assignments = []
        errors = []

        for rel in ifc_file.by_type('IfcRelDefinesByType'):
            try:
                relating_type = rel.RelatingType
                if not relating_type or not hasattr(relating_type, 'GlobalId'):
                    continue

                type_guid = relating_type.GlobalId
                if type_guid not in type_guids:
                    continue

                related_objects = rel.RelatedObjects or []

                for element in related_objects:
                    if not hasattr(element, 'GlobalId'):
                        continue

                    entity_guid = element.GlobalId
                    if entity_guid not in entity_guids:
                        continue

                    assignments.append(TypeAssignmentData(
                        entity_guid=entity_guid,
                        type_guid=type_guid,
                    ))

            except Exception as e:
                errors.append({
                    'stage': 'type_assignments',
                    'severity': 'warning',
                    'message': f"Failed to extract type assignment: {str(e)}",
                    'element_guid': None,
                    'element_type': 'IfcRelDefinesByType',
                    'timestamp': datetime.now().isoformat()
                })

        return assignments, errors


# Singleton instance
ifc_parser = IFCParserService()

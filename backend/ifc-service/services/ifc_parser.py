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
import ifcopenshell.util.unit
from collections import defaultdict
import hashlib

from repositories.ifc_repository import (
    MaterialData, TypeData, TypeLayerData,
)


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


@dataclass
class TypesOnlyResult:
    """
    Result of fast types-only extraction.

    This is the simplified extraction that only gets types + counts.
    Used for the new architecture where we don't store entities in DB.
    """
    success: bool = False
    ifc_schema: str = ""
    file_size_bytes: int = 0

    # Types with instance counts
    types: List[TypeData] = field(default_factory=list)
    materials: List[MaterialData] = field(default_factory=list)

    # Summary counts
    type_count: int = 0
    material_count: int = 0
    element_count: int = 0  # Total elements (for stats, not stored)
    storey_count: int = 0

    # Spatial data
    storeys: List[Dict] = field(default_factory=list)  # [{guid, name, elevation}]
    storey_type_distribution: Dict[str, Dict[str, int]] = field(default_factory=dict)
    # {storey_guid: {type_name: instance_count}}

    # Structured processing log (machine-readable)
    log_entries: List[Dict] = field(default_factory=list)
    # Quality report (summary of data completeness)
    quality_report: Dict = field(default_factory=dict)
    # IfcGrid extraction (Phase 4): {"grids": [{name, guid, placement, u_axes, v_axes, w_axes}]}
    discovered_grid: Dict = field(default_factory=dict)

    # Timing
    duration_seconds: float = 0.0

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

    def parse_types_only(self, file_path: str) -> TypesOnlyResult:
        """
        Fast type extraction (~2 seconds).

        This is the simplified extraction for the new architecture where
        we only store types in the database, not individual entities.

        Instance counts are computed directly from IfcRelDefinesByType
        relationships rather than storing and counting individual entity rows.

        Args:
            file_path: Path to the IFC file

        Returns:
            TypesOnlyResult with types (including instance counts) and materials
        """
        result = TypesOnlyResult()
        start_time = time.time()

        def log(level: str, stage: str, message: str, **details):
            """Append structured log entry."""
            result.log_entries.append({
                'timestamp': datetime.now().isoformat(),
                'level': level,
                'stage': stage,
                'message': message,
                **details,
            })

        try:
            # Open the file
            ifc_file = ifcopenshell.open(file_path)
            result.ifc_schema = ifc_file.schema
            result.file_size_bytes = os.path.getsize(file_path) if os.path.exists(file_path) else 0
            log('info', 'open', f'Opened {result.ifc_schema} file ({result.file_size_bytes} bytes)')

            # Resolve the file's length unit so LayerThickness values can be
            # correctly normalized to meters (Revit exports are usually in mm).
            try:
                length_unit_scale = float(ifcopenshell.util.unit.calculate_unit_scale(ifc_file))
            except Exception:
                length_unit_scale = 1.0
            # Infer human-readable unit from scale
            if abs(length_unit_scale - 0.001) < 1e-6:
                discovered_unit = 'mm'
            elif abs(length_unit_scale - 0.01) < 1e-6:
                discovered_unit = 'cm'
            elif abs(length_unit_scale - 0.3048) < 1e-4:
                discovered_unit = 'ft'
            elif abs(length_unit_scale - 0.0254) < 1e-5:
                discovered_unit = 'in'
            elif abs(length_unit_scale - 1.0) < 1e-6:
                discovered_unit = 'm'
            else:
                discovered_unit = f'scale={length_unit_scale}'
            log('info', 'units', f'Length unit: {discovered_unit} (scale={length_unit_scale})',
                length_unit=discovered_unit, length_unit_scale=length_unit_scale)
            print(f"[Parser] Length unit scale (to meters): {length_unit_scale}")

            # Count elements for stats (quick scan)
            element_count = 0
            for product in ifc_file.by_type('IfcProduct'):
                if product.is_a() not in ('IfcSite', 'IfcBuilding', 'IfcBuildingStorey', 'IfcSpace'):
                    element_count += 1
            result.element_count = element_count

            # Extract storeys with elevations
            storeys = []
            storey_guid_map = {}  # guid -> storey dict
            for storey in ifc_file.by_type('IfcBuildingStorey'):
                elevation = getattr(storey, 'Elevation', None)
                storey_data = {
                    'guid': storey.GlobalId,
                    'name': storey.Name or storey.GlobalId,
                    'elevation': float(elevation) * length_unit_scale if elevation is not None else None,
                }
                storeys.append(storey_data)
                storey_guid_map[storey.GlobalId] = storey_data
            result.storeys = storeys
            result.storey_count = len(storeys)
            log('info', 'storeys', f'Found {len(storeys)} storeys',
                storeys=[{'name': s['name'], 'elevation': s['elevation']} for s in storeys])

            # Extract IfcGrid axes (Phase 4) — failure isolated; bad grid never fails parse.
            try:
                result.discovered_grid = self._extract_grids(ifc_file, length_unit_scale)
                grid_count = len(result.discovered_grid.get('grids', []))
                if grid_count:
                    log('info', 'grids', f'Extracted {grid_count} grid(s)',
                        grids=[
                            {
                                'name': g.get('name'),
                                'u_axis_count': len(g.get('u_axes', [])),
                                'v_axis_count': len(g.get('v_axes', [])),
                                'w_axis_count': len(g.get('w_axes', [])),
                            }
                            for g in result.discovered_grid['grids']
                        ])
                else:
                    log('info', 'grids', 'No IfcGrid entities in file')
            except Exception as exc:
                result.discovered_grid = {'grids': []}
                log('warning', 'grids', f'Grid extraction failed: {exc}', error=str(exc))

            # Parse IfcRelContainedInSpatialStructure to build storey->element mapping
            # This tells us which elements are on which floor
            element_to_storey = {}  # element_guid -> storey_guid
            for rel in ifc_file.by_type('IfcRelContainedInSpatialStructure'):
                structure = rel.RelatingStructure
                if structure.is_a('IfcBuildingStorey'):
                    for element in (rel.RelatedElements or []):
                        element_to_storey[element.GlobalId] = structure.GlobalId

            # Extract types with instance counts
            types = []
            for type_element in ifc_file.by_type('IfcTypeObject'):
                try:
                    # Count instances via IfcRelDefinesByType relationship
                    # IFC2X3 uses 'ObjectTypeOf', IFC4 uses 'Types' as the inverse attribute name
                    instance_count = 0
                    representative_element = None
                    type_rels = None
                    if hasattr(type_element, 'Types') and type_element.Types:
                        type_rels = type_element.Types
                    elif hasattr(type_element, 'ObjectTypeOf') and type_element.ObjectTypeOf:
                        type_rels = type_element.ObjectTypeOf
                    if type_rels:
                        for rel in type_rels:
                            if rel.RelatedObjects:
                                instance_count += len(rel.RelatedObjects)
                                if representative_element is None:
                                    representative_element = rel.RelatedObjects[0]

                    # Extract predefined_type if available
                    predefined_type = None
                    if hasattr(type_element, 'PredefinedType') and type_element.PredefinedType:
                        predefined_type = str(type_element.PredefinedType)

                    # Extract primary material name (for TypeBank identity tuple)
                    material = self._extract_type_material(type_element)

                    # Extract the full layer stack. Revit exports frequently attach
                    # IfcRelAssociatesMaterial to elements instead of to the type,
                    # so the representative_element fallback is essential.
                    ifc_type_class = type_element.is_a()
                    representative_unit = self._infer_representative_unit(ifc_type_class)
                    definition_layers = self._extract_type_layers(
                        type_object=type_element,
                        representative_element=representative_element,
                        representative_unit=representative_unit,
                        length_unit_scale=length_unit_scale,
                    )

                    # If material was missing but layers were found via the element
                    # fallback, keep TypeBank identity consistent by using the first layer.
                    if not material and definition_layers:
                        material = definition_layers[0].material_name

                    # Extract key properties from type Psets (IsExternal, LoadBearing, etc.)
                    type_properties = self._extract_type_properties(type_element)

                    types.append(TypeData(
                        type_guid=type_element.GlobalId,
                        type_name=type_element.Name or '',
                        ifc_type=ifc_type_class,
                        predefined_type=predefined_type or 'NOTDEFINED',
                        material=material,
                        instance_count=instance_count,
                        properties=type_properties or None,
                        representative_unit=representative_unit,
                        definition_layers=definition_layers,
                    ))

                except Exception as e:
                    # Log but continue - don't fail entire parse for one bad type
                    print(f"[Parser] Warning: Failed to extract type {getattr(type_element, 'GlobalId', 'unknown')}: {e}")

            # ==================== Untyped Element Tracking ====================
            # Find elements NOT covered by any IfcTypeObject. These are silently
            # lost in many platforms. We create synthetic types for them so they
            # appear in the type inventory with accurate counts.
            typed_guids = set()
            element_to_type_name = {}  # element_guid -> type_name (for storey distribution)
            for type_element in ifc_file.by_type('IfcTypeObject'):
                type_rels = None
                if hasattr(type_element, 'Types') and type_element.Types:
                    type_rels = type_element.Types
                elif hasattr(type_element, 'ObjectTypeOf') and type_element.ObjectTypeOf:
                    type_rels = type_element.ObjectTypeOf
                if type_rels:
                    t_name = type_element.Name or type_element.GlobalId
                    for rel in type_rels:
                        if rel.RelatedObjects:
                            for obj in rel.RelatedObjects:
                                typed_guids.add(obj.GlobalId)
                                element_to_type_name[obj.GlobalId] = t_name

            # Group untyped elements by (ifc_class, object_type)
            untyped_groups = defaultdict(lambda: {'count': 0, 'first_element': None})
            untyped_total = 0
            for element in ifc_file.by_type('IfcElement'):
                if element.GlobalId not in typed_guids:
                    ifc_class = element.is_a()
                    object_type = getattr(element, 'ObjectType', None) or '<untyped>'
                    key = (ifc_class, object_type)
                    group = untyped_groups[key]
                    group['count'] += 1
                    if group['first_element'] is None:
                        group['first_element'] = element
                    untyped_total += 1

            # Create synthetic types for untyped groups
            for (ifc_class, object_type), group in untyped_groups.items():
                type_name = object_type if object_type != '<untyped>' else f'{ifc_class}::<untyped>'
                ifc_type_class = ifc_class + 'Type' if not ifc_class.endswith('Type') else ifc_class
                type_guid = 'synth_' + hashlib.md5(f'{ifc_class}:{object_type}'.encode()).hexdigest()[:18]

                # Try to get material from representative element
                material = ''
                representative_element = group['first_element']
                representative_unit = self._infer_representative_unit(ifc_type_class)
                definition_layers = self._extract_type_layers(
                    type_object=None,
                    representative_element=representative_element,
                    representative_unit=representative_unit,
                    length_unit_scale=length_unit_scale,
                )
                if definition_layers:
                    material = definition_layers[0].material_name

                types.append(TypeData(
                    type_guid=type_guid,
                    type_name=type_name,
                    ifc_type=ifc_type_class,
                    predefined_type='NOTDEFINED',
                    material=material,
                    instance_count=group['count'],
                    has_ifc_type_object=False,
                    representative_unit=representative_unit,
                    definition_layers=definition_layers,
                ))

            if untyped_total > 0:
                # Add untyped elements to element_to_type_name for storey distribution
                for element in ifc_file.by_type('IfcElement'):
                    if element.GlobalId not in element_to_type_name:
                        ifc_class = element.is_a()
                        object_type = getattr(element, 'ObjectType', None) or '<untyped>'
                        type_name = object_type if object_type != '<untyped>' else f'{ifc_class}::<untyped>'
                        element_to_type_name[element.GlobalId] = type_name
                log('warning', 'types', f'{untyped_total} elements have no IfcTypeObject assignment',
                    untyped_element_count=untyped_total, synthetic_type_count=len(untyped_groups))
                print(f"[Parser] Tracked {untyped_total} untyped elements across {len(untyped_groups)} synthetic types")

            # ==================== Build Storey-Type Distribution ====================
            # Cross-reference spatial containment with type assignments
            storey_type_dist = defaultdict(lambda: defaultdict(int))
            elements_with_storey = 0
            for elem_guid, storey_guid in element_to_storey.items():
                type_name = element_to_type_name.get(elem_guid)
                if type_name:
                    storey_type_dist[storey_guid][type_name] += 1
                    elements_with_storey += 1

            result.storey_type_distribution = {k: dict(v) for k, v in storey_type_dist.items()}
            if storey_type_dist:
                log('info', 'spatial', f'{elements_with_storey} elements mapped to storeys across {len(storey_type_dist)} storeys',
                    elements_mapped=elements_with_storey, storeys_with_elements=len(storey_type_dist))

            typed_type_count = len(types) - len(untyped_groups)
            log('info', 'types', f'Extracted {len(types)} types ({typed_type_count} from IfcTypeObject, {len(untyped_groups)} synthetic)',
                typed_count=typed_type_count, synthetic_count=len(untyped_groups))

            # Count types with properties extracted
            types_with_props = sum(1 for t in types if t.properties)
            if types_with_props > 0:
                log('info', 'properties', f'{types_with_props}/{len(types)} types have Pset properties',
                    types_with_properties=types_with_props)

            result.types = types
            result.type_count = len(types)

            # Extract materials
            materials, _ = self._extract_materials(ifc_file)
            result.materials = materials
            result.material_count = len(materials)
            log('info', 'materials', f'Extracted {len(materials)} materials', count=len(materials))

            result.success = True
            result.duration_seconds = time.time() - start_time

            # Build quality report
            result.quality_report = {
                'total_elements': element_count,
                'typed_elements': element_count - untyped_total,
                'untyped_elements': untyped_total,
                'type_count': len(types),
                'typed_type_count': typed_type_count,
                'synthetic_type_count': len(untyped_groups),
                'types_with_properties': types_with_props,
                'material_count': len(materials),
                'storey_count': result.storey_count,
                'elements_with_storey': elements_with_storey,
                'length_unit': discovered_unit,
                'coverage_pct': round((element_count - untyped_total) / element_count * 100, 1) if element_count > 0 else 0,
            }

            log('info', 'complete', f'Extraction complete in {result.duration_seconds:.2f}s',
                duration_seconds=round(result.duration_seconds, 2))

            print(f"[Parser] Types-only extraction complete in {result.duration_seconds:.2f}s")
            print(f"  Types: {result.type_count} ({typed_type_count} from IfcTypeObject, {len(untyped_groups)} synthetic)")
            print(f"  Materials: {result.material_count}")
            print(f"  Total elements: {result.element_count}")

        except Exception as e:
            result.success = False
            result.error = str(e)
            result.duration_seconds = time.time() - start_time
            log('error', 'fatal', f'Extraction failed: {str(e)}')

        return result

    def _extract_grids(self, ifc_file, length_unit_scale: float) -> Dict:
        """
        Extract every IfcGrid: name, guid, 4x4 placement, U/V/W axes.

        Each axis becomes:
          {tag, curve_type, start: [x,y,z]|None, direction: [dx,dy,dz]|None}

        IfcLine: start = Pnt.Coordinates, direction = DirectionRatios * Magnitude.
        IfcPolyline: start = first point, direction = (last - first).
        Other curve types: curve_type recorded, start/direction = None.

        Coordinates and the placement translation column are converted to
        meters via ``length_unit_scale`` so downstream consumers
        (drawing-sheet axis registration, footprint containment) can compare
        values without re-resolving units.
        """
        try:
            import ifcopenshell.util.placement
        except Exception:
            ifcopenshell.util.placement = None  # type: ignore[attr-defined]

        result_grids: List[Dict] = []

        def _scaled_point(coords) -> Optional[List[float]]:
            if coords is None:
                return None
            try:
                return [float(c) * length_unit_scale for c in coords]
            except Exception:
                return None

        def _axis_dict(axis) -> Dict:
            tag = getattr(axis, 'AxisTag', None)
            curve = getattr(axis, 'AxisCurve', None)
            entry: Dict = {
                'tag': tag,
                'curve_type': curve.is_a() if curve is not None else None,
                'start': None,
                'direction': None,
            }
            if curve is None:
                return entry
            try:
                if curve.is_a('IfcLine'):
                    pnt = getattr(curve, 'Pnt', None)
                    direction = getattr(curve, 'Dir', None)
                    if pnt is not None:
                        entry['start'] = _scaled_point(getattr(pnt, 'Coordinates', None))
                    if direction is not None:
                        # IfcLine.Dir is an IfcVector: Orientation (IfcDirection) + Magnitude.
                        # Some authors hand back a raw IfcDirection — handle both.
                        if direction.is_a('IfcVector'):
                            orientation = getattr(direction, 'Orientation', None)
                            magnitude = float(getattr(direction, 'Magnitude', 1.0) or 1.0)
                            ratios = getattr(orientation, 'DirectionRatios', None) if orientation is not None else None
                        else:
                            magnitude = 1.0
                            ratios = getattr(direction, 'DirectionRatios', None)
                        if ratios is not None:
                            # Direction ratios are unitless; the magnitude carries
                            # the model's length unit, so scale it to meters.
                            scaled_mag = magnitude * length_unit_scale
                            entry['direction'] = [float(r) * scaled_mag for r in ratios]
                elif curve.is_a('IfcPolyline'):
                    points = list(getattr(curve, 'Points', []) or [])
                    if len(points) >= 2:
                        first = _scaled_point(getattr(points[0], 'Coordinates', None))
                        last = _scaled_point(getattr(points[-1], 'Coordinates', None))
                        entry['start'] = first
                        if first is not None and last is not None:
                            entry['direction'] = [last[i] - first[i] for i in range(len(first))]
            except Exception:
                # Curve geometry unreadable — keep tag + curve_type, drop coords.
                entry['start'] = None
                entry['direction'] = None
            return entry

        for grid in ifc_file.by_type('IfcGrid'):
            placement: Optional[List[List[float]]] = None
            try:
                if grid.ObjectPlacement is not None and ifcopenshell.util.placement is not None:
                    matrix = ifcopenshell.util.placement.get_local_placement(grid.ObjectPlacement)
                    if matrix is not None:
                        # Numpy array; copy + scale translation column to meters.
                        m = [[float(v) for v in row] for row in matrix]
                        for r in range(3):
                            m[r][3] = m[r][3] * length_unit_scale
                        placement = m
            except Exception:
                placement = None

            grid_entry: Dict = {
                'name': getattr(grid, 'Name', None),
                'guid': getattr(grid, 'GlobalId', None),
                'placement': placement,
                'u_axes': [_axis_dict(a) for a in (getattr(grid, 'UAxes', None) or [])],
                'v_axes': [_axis_dict(a) for a in (getattr(grid, 'VAxes', None) or [])],
                'w_axes': [_axis_dict(a) for a in (getattr(grid, 'WAxes', None) or [])],
            }
            result_grids.append(grid_entry)

        return {'grids': result_grids}

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

    def _extract_types(self, ifc_file, length_unit_scale: float = 1.0) -> Tuple[List[TypeData], List[Dict]]:
        """
        Extract types by grouping elements by their ObjectType attribute.

        ObjectType is the PRIMARY source for type enumeration:
        - Always populated by Revit regardless of export settings
        - More reliable than IfcTypeObject which depends on export configuration

        IfcTypeObject is SECONDARY - used to enrich type data when available:
        - GlobalId, PredefinedType, Material associations
        - When ObjectType matches IfcTypeObject.Name, link them

        This approach ensures:
        - No empty types (only created when ObjectType exists)
        - No unused types (instance count from actual elements)
        - Better coverage (elements without IfcRelDefinesByType included)
        """
        types = []
        errors = []

        # ==================== PASS 1: Group elements by ObjectType ====================
        # Key: ObjectType string, Value: dict with element GUIDs and IFC class info.
        # Also captures the first element seen for each ObjectType as a representative
        # sample — used later to extract material layers when the type's own
        # IfcTypeObject lacks material associations (common in Revit exports).
        object_type_groups = defaultdict(lambda: {
            'guids': [],
            'ifc_classes': set(),  # Track which IFC classes use this type
            'first_element': None,
        })

        try:
            for element in ifc_file.by_type('IfcElement'):
                object_type = getattr(element, 'ObjectType', None)
                if not object_type:
                    # Synthetic key for untyped elements: group by ifc_class
                    object_type = f'{element.is_a()}::<untyped>'
                group = object_type_groups[object_type]
                group['guids'].append(element.GlobalId)
                group['ifc_classes'].add(element.is_a())
                if group['first_element'] is None:
                    group['first_element'] = element
        except Exception as e:
            errors.append({
                'stage': 'types',
                'severity': 'warning',
                'message': f"Error grouping elements by ObjectType: {str(e)}",
                'element_guid': None,
                'element_type': 'IfcElement',
                'timestamp': datetime.now().isoformat()
            })

        # ==================== PASS 2: Build IfcTypeObject lookup ====================
        # Key: IfcTypeObject.Name, Value: IfcTypeObject entity
        type_object_lookup = {}

        try:
            for type_element in ifc_file.by_type('IfcTypeObject'):
                type_name = type_element.Name
                if type_name:
                    # If multiple IfcTypeObjects have same name, prefer the one with instances
                    if type_name not in type_object_lookup:
                        type_object_lookup[type_name] = type_element
                    else:
                        # Check which one has instances linked
                        existing = type_object_lookup[type_name]
                        existing_instances = self._count_type_instances(existing)
                        new_instances = self._count_type_instances(type_element)
                        if new_instances > existing_instances:
                            type_object_lookup[type_name] = type_element
        except Exception as e:
            errors.append({
                'stage': 'types',
                'severity': 'warning',
                'message': f"Error building IfcTypeObject lookup: {str(e)}",
                'element_guid': None,
                'element_type': 'IfcTypeObject',
                'timestamp': datetime.now().isoformat()
            })

        # ==================== PASS 3: Create TypeData for each unique ObjectType ====================
        for object_type, group_data in object_type_groups.items():
            try:
                type_object = type_object_lookup.get(object_type)
                instance_count = len(group_data['guids'])
                ifc_classes = group_data['ifc_classes']
                representative_element = group_data['first_element']

                # Determine IFC type class (e.g., IfcWallType from IfcWall)
                if type_object:
                    # Use actual IfcTypeObject class
                    ifc_type_class = type_object.is_a()
                    type_guid = type_object.GlobalId
                    has_ifc_type_object = True
                else:
                    # Infer type class from element class (IfcWall -> IfcWallType)
                    # Use most common element class in this group
                    most_common_class = max(ifc_classes, key=lambda c: sum(1 for e in group_data['guids']))
                    ifc_type_class = most_common_class + 'Type' if not most_common_class.endswith('Type') else most_common_class
                    # Generate synthetic GUID from ObjectType (deterministic)
                    type_guid = 'synth_' + hashlib.md5(object_type.encode()).hexdigest()[:18]
                    has_ifc_type_object = False

                # Extract metadata from IfcTypeObject if available
                predefined_type = 'NOTDEFINED'
                material = ''

                if type_object:
                    if hasattr(type_object, 'PredefinedType') and type_object.PredefinedType:
                        predefined_type = str(type_object.PredefinedType)
                    material = self._extract_type_material(type_object)

                # Extract layer stack for Materials Browser / LCA / Balance Sheet.
                # Prefer the IfcTypeObject's material association; fall back to the
                # representative element (Revit exports often attach material to
                # elements, not to the type).
                representative_unit = self._infer_representative_unit(ifc_type_class)
                definition_layers = self._extract_type_layers(
                    type_object=type_object,
                    representative_element=representative_element,
                    representative_unit=representative_unit,
                    length_unit_scale=length_unit_scale,
                )

                # If we got layers but `material` (primary string for TypeBank identity)
                # is still empty, populate it from the first layer for consistency.
                if not material and definition_layers:
                    material = definition_layers[0].material_name

                # Extract key properties from type Psets (IsExternal, LoadBearing, etc.)
                type_properties = self._extract_type_properties(type_object) if type_object else None

                types.append(TypeData(
                    type_guid=type_guid,
                    type_name=object_type,  # Use ObjectType as canonical name
                    ifc_type=ifc_type_class,
                    predefined_type=predefined_type,
                    material=material,
                    instance_count=instance_count,
                    has_ifc_type_object=has_ifc_type_object,
                    properties=type_properties or None,
                    representative_unit=representative_unit,
                    definition_layers=definition_layers,
                ))

            except Exception as e:
                errors.append({
                    'stage': 'types',
                    'severity': 'warning',
                    'message': f"Failed to create type for ObjectType '{object_type}': {str(e)}",
                    'element_guid': None,
                    'element_type': 'TypeData',
                    'timestamp': datetime.now().isoformat()
                })

        return types, errors

    def _count_type_instances(self, type_element) -> int:
        """Count instances linked to an IfcTypeObject via inverse relationship.

        IFC2X3 uses 'ObjectTypeOf', IFC4 uses 'Types' as the inverse attribute name.
        """
        try:
            type_rels = None
            if hasattr(type_element, 'Types') and type_element.Types:
                type_rels = type_element.Types
            elif hasattr(type_element, 'ObjectTypeOf') and type_element.ObjectTypeOf:
                type_rels = type_element.ObjectTypeOf
            if type_rels:
                count = 0
                for rel in type_rels:
                    if hasattr(rel, 'RelatedObjects') and rel.RelatedObjects:
                        count += len(rel.RelatedObjects)
                return count
        except Exception:
            pass
        return 0

    def _extract_type_material(self, type_element) -> str:
        """
        Extract primary material name from type's material association.

        Checks HasAssociations for IfcRelAssociatesMaterial relationships.
        Returns the first material name found, or empty string.
        """
        try:
            if not hasattr(type_element, 'HasAssociations'):
                return ''

            for assoc in type_element.HasAssociations:
                if assoc.is_a('IfcRelAssociatesMaterial'):
                    material = assoc.RelatingMaterial

                    # Direct IfcMaterial
                    if material.is_a('IfcMaterial'):
                        return material.Name or ''

                    # IfcMaterialLayerSet - get first layer's material
                    if material.is_a('IfcMaterialLayerSet'):
                        layers = material.MaterialLayers
                        if layers and layers[0].Material:
                            return layers[0].Material.Name or ''

                    # IfcMaterialLayerSetUsage
                    if material.is_a('IfcMaterialLayerSetUsage'):
                        layer_set = material.ForLayerSet
                        if layer_set and layer_set.MaterialLayers:
                            first_layer = layer_set.MaterialLayers[0]
                            if first_layer.Material:
                                return first_layer.Material.Name or ''

                    # IfcMaterialList - get first material
                    if material.is_a('IfcMaterialList'):
                        materials = material.Materials
                        if materials:
                            return materials[0].Name or ''

                    # IfcMaterialConstituentSet (IFC4+)
                    if hasattr(material, 'MaterialConstituents'):
                        constituents = material.MaterialConstituents
                        if constituents and constituents[0].Material:
                            return constituents[0].Material.Name or ''

            return ''

        except Exception:
            return ''

    # Key properties to extract from type-level Psets (Pset_*Common).
    # These define what a type IS and feed into TypeBankEntry statistics.
    _TYPE_PROPERTY_KEYS = {
        'IsExternal', 'LoadBearing', 'FireRating',
        'ThermalTransmittance', 'AcousticRating', 'Reference',
    }

    def _extract_type_properties(self, type_object) -> Dict[str, Any]:
        """
        Extract key properties from IfcTypeObject's property sets.

        Looks for Pset_*Common property sets and extracts predefined
        properties (IsExternal, LoadBearing, FireRating, etc.).

        Returns dict of property_name -> value (typed: bool, float, or str).
        Never raises.
        """
        props = {}
        if type_object is None:
            return props

        try:
            # IfcTypeObject stores properties via HasPropertySets (direct attribute)
            psets = getattr(type_object, 'HasPropertySets', None)
            if not psets:
                return props

            for pset in psets:
                if not pset.is_a('IfcPropertySet'):
                    continue
                for prop in (pset.HasProperties or []):
                    if prop.Name not in self._TYPE_PROPERTY_KEYS:
                        continue
                    if prop.is_a('IfcPropertySingleValue') and prop.NominalValue is not None:
                        raw = prop.NominalValue.wrappedValue
                        # Preserve typed values
                        if isinstance(raw, bool):
                            props[prop.Name] = raw
                        elif isinstance(raw, (int, float)):
                            props[prop.Name] = float(raw)
                        else:
                            props[prop.Name] = str(raw)
        except Exception:
            pass

        return props

    # Representative unit inference for types, used to populate TypeMapping.representative_unit
    # when the parser creates a mapping. Matches the conventions in the seed command and the
    # Materials Browser UI. Anything not in this map defaults to 'm2'.
    _TYPE_UNIT_MAP = {
        # Area-based (walls, slabs, roofs, plates, curtain walls, stairs)
        'IfcWallType': 'm2',
        'IfcWallStandardCaseType': 'm2',
        'IfcSlabType': 'm2',
        'IfcRoofType': 'm2',
        'IfcPlateType': 'm2',
        'IfcCurtainWallType': 'm2',
        'IfcStairType': 'm2',
        'IfcStairFlightType': 'm2',
        'IfcCoveringType': 'm2',
        'IfcRampType': 'm2',
        'IfcRampFlightType': 'm2',
        # Linear (columns, beams, pipes, ducts, railings, members)
        'IfcColumnType': 'm',
        'IfcBeamType': 'm',
        'IfcMemberType': 'm',
        'IfcRailingType': 'm',
        'IfcPipeSegmentType': 'm',
        'IfcPipeFittingType': 'm',
        'IfcDuctSegmentType': 'm',
        'IfcDuctFittingType': 'm',
        'IfcCableSegmentType': 'm',
        'IfcCableCarrierSegmentType': 'm',
        # Piece-count (windows, doors, furniture, equipment, valves, fittings)
        'IfcWindowType': 'pcs',
        'IfcWindowStyle': 'pcs',
        'IfcDoorType': 'pcs',
        'IfcDoorStyle': 'pcs',
        'IfcFurnitureType': 'pcs',
        'IfcSanitaryTerminalType': 'pcs',
        'IfcLightFixtureType': 'pcs',
        'IfcFlowTerminalType': 'pcs',
        'IfcValveType': 'pcs',
    }

    def _infer_representative_unit(self, ifc_type_class: str) -> str:
        """Infer TypeMapping.representative_unit from IFC type class."""
        return self._TYPE_UNIT_MAP.get(ifc_type_class, 'm2')

    def _extract_type_layers(
        self,
        type_object,
        representative_element,
        representative_unit: str,
        length_unit_scale: float = 1.0,
    ) -> List[TypeLayerData]:
        """
        Extract material layer stack for a type.

        Checks (in order): the IfcTypeObject's HasAssociations, then the representative
        element's HasAssociations. Handles all four IFC material attachment forms:
          - IfcMaterialLayerSet / IfcMaterialLayerSetUsage → layered sandwich
          - IfcMaterialConstituentSet (IFC4+) → named constituents
          - IfcMaterialList → legacy list of materials
          - IfcMaterial → single material, emitted as a single layer

        `length_unit_scale` is the factor to convert the file's length unit to
        meters (e.g. 0.001 for a mm-based file, 1.0 for a meter-based file).
        Obtain via ifcopenshell.util.unit.calculate_unit_scale(ifc_file) once per
        file and pass in. Without this, mm-based files (common for Revit exports)
        produce thicknesses that are wrong by 1000x.

        For area-based types (m²), thickness_m becomes the quantity_per_unit in
        m³ (volume per m²). For other units we emit a quantity_per_unit of 1.0
        in the type's representative unit — still useful for Materials Browser
        display even if not directly meaningful for LCA.

        Never raises: returns [] on any extraction failure.
        """
        layers: List[TypeLayerData] = []

        try:
            material = None

            # Prefer the type's own material association
            if type_object is not None:
                material = self._find_material_association(type_object)

            # Fall back to the representative element (Revit often attaches here)
            if material is None and representative_element is not None:
                material = self._find_material_association(representative_element)

            if material is None:
                return layers

            # Resolve LayerSetUsage → LayerSet
            if material.is_a('IfcMaterialLayerSetUsage'):
                layer_set = material.ForLayerSet
                if not layer_set:
                    return layers
                material = layer_set

            is_m2 = representative_unit == 'm2'

            # Case 1: IfcMaterialLayerSet — sandwich with thicknesses
            if material.is_a('IfcMaterialLayerSet'):
                for idx, layer in enumerate(material.MaterialLayers or [], start=1):
                    mat = getattr(layer, 'Material', None)
                    mat_name = (mat.Name if mat and mat.Name else '') or 'Unknown'
                    # LayerThickness is in the file's length unit; convert to meters first.
                    raw_thickness = float(getattr(layer, 'LayerThickness', 0) or 0)
                    thickness_m = raw_thickness * length_unit_scale
                    thickness_mm = round(thickness_m * 1000.0, 2) if thickness_m else None

                    if is_m2 and thickness_m > 0:
                        # Volume per m² of wall/slab/roof surface = thickness_m × 1 m² → m³
                        qty_per_unit = round(thickness_m, 4)
                        material_unit = 'm3'
                    else:
                        qty_per_unit = 1.0
                        material_unit = representative_unit if representative_unit in ('m', 'm2', 'm3', 'kg', 'pcs') else 'm2'

                    layers.append(TypeLayerData(
                        layer_order=idx,
                        material_name=mat_name[:255],
                        thickness_mm=thickness_mm,
                        quantity_per_unit=qty_per_unit,
                        material_unit=material_unit,
                    ))
                return layers

            # Case 2: IfcMaterialConstituentSet (IFC4+)
            if hasattr(material, 'MaterialConstituents') and material.MaterialConstituents:
                for idx, constituent in enumerate(material.MaterialConstituents, start=1):
                    mat = getattr(constituent, 'Material', None)
                    mat_name = (mat.Name if mat and mat.Name else '') or getattr(constituent, 'Name', '') or 'Unknown'
                    layers.append(TypeLayerData(
                        layer_order=idx,
                        material_name=mat_name[:255],
                        thickness_mm=None,
                        quantity_per_unit=1.0,
                        material_unit=representative_unit if representative_unit in ('m', 'm2', 'm3', 'kg', 'pcs') else 'm2',
                    ))
                return layers

            # Case 3: IfcMaterialList — legacy flat list
            if material.is_a('IfcMaterialList'):
                for idx, mat in enumerate(material.Materials or [], start=1):
                    mat_name = (mat.Name if mat and mat.Name else '') or 'Unknown'
                    layers.append(TypeLayerData(
                        layer_order=idx,
                        material_name=mat_name[:255],
                        thickness_mm=None,
                        quantity_per_unit=1.0,
                        material_unit=representative_unit if representative_unit in ('m', 'm2', 'm3', 'kg', 'pcs') else 'm2',
                    ))
                return layers

            # Case 4: single IfcMaterial
            if material.is_a('IfcMaterial'):
                mat_name = material.Name or 'Unknown'
                layers.append(TypeLayerData(
                    layer_order=1,
                    material_name=mat_name[:255],
                    thickness_mm=None,
                    quantity_per_unit=1.0,
                    material_unit=representative_unit if representative_unit in ('m', 'm2', 'm3', 'kg', 'pcs') else 'm2',
                ))
                return layers

        except Exception:
            return []

        return layers

    def _find_material_association(self, ifc_entity):
        """Return the RelatingMaterial of the first IfcRelAssociatesMaterial on an entity, or None."""
        try:
            if not hasattr(ifc_entity, 'HasAssociations'):
                return None
            for assoc in ifc_entity.HasAssociations:
                if assoc.is_a('IfcRelAssociatesMaterial'):
                    return assoc.RelatingMaterial
        except Exception:
            return None
        return None

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

                # Get element metadata
                element_name = element.Name or ''
                element_type = element.is_a()
                object_type = getattr(element, 'ObjectType', None) or ''

                # Detect geometry-only entities (no meaningful metadata)
                # These are typically IfcBuildingElementProxy with no name, type, or properties
                is_geometry_only = (
                    not element_name and
                    not object_type and
                    element_type == 'IfcBuildingElementProxy'
                )

                entities.append(EntityData(
                    ifc_guid=element.GlobalId,
                    ifc_type=element_type,
                    name=element_name,
                    description=getattr(element, 'Description', None),
                    storey_id=storey_guid,  # Store GUID, will be converted to UUID by orchestrator
                    area=quantities['area'],
                    volume=quantities['volume'],
                    length=quantities['length'],
                    height=quantities['height'],
                    perimeter=quantities['perimeter'],
                    is_geometry_only=is_geometry_only,
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
                                        value_number = None
                                        value_boolean = None

                                        if prop.NominalValue:
                                            raw = prop.NominalValue.wrappedValue
                                            prop_value = str(raw)
                                            prop_type = type(raw).__name__

                                            # Populate typed columns
                                            if isinstance(raw, bool):
                                                value_boolean = raw
                                            elif isinstance(raw, (int, float)):
                                                value_number = float(raw)

                                        properties.append(PropertyData(
                                            entity_id=element.GlobalId,  # Store GUID, convert later
                                            pset_name=pset_name,
                                            property_name=prop.Name,
                                            property_value=prop_value,
                                            property_type=prop_type,
                                            value_number=value_number,
                                            value_boolean=value_boolean,
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
        self, ifc_file, entity_guids: set, types: List[TypeData]
    ) -> Tuple[List[TypeAssignmentData], List[Dict]]:
        """
        Extract type->entity assignments by matching ObjectType attribute.

        This replaces the previous approach of using IfcRelDefinesByType.
        Elements are assigned to types based on their ObjectType value matching
        the type_name (which is derived from ObjectType in _extract_types).

        Args:
            ifc_file: Open IFC file
            entity_guids: Set of entity GUIDs we've extracted
            types: List of TypeData from _extract_types (ObjectType-primary)
        """
        assignments = []
        errors = []

        # Build lookup: ObjectType -> type_guid
        object_type_to_guid = {t.type_name: t.type_guid for t in types}

        try:
            for element in ifc_file.by_type('IfcElement'):
                entity_guid = element.GlobalId

                # Skip elements we don't have in our entity set
                if entity_guid not in entity_guids:
                    continue

                # Get ObjectType and match to type
                object_type = getattr(element, 'ObjectType', None)
                if not object_type:
                    continue  # Element has no type - skip

                type_guid = object_type_to_guid.get(object_type)
                if not type_guid:
                    # This shouldn't happen if _extract_types worked correctly
                    errors.append({
                        'stage': 'type_assignments',
                        'severity': 'warning',
                        'message': f"ObjectType '{object_type}' not found in types list",
                        'element_guid': entity_guid,
                        'element_type': element.is_a(),
                        'timestamp': datetime.now().isoformat()
                    })
                    continue

                assignments.append(TypeAssignmentData(
                    entity_guid=entity_guid,
                    type_guid=type_guid,
                ))

        except Exception as e:
            errors.append({
                'stage': 'type_assignments',
                'severity': 'error',
                'message': f"Failed to extract type assignments: {str(e)}",
                'element_guid': None,
                'element_type': 'IfcElement',
                'timestamp': datetime.now().isoformat()
            })

        return assignments, errors


# Singleton instance
ifc_parser = IFCParserService()

"""
Layer 1: IFC Metadata Parsing Service

PHILOSOPHY:
- Extract ONLY metadata (GUID, type, name, properties, relationships)
- NO geometry extraction (that's Layer 2)
- NO validation judgement (that's Layer 3)
- ALWAYS succeeds unless file is corrupt
- FAST: Should complete in seconds even for large files

PURPOSE:
This creates the rock-solid "Layer 1" foundation that all other features build on.
"""
import ifcopenshell
import ifcopenshell.util.placement
import ifcopenshell.util.shape
import time
import numpy as np
from datetime import datetime
from django.db import transaction
from django.utils import timezone

from apps.entities.models import (
    IFCEntity, SpatialHierarchy, PropertySet,
    System, SystemMembership, Material, MaterialAssignment,
    IFCType, TypeAssignment, GraphEdge, ProcessingReport
)


def parse_ifc_metadata(model_id, file_path):
    """
    Parse IFC file and extract ONLY metadata (no geometry).

    This is Layer 1: The foundation that always succeeds.

    Args:
        model_id: UUID of the Model instance
        file_path: Path to the IFC file

    Returns:
        dict: Parsing results with counts and timing
    """
    from apps.models.models import Model

    # Get model instance
    model = Model.objects.get(id=model_id)

    # Create processing report
    report = ProcessingReport.objects.create(
        model=model,
        overall_status='failed',  # Will update on success
    )

    start_time = time.time()
    stage_results = []
    errors = []

    # Default results
    results = {
        'ifc_schema': '',
        'element_count': 0,
        'storey_count': 0,
        'system_count': 0,
        'property_count': 0,
        'material_count': 0,
        'type_count': 0,
        'processing_report_id': str(report.id),
    }

    try:
        # ==================== STAGE: File Open ====================
        stage_start = time.time()
        print(f"\n📂 [LAYER 1] Opening IFC file: {file_path}")

        model.parsing_status = 'parsing'
        model.save(update_fields=['parsing_status'])

        try:
            ifc_file = ifcopenshell.open(file_path)
            ifc_schema = ifc_file.schema

            # Update report with file info
            report.ifc_schema = ifc_schema
            import os
            report.file_size_bytes = os.path.getsize(file_path) if os.path.exists(file_path) else 0
            report.save()

            stage_results.append({
                'stage': 'file_open',
                'status': 'success',
                'processed': 1,
                'skipped': 0,
                'failed': 0,
                'errors': [],
                'duration_ms': int((time.time() - stage_start) * 1000),
                'message': f'Opened IFC file with schema {ifc_schema}'
            })

            results['ifc_schema'] = ifc_schema
            print(f"✅ File opened: {ifc_schema}")

        except Exception as e:
            error_msg = f"Failed to open IFC file: {str(e)}"
            print(f"❌ {error_msg}")
            errors.append({
                'stage': 'file_open',
                'severity': 'critical',
                'message': error_msg,
                'element_guid': None,
                'element_type': None,
                'timestamp': datetime.now().isoformat()
            })
            raise  # Can't continue without file

        # Use transaction for atomic operations
        with transaction.atomic():
            # ==================== STAGE: Spatial Hierarchy ====================
            stage_start = time.time()
            print("\n🏗️  [LAYER 1] Extracting spatial hierarchy...")
            storey_count, stage_errors = _extract_spatial_hierarchy(model, ifc_file)
            results['storey_count'] = storey_count

            stage_results.append({
                'stage': 'spatial_hierarchy',
                'status': 'success' if len(stage_errors) == 0 else 'partial',
                'processed': storey_count,
                'skipped': 0,
                'failed': len(stage_errors),
                'errors': [e['message'] for e in stage_errors],
                'duration_ms': int((time.time() - stage_start) * 1000),
                'message': f"Extracted {storey_count} spatial elements"
            })
            errors.extend(stage_errors)
            print(f"✅ Spatial hierarchy: {storey_count} elements ({len(stage_errors)} errors)")

            # ==================== STAGE: Materials ====================
            stage_start = time.time()
            print("\n🎨 [LAYER 1] Extracting materials...")
            material_count, stage_errors = _extract_materials(model, ifc_file)
            results['material_count'] = material_count

            stage_results.append({
                'stage': 'materials',
                'status': 'success' if len(stage_errors) == 0 else 'partial',
                'processed': material_count,
                'skipped': 0,
                'failed': len(stage_errors),
                'errors': [e['message'] for e in stage_errors],
                'duration_ms': int((time.time() - stage_start) * 1000),
                'message': f"Extracted {material_count} materials"
            })
            errors.extend(stage_errors)
            print(f"✅ Materials: {material_count} ({len(stage_errors)} errors)")

            # ==================== STAGE: Types ====================
            stage_start = time.time()
            print("\n📐 [LAYER 1] Extracting type definitions...")
            type_count, stage_errors = _extract_types(model, ifc_file)
            results['type_count'] = type_count

            stage_results.append({
                'stage': 'types',
                'status': 'success' if len(stage_errors) == 0 else 'partial',
                'processed': type_count,
                'skipped': 0,
                'failed': len(stage_errors),
                'errors': [e['message'] for e in stage_errors],
                'duration_ms': int((time.time() - stage_start) * 1000),
                'message': f"Extracted {type_count} type definitions"
            })
            errors.extend(stage_errors)
            print(f"✅ Types: {type_count} ({len(stage_errors)} errors)")

            # ==================== STAGE: Systems ====================
            stage_start = time.time()
            print("\n⚙️  [LAYER 1] Extracting systems...")
            system_count, stage_errors = _extract_systems(model, ifc_file)
            results['system_count'] = system_count

            stage_results.append({
                'stage': 'systems',
                'status': 'success' if len(stage_errors) == 0 else 'partial',
                'processed': system_count,
                'skipped': 0,
                'failed': len(stage_errors),
                'errors': [e['message'] for e in stage_errors],
                'duration_ms': int((time.time() - stage_start) * 1000),
                'message': f"Extracted {system_count} systems"
            })
            errors.extend(stage_errors)
            print(f"✅ Systems: {system_count} ({len(stage_errors)} errors)")

            # ==================== STAGE: Elements (METADATA ONLY - NO GEOMETRY) ====================
            stage_start = time.time()
            print("\n📦 [LAYER 1] Extracting element metadata (NO GEOMETRY)...")
            element_count, stage_errors = _extract_elements_metadata(model, ifc_file)
            results['element_count'] = element_count

            stage_results.append({
                'stage': 'elements_metadata',
                'status': 'success' if len(stage_errors) == 0 else 'partial',
                'processed': element_count,
                'skipped': 0,
                'failed': len(stage_errors),
                'errors': [e['message'] for e in stage_errors],
                'duration_ms': int((time.time() - stage_start) * 1000),
                'message': f"Extracted {element_count} elements (metadata only)"
            })
            errors.extend(stage_errors)
            print(f"✅ Elements: {element_count} ({len(stage_errors)} errors)")

            # ==================== STAGE: Properties ====================
            stage_start = time.time()
            print("\n🏷️  [LAYER 1] Extracting property sets...")
            property_count, stage_errors = _extract_property_sets(model, ifc_file)
            results['property_count'] = property_count

            stage_results.append({
                'stage': 'properties',
                'status': 'success' if len(stage_errors) == 0 else 'partial',
                'processed': property_count,
                'skipped': 0,
                'failed': len(stage_errors),
                'errors': [e['message'] for e in stage_errors],
                'duration_ms': int((time.time() - stage_start) * 1000),
                'message': f"Extracted {property_count} properties"
            })
            errors.extend(stage_errors)
            print(f"✅ Properties: {property_count} ({len(stage_errors)} errors)")

        # ==================== Parsing Complete ====================
        end_time = time.time()
        duration = end_time - start_time

        # Update model status
        model.parsing_status = 'parsed'
        model.ifc_schema = results['ifc_schema']
        model.element_count = results['element_count']
        model.storey_count = results['storey_count']
        model.system_count = results['system_count']
        model.save(update_fields=[
            'parsing_status', 'ifc_schema', 'element_count',
            'storey_count', 'system_count'
        ])

        # Update processing report
        report.overall_status = 'success' if len(errors) == 0 else 'partial'
        report.completed_at = timezone.now()
        report.duration_seconds = duration
        report.stage_results = stage_results
        report.errors = errors
        report.total_entities_processed = (
            results['element_count'] +
            results['storey_count'] +
            results['material_count'] +
            results['type_count'] +
            results['system_count']
        )
        report.summary = f"""
IFC Metadata Parsing Complete (Layer 1)
========================================
Duration: {duration:.2f}s
IFC Schema: {results['ifc_schema']}

Elements: {results['element_count']}
Storeys: {results['storey_count']}
Properties: {results['property_count']}
Materials: {results['material_count']}
Types: {results['type_count']}
Systems: {results['system_count']}

Errors: {len(errors)}

Note: Geometry extraction is Layer 2 (run separately)
"""
        report.save()

        print(f"\n{'='*80}")
        print(f"✅ [LAYER 1] IFC METADATA PARSING COMPLETE!")
        print(f"   Duration: {duration:.2f}s")
        print(f"   Elements: {results['element_count']} (metadata only, no geometry)")
        print(f"   Properties: {results['property_count']}")
        print(f"   Errors: {len(errors)}")
        print(f"   Next step: Extract geometry (Layer 2)")
        print(f"{'='*80}\n")

        return results

    except Exception as e:
        # Catastrophic failure
        end_time = time.time()
        duration = end_time - start_time

        error_msg = f"Catastrophic parsing failure: {str(e)}"
        print(f"\n❌ {error_msg}")

        # Update model status
        model.parsing_status = 'failed'
        model.save(update_fields=['parsing_status'])

        # Update report
        report.overall_status = 'failed'
        report.catastrophic_failure = True
        report.failure_exception = str(e)
        report.completed_at = timezone.now()
        report.duration_seconds = duration
        report.stage_results = stage_results
        report.errors = errors
        report.summary = f"CATASTROPHIC FAILURE\\n\\n{error_msg}"
        report.save()

        print(f"❌ Parsing failed after {duration:.2f}s")
        results['processing_report_id'] = str(report.id)

        raise


def _extract_spatial_hierarchy(model, ifc_file):
    """Extract project/site/building/storey hierarchy (metadata only)."""
    count = 0
    errors = []

    # Project
    try:
        projects = ifc_file.by_type('IfcProject')
        if projects:
            project = projects[0]
            # Use get_or_create to handle duplicates gracefully
            entity, created = IFCEntity.objects.get_or_create(
                model=model,
                ifc_guid=project.GlobalId,
                defaults={
                    'ifc_type': 'IfcProject',
                    'name': project.Name or 'Unnamed Project',
                    'geometry_status': 'no_representation'  # Projects don't have geometry
                }
            )
            if not created:
                # Update if it already exists
                entity.ifc_type = 'IfcProject'
                entity.name = project.Name or 'Unnamed Project'
                entity.save()

            # Create spatial hierarchy only if not exists
            SpatialHierarchy.objects.get_or_create(
                model=model,
                entity=entity,
                defaults={'hierarchy_level': 'project'}
            )
            count += 1
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
            entity, created = IFCEntity.objects.get_or_create(
                model=model,
                ifc_guid=site.GlobalId,
                defaults={
                    'ifc_type': 'IfcSite',
                    'name': site.Name or 'Unnamed Site',
                    'geometry_status': 'no_representation'
                }
            )
            if not created:
                entity.name = site.Name or 'Unnamed Site'
                entity.save()

            SpatialHierarchy.objects.get_or_create(
                model=model,
                entity=entity,
                defaults={'hierarchy_level': 'site'}
            )
            count += 1
        except Exception as e:
            errors.append({
                'stage': 'spatial_hierarchy',
                'severity': 'error',
                'message': f"Failed to extract IfcSite '{site.Name}': {str(e)}",
                'element_guid': site.GlobalId if hasattr(site, 'GlobalId') else None,
                'element_type': 'IfcSite',
                'timestamp': datetime.now().isoformat()
            })

    # Buildings
    for building in ifc_file.by_type('IfcBuilding'):
        try:
            entity, created = IFCEntity.objects.get_or_create(
                model=model,
                ifc_guid=building.GlobalId,
                defaults={
                    'ifc_type': 'IfcBuilding',
                    'name': building.Name or 'Unnamed Building',
                    'geometry_status': 'no_representation'
                }
            )
            if not created:
                entity.name = building.Name or 'Unnamed Building'
                entity.save()

            SpatialHierarchy.objects.get_or_create(
                model=model,
                entity=entity,
                defaults={'hierarchy_level': 'building'}
            )
            count += 1
        except Exception as e:
            errors.append({
                'stage': 'spatial_hierarchy',
                'severity': 'error',
                'message': f"Failed to extract IfcBuilding '{building.Name}': {str(e)}",
                'element_guid': building.GlobalId if hasattr(building, 'GlobalId') else None,
                'element_type': 'IfcBuilding',
                'timestamp': datetime.now().isoformat()
            })

    # Storeys
    for storey in ifc_file.by_type('IfcBuildingStorey'):
        try:
            entity, created = IFCEntity.objects.get_or_create(
                model=model,
                ifc_guid=storey.GlobalId,
                defaults={
                    'ifc_type': 'IfcBuildingStorey',
                    'name': storey.Name or 'Unnamed Storey',
                    'geometry_status': 'no_representation'
                }
            )
            if not created:
                entity.name = storey.Name or 'Unnamed Storey'
                entity.save()

            SpatialHierarchy.objects.get_or_create(
                model=model,
                entity=entity,
                defaults={'hierarchy_level': 'storey'}
            )
            count += 1
        except Exception as e:
            errors.append({
                'stage': 'spatial_hierarchy',
                'severity': 'error',
                'message': f"Failed to extract IfcBuildingStorey '{storey.Name}': {str(e)}",
                'element_guid': storey.GlobalId if hasattr(storey, 'GlobalId') else None,
                'element_type': 'IfcBuildingStorey',
                'timestamp': datetime.now().isoformat()
            })

    return count, errors


def _extract_materials(model, ifc_file):
    """Extract materials (metadata only)."""
    count = 0
    errors = []

    for material in ifc_file.by_type('IfcMaterial'):
        try:
            step_id = str(material.id())
            mat, created = Material.objects.get_or_create(
                model=model,
                material_guid=step_id,
                defaults={
                    'name': material.Name or 'Unnamed Material',
                    'category': getattr(material, 'Category', None),
                }
            )
            if created:
                count += 1
        except Exception as e:
            errors.append({
                'stage': 'materials',
                'severity': 'warning',
                'message': f"Failed to extract material '{material.Name}': {str(e)}",
                'element_guid': None,
                'element_type': 'IfcMaterial',
                'timestamp': datetime.now().isoformat()
            })

    return count, errors


def _extract_types(model, ifc_file):
    """Extract type objects (metadata only)."""
    count = 0
    errors = []

    for type_element in ifc_file.by_type('IfcTypeObject'):
        try:
            IFCType.objects.create(
                model=model,
                type_guid=type_element.GlobalId,
                ifc_type=type_element.is_a(),
                type_name=type_element.Name or 'Unnamed Type',
            )
            count += 1
        except Exception as e:
            errors.append({
                'stage': 'types',
                'severity': 'warning',
                'message': f"Failed to extract type '{type_element.Name}': {str(e)}",
                'element_guid': type_element.GlobalId if hasattr(type_element, 'GlobalId') else None,
                'element_type': type_element.is_a() if hasattr(type_element, 'is_a') else 'IfcTypeObject',
                'timestamp': datetime.now().isoformat()
            })

    return count, errors


def _extract_systems(model, ifc_file):
    """Extract systems (metadata only)."""
    count = 0
    errors = []

    for system in ifc_file.by_type('IfcSystem'):
        try:
            System.objects.create(
                model=model,
                system_guid=system.GlobalId,
                system_type=system.is_a(),
                system_name=system.Name or 'Unnamed System',
                description=getattr(system, 'Description', None)
            )
            count += 1
        except Exception as e:
            errors.append({
                'stage': 'systems',
                'severity': 'warning',
                'message': f"Failed to extract system '{system.Name}': {str(e)}",
                'element_guid': system.GlobalId if hasattr(system, 'GlobalId') else None,
                'element_type': system.is_a() if hasattr(system, 'is_a') else 'IfcSystem',
                'timestamp': datetime.now().isoformat()
            })

    return count, errors


def _extract_simple_bbox(element):
    """
    Extract a simple bounding box from element WITHOUT tessellation.

    This is VERY fast (just reading placement data, no geometry generation).
    Used for initial display - viewer shows boxes, then upgrades to real geometry.

    Args:
        element: IFC element

    Returns:
        dict with min/max coordinates, or default small box at origin
    """
    try:
        # Try to get object placement (fast - just reading properties)
        if hasattr(element, 'ObjectPlacement') and element.ObjectPlacement:
            # Get placement matrix (4x4 transform)
            matrix = ifcopenshell.util.placement.get_local_placement(element.ObjectPlacement)

            # Extract position from matrix (translation component)
            x, y, z = matrix[0][3], matrix[1][3], matrix[2][3]

            # Try to get simple dimensions from representation
            size = 1.0  # Default 1m box
            if hasattr(element, 'Representation') and element.Representation:
                # Try to extract a characteristic size
                # This is approximate but FAST (no tessellation)
                try:
                    for rep in element.Representation.Representations:
                        for item in rep.Items:
                            if hasattr(item, 'Dim'):
                                size = max(size, float(item.Dim))
                            elif hasattr(item, 'Depth'):
                                size = max(size, float(item.Depth))
                except:
                    pass  # Use default

            # Create a box around the placement position
            half_size = size / 2
            return {
                'min_x': float(x - half_size),
                'min_y': float(y - half_size),
                'min_z': float(z - half_size),
                'max_x': float(x + half_size),
                'max_y': float(y + half_size),
                'max_z': float(z + half_size),
            }
    except:
        pass  # Fall through to default

    # Default: small box at origin (element has no valid placement)
    return {
        'min_x': 0.0,
        'min_y': 0.0,
        'min_z': 0.0,
        'max_x': 1.0,
        'max_y': 1.0,
        'max_z': 1.0,
    }


def _extract_elements_metadata(model, ifc_file):
    """
    Extract element metadata ONLY (no geometry).

    This is MUCH faster than the original extract_elements() because:
    1. No geometry processing (no ifcopenshell.geom.create_shape calls)
    2. Uses bulk_create for batch inserts (100x faster)
    3. No per-element transactions
    4. Pre-fetches storeys to avoid N+1 query problem
    """
    element_count = 0
    errors = []

    # Get all physical elements
    elements = ifc_file.by_type('IfcElement')

    print(f"   Found {len(elements)} elements in IFC file")

    # PRE-FETCH all storeys into a dict for O(1) lookup (CRITICAL for performance!)
    storey_map = {
        entity.ifc_guid: entity.id
        for entity in IFCEntity.objects.filter(
            model=model,
            ifc_type='IfcBuildingStorey'
        ).only('id', 'ifc_guid')
    }
    print(f"   Pre-fetched {len(storey_map)} storeys for fast lookup")

    # Prepare batch for bulk insert
    entities_to_create = []
    batch_size = 500

    for element in elements:
        try:
            # Extract simple bounding box (NO tessellation, just read placement)
            bbox_data = _extract_simple_bbox(element)

            # Determine geometry status
            if element.Representation:
                geometry_status = 'pending'  # Has representation, extract in Layer 2
            else:
                geometry_status = 'no_representation'  # No geometry to extract

            # Get storey UUID (if assigned) - use pre-fetched map for O(1) lookup
            storey_id = None
            if hasattr(element, 'ContainedInStructure') and element.ContainedInStructure:
                for rel in element.ContainedInStructure:
                    if rel.RelatingStructure.is_a('IfcBuildingStorey'):
                        storey_guid = rel.RelatingStructure.GlobalId
                        storey_id = storey_map.get(storey_guid)  # Fast dict lookup, no DB query!
                        break

            # Create entity object (but don't save yet)
            entity = IFCEntity(
                model=model,
                ifc_guid=element.GlobalId,
                ifc_type=element.is_a(),
                name=element.Name or '',
                description=getattr(element, 'Description', None),
                storey_id=storey_id,
                geometry_status=geometry_status,
                # Store simple bounding box for fast initial display
                bbox_min_x=bbox_data['min_x'],
                bbox_min_y=bbox_data['min_y'],
                bbox_min_z=bbox_data['min_z'],
                bbox_max_x=bbox_data['max_x'],
                bbox_max_y=bbox_data['max_y'],
                bbox_max_z=bbox_data['max_z'],
            )
            entities_to_create.append(entity)
            element_count += 1

            # Batch insert when we reach batch_size
            if len(entities_to_create) >= batch_size:
                IFCEntity.objects.bulk_create(entities_to_create, ignore_conflicts=True)
                print(f"   Inserted {element_count} elements...")
                entities_to_create = []

        except Exception as e:
            errors.append({
                'stage': 'elements_metadata',
                'severity': 'error',
                'message': f"Failed to process element '{element.Name or element.GlobalId}': {str(e)}",
                'element_guid': element.GlobalId if hasattr(element, 'GlobalId') else None,
                'element_type': element.is_a() if hasattr(element, 'is_a') else 'IfcElement',
                'timestamp': datetime.now().isoformat()
            })

    # Insert remaining entities
    if entities_to_create:
        IFCEntity.objects.bulk_create(entities_to_create, ignore_conflicts=True)

    return element_count, errors


def _extract_property_sets(model, ifc_file):
    """Extract property sets (metadata only) - BULK INSERT for performance."""
    count = 0
    errors = []

    # Batch size for bulk inserts
    BATCH_SIZE = 1000
    property_batch = []

    # Get all elements
    elements = ifc_file.by_type('IfcElement')

    # Pre-fetch all entities into a dict for O(1) lookup
    entity_map = {
        entity.ifc_guid: entity
        for entity in IFCEntity.objects.filter(model=model).only('id', 'ifc_guid')
    }

    for element in elements:
        # Get the IFCEntity for this element (fast dict lookup)
        entity = entity_map.get(element.GlobalId)
        if not entity:
            continue

        # Get property sets
        if hasattr(element, 'IsDefinedBy'):
            for definition in element.IsDefinedBy:
                try:
                    if definition.is_a('IfcRelDefinesByProperties'):
                        property_set = definition.RelatingPropertyDefinition

                        if property_set.is_a('IfcPropertySet'):
                            pset_name = property_set.Name

                            # Extract individual properties
                            for prop in property_set.HasProperties:
                                prop_name = '<unknown>'
                                try:
                                    if prop.is_a('IfcPropertySingleValue'):
                                        prop_name = prop.Name
                                        prop_value = str(prop.NominalValue.wrappedValue) if prop.NominalValue else None
                                        prop_type = type(prop.NominalValue.wrappedValue).__name__ if prop.NominalValue else 'string'

                                        # Add to batch instead of creating immediately
                                        property_batch.append(PropertySet(
                                            entity=entity,
                                            pset_name=pset_name,
                                            property_name=prop_name,
                                            property_value=prop_value,
                                            property_type=prop_type
                                        ))
                                        count += 1

                                        # Bulk insert when batch is full
                                        if len(property_batch) >= BATCH_SIZE:
                                            PropertySet.objects.bulk_create(property_batch, ignore_conflicts=True)
                                            print(f"   Inserted {count} properties...")
                                            property_batch = []

                                except Exception as e:
                                    errors.append({
                                        'stage': 'properties',
                                        'severity': 'warning',
                                        'message': f"Failed to extract property '{prop_name}' from '{pset_name}': {str(e)}",
                                        'element_guid': element.GlobalId,
                                        'element_type': element.is_a(),
                                        'timestamp': datetime.now().isoformat()
                                    })
                except Exception as e:
                    errors.append({
                        'stage': 'properties',
                        'severity': 'warning',
                        'message': f"Failed to process property definition for '{element.Name or element.GlobalId}': {str(e)}",
                        'element_guid': element.GlobalId if hasattr(element, 'GlobalId') else None,
                        'element_type': element.is_a() if hasattr(element, 'is_a') else 'IfcElement',
                        'timestamp': datetime.now().isoformat()
                    })

    # Insert remaining properties
    if property_batch:
        PropertySet.objects.bulk_create(property_batch, ignore_conflicts=True)

    return count, errors
